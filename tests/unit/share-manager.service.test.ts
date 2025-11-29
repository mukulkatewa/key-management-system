import { ShareManagerService } from '../../src/services/mpc/share-manager.service';
import { KMSService } from '../../src/services/kms.service';

//  Mock the entire module before importing
jest.mock('secrets.js-grempe', () => ({
  share: jest.fn(),
  combine: jest.fn()
}));

// Import after mocking
import * as secrets from 'secrets.js-grempe';

jest.mock('../../src/services/kms.service');

describe('ShareManagerService', () => {
  let shareManager: ShareManagerService;
  let mockKmsService: jest.Mocked<KMSService>;

  beforeEach(() => {
    mockKmsService = new KMSService() as jest.Mocked<KMSService>;
    shareManager = new ShareManagerService();
    (shareManager as any).kmsService = mockKmsService;
    
    // Suppress console logs
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAndStoreShares', () => {
    it('should split key into 3 shares using Shamir Secret Sharing', async () => {
      const privateKey = 'abcdef1234567890';
      const mockShares = ['share1hex', 'share2hex', 'share3hex'];
      
      //  Now this will work
      (secrets.share as jest.Mock).mockReturnValue(mockShares);
      mockKmsService.storePrivateKey = jest.fn().mockResolvedValue(undefined);

      const shares = await shareManager.generateAndStoreShares(privateKey, 'test-wallet');

      expect(secrets.share).toHaveBeenCalledWith(
        expect.any(String),
        3,
        2
      );
      expect(shares).toHaveLength(3);
      expect(shares[0].shareIndex).toBe(1);
    });

    it('should store each share encrypted in AWS Secrets Manager', async () => {
      const privateKey = 'abcdef1234567890';
      const mockShares = ['share1hex', 'share2hex', 'share3hex'];
      
      (secrets.share as jest.Mock).mockReturnValue(mockShares);
      mockKmsService.storePrivateKey = jest.fn().mockResolvedValue(undefined);

      await shareManager.generateAndStoreShares(privateKey, 'test-wallet');

      expect(mockKmsService.storePrivateKey).toHaveBeenCalledTimes(3);
    });

    it('should return share metadata with correct structure', async () => {
      const privateKey = 'abcdef1234567890';
      const mockShares = ['share1', 'share2', 'share3'];
      
      (secrets.share as jest.Mock).mockReturnValue(mockShares);
      mockKmsService.storePrivateKey = jest.fn().mockResolvedValue(undefined);

      const shares = await shareManager.generateAndStoreShares(privateKey, 'wallet-id');

      shares.forEach((share, index) => {
        expect(share.shareId).toBe(`mpc-share-wallet-id-${index + 1}`);
      });
    });

    it('should handle AWS storage failures', async () => {
      const privateKey = 'abcdef1234567890';
      const mockShares = ['share1', 'share2', 'share3'];
      
      (secrets.share as jest.Mock).mockReturnValue(mockShares);
      mockKmsService.storePrivateKey = jest.fn().mockRejectedValue(
        new Error('AWS Secrets Manager unavailable')
      );

      await expect(
        shareManager.generateAndStoreShares(privateKey, 'test-wallet')
      ).rejects.toThrow('AWS Secrets Manager unavailable');
    });

    it('should handle 0x prefix in private key', async () => {
      const privateKeyWithPrefix = '0xabcdef1234567890';
      const mockShares = ['share1', 'share2', 'share3'];
      
      (secrets.share as jest.Mock).mockReturnValue(mockShares);
      mockKmsService.storePrivateKey = jest.fn().mockResolvedValue(undefined);

      await shareManager.generateAndStoreShares(privateKeyWithPrefix, 'test-wallet');

      const callArg = (secrets.share as jest.Mock).mock.calls[0][0];
      expect(callArg).not.toContain('0x');
    });
  });

  describe('retrieveAndCombineShares', () => {
    it('should retrieve 2 shares and combine them', async () => {
      const share1 = 'share1hex';
      const share2 = 'share2hex';
      const reconstructedKey = 'reconstructedprivatekey';

      mockKmsService.getPrivateKey = jest.fn()
        .mockResolvedValueOnce(share1)
        .mockResolvedValueOnce(share2);
      
      (secrets.combine as jest.Mock).mockReturnValue(reconstructedKey);

      const result = await shareManager.retrieveAndCombineShares('test-wallet');

      expect(mockKmsService.getPrivateKey).toHaveBeenCalledTimes(2);
      expect(secrets.combine).toHaveBeenCalledWith([share1, share2]);
      expect(result).toBe(reconstructedKey);
    });

    it('should retrieve exactly threshold number of shares', async () => {
      const shares = ['share1', 'share2'];
      const reconstructedKey = 'reconstructedkey';

      mockKmsService.getPrivateKey = jest.fn()
        .mockResolvedValueOnce(shares[0])
        .mockResolvedValueOnce(shares[1]);
      
      (secrets.combine as jest.Mock).mockReturnValue(reconstructedKey);

      await shareManager.retrieveAndCombineShares('test-wallet', 2);

      expect(mockKmsService.getPrivateKey).toHaveBeenCalledTimes(2);
    });

    it('should fail if insufficient shares available', async () => {
      mockKmsService.getPrivateKey = jest.fn()
        .mockResolvedValueOnce('share1')
        .mockRejectedValueOnce(new Error('Share not found'))
        .mockRejectedValueOnce(new Error('Share not found'));

      await expect(
        shareManager.retrieveAndCombineShares('test-wallet')
      ).rejects.toThrow('Cannot reconstruct key: need 2 shares, only got 1');
    });

    it('should handle case when all shares are missing', async () => {
      mockKmsService.getPrivateKey = jest.fn().mockRejectedValue(
        new Error('Wallet not found')
      );

      await expect(
        shareManager.retrieveAndCombineShares('missing-wallet')
      ).rejects.toThrow('Cannot reconstruct key: need 2 shares, only got 0');
    });

    it('should throw error if requested shares less than threshold', async () => {
      await expect(
        shareManager.retrieveAndCombineShares('test-wallet', 1)
      ).rejects.toThrow('Insufficient shares: need at least 2, requested 1');
    });

    it('should retrieve 3 shares if requested', async () => {
      const shares = ['share1', 'share2', 'share3'];
      const reconstructedKey = 'reconstructedkey';

      mockKmsService.getPrivateKey = jest.fn()
        .mockResolvedValueOnce(shares[0])
        .mockResolvedValueOnce(shares[1])
        .mockResolvedValueOnce(shares[2]);
      
      (secrets.combine as jest.Mock).mockReturnValue(reconstructedKey);

      await shareManager.retrieveAndCombineShares('test-wallet', 3);

      expect(mockKmsService.getPrivateKey).toHaveBeenCalledTimes(3);
    });

    it('should continue retrieving if some shares fail', async () => {
      const reconstructedKey = 'reconstructedkey';

      mockKmsService.getPrivateKey = jest.fn()
        .mockRejectedValueOnce(new Error('Share 1 not found'))
        .mockResolvedValueOnce('share2')
        .mockResolvedValueOnce('share3');
      
      (secrets.combine as jest.Mock).mockReturnValue(reconstructedKey);

      const result = await shareManager.retrieveAndCombineShares('test-wallet');

      expect(mockKmsService.getPrivateKey).toHaveBeenCalledTimes(3);
      expect(secrets.combine).toHaveBeenCalledWith(['share2', 'share3']);
      expect(result).toBe(reconstructedKey);
    });
  });

  describe('storePublicKeyMetadata', () => {
    it('should delegate to KMSService', async () => {
      mockKmsService.storePublicKeyMetadata = jest.fn().mockResolvedValue(undefined);

      const metadata = {
        publicKey: '0xabc123',
        walletType: 'mpc' as const,
        threshold: '2-of-3',
        createdAt: '2025-11-30'
      };

      await shareManager.storePublicKeyMetadata('test-wallet', metadata);

      expect(mockKmsService.storePublicKeyMetadata).toHaveBeenCalledWith('test-wallet', metadata);
    });
  });

  describe('getPublicKeyMetadata', () => {
    it('should delegate to KMSService', async () => {
      const expectedMetadata = {
        publicKey: '0xabc123',
        walletType: 'mpc' as const,
        threshold: '2-of-3',
        createdAt: '2025-11-30'
      };

      mockKmsService.getPublicKeyMetadata = jest.fn().mockResolvedValue(expectedMetadata);

      const result = await shareManager.getPublicKeyMetadata('test-wallet');

      expect(result).toEqual(expectedMetadata);
    });
  });

  describe('listShares', () => {
    it('should list all available shares for a wallet', async () => {
      mockKmsService.getPrivateKey = jest.fn()
        .mockResolvedValueOnce('share1')
        .mockResolvedValueOnce('share2')
        .mockResolvedValueOnce('share3');

      const shares = await shareManager.listShares('test-wallet');

      expect(shares).toHaveLength(3);
    });

    it('should only list existing shares', async () => {
      mockKmsService.getPrivateKey = jest.fn()
        .mockResolvedValueOnce('share1')
        .mockRejectedValueOnce(new Error('Share not found'))
        .mockResolvedValueOnce('share3');

      const shares = await shareManager.listShares('test-wallet');

      expect(shares).toHaveLength(2);
    });

    it('should return empty array if no shares exist', async () => {
      mockKmsService.getPrivateKey = jest.fn().mockRejectedValue(
        new Error('Share not found')
      );

      const shares = await shareManager.listShares('nonexistent-wallet');

      expect(shares).toEqual([]);
    });
  });

  describe('deleteAllShares', () => {
    it('should attempt to delete all 3 shares', async () => {
      const deletedCount = await shareManager.deleteAllShares('test-wallet');
      expect(deletedCount).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle very long private keys', async () => {
      const longPrivateKey = 'a'.repeat(256);
      const mockShares = ['share1', 'share2', 'share3'];
      
      (secrets.share as jest.Mock).mockReturnValue(mockShares);
      mockKmsService.storePrivateKey = jest.fn().mockResolvedValue(undefined);

      const shares = await shareManager.generateAndStoreShares(longPrivateKey, 'test-wallet');

      expect(shares).toHaveLength(3);
    });

    it('should handle concurrent share retrieval', async () => {
      const reconstructedKey = 'reconstructedkey';

      mockKmsService.getPrivateKey = jest.fn()
        .mockResolvedValue('share1')
        .mockResolvedValue('share2');
      
      (secrets.combine as jest.Mock).mockReturnValue(reconstructedKey);

      const [result1, result2] = await Promise.all([
        shareManager.retrieveAndCombineShares('test-wallet'),
        shareManager.retrieveAndCombineShares('test-wallet')
      ]);

      expect(result1).toBe(reconstructedKey);
      expect(result2).toBe(reconstructedKey);
    });
  });
});
