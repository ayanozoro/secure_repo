import { Injectable, Logger } from '@nestjs/common';
import {
  ParsedDependency,
  DependencyAnalysisResult,
  PackageJsonStructure,
  PackageLockStructure,
  PackageLockPackageEntry,
  PackageLockDependencyEntryV1,
} from './dependency-parser.types';

@Injectable()
export class DependencyParserService {
  private readonly logger = new Logger(DependencyParserService.name);

  // Maximum allowed file size to prevent DoS (10MB for lockfile, 2MB for package.json)
  private readonly MAX_LOCKFILE_SIZE_BYTES = 10 * 1024 * 1024;
  private readonly MAX_PACKAGE_JSON_SIZE_BYTES = 2 * 1024 * 1024;

  /**
   * Parses repository dependency files (package.json & package-lock.json).
   * Lockfile is mandatory for exact version resolution.
   */
  public parseDependencies(
    packageJsonContent?: string | null,
    lockfileContent?: string | null,
  ): DependencyAnalysisResult {
    const warnings: string[] = [];

    // 1. Validate lockfile existence
    if (!lockfileContent || typeof lockfileContent !== 'string' || !lockfileContent.trim()) {
      return {
        success: false,
        lockfilePresent: false,
        totalDirect: 0,
        totalTransitive: 0,
        totalProd: 0,
        totalDev: 0,
        totalDependencies: 0,
        dependencies: [],
        warnings,
        error:
          'Exact dependency resolution is unavailable because package-lock.json is missing. SecureDevOps requires an exact lockfile and does not treat package.json version ranges as installed versions.',
      };
    }

    // 2. Validate file sizes
    if (lockfileContent.length > this.MAX_LOCKFILE_SIZE_BYTES) {
      return {
        success: false,
        lockfilePresent: true,
        totalDirect: 0,
        totalTransitive: 0,
        totalProd: 0,
        totalDev: 0,
        totalDependencies: 0,
        dependencies: [],
        warnings,
        error: `package-lock.json exceeds maximum allowed file size of ${this.MAX_LOCKFILE_SIZE_BYTES / (1024 * 1024)}MB.`,
      };
    }

    if (packageJsonContent && packageJsonContent.length > this.MAX_PACKAGE_JSON_SIZE_BYTES) {
      return {
        success: false,
        lockfilePresent: true,
        totalDirect: 0,
        totalTransitive: 0,
        totalProd: 0,
        totalDev: 0,
        totalDependencies: 0,
        dependencies: [],
        warnings,
        error: `package.json exceeds maximum allowed file size of ${this.MAX_PACKAGE_JSON_SIZE_BYTES / (1024 * 1024)}MB.`,
      };
    }

    // 3. Parse JSON payloads safely
    let packageJson: PackageJsonStructure = {};
    if (packageJsonContent && packageJsonContent.trim()) {
      try {
        packageJson = JSON.parse(packageJsonContent);
      } catch (err) {
        return {
          success: false,
          lockfilePresent: true,
          totalDirect: 0,
          totalTransitive: 0,
          totalProd: 0,
          totalDev: 0,
          totalDependencies: 0,
          dependencies: [],
          warnings,
          error: `Malformed package.json: ${(err as Error).message}`,
        };
      }
    } else {
      warnings.push('package.json was not provided. All dependencies will be classified based on lockfile metadata alone.');
    }

    let lockfile: PackageLockStructure;
    try {
      lockfile = JSON.parse(lockfileContent);
    } catch (err) {
      return {
        success: false,
        lockfilePresent: true,
        totalDirect: 0,
        totalTransitive: 0,
        totalProd: 0,
        totalDev: 0,
        totalDependencies: 0,
        dependencies: [],
        warnings,
        error: `Malformed package-lock.json: ${(err as Error).message}`,
      };
    }

    // 4. Extract direct dependencies and their declared version ranges from package.json
    const directProdRanges = new Map<string, string>();
    const directDevRanges = new Map<string, string>();

    if (packageJson.dependencies && typeof packageJson.dependencies === 'object') {
      for (const [name, range] of Object.entries(packageJson.dependencies)) {
        if (typeof range === 'string') directProdRanges.set(name, range);
      }
    }

    if (packageJson.devDependencies && typeof packageJson.devDependencies === 'object') {
      for (const [name, range] of Object.entries(packageJson.devDependencies)) {
        if (typeof range === 'string') directDevRanges.set(name, range);
      }
    }

    if (packageJson.optionalDependencies && typeof packageJson.optionalDependencies === 'object') {
      for (const [name, range] of Object.entries(packageJson.optionalDependencies)) {
        if (typeof range === 'string' && !directProdRanges.has(name)) directProdRanges.set(name, range);
      }
    }

    const lockfileVersion = lockfile.lockfileVersion || 1;

    // 5. Parse modern lockfile (v2 / v3) via the 'packages' map
    if (lockfile.packages && typeof lockfile.packages === 'object' && Object.keys(lockfile.packages).length > 0) {
      return this.parsePackagesSection(
        lockfile.packages,
        lockfileVersion,
        directProdRanges,
        directDevRanges,
        warnings,
      );
    }

    // 6. Fallback to v1 dependencies tree if 'packages' is absent
    if (lockfile.dependencies && typeof lockfile.dependencies === 'object') {
      return this.parseLegacyDependenciesSection(
        lockfile.dependencies,
        lockfileVersion,
        directProdRanges,
        directDevRanges,
        warnings,
      );
    }

    return {
      success: true,
      lockfilePresent: true,
      lockfileVersion,
      totalDirect: 0,
      totalTransitive: 0,
      totalProd: 0,
      totalDev: 0,
      totalDependencies: 0,
      dependencies: [],
      warnings: [...warnings, 'package-lock.json does not contain any dependencies.'],
    };
  }

