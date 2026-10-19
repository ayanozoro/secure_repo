import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  PackageDependency,
  NormalizedFinding,
  DependencyScanResult,
  BatchScanResult,
  SeverityLevel,
  SeverityCounts,
  OsvVulnerability,
  OsvBatchQueryRequest,
  OsvBatchQueryResponse,
  OsvSingleQueryResponse,
  OsvRange,
} from './osv.types';

interface CacheEntry {
  vulns: OsvVulnerability[];
  expiresAt: number;
}

@Injectable()
export class OsvService {
  private readonly logger = new Logger(OsvService.name);
  private readonly httpClient: AxiosInstance;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxConcurrency: number;
  private readonly cacheTtlMs: number;
  private readonly batchSize: number;
  private readonly retryDelayMs: number;

  // In-memory cache keyed by "ecosystem:name@version" or "vuln:id"
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('osv.baseUrl') || 'https://api.osv.dev/v1';
    this.timeoutMs = this.configService.get<number>('osv.timeoutMs') || 10000;
    this.maxConcurrency = this.configService.get<number>('osv.maxConcurrency') || 5;
    this.cacheTtlMs = this.configService.get<number>('osv.cacheTtlMs') || 3600000;
    this.batchSize = this.configService.get<number>('osv.batchSize') || 100;
    this.retryDelayMs = this.configService.get<number>('osv.retryDelayMs') || 300;

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SecureDevOps-Scanner/1.0',
      },
    });
  }

  /**
   * Generates a cache key for a package and version.
   */
  private getCacheKey(ecosystem: string, name: string, version: string): string {
    return `${ecosystem.toLowerCase()}:${name.toLowerCase()}@${version}`;
  }

  /**
   * Retrieves cached vulnerabilities if not expired.
   */
  public getFromCache(ecosystem: string, name: string, version: string): OsvVulnerability[] | null {
    const key = this.getCacheKey(ecosystem, name, version);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.vulns;
  }

  /**
   * Stores vulnerabilities in cache with TTL.
   */
  public setInCache(ecosystem: string, name: string, version: string, vulns: OsvVulnerability[]): void {
    const key = this.getCacheKey(ecosystem, name, version);
    this.cache.set(key, {
      vulns,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  /**
   * Clears the in-memory cache (useful for testing or cache invalidation).
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Returns current cache stats.
   */
  public getCacheStats(): { size: number } {
    return { size: this.cache.size };
  }

  /**
   * Retrieves a full vulnerability record by ID.
   */
  public async getVulnerabilityById(id: string): Promise<OsvVulnerability | null> {
    if (!id) return null;
    const cacheKey = `vuln:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() <= cached.expiresAt) {
      return cached.vulns[0] || null;
    }

    try {
      const vuln = await this.executeWithRetry(async () => {
        const response = await this.httpClient.get<OsvVulnerability>(`/vulns/${encodeURIComponent(id)}`);
        return response.data;
      });

      if (vuln) {
        this.cache.set(cacheKey, {
          vulns: [vuln],
          expiresAt: Date.now() + this.cacheTtlMs,
        });
        return vuln;
      }
      return null;
    } catch (err) {
      this.logger.warn(`Failed to fetch details for vulnerability ${id}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Query OSV API for a single package.
   */
  public async queryPackage(
    packageName: string,
    version: string,
    ecosystem = 'npm',
  ): Promise<OsvVulnerability[]> {
    if (!packageName || !version) {
      throw new Error('Package name and version are required.');
    }

    const cached = this.getFromCache(ecosystem, packageName, version);
    if (cached) {
      return cached;
    }

    const payload = {
      package: {
        name: packageName,
        ecosystem,
      },
      version,
    };

    const vulns = await this.executeWithRetry(async () => {
      const response = await this.httpClient.post<OsvSingleQueryResponse>('/query', payload);
      return response.data?.vulns || [];
    });

    this.setInCache(ecosystem, packageName, version, vulns);
    return vulns;
  }

  /**
   * Scans a list of dependencies using batch queries, concurrency limits, and caching.
   */
  public async scanDependencies(dependencies: PackageDependency[]): Promise<BatchScanResult> {
    const startTime = Date.now();

    // 1. Sanitize & validate dependencies
    const validDeps: PackageDependency[] = [];
    for (const dep of dependencies) {
      if (dep && typeof dep.name === 'string' && dep.name.trim() && typeof dep.version === 'string' && dep.version.trim()) {
        validDeps.push({
          name: dep.name.trim(),
          version: dep.version.trim(),
          ecosystem: dep.ecosystem?.trim() || 'npm',
          dependencyType: dep.dependencyType || 'direct',
          isDev: Boolean(dep.isDev),
        });
      } else {
        this.logger.warn(`Skipping invalid dependency entry: ${JSON.stringify(dep)}`);
      }
    }

    if (validDeps.length === 0) {
      return {
        totalDependencies: 0,
        vulnerableDependencies: 0,
        totalFindings: 0,
        findings: [],
        dependencyResults: [],
        severityCounts: this.getEmptySeverityCounts(),
        cachedCount: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Separate cached items from items that need network query
    let cachedCount = 0;
    const depResults: DependencyScanResult[] = [];
    const uncachedDeps: { dep: PackageDependency; index: number }[] = [];

    for (let i = 0; i < validDeps.length; i++) {
      const dep = validDeps[i];
      const cachedVulns = this.getFromCache(dep.ecosystem!, dep.name, dep.version);

      if (cachedVulns !== null) {
        cachedCount++;
        const findings = this.normalizeVulnerabilities(cachedVulns, dep);
        depResults.push({
          packageName: dep.name,
          installedVersion: dep.version,
          ecosystem: dep.ecosystem!,
          dependencyType: dep.dependencyType!,
          isDev: dep.isDev!,
          isVulnerable: findings.length > 0,
          findings,
          fromCache: true,
        });
      } else {
        uncachedDeps.push({ dep, index: i });
      }
    }

    // 3. Process uncached items in chunks using OSV batch API
    if (uncachedDeps.length > 0) {
      const chunks = this.chunkArray(uncachedDeps, this.batchSize);
      const chunkResults = await this.processBatchesWithConcurrency(chunks);

      for (const itemResult of chunkResults) {
        const { dep, vulns, error } = itemResult;
        if (error) {
          depResults.push({
            packageName: dep.name,
            installedVersion: dep.version,
            ecosystem: dep.ecosystem!,
            dependencyType: dep.dependencyType!,
            isDev: dep.isDev!,
            isVulnerable: false,
            findings: [],
            fromCache: false,
            error,
          });
        } else {
          this.setInCache(dep.ecosystem!, dep.name, dep.version, vulns);
          const findings = this.normalizeVulnerabilities(vulns, dep);
          depResults.push({
            packageName: dep.name,
            installedVersion: dep.version,
            ecosystem: dep.ecosystem!,
            dependencyType: dep.dependencyType!,
            isDev: dep.isDev!,
            isVulnerable: findings.length > 0,
            findings,
            fromCache: false,
          });
        }
      }
    }

    // 4. Aggregate all findings and calculate stats
    const allFindings: NormalizedFinding[] = [];
    const severityCounts = this.getEmptySeverityCounts();
    let vulnerableCount = 0;

    for (const res of depResults) {
      if (res.isVulnerable) {
        vulnerableCount++;
        for (const finding of res.findings) {
          allFindings.push(finding);
          this.incrementSeverityCount(severityCounts, finding.severity);
        }
      }
    }

    return {
      totalDependencies: validDeps.length,
      vulnerableDependencies: vulnerableCount,
      totalFindings: allFindings.length,
      findings: allFindings,
      dependencyResults: depResults,
      severityCounts,
      cachedCount,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Process multiple batch chunks with bounded concurrency.
   */
  private async processBatchesWithConcurrency(
    chunks: { dep: PackageDependency; index: number }[][],
  ): Promise<{ dep: PackageDependency; vulns: OsvVulnerability[]; error?: string }[]> {
    const results: { dep: PackageDependency; vulns: OsvVulnerability[]; error?: string }[] = [];
    const executing: Promise<void>[] = [];

    for (const chunk of chunks) {
      const p = this.processSingleBatchChunk(chunk).then((chunkResult) => {
        results.push(...chunkResult);
      });
      executing.push(p);

      if (executing.length >= this.maxConcurrency) {
        await Promise.race(executing);
        for (let i = executing.length - 1; i >= 0; i--) {
          const pRef = executing[i];
          let settled = false;
          pRef.then(() => { settled = true; }).catch(() => { settled = true; });
          if (settled) {
            executing.splice(i, 1);
          }
        }
      }
    }

    await Promise.all(executing);
    return results;
  }

  /**
   * Processes a single batch chunk via OSV batch API with hydration of detailed records.
   */
  private async processSingleBatchChunk(
    chunk: { dep: PackageDependency; index: number }[],
  ): Promise<{ dep: PackageDependency; vulns: OsvVulnerability[]; error?: string }[]> {
    const payload: OsvBatchQueryRequest = {
      queries: chunk.map((c) => ({
        package: {
          name: c.dep.name,
          ecosystem: c.dep.ecosystem || 'npm',
        },
        version: c.dep.version,
      })),
    };

    try {
      const responseData = await this.executeWithRetry(async () => {
        const response = await this.httpClient.post<OsvBatchQueryResponse>('/querybatch', payload);
        return response.data;
      });

      const batchResults = responseData?.results || [];
      const preliminaryResults = chunk.map((item, idx) => {
        const resultItem = batchResults[idx];
        const vulns = resultItem?.vulns || [];
        return {
          dep: item.dep,
          vulns,
        };
      });

      // Hydrate minimal OSV batch records with full vulnerability details
      return await this.enrichVulnerabilities(preliminaryResults);
    } catch (batchError) {
      this.logger.warn(
        `Batch query failed for chunk of ${chunk.length} items (${(batchError as Error).message}). Falling back to individual queries.`,
      );
      return this.fallbackIndividualQueries(chunk);
    }
  }

  /**
   * Enriches minimal batch vulnerabilities ({ id, modified }) with full vulnerability metadata.
   */
  private async enrichVulnerabilities(
    results: { dep: PackageDependency; vulns: OsvVulnerability[]; error?: string }[],
  ): Promise<{ dep: PackageDependency; vulns: OsvVulnerability[]; error?: string }[]> {
    // Collect unique IDs needing hydration (if summary or affected is missing)
    const neededIds = new Set<string>();
    for (const item of results) {
      for (const v of item.vulns) {
        if (v?.id && !v.summary && !v.affected && !v.details) {
          neededIds.add(v.id);
        }
      }
    }

    if (neededIds.size === 0) {
      return results;
    }

    // Hydrate IDs with bounded concurrency
    const idMap = new Map<string, OsvVulnerability>();
    const idList = Array.from(neededIds);
    const idChunks = this.chunkArray(idList, 10);

    for (const idChunk of idChunks) {
      await Promise.all(
        idChunk.map(async (id) => {
          const detailed = await this.getVulnerabilityById(id);
          if (detailed) {
            idMap.set(id, detailed);
          }
        }),
      );
    }

    // Replace minimal records with detailed records
    return results.map((item) => ({
      ...item,
      vulns: item.vulns.map((v) => {
        if (v?.id && idMap.has(v.id)) {
          return idMap.get(v.id)!;
        }
        return v;
      }),
    }));
  }

  /**
   * Fallback to individual queries if batch query fails.
   */
  private async fallbackIndividualQueries(
    chunk: { dep: PackageDependency; index: number }[],
  ): Promise<{ dep: PackageDependency; vulns: OsvVulnerability[]; error?: string }[]> {
    const results: { dep: PackageDependency; vulns: OsvVulnerability[]; error?: string }[] = [];

    for (const item of chunk) {
      try {
        const vulns = await this.queryPackage(item.dep.name, item.dep.version, item.dep.ecosystem);
        results.push({ dep: item.dep, vulns });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed individual query for ${item.dep.name}@${item.dep.version}: ${errMsg}`);
        results.push({
          dep: item.dep,
          vulns: [],
          error: errMsg,
        });
      }
    }

    return results;
  }

  /**
   * Normalizes raw OSV vulnerability objects into our standard NormalizedFinding schema.
   */
  public normalizeVulnerabilities(
    vulns: OsvVulnerability[],
    dep: PackageDependency,
  ): NormalizedFinding[] {
    if (!vulns || !Array.isArray(vulns)) return [];

    return vulns.map((v) => this.normalizeSingleVulnerability(v, dep));
  }

  /**
   * Normalizes a single OSV vulnerability object.
   */
  private normalizeSingleVulnerability(
    v: OsvVulnerability,
    dep: PackageDependency,
  ): NormalizedFinding {
    // 1. Severity extraction & normalization
    const { severity, cvssScore, cvssVector } = this.extractSeverity(v);

    // 2. Fixed version extraction
    const fixedVersion = this.extractFixedVersion(v, dep.name);

    // 3. Affected version range summary
    const affectedVersions = this.extractAffectedRange(v, dep.name);

    // 4. Aliases (CVE, GHSA, etc.)
    const aliases = Array.isArray(v.aliases) ? [...v.aliases] : [];

    // 5. References URLs
    const references: string[] = [];
    if (Array.isArray(v.references)) {
      for (const ref of v.references) {
        if (ref?.url) {
          references.push(ref.url);
        }
      }
    }

    // 6. CWE IDs
    const cwes: string[] = [];
    if (v.database_specific?.cwe_ids && Array.isArray(v.database_specific.cwe_ids)) {
      cwes.push(...v.database_specific.cwe_ids);
    }

    return {
      packageName: dep.name,
      installedVersion: dep.version,
      ecosystem: dep.ecosystem || 'npm',
      dependencyType: dep.dependencyType || 'direct',
      isDev: Boolean(dep.isDev),
      osvId: v.id || 'UNKNOWN-ID',
      summary: v.summary || v.details?.slice(0, 150) || 'No summary available',
      details: v.details || v.summary || 'No detailed description available',
      aliases,
      severity,
      cvssScore,
      cvssVector,
      affectedVersions,
      fixedVersion,
      references,
      cwes,
      publishedAt: v.published || null,
      modifiedAt: v.modified || null,
    };
  }

  /**
   * Extracts severity level and CVSS details without inventing scores.
   */
  private extractSeverity(v: OsvVulnerability): {
    severity: SeverityLevel;
    cvssScore: number | null;
    cvssVector: string | null;
  } {
    let severity: SeverityLevel = 'UNKNOWN';
    let cvssScore: number | null = null;
    let cvssVector: string | null = null;

    // Check OSV severity array for CVSS
    if (Array.isArray(v.severity) && v.severity.length > 0) {
      for (const sev of v.severity) {
        if (sev?.score) {
          cvssVector = sev.score;
          const numeric = parseFloat(sev.score);
          if (!isNaN(numeric) && numeric >= 0 && numeric <= 10) {
            cvssScore = numeric;
          } else if (sev.score.startsWith('CVSS:3.')) {
            const calculated = this.calculateCvssV3Score(sev.score);
            if (calculated !== null) {
              cvssScore = calculated;
            }
          }
        }
      }
    }

    // Check database_specific.severity (e.g., GitHub Advisory, NVD)
    const dbSev = v.database_specific?.severity;
    if (typeof dbSev === 'string' && dbSev.trim()) {
      const normalized = dbSev.trim().toUpperCase();
      if (normalized === 'CRITICAL') severity = 'CRITICAL';
      else if (normalized === 'HIGH') severity = 'HIGH';
      else if (normalized === 'MODERATE' || normalized === 'MEDIUM') severity = 'MEDIUM';
      else if (normalized === 'LOW') severity = 'LOW';
    }

    // Check ecosystem_specific if still unknown
    if (severity === 'UNKNOWN' && v.affected && Array.isArray(v.affected)) {
      for (const aff of v.affected) {
        const ecoSev = aff.ecosystem_specific?.severity;
        if (typeof ecoSev === 'string' && ecoSev.trim()) {
          const norm = ecoSev.trim().toUpperCase();
          if (norm === 'CRITICAL') severity = 'CRITICAL';
          else if (norm === 'HIGH') severity = 'HIGH';
          else if (norm === 'MODERATE' || norm === 'MEDIUM') severity = 'MEDIUM';
          else if (norm === 'LOW') severity = 'LOW';
          if (severity !== 'UNKNOWN') break;
        }
      }
    }

    // If numeric CVSS score exists and severity is still unknown, map standard CVSS v3 ranges
    if (cvssScore !== null && severity === 'UNKNOWN') {
      if (cvssScore >= 9.0) severity = 'CRITICAL';
      else if (cvssScore >= 7.0) severity = 'HIGH';
      else if (cvssScore >= 4.0) severity = 'MEDIUM';
      else if (cvssScore > 0.0) severity = 'LOW';
    }

    return { severity, cvssScore, cvssVector };
  }

  /**
   * Calculates CVSS v3.x base score from a vector string.
   * Format example: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
   */
  public calculateCvssV3Score(vector: string): number | null {
    if (!vector || !vector.startsWith('CVSS:3.')) return null;

    const metrics: Record<string, string> = {};
    const parts = vector.split('/');
    for (const part of parts.slice(1)) {
      const [key, val] = part.split(':');
      if (key && val) metrics[key] = val;
    }

    const { AV, AC, PR, UI, S, C, I, A } = metrics;
    if (!AV || !AC || !PR || !UI || !S || !C || !I || !A) return null;

    const avMap: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
    const acMap: Record<string, number> = { L: 0.77, H: 0.44 };
    const uiMap: Record<string, number> = { N: 0.85, R: 0.62 };
    const cMap: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };
    const iMap: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };
    const aMap: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };

    const avVal = avMap[AV] ?? 0.85;
    const acVal = acMap[AC] ?? 0.77;
    const uiVal = uiMap[UI] ?? 0.85;
    const cVal = cMap[C] ?? 0;
    const iVal = iMap[I] ?? 0;
    const aVal = aMap[A] ?? 0;

    let prVal = 0.85;
    if (PR === 'N') prVal = 0.85;
    else if (PR === 'L') prVal = S === 'C' ? 0.68 : 0.62;
    else if (PR === 'H') prVal = S === 'C' ? 0.5 : 0.27;

    const iss = 1 - (1 - cVal) * (1 - iVal) * (1 - aVal);
    let impact = 0;
    if (S === 'U') {
      impact = 6.42 * iss;
    } else {
      impact = 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
    }

    const exploitability = 8.22 * avVal * acVal * prVal * uiVal;

    if (impact <= 0) return 0.0;

    let baseScore = 0;
    if (S === 'U') {
      baseScore = Math.min(impact + exploitability, 10);
    } else {
      baseScore = Math.min(1.08 * (impact + exploitability), 10);
    }

    return Math.ceil(baseScore * 10) / 10;
  }

  /**
   * Extracts the fixed version for a package from OSV ranges events.
   */
  private extractFixedVersion(v: OsvVulnerability, packageName: string): string | null {
    if (!v.affected || !Array.isArray(v.affected)) return null;

    const fixedVersions: string[] = [];

    for (const aff of v.affected) {
      if (aff.package?.name?.toLowerCase() === packageName.toLowerCase() && Array.isArray(aff.ranges)) {
        for (const range of aff.ranges) {
          if (Array.isArray(range.events)) {
            for (const event of range.events) {
              if (event.fixed && typeof event.fixed === 'string') {
                fixedVersions.push(event.fixed);
              }
            }
          }
        }
      }
    }

    if (fixedVersions.length === 0) return null;
    const unique = Array.from(new Set(fixedVersions));
    return unique.join(', ');
  }

  /**
   * Extracts human-readable affected version ranges.
   */
  private extractAffectedRange(v: OsvVulnerability, packageName: string): string {
    if (!v.affected || !Array.isArray(v.affected)) return 'Unknown';

    const rangeDescriptions: string[] = [];

    for (const aff of v.affected) {
      if (aff.package?.name?.toLowerCase() === packageName.toLowerCase()) {
        if (Array.isArray(aff.ranges)) {
          for (const range of aff.ranges) {
            const desc = this.formatRangeEvents(range);
            if (desc) rangeDescriptions.push(desc);
          }
        }
        if (rangeDescriptions.length === 0 && Array.isArray(aff.versions) && aff.versions.length > 0) {
          if (aff.versions.length <= 3) {
            rangeDescriptions.push(`Versions: ${aff.versions.join(', ')}`);
          } else {
            rangeDescriptions.push(`${aff.versions.length} versions affected`);
          }
        }
      }
    }

    return rangeDescriptions.length > 0 ? rangeDescriptions.join('; ') : 'Unknown';
  }

  /**
   * Formats range events into a readable string (e.g., ">= 4.0.0, < 4.17.21").
   */
  private formatRangeEvents(range: OsvRange): string | null {
    if (!range.events || !Array.isArray(range.events)) return null;

    const parts: string[] = [];
    let introduced: string | null = null;
    let fixed: string | null = null;
    let lastAffected: string | null = null;

    for (const event of range.events) {
      if (event.introduced !== undefined) {
        introduced = event.introduced;
      }
      if (event.fixed !== undefined) {
        fixed = event.fixed;
      }
      if (event.last_affected !== undefined) {
        lastAffected = event.last_affected;
      }
    }

    if (introduced && introduced !== '0') {
      parts.push(`>= ${introduced}`);
    }
    if (fixed) {
      parts.push(`< ${fixed}`);
    } else if (lastAffected) {
      parts.push(`<= ${lastAffected}`);
    }

    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Helper to execute an async operation with exponential backoff on retryable HTTP errors.
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 2, baseDelayMs = this.retryDelayMs): Promise<T> {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await fn();
      } catch (error) {
        attempt++;
        const isAxiosErr = axios.isAxiosError(error);
        const status = isAxiosErr ? error.response?.status : null;

        // Retry on 429 (rate limit) or 5xx (server errors) or network timeout
        const isRateLimit = status === 429;
        const isServerError = status && status >= 500 && status < 600;
        const isNetworkTimeout = isAxiosErr && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT');

        const isRetryable = isRateLimit || isServerError || isNetworkTimeout;

        if (!isRetryable || attempt > maxRetries) {
          throw error;
        }

        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 50;
        this.logger.warn(`OSV request failed (status: ${status || error.code}). Retrying in ${Math.round(delay)}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Splits an array into smaller chunks.
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Returns empty severity counters.
   */
  private getEmptySeverityCounts(): SeverityCounts {
    return {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0,
    };
  }

  /**
   * Increments the appropriate severity counter.
   */
  private incrementSeverityCount(counts: SeverityCounts, severity: SeverityLevel): void {
    switch (severity) {
      case 'CRITICAL':
        counts.critical++;
        break;
      case 'HIGH':
        counts.high++;
        break;
      case 'MEDIUM':
        counts.medium++;
        break;
      case 'LOW':
        counts.low++;
        break;
      default:
        counts.unknown++;
        break;
    }
  }
}
