export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type DependencyType = 'direct' | 'transitive';

export interface PackageDependency {
  name: string;
  version: string;
  ecosystem?: string; // defaults to 'npm'
  dependencyType?: DependencyType;
  isDev?: boolean;
}

export interface NormalizedFinding {
  packageName: string;
  installedVersion: string;
  ecosystem: string;
  dependencyType: DependencyType;
  isDev: boolean;
  osvId: string;
  summary: string;
  details: string;
  aliases: string[];
  severity: SeverityLevel;
  cvssScore: number | null;
  cvssVector: string | null;
  affectedVersions: string;
  fixedVersion: string | null;
  references: string[];
  cwes: string[];
  publishedAt: string | null;
  modifiedAt: string | null;
}

export interface DependencyScanResult {
  packageName: string;
  installedVersion: string;
  ecosystem: string;
  dependencyType: DependencyType;
  isDev: boolean;
  isVulnerable: boolean;
  findings: NormalizedFinding[];
  fromCache?: boolean;
  error?: string;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

export interface BatchScanResult {
  totalDependencies: number;
  vulnerableDependencies: number;
  totalFindings: number;
  findings: NormalizedFinding[];
  dependencyResults: DependencyScanResult[];
  severityCounts: SeverityCounts;
  cachedCount: number;
  durationMs: number;
}

// ----------------------------------------------------
// Raw OSV API Schema Types
// ----------------------------------------------------

export interface OsvPackageSpec {
  name: string;
  ecosystem: string;
  purl?: string;
}

export interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

export interface OsvRange {
  type: string; // 'SEMVER' | 'ECOSYSTEM' | 'GIT'
  repo?: string;
  events: OsvEvent[];
  database_specific?: Record<string, unknown>;
}

export interface OsvAffected {
  package: OsvPackageSpec;
  ranges?: OsvRange[];
  versions?: string[];
  ecosystem_specific?: Record<string, unknown>;
  database_specific?: Record<string, unknown>;
}

export interface OsvReference {
  type: string;
  url: string;
}

export interface OsvSeverity {
  type: string; // 'CVSS_V3' | 'CVSS_V2'
  score: string;
}

export interface OsvVulnerability {
  schema_version?: string;
  id: string;
  modified?: string;
  published?: string;
  withdrawn?: string;
  aliases?: string[];
  related?: string[];
  summary?: string;
  details?: string;
  severity?: OsvSeverity[];
  affected?: OsvAffected[];
  references?: OsvReference[];
  database_specific?: {
    severity?: string;
    cwe_ids?: string[];
    github_reviewed?: boolean;
    github_reviewed_at?: string;
    nvd_published_at?: string;
    [key: string]: unknown;
  };
}

export interface OsvBatchQueryItem {
  package: {
    name: string;
    ecosystem: string;
  };
  version: string;
}

export interface OsvBatchQueryRequest {
  queries: OsvBatchQueryItem[];
}

export interface OsvBatchResultItem {
  vulns?: OsvVulnerability[];
}

export interface OsvBatchQueryResponse {
  results?: OsvBatchResultItem[];
}

export interface OsvSingleQueryResponse {
  vulns?: OsvVulnerability[];
}
