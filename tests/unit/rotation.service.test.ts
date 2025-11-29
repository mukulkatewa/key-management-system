import { RotationService } from '../../src/services/rotation.service';
import { KMSService } from '../../src/services/kms.service';

jest.mock('../../src/services/kms.service');

describe('RotationService', () => {
  let rotationService: RotationService;
  let mockKmsService: jest.Mocked<KMSService>;

  beforeEach(() => {
    mockKmsService = new KMSService() as jest.Mocked<KMSService>;
    rotationService = new RotationService();
    (rotationService as any).kmsService = mockKmsService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('rotateWallet', () => {
    it('should rotate wallet from v1 to v2', async () => {
      // Arrange
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue({
        walletId: 'test',
        currentVersion: 1,
        versions: {
          1: {
            publicKey: '0xold',
            status: 'active',
            createdAt: '2025-11-29'
          }
        },
        rotationHistory: []
      });
      mockKmsService.storeVersionedPrivateKey = jest.fn().mockResolvedValue(undefined);
      mockKmsService.storePublicKeyMetadata = jest.fn().mockResolvedValue(undefined);
      mockKmsService.storeWalletVersionMetadata = jest.fn().mockResolvedValue(undefined);

      // Act
      const result = await rotationService.rotateWallet('test', 'Annual rotation');

      // Assert
      expect(result.walletId).toBe('test');
      expect(result.oldVersion).toBe(1);
      expect(result.newVersion).toBe(2);
      expect(result.newPublicKey).toMatch(/^0x[a-f0-9]{64}$/);
      expect(result.newPublicKey).not.toBe('0xold'); // Different key!
      expect(result.gracePeriodDays).toBe(30);
    });

    it('should update version metadata correctly', async () => {
      // Arrange
      const existingMetadata = {
        walletId: 'test',
        currentVersion: 1,
        versions: {
          1: {
            publicKey: '0xold',
            status: 'active' as const,
            createdAt: '2025-11-29'
          }
        },
        rotationHistory: []
      };

      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue(existingMetadata);
      mockKmsService.storeVersionedPrivateKey = jest.fn().mockResolvedValue(undefined);
      mockKmsService.storePublicKeyMetadata = jest.fn().mockResolvedValue(undefined);
      mockKmsService.storeWalletVersionMetadata = jest.fn().mockResolvedValue(undefined);

      // Act
      await rotationService.rotateWallet('test', 'Test rotation');

      // Assert
      const savedMetadata = mockKmsService.storeWalletVersionMetadata.mock.calls[0][0];
      expect(savedMetadata.currentVersion).toBe(2);
      expect(savedMetadata.versions[1].status).toBe('deprecated');
      expect(savedMetadata.versions[2].status).toBe('active');
      expect(savedMetadata.rotationHistory).toHaveLength(1);
      expect(savedMetadata.rotationHistory[0].reason).toBe('Test rotation');
    });

    it('should fail if wallet does not exist', async () => {
      // Arrange
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(
        rotationService.rotateWallet('nonexistent')
      ).rejects.toThrow('Wallet not found: nonexistent');
    });

    it('should track rotation history', async () => {
      // Arrange
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue({
        walletId: 'test',
        currentVersion: 2,
        versions: {
          1: { publicKey: '0xv1', status: 'deprecated' as const, createdAt: '2024-11-29' },
          2: { publicKey: '0xv2', status: 'active' as const, createdAt: '2025-11-29' }
        },
        rotationHistory: [
          { fromVersion: 1, toVersion: 2, rotatedAt: '2025-11-29', reason: 'First rotation' }
        ]
      });
      mockKmsService.storeVersionedPrivateKey = jest.fn().mockResolvedValue(undefined);
      mockKmsService.storePublicKeyMetadata = jest.fn().mockResolvedValue(undefined);
      mockKmsService.storeWalletVersionMetadata = jest.fn().mockResolvedValue(undefined);

      // Act
      await rotationService.rotateWallet('test', 'Second rotation');

      // Assert
      const savedMetadata = mockKmsService.storeWalletVersionMetadata.mock.calls[0][0];
      expect(savedMetadata.rotationHistory).toHaveLength(2);
      expect(savedMetadata.rotationHistory[1].fromVersion).toBe(2);
      expect(savedMetadata.rotationHistory[1].toVersion).toBe(3);
    });
  });

  describe('getActiveVersion', () => {
    it('should return current version from metadata', async () => {
      // Arrange
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue({
        walletId: 'test',
        currentVersion: 3,
        versions: {},
        rotationHistory: []
      });

      // Act
      const version = await rotationService.getActiveVersion('test');

      // Assert
      expect(version).toBe(3);
    });

    it('should return 1 for legacy wallets without metadata', async () => {
      // Arrange
      mockKmsService.getWalletVersionMetadata = jest.fn().mockResolvedValue(null);
      mockKmsService.getPrivateKey = jest.fn().mockResolvedValue('privatekey');

      // Act
      const version = await rotationService.getActiveVersion('legacy-wallet');

      // Assert
      expect(version).toBe(1);
    });
  });
});
