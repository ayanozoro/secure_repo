import { DependencyType } from '../osv/osv.types';

export interface ParsedDependency {
  name: string;
  version: string;
  ecosystem: 'npm';
  dependencyType: DependencyType; // 'direct' | 'transitive'
  isDev: boolean;
  installPaths: string[]; // e.g. ["node_modules/lodash", "node_modules/a/node_modules/lodash"]
  declaredRange?: string; // version range from package.json if direct, e.g. "^4.17.15"
}

export interface DependencyAnalysisResult {
  success: boolean;
  lockfilePresent: boolean;
  lockfileVersion?: number;
  totalDirect: number;
  totalTransitive: number;
  totalProd: number;
  totalDev: number;
  totalDependencies: number;
  dependencies: ParsedDependency[];
  warnings: string[];
  error?: string;
}

export interface PackageJsonStructure {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface PackageLockPackageEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  devOptional?: boolean;
  optional?: boolean;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface PackageLockDependencyEntryV1 {
  version?: string;
  dev?: boolean;
  requires?: Record<string, string>;
  dependencies?: Record<string, PackageLockDependencyEntryV1>;
  [key: string]: unknown;
}

export interface PackageLockStructure {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, PackageLockPackageEntry>;
  dependencies?: Record<string, PackageLockDependencyEntryV1>;
  [key: string]: unknown;
}
