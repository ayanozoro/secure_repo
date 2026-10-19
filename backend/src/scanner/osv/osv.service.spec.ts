import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OsvService } from './osv.service';
import { PackageDependency, OsvVulnerability } from './osv.types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OsvService', () => {
  let service: OsvService;
  let mockAxiosInstance: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    mockedAxios.isAxiosError.mockImplementation((err: any) => err?.isAxiosError === true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OsvService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'osv.baseUrl') return 'https://api.osv.dev/v1';
              if (key === 'osv.timeoutMs') return 5000;
              if (key === 'osv.maxConcurrency') return 2;
              if (key === 'osv.cacheTtlMs') return 60000;
              if (key === 'osv.batchSize') return 2; // small batch size to test chunking
              if (key === 'osv.retryDelayMs') return 1; // fast retries in tests
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OsvService>(OsvService);
    service.clearCache();
  });

  afterEach(() => {
    service.clearCache();
  });

  describe('queryPackage', () => {
    it('should query single package and return vulnerabilities', async () => {
      const mockVulns: OsvVulnerability[] = [
        {
          id: 'GHSA-29mw-wpgm-hmr9',
          aliases: ['CVE-2020-28500'],
          summary: 'ReDoS in lodash',
          details: 'Detailed description of ReDoS in lodash',
          database_specific: {
            severity: 'MODERATE',
            cwe_ids: ['CWE-1333'],
          },
          affected: [
            {
              package: { name: 'lodash', ecosystem: 'npm' },
              ranges: [
                {
                  type: 'SEMVER',
                  events: [{ introduced: '4.0.0' }, { fixed: '4.17.21' }],
                },
              ],
            },
          ],
        },
      ];

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { vulns: mockVulns },
      });

      const result = await service.queryPackage('lodash', '4.17.15');
      expect(result).toEqual(mockVulns);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/query', {
        package: { name: 'lodash', ecosystem: 'npm' },
        version: '4.17.15',
      });
    });

    it('should throw an error if package name or version is missing', async () => {
      await expect(service.queryPackage('', '1.0.0')).rejects.toThrow('Package name and version are required.');
      await expect(service.queryPackage('lodash', '')).rejects.toThrow('Package name and version are required.');
    });

    it('should return from cache on subsequent queries without invoking HTTP', async () => {
      const mockVulns: OsvVulnerability[] = [{ id: 'GHSA-test-123' }];
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: { vulns: mockVulns },
      });

      const first = await service.queryPackage('lodash', '4.17.15');
      const second = await service.queryPackage('lodash', '4.17.15');

      expect(first).toEqual(mockVulns);
      expect(second).toEqual(mockVulns);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('scanDependencies', () => {
    it('should handle empty dependency list gracefully', async () => {
      const result = await service.scanDependencies([]);
      expect(result.totalDependencies).toBe(0);
      expect(result.vulnerableDependencies).toBe(0);
      expect(result.findings).toEqual([]);
      expect(result.cachedCount).toBe(0);
      expect(mockAxiosInstance.post).not.toHaveBeenCalled();
    });

    it('should scan dependencies using batch query and normalize findings', async () => {
      const deps: PackageDependency[] = [
        { name: 'lodash', version: '4.17.15', dependencyType: 'direct', isDev: false },
        { name: 'react', version: '18.2.0', dependencyType: 'direct', isDev: false },
      ];

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          results: [
            {
              vulns: [
                {
                  id: 'GHSA-29mw-wpgm-hmr9',
                  aliases: ['CVE-2020-28500'],
                  summary: 'ReDoS in lodash',
                  details: 'Full details here',
                  database_specific: {
                    severity: 'MODERATE',
                    cwe_ids: ['CWE-1333'],
                  },
                  affected: [
                    {
                      package: { name: 'lodash', ecosystem: 'npm' },
                      ranges: [
                        {
                          type: 'SEMVER',
                          events: [{ introduced: '4.0.0' }, { fixed: '4.17.21' }],
                        },
                      ],
                    },
                  ],
                  references: [{ type: 'WEB', url: 'https://nvd.nist.gov/vuln/detail/CVE-2020-28500' }],
                },
              ],
            },
            {}, // react has no vulns
          ],
        },
      });

      const scanResult = await service.scanDependencies(deps);

      expect(scanResult.totalDependencies).toBe(2);
      expect(scanResult.vulnerableDependencies).toBe(1);
      expect(scanResult.totalFindings).toBe(1);
      expect(scanResult.severityCounts.medium).toBe(1);
      expect(scanResult.severityCounts.high).toBe(0);

      const finding = scanResult.findings[0];
      expect(finding.packageName).toBe('lodash');
      expect(finding.installedVersion).toBe('4.17.15');
      expect(finding.osvId).toBe('GHSA-29mw-wpgm-hmr9');
      expect(finding.aliases).toContain('CVE-2020-28500');
      expect(finding.severity).toBe('MEDIUM'); // MODERATE mapped to MEDIUM
      expect(finding.fixedVersion).toBe('4.17.21');
      expect(finding.affectedVersions).toContain('>= 4.0.0, < 4.17.21');
      expect(finding.cwes).toContain('CWE-1333');
      expect(finding.references).toContain('https://nvd.nist.gov/vuln/detail/CVE-2020-28500');
    });

    it('should correctly handle packages with UNKNOWN severity when severity data is absent', async () => {
      const deps: PackageDependency[] = [
        { name: 'mysterious-pkg', version: '0.1.0' },
      ];

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          results: [
            {
              vulns: [
                {
                  id: 'GHSA-unknown-sev',
                  summary: 'Something happened',
                  affected: [
                    {
                      package: { name: 'mysterious-pkg', ecosystem: 'npm' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      const scanResult = await service.scanDependencies(deps);
      expect(scanResult.totalFindings).toBe(1);
      expect(scanResult.findings[0].severity).toBe('UNKNOWN');
      expect(scanResult.severityCounts.unknown).toBe(1);
    });

    it('should correctly map CVSS numeric scores to CRITICAL / HIGH / MEDIUM / LOW', () => {
      const makeVulnWithScore = (score: string): OsvVulnerability => ({
        id: 'TEST-VULN',
        severity: [{ type: 'CVSS_V3', score }],
      });

      const dep: PackageDependency = { name: 'test-pkg', version: '1.0.0' };

      const crit = service.normalizeVulnerabilities([makeVulnWithScore('9.8')], dep);
      expect(crit[0].severity).toBe('CRITICAL');
      expect(crit[0].cvssScore).toBe(9.8);

      const high = service.normalizeVulnerabilities([makeVulnWithScore('7.5')], dep);
      expect(high[0].severity).toBe('HIGH');
      expect(high[0].cvssScore).toBe(7.5);

      const med = service.normalizeVulnerabilities([makeVulnWithScore('5.3')], dep);
      expect(med[0].severity).toBe('MEDIUM');
      expect(med[0].cvssScore).toBe(5.3);

      const low = service.normalizeVulnerabilities([makeVulnWithScore('2.1')], dep);
      expect(low[0].severity).toBe('LOW');
      expect(low[0].cvssScore).toBe(2.1);
    });

    it('should retry on HTTP 429 (rate limit) and succeed on subsequent attempt', async () => {
      const rateLimitErr = {
        isAxiosError: true,
        response: { status: 429 },
        message: 'Too Many Requests',
      };

      const successResponse = {
        data: {
          results: [{}],
        },
      };

      mockAxiosInstance.post
        .mockRejectedValueOnce(rateLimitErr)
        .mockResolvedValueOnce(successResponse);

      const deps: PackageDependency[] = [{ name: 'axios', version: '1.0.0' }];
      const result = await service.scanDependencies(deps);

      expect(result.totalDependencies).toBe(1);
      expect(result.vulnerableDependencies).toBe(0);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });

    it('should fallback to individual queries if batch query fails permanently', async () => {
      const serverErr = {
        isAxiosError: true,
        response: { status: 500 },
        message: 'Internal Server Error',
      };

      // Batch query fails all retries
      mockAxiosInstance.post.mockRejectedValue(serverErr);

      const deps: PackageDependency[] = [{ name: 'fail-pkg', version: '1.0.0' }];
      const result = await service.scanDependencies(deps);

      expect(result.totalDependencies).toBe(1);
      expect(result.vulnerableDependencies).toBe(0);
      expect(result.dependencyResults[0].error).toBeDefined();
    });

    it('should hydrate minimal vulnerability records from batch query by fetching details', async () => {
      const deps: PackageDependency[] = [{ name: 'lodash', version: '4.17.15' }];

      // Batch query returns minimal record
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          results: [
            {
              vulns: [{ id: 'GHSA-29mw-wpgm-hmr9' }],
            },
          ],
        },
      });

      // Hydration GET call
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          id: 'GHSA-29mw-wpgm-hmr9',
          summary: 'ReDoS in lodash',
          database_specific: { severity: 'HIGH' },
          affected: [
            {
              package: { name: 'lodash', ecosystem: 'npm' },
              ranges: [{ type: 'SEMVER', events: [{ fixed: '4.17.21' }] }],
            },
          ],
        },
      });

      const result = await service.scanDependencies(deps);
      expect(result.totalFindings).toBe(1);
      expect(result.findings[0].summary).toBe('ReDoS in lodash');
      expect(result.findings[0].severity).toBe('HIGH');
      expect(result.findings[0].fixedVersion).toBe('4.17.21');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/vulns/GHSA-29mw-wpgm-hmr9');
    });

    it('should calculate CVSS v3.1 base score accurately from vector', () => {
      // Standard CVSS 3.1 vector for 9.8 Critical
      const vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';
      const score = service.calculateCvssV3Score(vector);
      expect(score).toBe(9.8);

      // Low score vector
      const lowVector = 'CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N';
      const lowScore = service.calculateCvssV3Score(lowVector);
      expect(lowScore).toBeDefined();
      expect(lowScore).toBeLessThan(3.0);
    });

    it('should leverage cache when repeated packages are scanned', async () => {
      const deps: PackageDependency[] = [
        { name: 'semver', version: '7.3.5', dependencyType: 'direct' },
        { name: 'semver', version: '7.3.5', dependencyType: 'transitive' },
      ];

      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          results: [{}],
        },
      });

      service.setInCache('npm', 'semver', '7.3.5', []);

      const result = await service.scanDependencies(deps);

      expect(result.cachedCount).toBe(2);
      expect(mockAxiosInstance.post).not.toHaveBeenCalled();
      expect(result.totalDependencies).toBe(2);
    });

    it('should fetch and cache individual vulnerability details by ID', async () => {
      const vulnDetails: OsvVulnerability = {
        id: 'GHSA-test-id',
        summary: 'Test Vulnerability',
      };

      mockAxiosInstance.get.mockResolvedValueOnce({ data: vulnDetails });

      const first = await service.getVulnerabilityById('GHSA-test-id');
      const second = await service.getVulnerabilityById('GHSA-test-id');

      expect(first).toEqual(vulnDetails);
      expect(second).toEqual(vulnDetails);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });
  });
});
