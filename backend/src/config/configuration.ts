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
  };
  github: {
    appId?: string;
    privateKey?: string;
    clientId?: string;
    clientSecret?: string;
    webhookSecret?: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '4000', 10),
  environment: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || 'api',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/securedevops?schema=public',
  osv: {
    baseUrl: process.env.OSV_API_BASE_URL || 'https://api.osv.dev/v1',
    timeoutMs: parseInt(process.env.OSV_REQUEST_TIMEOUT_MS || '10000', 10),
    maxConcurrency: parseInt(process.env.OSV_MAX_CONCURRENCY || '5', 10),
    cacheTtlMs: parseInt(process.env.OSV_CACHE_TTL_MS || '3600000', 10), // 1 hour
    batchSize: parseInt(process.env.OSV_BATCH_SIZE || '100', 10),
  },
  github: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  },
});