  /**
   * Parses modern npm lockfile v2/v3 'packages' structure.
   */
  private parsePackagesSection(
    packages: Record<string, PackageLockPackageEntry>,
    lockfileVersion: number,
    directProdRanges: Map<string, string>,
    directDevRanges: Map<string, string>,
    warnings: string[],
  ): DependencyAnalysisResult {
    // Key: "name@version" -> ParsedDependency
    const depMap = new Map<string, ParsedDependency>();

    // Also check root package entry packages[""] if package.json was missing or incomplete
    const rootEntry = packages[''];
    if (rootEntry) {
      if (rootEntry.dependencies && typeof rootEntry.dependencies === 'object') {
        for (const [name, range] of Object.entries(rootEntry.dependencies)) {
          if (!directProdRanges.has(name) && typeof range === 'string') {
            directProdRanges.set(name, range);
          }
        }
      }
      if (rootEntry.devDependencies && typeof rootEntry.devDependencies === 'object') {
        for (const [name, range] of Object.entries(rootEntry.devDependencies)) {
          if (!directDevRanges.has(name) && typeof range === 'string') {
            directDevRanges.set(name, range);
          }
        }
      }
    }

    for (const [pathKey, entry] of Object.entries(packages)) {
      // Skip root project itself
      if (pathKey === '' || !pathKey.includes('node_modules/')) {
        continue;
      }

      if (!entry || typeof entry !== 'object' || !entry.version || typeof entry.version !== 'string') {
        continue;
      }

      const packageName = this.extractPackageNameFromPath(pathKey);
      if (!packageName) {
        continue;
      }

      const version = entry.version.trim();
      const uniqueKey = `${packageName}@${version}`;

      // A package is direct if it is declared in root package.json AND is a top-level dependency
      const isTopLevel = pathKey === `node_modules/${packageName}`;
      const isDeclaredDirect = directProdRanges.has(packageName) || directDevRanges.has(packageName);
      const isDirect = isTopLevel && isDeclaredDirect;

      // Classification: Dev vs Prod
      let isDev = false;
      if (directDevRanges.has(packageName) && !directProdRanges.has(packageName)) {
        isDev = true;
      } else if (entry.dev === true && !directProdRanges.has(packageName)) {
        isDev = true;
      }

      const declaredRange = directProdRanges.get(packageName) || directDevRanges.get(packageName);

      if (depMap.has(uniqueKey)) {
        const existing = depMap.get(uniqueKey)!;
        existing.installPaths.push(pathKey);
        // If one of the installations is direct, promote the whole dependency to direct
        if (isDirect) {
          existing.dependencyType = 'direct';
          if (declaredRange) existing.declaredRange = declaredRange;
        }
        // If one installation is production, promote to production
        if (!isDev) {
          existing.isDev = false;
        }
      } else {
        depMap.set(uniqueKey, {
          name: packageName,
          version,
          ecosystem: 'npm',
          dependencyType: isDirect ? 'direct' : 'transitive',
          isDev,
          installPaths: [pathKey],
          declaredRange,
        });
      }
    }

    const dependencies = Array.from(depMap.values());
    return this.calculateSummary(dependencies, lockfileVersion, warnings);
  }

