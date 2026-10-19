import { Injectable, Logger } from '@nestjs/common';
import { OsvService } from './osv/osv.service';
import { DependencyParserService } from './parser/dependency-parser.service';
import { ParsedDependency } from './parser/dependency-parser.types';
import {
  NormalizedFinding,
  SeverityCounts,
  PackageDependency,
} from './osv/osv.types';

export interface FileScanResult {
  success: boolean;
  lockfilePresent: boolean;
  lockfileVersion?: number;
  metrics: {
    totalDependencies: number;
    directDependencies: number;
    transitiveDependencies: number;
    productionDependencies: number;
    developmentDependencies: number;
    vulnerableDependencies: number;
    totalFindings: number;
    severityCounts: SeverityCounts;
  };
  parsedDependencies: ParsedDependency[];
  findings: NormalizedFinding[];
  cachedCount: number;
  durationMs: number;
  warnings: string[];
  error?: string;
}

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly osvService: OsvService,
    private readonly parserService: DependencyParserService,
  ) {}

  /**
   * Analyzes package.json and package-lock.json, extracts exact dependencies,
   * and scans them against the OSV database.
   */
  public async analyzeAndScan(
    packageJsonContent?: string | null,
    lockfileContent?: string | null,
  ): Promise<FileScanResult> {
    const startTime = Date.now();

    // 1. Parse dependency files
    const parseResult = this.parserService.parseDependencies(
      packageJsonContent,
      lockfileContent,
    );

    if (!parseResult.success) {
      return {
        success: false,
        lockfilePresent: parseResult.lockfilePresent,
        lockfileVersion: parseResult.lockfileVersion,
        metrics: {
          totalDependencies: 0,
          directDependencies: 0,
          transitiveDependencies: 0,
          productionDependencies: 0,
          developmentDependencies: 0,
          vulnerableDependencies: 0,
          totalFindings: 0,
          severityCounts: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            unknown: 0,
          },
        },
        parsedDependencies: [],
        findings: [],
        cachedCount: 0,
        durationMs: Date.now() - startTime,
        warnings: parseResult.warnings,
        error: parseResult.error,
      };
    }

    // 2. Prepare dependencies for OSV scanning
    const targetDeps: PackageDependency[] = parseResult.dependencies.map((d) => ({
      name: d.name,
      version: d.version,
      ecosystem: d.ecosystem,
      dependencyType: d.dependencyType,
      isDev: d.isDev,
    }));

    // 3. Scan dependencies against OSV
    const scanResult = await this.osvService.scanDependencies(targetDeps);

    return {
      success: true,
      lockfilePresent: true,
      lockfileVersion: parseResult.lockfileVersion,
      metrics: {
        totalDependencies: parseResult.totalDependencies,
        directDependencies: parseResult.totalDirect,
        transitiveDependencies: parseResult.totalTransitive,
        productionDependencies: parseResult.totalProd,
        developmentDependencies: parseResult.totalDev,
        vulnerableDependencies: scanResult.vulnerableDependencies,
        totalFindings: scanResult.totalFindings,
        severityCounts: scanResult.severityCounts,
      },
      parsedDependencies: parseResult.dependencies,
      findings: scanResult.findings,
      cachedCount: scanResult.cachedCount,
      durationMs: Date.now() - startTime,
      warnings: parseResult.warnings,
    };
  }
}
