import {
  Controller,
  Post,
  Get,
  Sse,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  Logger,
  Body,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';
import axios from 'axios';
import { Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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

  // RxJS Subject for real-time Server-Sent Events (SSE) broadcast to frontend
  private readonly webhookEvents$ = new Subject<any>();

  // In-memory buffer of recent webhook activities
  private readonly recentActivity: any[] = [];

  constructor(
    private readonly githubService: GitHubService,
    private readonly scannerService: ScannerService,
    private readonly configService: ConfigService,
  ) {}

  private addActivity(record: any) {
    this.recentActivity.unshift(record);
    if (this.recentActivity.length > 50) {
      this.recentActivity.pop();
    }
  }

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
      if (!signature) {
        this.logger.warn(
          `Rejected webhook delivery ${deliveryId}: Missing 'x-hub-signature-256' header. ` +
            `Ensure you entered the Secret in your GitHub Webhook settings (matching GITHUB_WEBHOOK_SECRET in backend/.env).`,
        );
      } else {
        this.logger.warn(
          `Rejected webhook delivery ${deliveryId}: Signature mismatch. ` +
            `The secret in GitHub Webhook settings does not match GITHUB_WEBHOOK_SECRET in backend/.env.`,
        );
      }
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
      const repoFullName = payload.repository?.full_name || 'ayanozoro/auth_service';
      this.logger.log(`Ping received from GitHub repository: ${repoFullName}`);
      const pingRecord = {
        id: deliveryId || `ping-${Date.now()}`,
        event: 'ping',
        repository: repoFullName,
        ref: null,
        commitSha: null,
        timestamp: new Date().toISOString(),
        status: 'verified',
        message: payload.zen || 'Webhook ping handshake confirmed.',
      };
      this.addActivity(pingRecord);
      this.webhookEvents$.next({
        type: 'ping_received',
        ...pingRecord,
      });

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

      const totalFindings = scanResults.reduce(
        (sum, s) => sum + (s.result?.metrics?.totalFindings || 0),
        0,
      );
      const totalDeps = scanResults.reduce(
        (sum, s) => sum + (s.result?.metrics?.totalDependencies || 0),
        0,
      );
      const uniqueVulns = Array.from(
        new Set(
          scanResults.flatMap((s) => s.result?.findings?.map((f) => f.packageName) || []),
        ),
      );

      const pushRecord = {
        id: deliveryId || `push-${Date.now()}`,
        event: 'push',
        repository: repoFullName,
        commitSha: commitSha ? commitSha.substring(0, 7) : 'head',
        fullCommitSha: commitSha,
        ref: ref || 'refs/heads/main',
        timestamp: new Date().toISOString(),
        status: 'completed',
        totalDependencies: totalDeps,
        findingsCount: totalFindings,
        vulnerabilities: uniqueVulns,
        scannedProjectsCount: scanResults.length,
        scans: scanResults,
      };

      this.addActivity(pushRecord);
      this.webhookEvents$.next({
        type: 'push_scan_completed',
        ...pushRecord,
      });

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

  /**
   * Webhook Info Endpoint: GET /api/webhooks/info
   * Returns current active endpoints, Smee tunnel URL, and delivery statistics.
   */
  @Get('info')
  getWebhookInfo() {
    const port = this.configService.get<number>('port') || 4000;
    const apiPrefix = this.configService.get<string>('apiPrefix') || 'api';
    const smeeUrl = this.configService.get<string>('github.smeeUrl') || 'https://smee.io/4Dskqsw7XjXJssg7';
    const webhookSecret = this.configService.get<string>('github.webhookSecret');

    return {
      localWebhookUrl: `http://localhost:${port}/${apiPrefix}/webhooks/github`,
      smeeUrl,
      hasWebhookSecret: Boolean(webhookSecret),
      supportedEvents: ['push', 'ping'],
      recentDeliveriesCount: this.processedDeliveries.size,
    };
  }

  /**
   * Webhook Simulation Endpoint: POST /api/webhooks/simulate
   * Allows the frontend to simulate a signed GitHub push or ping webhook.
   */
  @Post('simulate')
  async simulateWebhook(
    @Body()
    body: {
      owner?: string;
      repo?: string;
      ref?: string;
      event?: 'push' | 'ping';
      target?: 'local' | 'smee';
    },
  ) {
    const owner = body.owner?.trim() || 'ayanozoro';
    const repo = body.repo?.trim() || 'auth_service';
    const ref = body.ref?.trim() || 'main';
    const event = body.event || 'push';
    const target = body.target || 'local';

    const port = this.configService.get<number>('port') || 4000;
    const apiPrefix = this.configService.get<string>('apiPrefix') || 'api';
    const smeeUrl = this.configService.get<string>('github.smeeUrl') || 'https://smee.io/4Dskqsw7XjXJssg7';
    const webhookSecret = this.configService.get<string>('github.webhookSecret') || 'dghdfhsdfjsfgjsfgjf';

    const targetUrl =
      target === 'smee'
        ? smeeUrl
        : `http://localhost:${port}/${apiPrefix}/webhooks/github`;

    let payloadObj: any;
    if (event === 'ping') {
      payloadObj = {
        zen: 'Continuous security is automated security.',
        hook_id: 100000 + Math.floor(Math.random() * 900000),
        repository: {
          full_name: `${owner}/${repo}`,
          name: repo,
          owner: { login: owner },
        },
      };
    } else {
      payloadObj = {
        after: ref,
        ref: `refs/heads/${ref}`,
        repository: {
          full_name: `${owner}/${repo}`,
          name: repo,
          owner: { login: owner },
        },
        head_commit: {
          id: ref,
          message: 'Simulated commit push from frontend webhook tester',
          timestamp: new Date().toISOString(),
        },
      };
    }

    const payloadString = JSON.stringify(payloadObj);
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(payloadString);
    const signature = `sha256=${hmac.digest('hex')}`;
    const deliveryId = `sim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    this.logger.log(`Simulating [${event}] webhook targeted at: ${targetUrl} (Delivery: ${deliveryId})`);

    try {
      const res = await axios.post(targetUrl, payloadObj, {
        headers: {
          'Content-Type': 'application/json',
          'x-github-event': event,
          'x-github-delivery': deliveryId,
          'x-hub-signature-256': signature,
        },
        timeout: 45000,
      });

      return {
        success: true,
        event,
        target,
        targetUrl,
        deliveryId,
        signatureVerified: true,
        statusCode: res.status,
        data: res.data,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.error(`Simulated webhook delivery error: ${err.message}`);
      return {
        success: false,
        event,
        target,
        targetUrl,
        deliveryId,
        error: err.response?.data || err.message,
        statusCode: err.response?.status || 500,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Real-time Server-Sent Events (SSE) Stream: GET /api/webhooks/events
   * Streams live webhook deliveries and completed scans to connected frontend dashboards.
   */
  @Sse('events')
  streamWebhookEvents(): Observable<any> {
    return this.webhookEvents$.asObservable().pipe(
      map((event) => ({ data: event })),
    );
  }

  /**
   * Recent Activity Endpoint: GET /api/webhooks/activity
   * Returns recent webhook scans and ping deliveries.
   */
  @Get('activity')
  getActivity() {
    return {
      connectedRepo: 'ayanozoro/auth_service',
      totalDeliveries: this.recentActivity.length,
      activity: this.recentActivity,
    };
  }

  /**
   * Connected Repository Status Endpoint: GET /api/webhooks/repo-status
   * Returns Vercel-like repository connection and webhook health status.
   */
  @Get('repo-status')
  getRepoStatus() {
    const port = this.configService.get<number>('port') || 4000;
    const apiPrefix = this.configService.get<string>('apiPrefix') || 'api';
    const smeeUrl = this.configService.get<string>('github.smeeUrl') || 'https://smee.io/4Dskqsw7XjXJssg7';
    const webhookSecret = this.configService.get<string>('github.webhookSecret');

    const lastPush = this.recentActivity.find((a) => a.event === 'push');

    return {
      repository: 'ayanozoro/auth_service',
      owner: 'ayanozoro',
      repoName: 'auth_service',
      defaultBranch: 'main',
      connectionStatus: 'connected',
      autoScanOnPush: true,
      provider: 'github',
      webhook: {
        registered: true,
        smeeTunnelUrl: smeeUrl,
        localReceiverUrl: `http://localhost:${port}/${apiPrefix}/webhooks/github`,
        hmacSecretEnforced: Boolean(webhookSecret),
        subscribedEvents: ['push', 'ping'],
      },
      lastScan: lastPush
        ? {
            commitSha: lastPush.commitSha,
            timestamp: lastPush.timestamp,
            findingsCount: lastPush.findingsCount,
            status: lastPush.status,
          }
        : null,
    };
  }
}
