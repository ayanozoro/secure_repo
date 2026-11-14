import * as fs from 'fs';
import * as path from 'path';

export interface AppConfig {
  port: number;
  environment: string;
  apiPrefix: string;
  databaseUrl: string;
  osv: {
    baseUrl: string;
    timeoutMs: number;
    maxConcurrency: number;
    cacheTtlMs: number;
    batchSize: number;
    retryDelayMs: number;
  };
  github: {
    appId?: string;
    privateKey?: string;
    clientId?: string;
    clientSecret?: string;
    webhookSecret?: string;
    smeeUrl?: string;
  };
}

function resolvePrivateKey(): string | undefined {
  const candidate = (
    process.env.GITHUB_APP_PRIVATE_KEY_PATH ||
    process.env.GITHUB_APP_PRIVATE_KEY ||
    ''
  )
    .trim()
    .replace(/^["']|["']$/g, '');

  if (!candidate) return undefined;

  // Check if candidate points to an existing file
  const candidatePath = path.isAbsolute(candidate)
    ? candidate
    : path.resolve(process.cwd(), candidate);

  if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
    return fs.readFileSync(candidatePath, 'utf8');
  }

  // Check in backend subdirectory if running from workspace root
  const backendCandidatePath = path.resolve(process.cwd(), 'backend', candidate);
  if (fs.existsSync(backendCandidatePath) && fs.statSync(backendCandidatePath).isFile()) {
    return fs.readFileSync(backendCandidatePath, 'utf8');
  }

  // Otherwise treat as raw key string
  return candidate.replace(/\\n/g, '\n');
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '4000', 10),
  environment: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || 'api',
  databaseUrl: (process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/securedevops?schema=public').trim(),
  osv: {
    baseUrl: (process.env.OSV_API_BASE_URL || 'https://api.osv.dev/v1').trim(),
    timeoutMs: parseInt(process.env.OSV_REQUEST_TIMEOUT_MS || '10000', 10),
    maxConcurrency: parseInt(process.env.OSV_MAX_CONCURRENCY || '5', 10),
    cacheTtlMs: parseInt(process.env.OSV_CACHE_TTL_MS || '3600000', 10),
    batchSize: parseInt(process.env.OSV_BATCH_SIZE || '100', 10),
    retryDelayMs: parseInt(process.env.OSV_RETRY_DELAY_MS || '300', 10),
  },
  github: {
    appId: process.env.GITHUB_APP_ID?.trim(),
    privateKey: resolvePrivateKey(),
    clientId: process.env.GITHUB_CLIENT_ID?.trim(),
    clientSecret: process.env.GITHUB_CLIENT_SECRET?.trim(),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET?.trim(),
    smeeUrl: process.env.SMEE_URL?.trim(),
  },
});
