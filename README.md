# SecureDevOps — GitHub Dependency Vulnerability Scanner

SecureDevOps is an automated Software Composition Analysis (SCA) tool designed to scan repository dependencies against the official Google Open Source Vulnerabilities (OSV) database.

---

## Architecture Overview

```
SecureDevOps/
├── backend/                       # NestJS API & Dependency Vulnerability Engine
│   ├── src/
│   │   ├── config/                # Environment and scanner configurations
│   │   ├── scanner/
│   │   │   ├── osv/
│   │   │   │   ├── osv.service.ts # Core OSV integration, batching, caching & normalization
│   │   │   │   ├── osv.types.ts   # Strongly typed OSV schemas & normalized findings
│   │   │   │   └── osv.service.spec.ts # Jest unit test suite (13 passing tests)
│   │   │   ├── scanner.controller.ts # Test & scanning REST endpoints
│   │   │   └── scanner.module.ts
│   │   ├── app.controller.ts      # Health check endpoint (/api/health)
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.ts
├── docker-compose.yml             # PostgreSQL 16 & Redis 7 services
├── .env.example                   # Environment configuration template
└── README.md
```

---

## Stage 1 Implementation: OSV Vulnerability Scanner

### Features Implemented
1. **OSV Service (`OsvService`)**:
   - Queries the official OSV API (`https://api.osv.dev/v1/querybatch` and `https://api.osv.dev/v1/query`).
   - Batch querying with configurable chunking (default 100 packages/batch) to optimize network efficiency.
   - Bounded concurrency to respect upstream rate limits.
   - In-memory TTL caching per package & version (`${ecosystem}:${name}@${version}`) and vulnerability ID (`vuln:${id}`).
   - Automatic hydration: Fetches complete vulnerability metadata (CVEs, GHSAs, descriptions, affected ranges, and fixed versions) for minimal OSV batch records.
   - Exact CVSS v3.1 vector calculator and severity normalizer (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `UNKNOWN`).
   - Resilient retry logic with exponential backoff on HTTP 429 and 5xx errors.
   - Graceful fallback to individual queries if a batch query fails.
2. **REST Endpoints**:
   - `GET /api/health` — API health check.
   - `GET /api/scanner/status` — Scanner cache status and operational health.
   - `GET /api/scanner/query?name=lodash&version=4.17.15` — Single package query.
   - `POST /api/scanner/scan` — Batch dependency scan (accepts custom list or runs default sample).
3. **Unit Tests**:
   - 13 comprehensive unit tests covering response parsing, caching, rate limiting retries, missing data, CVSS vectors, and batch error fallbacks.

---

## Quickstart & Verification

### 1. Install & Build Backend
```bash
cd backend
npm install
npm run build
```

### 2. Run Tests
```bash
cd backend
npm test
```

### 3. Start Backend Server
```bash
cd backend
npm run start:dev
```

### 4. Test the Scanner Endpoint
Run a scan against a sample list of packages:
```bash
curl -X POST http://localhost:4000/api/scanner/scan \
  -H "Content-Type: application/json" \
  -d '{
    "dependencies": [
      { "name": "lodash", "version": "4.17.15", "dependencyType": "direct", "isDev": false },
      { "name": "minimist", "version": "1.2.0", "dependencyType": "transitive", "isDev": false },
      { "name": "qs", "version": "6.5.2", "dependencyType": "direct", "isDev": false },
      { "name": "react", "version": "18.2.0", "dependencyType": "direct", "isDev": false },
      { "name": "typescript", "version": "5.3.3", "dependencyType": "direct", "isDev": true }
    ]
  }'
```
