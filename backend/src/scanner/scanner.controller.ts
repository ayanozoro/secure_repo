import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { OsvService } from './osv/osv.service';
import { DependencyParserService } from './parser/dependency-parser.service';
import { ScannerService, FileScanResult } from './scanner.service';
import { BatchScanResult, PackageDependency } from './osv/osv.types';
import { DependencyAnalysisResult } from './parser/dependency-parser.types';

@Controller('scanner')
export class ScannerController {
  constructor(
    private readonly osvService: OsvService,
    private readonly parserService: DependencyParserService,
    private readonly scannerService: ScannerService,
  ) {}

  /**
   * Health / status endpoint for the scanner.
   */
  @Get('status')
  getStatus() {
    return {
      status: 'ok',
      service: 'OsvScanner',
      cacheStats: this.osvService.getCacheStats(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Scans a single package by query params.
   * Example: GET /api/scanner/query?name=lodash&version=4.17.15
   */
  @Get('query')
  async querySingle(
    @Query('name') name: string,
    @Query('version') version: string,
    @Query('ecosystem') ecosystem = 'npm',
  ) {
    if (!name || !version) {
      return { error: 'Both name and version query parameters are required.' };
    }
    const vulns = await this.osvService.queryPackage(name, version, ecosystem);
    const normalized = this.osvService.normalizeVulnerabilities(vulns, {
      name,
      version,
      ecosystem,
    });
    return {
      package: name,
      version,
      ecosystem,
      vulnerabilityCount: normalized.length,
      isVulnerable: normalized.length > 0,
      findings: normalized,
    };
  }

  /**
   * Scans a raw list of dependencies sent in request body.
   * Example: POST /api/scanner/scan
   */
  @Post('scan')
  async scanDependencies(
    @Body() body: { dependencies?: PackageDependency[] },
  ): Promise<BatchScanResult> {
    const defaultSample: PackageDependency[] = [
      { name: 'lodash', version: '4.17.15', dependencyType: 'direct', isDev: false },
      { name: 'minimist', version: '1.2.0', dependencyType: 'transitive', isDev: false },
      { name: 'qs', version: '6.5.2', dependencyType: 'direct', isDev: false },
      { name: 'react', version: '18.2.0', dependencyType: 'direct', isDev: false },
      { name: 'typescript', version: '5.3.3', dependencyType: 'direct', isDev: true },
    ];

    const targetDependencies =
      body?.dependencies && Array.isArray(body.dependencies) && body.dependencies.length > 0
        ? body.dependencies
        : defaultSample;

    return this.osvService.scanDependencies(targetDependencies);
  }

  /**
   * Stage 2: Parses package.json and package-lock.json without scanning.
   * Example: POST /api/scanner/parse
   */
  @Post('parse')
  parseFiles(
    @Body() body: { packageJson?: string; packageLock?: string },
  ): DependencyAnalysisResult {
    return this.parserService.parseDependencies(body?.packageJson, body?.packageLock);
  }

  /**
   * Stage 2: Parses package.json and package-lock.json AND scans dependencies against OSV.
   * Example: POST /api/scanner/analyze
   */
  @Post('analyze')
  async analyzeFiles(
    @Body() body: { packageJson?: string; packageLock?: string },
  ): Promise<FileScanResult> {
    return this.scannerService.analyzeAndScan(body?.packageJson, body?.packageLock);
  }

  /**
   * Stage 2: Self-test endpoint that reads and scans backend's own package.json & package-lock.json!
   * Example: GET /api/scanner/self-test
   */
  @Get('self-test')
  async scanSelf(): Promise<FileScanResult> {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const lockPath = path.resolve(process.cwd(), 'package-lock.json');

    const pkgContent = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, 'utf8') : null;
    const lockContent = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8') : null;

    return this.scannerService.analyzeAndScan(pkgContent, lockContent);
  }
}