  /**
   * Parses legacy npm lockfile v1 'dependencies' hierarchical tree.
   */
  private parseLegacyDependenciesSection(
    dependenciesTree: Record<string, PackageLockDependencyEntryV1>,
    lockfileVersion: number,
    directProdRanges: Map<string, string>,
    directDevRanges: Map<string, string>,
    warnings: string[],
  ): DependencyAnalysisResult {
    const depMap = new Map<string, ParsedDependency>();

    const traverse = (
      tree: Record<string, PackageLockDependencyEntryV1>,
      parentPath: string,
      isTopLevel: boolean,
    ) => {
      for (const [name, entry] of Object.entries(tree)) {
        if (!entry || typeof entry !== 'object' || !entry.version || typeof entry.version !== 'string') {
          continue;
        }

        const version = entry.version.trim();
        const pathKey = parentPath ? `${parentPath}/node_modules/${name}` : `node_modules/${name}`;
        const uniqueKey = `${name}@${version}`;

        const isDeclaredDirect = directProdRanges.has(name) || directDevRanges.has(name);
        const isDirect = isTopLevel && isDeclaredDirect;

        let isDev = false;
        if (directDevRanges.has(name) && !directProdRanges.has(name)) {
          isDev = true;
        } else if (entry.dev === true && !directProdRanges.has(name)) {
          isDev = true;
        }

        const declaredRange = directProdRanges.get(name) || directDevRanges.get(name);

        if (depMap.has(uniqueKey)) {
          const existing = depMap.get(uniqueKey)!;
          existing.installPaths.push(pathKey);
          if (isDirect) {
            existing.dependencyType = 'direct';
            if (declaredRange) existing.declaredRange = declaredRange;
          }
          if (!isDev) {
            existing.isDev = false;
          }
        } else {
          depMap.set(uniqueKey, {
            name,
            version,
            ecosystem: 'npm',
            dependencyType: isDirect ? 'direct' : 'transitive',
            isDev,
            installPaths: [pathKey],
            declaredRange,
          });
        }

        // Recurse into nested dependencies
        if (entry.dependencies && typeof entry.dependencies === 'object') {
          traverse(entry.dependencies, pathKey, false);
        }
      }
    };

    traverse(dependenciesTree, '', true);

    const dependencies = Array.from(depMap.values());
    return this.calculateSummary(dependencies, lockfileVersion, warnings);
  }

  /**
   * Extracts package name from a path like:
   * "node_modules/lodash" -> "lodash"
   * "node_modules/@scope/pkg" -> "@scope/pkg"
   * "node_modules/a/node_modules/b" -> "b"
   * "node_modules/a/node_modules/@scope/pkg" -> "@scope/pkg"
   */
  private extractPackageNameFromPath(pathKey: string): string | null {
    const marker = 'node_modules/';
    const lastIndex = pathKey.lastIndexOf(marker);
    if (lastIndex === -1) return null;

    const remainder = pathKey.substring(lastIndex + marker.length);
    if (!remainder) return null;

    return remainder;
  }

  /**
   * Aggregates summary statistics for parsed dependencies.
   */
  private calculateSummary(
    dependencies: ParsedDependency[],
    lockfileVersion: number,
    warnings: string[],
  ): DependencyAnalysisResult {
    let totalDirect = 0;
    let totalTransitive = 0;
    let totalProd = 0;
    let totalDev = 0;

    for (const dep of dependencies) {
      if (dep.dependencyType === 'direct') {
        totalDirect++;
      } else {
        totalTransitive++;
      }

      if (dep.isDev) {
        totalDev++;
      } else {
        totalProd++;
      }
    }

    return {
      success: true,
      lockfilePresent: true,
      lockfileVersion,
      totalDirect,
      totalTransitive,
      totalProd,
      totalDev,
      totalDependencies: dependencies.length,
      dependencies,
      warnings,
    };
  }
}
