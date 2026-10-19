import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { OsvService } from './osv/osv.service';
import { BatchScanResult, PackageDependency } from './osv/osv.types';

@Controller('scanner')
export class ScannerController {
  constructor(private readonly osvService: OsvService) {}

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
   * Scans a list of dependencies sent in request body, or a default sample set if empty.
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
}
