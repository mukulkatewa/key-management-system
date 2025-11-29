import { SigningService } from '../../src/services/signing.service';
import { KMSService } from '../../src/services/kms.service';
import * as nacl from 'tweetnacl';

// Mock KMSService
jest.mock('../../src/services/kms.service');

describe('SigningService', () => {
  let signingService: SigningService;
  let mockKmsService: jest.Mocked<KMSService>;

  // Valid Ed25519 private key (64 bytes = 128 hex chars)
  const validPrivateKey = 'a'.repeat(128); // ✅ Correct size!

  beforeEach(() => {
    mockKmsService = new KMSService() as jest.Mocked<KMSService>;
    signingService = new SigningService();
    (signingService as any).kmsService = mockKmsService;
    
    // Suppress console logs during tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('generateWallet', () => {
    it('should generate wallet with valid Ed25519 keypair', async () => {
      mockKmsService.storeVersionedPrivateKey = jest.fn().mockResolvedValue(undefined);
      mockKmsService.storePublicKeyMetadata = jest.fn().mockResolvedValue(undefined);
      mockKmsService.storeWalletVersionMetadata = jest.fn().mockResolvedValue(undefined);

      const wallet = await signingService.generateWallet('test-wallet');

      expect(wallet.walletId).toBe('test-wallet');
      expect(wallet.publicKey).toMatch(/^0x[a-f0-9]{64}$/);
      expect(wallet.createdAt).toBeDefined();
      expect(mockKmsService.storeVersionedPrivateKey).toHaveBeenCalledWith(
        'test-wallet',
        1,
        expect.any(String),
        undefined
      );
    });

    it('should store wallet metadata correctly', async () => {
      mockKmsService.storeVersionedPrivateKey = jest.fn().mockResolvedValue(undefined);
      mockKmsService.storePublicKeyMetadata = jest.fn().mockResolvedValue(undefined);
      mockKmsService.storeWalletVersionMetadata = jest.fn().mockResolvedValue(undefined);

      const metadata = { label: 'Test Wallet', purpose: 'Testing' };

      await signingService.generateWallet('test-wallet', metadata);

      expect(mockKmsService.storeVersionedPrivateKey).toHaveBeenCalledWith(
        'test-wallet',
        1,
        expect.any(String),
        metadata
      );
    });

    it('should handle KMS storage failures', async () => {
      mockKmsService.storeVersionedPrivateKey = jest.fn().mockRejectedValue(
        new Error('AWS KMS throttled')
      );

      await expect(
        signingService.generateWallet('test-wallet')
      ).rejects.toThrow('Failed to generate wallet');
    });
  });

  describe('signMessage', () => {
    it('should sign message correctly with v1', async () => {
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue({
        walletId: 'test',
        currentVersion: 1,
        versions: {},
        rotationHistory: []
      });
      mockKmsService.getVersionedPrivateKey = jest.fn().mockResolvedValue(validPrivateKey);

      const result = await signingService.signMessage({
        walletId: 'test',
        message: 'hello world'
      });

      expect(result.signature).toMatch(/^0x[a-f0-9]{128}$/);
      expect(result.publicKey).toMatch(/^0x[a-f0-9]{64}$/);
      expect(result.walletId).toBe('test');
      expect(mockKmsService.getVersionedPrivateKey).toHaveBeenCalledWith('test', 1);
    });

    it('should use current version for signing', async () => {
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue({
        walletId: 'test',
        currentVersion: 2,
        versions: {},
        rotationHistory: []
      });
      mockKmsService.getVersionedPrivateKey = jest.fn().mockResolvedValue(validPrivateKey);

      await signingService.signMessage({
        walletId: 'test',
        message: 'hello'
      });

      expect(mockKmsService.getVersionedPrivateKey).toHaveBeenCalledWith('test', 2);
    });

    it('should handle missing wallet error', async () => {
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue(null);
      mockKmsService.getVersionedPrivateKey = jest.fn().mockRejectedValue(
        new Error('Wallet version not found: test-v1')
      );

      await expect(
        signingService.signMessage({ walletId: 'test', message: 'hello' })
      ).rejects.toThrow('Failed to sign message');
    });

    it('should produce deterministic signatures', async () => {
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue({
        walletId: 'test',
        currentVersion: 1,
        versions: {},
        rotationHistory: []
      });
      mockKmsService.getVersionedPrivateKey = jest.fn().mockResolvedValue(validPrivateKey);

      const message = 'deterministic test';

      const result1 = await signingService.signMessage({ walletId: 'test', message });
      const result2 = await signingService.signMessage({ walletId: 'test', message });

      expect(result1.signature).toBe(result2.signature);
    });
  });

  describe('signOrderPayload', () => {
    it('should serialize order payload and sign', async () => {
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue({
        walletId: 'test',
        currentVersion: 1,
        versions: {},
        rotationHistory: []
      });
      mockKmsService.getVersionedPrivateKey = jest.fn().mockResolvedValue(validPrivateKey);

      const orderPayload = {
        action: 'order',
        coin: 'BTC',
        isBuy: true,
        sz: 1.0,
        limitPx: 50000
      };

      const result = await signingService.signOrderPayload('test', orderPayload);

      expect(result.signature).toMatch(/^0x[a-f0-9]{128}$/);
      expect(result.publicKey).toBeDefined();
    });
  });

  describe('getPublicKey', () => {
    it('should retrieve public key from metadata (fast path)', async () => {
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue({
        walletId: 'test',
        currentVersion: 1,
        versions: {},
        rotationHistory: []
      });
      mockKmsService.getPublicKeyMetadata = jest.fn().mockResolvedValue({
        publicKey: '0xabc123',
        walletType: 'standard',
        threshold: 'N/A',
        createdAt: '2025-11-30'
      });

      const publicKey = await signingService.getPublicKey('test');

      expect(publicKey).toBe('0xabc123');
      expect(mockKmsService.getPublicKeyMetadata).toHaveBeenCalledWith('test-v1');
      expect(mockKmsService.getVersionedPrivateKey).not.toHaveBeenCalled();
    });

    it('should fallback to key reconstruction if metadata missing', async () => {
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue({
        walletId: 'test',
        currentVersion: 1,
        versions: {},
        rotationHistory: []
      });
      mockKmsService.getPublicKeyMetadata = jest.fn().mockRejectedValue(
        new Error('Wallet metadata not found')
      );
      mockKmsService.getVersionedPrivateKey = jest.fn().mockResolvedValue(validPrivateKey);
      mockKmsService.storePublicKeyMetadata = jest.fn().mockResolvedValue(undefined);

      const publicKey = await signingService.getPublicKey('test');

      expect(publicKey).toMatch(/^0x[a-f0-9]{64}$/);
      expect(mockKmsService.getVersionedPrivateKey).toHaveBeenCalled();
      expect(mockKmsService.storePublicKeyMetadata).toHaveBeenCalled();
    });
  });
});
