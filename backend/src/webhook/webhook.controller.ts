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
import { ScannerService } from '../scanner/scanner.service';

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

      // Keep cache bounded
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
        `Processing push event for ${repoFullName} at commit ${commitSha.substring(0, 7)} (ref: ${ref}). Fetching dependency files...`,
      );

      // 5. Fetch package.json and package-lock.json from GitHub
      const [packageJsonContent, packageLockContent] = await Promise.all([
        this.githubService.getFileContent(owner, repoName, 'package.json', commitSha, installationId),
        this.githubService.getFileContent(owner, repoName, 'package-lock.json', commitSha, installationId),
      ]);

      if (!packageJsonContent) {
        this.logger.log(`No package.json found in ${repoFullName} at commit ${commitSha}`);
        return {
          status: 'skipped',
          repository: repoFullName,
          commitSha,
          message: 'No package.json file found in repository root.',
        };
      }

      if (!packageLockContent) {
        this.logger.warn(`package.json found in ${repoFullName}, but package-lock.json is missing.`);
        return {
          status: 'warning',
          repository: repoFullName,
          commitSha,
          message:
            'Exact dependency resolution is unavailable because package-lock.json is missing from this commit.',
        };
      }

      // 6. Scan extracted dependencies against OSV
      this.logger.log(`Parsing dependency files for ${repoFullName} and querying OSV...`);
      const scanResult = await this.scannerService.analyzeAndScan(
        packageJsonContent,
        packageLockContent,
      );

      this.logger.log(
        `Scan complete for ${repoFullName}: ${scanResult.metrics.totalDependencies} dependencies scanned, ${scanResult.metrics.vulnerableDependencies} vulnerable, ${scanResult.metrics.totalFindings} findings.`,
      );

      return {
        status: 'completed',
        repository: repoFullName,
        commitSha,
        ref,
        scanResult,
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
    @Body() body: { owner: string; repo: string; ref?: string; installationId?: number },
  ) {
    if (!body?.owner || !body?.repo) {
      throw new BadRequestException('owner and repo parameters are required.');
    }

    const [packageJson, packageLock] = await Promise.all([
      this.githubService.getFileContent(body.owner, body.repo, 'package.json', body.ref, body.installationId),
      this.githubService.getFileContent(body.owner, body.repo, 'package-lock.json', body.ref, body.installationId),
    ]);

    const hasPkg = Boolean(packageJson);
    const hasLock = Boolean(packageLock);

    let scanResult = null;
    if (hasPkg && hasLock) {
      scanResult = await this.scannerService.analyzeAndScan(packageJson, packageLock);
    }

    return {
      repository: `${body.owner}/${body.repo}`,
      ref: body.ref || 'default branch',
      filesFound: {
        packageJson: hasPkg,
        packageLock: hasLock,
      },
      packageJsonSnippet: packageJson ? packageJson.slice(0, 300) + '...' : null,
      scanResult,
    };
  }
}
