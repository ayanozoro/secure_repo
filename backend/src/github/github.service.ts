import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';

interface InstallationTokenCache {
  token: string;
  expiresAt: number;
}

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private readonly httpClient: AxiosInstance;
  private readonly appId?: string;
  private readonly privateKey?: string;
  private readonly webhookSecret?: string;

  // Cache for installation access tokens: installationId -> { token, expiresAt }
  private readonly tokenCache = new Map<number, InstallationTokenCache>();

  constructor(private readonly configService: ConfigService) {
    this.appId = this.configService.get<string>('github.appId');
    this.privateKey = this.configService.get<string>('github.privateKey');
    this.webhookSecret = this.configService.get<string>('github.webhookSecret');

    this.httpClient = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SecureDevOps-Scanner/1.0',
      },
    });
  }

  /**
   * Generates a GitHub App JWT valid for 10 minutes.
   */
  public generateAppJwt(): string {
    if (!this.appId || !this.privateKey) {
      throw new Error('GitHub App ID and Private Key are required to generate an App JWT.');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const payload = {
      iat: now - 60, // 60 seconds in the past for clock drift
      exp: now + 600, // 10 minutes expiration
      iss: this.appId,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const message = `${encodedHeader}.${encodedPayload}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(message);
    const signature = signer.sign(this.privateKey, 'base64url');

    return `${message}.${signature}`;
  }

  /**
   * Retrieves an installation access token for a given installation ID.
   */
  public async getInstallationAccessToken(installationId: number): Promise<string> {
    const cached = this.tokenCache.get(installationId);
    if (cached && Date.now() < cached.expiresAt - 60000) {
      return cached.token;
    }

    const jwt = this.generateAppJwt();
    const response = await this.httpClient.post<{ token: string; expires_at: string }>(
      `/app/installations/${installationId}/access_tokens`,
      {},
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
    );

    const token = response.data.token;
    const expiresAt = new Date(response.data.expires_at).getTime();

    this.tokenCache.set(installationId, { token, expiresAt });
    return token;
  }

  /**
   * Fetches the content of a file from a repository at a specific commit or branch.
   * Returns raw string content, or null if the file is not found (HTTP 404).
   */
  public async getFileContent(
    owner: string,
    repo: string,
    filePath: string,
    ref?: string,
    installationId?: number,
  ): Promise<string | null> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.raw+json',
    };

    if (installationId) {
      const token = await this.getInstallationAccessToken(installationId);
      headers.Authorization = `Bearer ${token}`;
    }

    const params: Record<string, string> = {};
    if (ref) {
      params.ref = ref;
    }

    try {
      const response = await this.httpClient.get<string | Record<string, unknown>>(
        `/repos/${owner}/${repo}/contents/${filePath}`,
        {
          headers,
          params,
          responseType: 'text',
        },
      );

      if (typeof response.data === 'string') {
        return response.data;
      }
      return JSON.stringify(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Verifies the GitHub webhook HMAC SHA-256 signature.
   */
  public verifyWebhookSignature(rawBody: Buffer | string, signatureHeader?: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn('GITHUB_WEBHOOK_SECRET is not configured. Webhook signature check will be skipped or fail.');
      return false;
    }

    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(bodyBuffer);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    const receivedBuffer = Buffer.from(signatureHeader, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  }
}
