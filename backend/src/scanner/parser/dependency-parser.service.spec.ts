import { DependencyParserService } from './dependency-parser.service';

describe('DependencyParserService', () => {
  let service: DependencyParserService;

  beforeEach(() => {
    service = new DependencyParserService();
  });

  describe('parseDependencies', () => {
    it('should fail cleanly when package-lock.json is missing', () => {
      const packageJson = JSON.stringify({
        dependencies: { lodash: '^4.17.15' },
      });

      const result = service.parseDependencies(packageJson, null);

      expect(result.success).toBe(false);
      expect(result.lockfilePresent).toBe(false);
      expect(result.dependencies).toEqual([]);
      expect(result.error).toContain('Exact dependency resolution is unavailable because package-lock.json is missing');
    });

    it('should fail cleanly when package-lock.json is empty string', () => {
      const result = service.parseDependencies('{}', '   ');

      expect(result.success).toBe(false);
      expect(result.lockfilePresent).toBe(false);
      expect(result.error).toContain('Exact dependency resolution is unavailable');
    });

    it('should handle malformed JSON safely in lockfile', () => {
      const result = service.parseDependencies('{}', '{ invalid json ...');

      expect(result.success).toBe(false);
      expect(result.lockfilePresent).toBe(true);
      expect(result.error).toContain('Malformed package-lock.json');
    });

    it('should handle malformed JSON safely in package.json', () => {
      const lockfile = JSON.stringify({
        lockfileVersion: 2,
        packages: {
          '': {},
          'node_modules/lodash': { version: '4.17.21' },
        },
      });

      const result = service.parseDependencies('{ bad package.json', lockfile);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Malformed package.json');
    });

    it('should parse modern lockfile v2/v3 packages section correctly', () => {
      const packageJson = JSON.stringify({
        name: 'sample-app',
        dependencies: {
          express: '^4.18.2',
        },
        devDependencies: {
          jest: '^29.5.0',
        },
      });

      const lockfile = JSON.stringify({
        name: 'sample-app',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: { express: '^4.18.2' },
            devDependencies: { jest: '^29.5.0' },
          },
          'node_modules/express': {
            version: '4.18.2',
            dependencies: { accepts: '~1.3.8' },
          },
          'node_modules/accepts': {
            version: '1.3.8',
          },
          'node_modules/jest': {
            version: '29.5.0',
            dev: true,
          },
        },
      });

      const result = service.parseDependencies(packageJson, lockfile);

      expect(result.success).toBe(true);
      expect(result.lockfilePresent).toBe(true);
      expect(result.lockfileVersion).toBe(3);
      expect(result.totalDependencies).toBe(3);
      expect(result.totalDirect).toBe(2); // express, jest
      expect(result.totalTransitive).toBe(1); // accepts
      expect(result.totalProd).toBe(2); // express, accepts
      expect(result.totalDev).toBe(1); // jest

      const express = result.dependencies.find((d) => d.name === 'express');
      expect(express).toBeDefined();
      expect(express?.version).toBe('4.18.2');
      expect(express?.dependencyType).toBe('direct');
      expect(express?.isDev).toBe(false);
      expect(express?.declaredRange).toBe('^4.18.2');

      const accepts = result.dependencies.find((d) => d.name === 'accepts');
      expect(accepts).toBeDefined();
      expect(accepts?.version).toBe('1.3.8');
      expect(accepts?.dependencyType).toBe('transitive');
      expect(accepts?.isDev).toBe(false);

      const jestDep = result.dependencies.find((d) => d.name === 'jest');
      expect(jestDep).toBeDefined();
      expect(jestDep?.version).toBe('29.5.0');
      expect(jestDep?.dependencyType).toBe('direct');
      expect(jestDep?.isDev).toBe(true);
    });

    it('should correctly capture packages installed at multiple versions', () => {
      const packageJson = JSON.stringify({
        dependencies: {
          'lib-a': '^1.0.0',
          'lib-b': '^2.0.0',
        },
      });

      const lockfile = JSON.stringify({
        lockfileVersion: 2,
        packages: {
          '': {},
          'node_modules/lib-a': {
            version: '1.0.0',
          },
          'node_modules/lib-b': {
            version: '2.0.0',
          },
          // lib-a uses debug 2.6.9
          'node_modules/lib-a/node_modules/debug': {
            version: '2.6.9',
          },
          // top-level has debug 4.3.4
          'node_modules/debug': {
            version: '4.3.4',
          },
        },
      });

      const result = service.parseDependencies(packageJson, lockfile);

      expect(result.success).toBe(true);
      const debugVersions = result.dependencies.filter((d) => d.name === 'debug');
      expect(debugVersions).toHaveLength(2);

      const debug2 = debugVersions.find((d) => d.version === '2.6.9');
      expect(debug2).toBeDefined();
      expect(debug2?.installPaths).toContain('node_modules/lib-a/node_modules/debug');

      const debug4 = debugVersions.find((d) => d.version === '4.3.4');
      expect(debug4).toBeDefined();
      expect(debug4?.installPaths).toContain('node_modules/debug');
    });

    it('should parse scoped packages correctly in both top-level and nested paths', () => {
      const packageJson = JSON.stringify({
        dependencies: {
          '@nestjs/common': '^10.0.0',
        },
      });

      const lockfile = JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': {},
          'node_modules/@nestjs/common': {
            version: '10.3.3',
          },
          'node_modules/some-tool/node_modules/@types/node': {
            version: '20.11.24',
            dev: true,
          },
        },
      });

      const result = service.parseDependencies(packageJson, lockfile);

      expect(result.success).toBe(true);
      const nestjs = result.dependencies.find((d) => d.name === '@nestjs/common');
      expect(nestjs).toBeDefined();
      expect(nestjs?.version).toBe('10.3.3');
      expect(nestjs?.dependencyType).toBe('direct');

      const typesNode = result.dependencies.find((d) => d.name === '@types/node');
      expect(typesNode).toBeDefined();
      expect(typesNode?.version).toBe('20.11.24');
      expect(typesNode?.dependencyType).toBe('transitive');
      expect(typesNode?.isDev).toBe(true);
    });

    it('should parse legacy lockfile v1 dependencies tree correctly', () => {
      const packageJson = JSON.stringify({
        dependencies: {
          express: '4.17.1',
        },
      });

      const lockfile = JSON.stringify({
        lockfileVersion: 1,
        dependencies: {
          express: {
            version: '4.17.1',
            dependencies: {
              debug: {
                version: '2.6.9',
              },
            },
          },
        },
      });

      const result = service.parseDependencies(packageJson, lockfile);

      expect(result.success).toBe(true);
      expect(result.lockfileVersion).toBe(1);
      expect(result.totalDependencies).toBe(2);

      const express = result.dependencies.find((d) => d.name === 'express');
      expect(express?.version).toBe('4.17.1');
      expect(express?.dependencyType).toBe('direct');

      const debug = result.dependencies.find((d) => d.name === 'debug');
      expect(debug?.version).toBe('2.6.9');
      expect(debug?.dependencyType).toBe('transitive');
    });
  });
});
