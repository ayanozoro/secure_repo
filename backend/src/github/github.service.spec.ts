import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GitHubService } from './github.service';
import * as crypto from 'crypto';

describe('GitHubService', () => {
  let service: GitHubService;
  const mockWebhookSecret = 'test_webhook_secret_123';

  // Generate test RSA key pair for testing JWT creation
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'github.appId') return '123456';
              if (key === 'github.privateKey') return privateKey;
              if (key === 'github.webhookSecret') return mockWebhookSecret;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GitHubService>(GitHubService);
  });

  describe('generateAppJwt', () => {
    it('should generate a valid RS256 JWT string', () => {
      const jwt = service.generateAppJwt();
      expect(typeof jwt).toBe('string');

      const parts = jwt.split('.');
      expect(parts).toHaveLength(3);

      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

      expect(header.alg).toBe('RS256');
      expect(header.typ).toBe('JWT');
      expect(payload.iss).toBe('123456');
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should return true for valid HMAC SHA-256 signature', () => {
      const payload = JSON.stringify({ action: 'push', repository: { name: 'test-repo' } });
      const hmac = crypto.createHmac('sha256', mockWebhookSecret);
      hmac.update(Buffer.from(payload));
      const validSignature = `sha256=${hmac.digest('hex')}`;

      const isValid = service.verifyWebhookSignature(payload, validSignature);
      expect(isValid).toBe(true);
    });

    it('should return false for invalid HMAC signature', () => {
      const payload = JSON.stringify({ action: 'push' });
      const invalidSignature = 'sha256=bad1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      const isValid = service.verifyWebhookSignature(payload, invalidSignature);
      expect(isValid).toBe(false);
    });

    it('should return false when signature header is missing or malformed', () => {
      const payload = JSON.stringify({ action: 'push' });
      expect(service.verifyWebhookSignature(payload, undefined)).toBe(false);
      expect(service.verifyWebhookSignature(payload, 'invalid-prefix-sig')).toBe(false);
    });
  });
});
