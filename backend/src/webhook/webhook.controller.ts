import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  Logger,
  Body,
} from '@nestjs/common';
import { Request } from 'express';
import { GitHubService } from '../github/github.service';
import { ScannerService, FileScanResult } from '../scanner/scanner.service';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  // In-memory set for deduplicating webhook delivery IDs
  private readonly processedDeliveries = new Set<string>();

  constructor(
    private readonly githubService: GitHubService,
    private readonly scannerService: ScannerService,
  ) {}

  /**
   * GitHub Webhook Receiver Endpoint: POST /api/webhooks/github
   */
  @Post('github')
  @HttpCode(HttpStatus.OK)
  async handleGitHubWebhook(
    @Req() req: RequestWithRawBody,
    @Headers('x-github-event') event: string,
    @Headers('x-hub-signature-256') signature?: string,
    @Headers('x-github-delivery') deliveryId?: string,
  ) {
    this.logger.log(`Received GitHub webhook event: [${event}] (Delivery ID: ${deliveryId || 'N/A'})`);

    // 1. Signature Verification
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const isValid = this.githubService.verifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      this.logger.warn(`Rejected webhook delivery ${deliveryId}: Invalid signature`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // 2. Delivery Deduplication
    if (deliveryId) {
      if (this.processedDeliveries.has(deliveryId)) {
        this.logger.warn(`Duplicate webhook delivery ignored: ${deliveryId}`);
        return { status: 'ignored', message: 'Duplicate delivery ID' };
      }
      this.processedDeliveries.add(deliveryId);

      if (this.processedDeliveries.size > 5000) {
        const first = this.processedDeliveries.values().next().value;
        if (first) this.processedDeliveries.delete(first);
      }
    }

    const payload = req.body;

    // 3. Handle 'ping' event
    if (event === 'ping') {
      this.logger.log(`Ping received from GitHub repository: ${payload.repository?.full_name}`);
      return {
        status: 'ok',
        message: 'Webhook ping verified successfully',
        zen: payload.zen,
        hookId: payload.hook_id,
      };
    }

    // 4. Handle 'push' event
    if (event === 'push') {
      const repoFullName = payload.repository?.full_name;
      const owner = payload.repository?.owner?.login || payload.repository?.owner?.name;
      const repoName = payload.repository?.name;
      const commitSha = payload.after || payload.head_commit?.id;
      const ref = payload.ref;
      const installationId = payload.installation?.id;

      if (!owner || !repoName || !commitSha) {
        throw new BadRequestException('Webhook push payload missing required fields (owner, repo, or commit SHA).');
      }

      this.logger.log(
        `Processing push event for ${repoFullName} at commit ${commitSha.substring(0, 7)} (ref: ${ref}).`,
      );

      // Find dependency files (root or common subfolders for monorepos)
      const targetPaths = ['', 'backend', 'frontend', 'server', 'client', 'app'];
      const scanResults: Array<{ path: string; result: FileScanResult }> = [];

      for (const p of targetPaths) {
        const pkgFilePath = p ? `${p}/package.json` : 'package.json';
        const lockFilePath = p ? `${p}/package-lock.json` : 'package-lock.json';

        const [packageJsonContent, packageLockContent] = await Promise.all([
          this.githubService.getFileContent(owner, repoName, pkgFilePath, commitSha, installationId),
          this.githubService.getFileContent(owner, repoName, lockFilePath, commitSha, installationId),
        ]);

        if (packageJsonContent && packageLockContent) {
          this.logger.log(`Found dependency files at '${pkgFilePath}'. Scanning with OSV...`);
          const result = await this.scannerService.analyzeAndScan(packageJsonContent, packageLockContent);
          scanResults.push({
            path: p || 'root',
            result,
          });
        }
      }

      if (scanResults.length === 0) {
        this.logger.warn(`No valid package.json & package-lock.json pair found in ${repoFullName} at commit ${commitSha}`);
        return {
          status: 'skipped',
          repository: repoFullName,
          commitSha,
          message: 'No package.json and package-lock.json files found to scan.',
        };
      }

      return {
        status: 'completed',
        repository: repoFullName,
        commitSha,
        ref,
        scannedProjectsCount: scanResults.length,
        scans: scanResults,
      };
    }

    return {
      status: 'ignored',
      message: `Event '${event}' is not processed by SecureDevOps scanner.`,
    };
  }

  /**
   * Manual Test Fetch Endpoint: POST /api/webhooks/test-fetch
   * Allows testing fetching dependency files from any GitHub repository directly.
   */
  @Post('test-fetch')
  async testFetch(
    @Body()
    body: {
      owner: string;
      repo: string;
      ref?: string;
      path?: string;
      installationId?: number;
    },
  ) {
    if (!body?.owner || !body?.repo) {
      throw new BadRequestException('owner and repo parameters are required.');
    }

    const ref = body.ref || 'main';
    const subpaths = body.path !== undefined ? [body.path] : ['', 'backend', 'frontend', 'server', 'client'];
    const results: Array<{
      scannedPath: string;
      filesFound: { packageJson: boolean; packageLock: boolean };
      scanResult: FileScanResult | null;
    }> = [];

    for (const sub of subpaths) {
      const cleanSub = sub.replace(/^\/+|\/+$/g, '');
      const pkgPath = cleanSub ? `${cleanSub}/package.json` : 'package.json';
      const lockPath = cleanSub ? `${cleanSub}/package-lock.json` : 'package-lock.json';

      const [packageJson, packageLock] = await Promise.all([
        this.githubService.getFileContent(body.owner, body.repo, pkgPath, ref, body.installationId),
        this.githubService.getFileContent(body.owner, body.repo, lockPath, ref, body.installationId),
      ]);

      const hasPkg = Boolean(packageJson);
      const hasLock = Boolean(packageLock);

      if (hasPkg || hasLock || body.path !== undefined) {
        let scanResult: FileScanResult | null = null;
        if (hasPkg && hasLock) {
          scanResult = await this.scannerService.analyzeAndScan(packageJson, packageLock);
        }

        results.push({
          scannedPath: cleanSub || 'root',
          filesFound: { packageJson: hasPkg, packageLock: hasLock },
          scanResult,
        });
      }
    }

    return {
      repository: `${body.owner}/${body.repo}`,
      ref,
      projectsFound: results.length,
      projects: results,
    };
  }
}
