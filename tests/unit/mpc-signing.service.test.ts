import { MPCSigningService } from '../../src/services/mpc/mpc-signing.service';
import { ShareManagerService } from '../../src/services/mpc/share-manager.service';

jest.mock('../../src/services/mpc/share-manager.service');

describe('MPCSigningService', () => {
  let mpcSigningService: MPCSigningService;
  let mockShareManager: jest.Mocked<ShareManagerService>;

  beforeEach(() => {
    mockShareManager = new ShareManagerService() as jest.Mocked<ShareManagerService>;
    mpcSigningService = new MPCSigningService();
    (mpcSigningService as any).shareManager = mockShareManager;
    
    // Suppress console logs
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateMPCWallet', () => {
    it('should generate wallet and split into shares', async () => {
      mockShareManager.generateAndStoreShares = jest.fn().mockResolvedValue([
        { shareId: 'share-1', shareIndex: 1, totalShares: 3, threshold: 2, createdAt: '2025-11-30' },
        { shareId: 'share-2', shareIndex: 2, totalShares: 3, threshold: 2, createdAt: '2025-11-30' },
        { shareId: 'share-3', shareIndex: 3, totalShares: 3, threshold: 2, createdAt: '2025-11-30' }
      ]);
      mockShareManager.storePublicKeyMetadata = jest.fn().mockResolvedValue(undefined);

      const wallet = await mpcSigningService.generateMPCWallet('mpc-test');

      expect(wallet.walletId).toBe('mpc-test');
      expect(wallet.publicKey).toMatch(/^0x[a-f0-9]{64}$/);
      expect(wallet.metadata).toBeDefined();
      expect(wallet.metadata?.mpcEnabled).toBe(true);
      expect(wallet.metadata?.shareCount).toBe(3);
      expect(mockShareManager.generateAndStoreShares).toHaveBeenCalled();
    });

    it('should store MPC metadata with threshold info', async () => {
      mockShareManager.generateAndStoreShares = jest.fn().mockResolvedValue([
        { shareId: 'share-1', shareIndex: 1, totalShares: 3, threshold: 2, createdAt: '2025-11-30' },
        { shareId: 'share-2', shareIndex: 2, totalShares: 3, threshold: 2, createdAt: '2025-11-30' },
        { shareId: 'share-3', shareIndex: 3, totalShares: 3, threshold: 2, createdAt: '2025-11-30' }
      ]);
      mockShareManager.storePublicKeyMetadata = jest.fn().mockResolvedValue(undefined);

      await mpcSigningService.generateMPCWallet('mpc-test');

      expect(mockShareManager.storePublicKeyMetadata).toHaveBeenCalledWith(
        'mpc-test',
        expect.objectContaining({
          walletType: 'mpc',
          threshold: '2-of-3'
        })
      );
    });

    it('should include custom metadata in wallet', async () => {
      mockShareManager.generateAndStoreShares = jest.fn().mockResolvedValue([
        { shareId: 'share-1', shareIndex: 1, totalShares: 3, threshold: 2, createdAt: '2025-11-30' },
        { shareId: 'share-2', shareIndex: 2, totalShares: 3, threshold: 2, createdAt: '2025-11-30' },
        { shareId: 'share-3', shareIndex: 3, totalShares: 3, threshold: 2, createdAt: '2025-11-30' }
      ]);
      mockShareManager.storePublicKeyMetadata = jest.fn().mockResolvedValue(undefined);

      const customMetadata = {
        label: 'Test MPC Wallet',
        purpose: 'Testing',
        customField: 'value'
      };

      const wallet = await mpcSigningService.generateMPCWallet('mpc-test', customMetadata);

      expect(wallet.metadata).toBeDefined();
      expect(wallet.metadata?.label).toBe('Test MPC Wallet');
      expect(wallet.metadata?.purpose).toBe('Testing');
      expect(wallet.metadata?.mpcEnabled).toBe(true);
    });
  });

  describe('signMessageMPC', () => {
    const testPrivateKey = 'a'.repeat(128); // Valid Ed25519 key

    it('should retrieve shares and sign', async () => {
      mockShareManager.retrieveAndCombineShares = jest.fn().mockResolvedValue(testPrivateKey);

      const result = await mpcSigningService.signMessageMPC({
        walletId: 'mpc-test',
        message: 'test message'
      });

      expect(result.signature).toMatch(/^0x[a-f0-9]{128}$/);
      expect(result.publicKey).toMatch(/^0x[a-f0-9]{64}$/);
      expect(result.walletId).toBe('mpc-test');
      expect(mockShareManager.retrieveAndCombineShares).toHaveBeenCalledWith('mpc-test');
    });

    it('should fail if insufficient shares available', async () => {
      mockShareManager.retrieveAndCombineShares = jest.fn().mockRejectedValue(
        new Error('Cannot reconstruct key: need 2 shares, only got 1')
      );

      await expect(
        mpcSigningService.signMessageMPC({ walletId: 'mpc-test', message: 'test' })
      ).rejects.toThrow('Failed to sign with MPC');
    });

    it('should handle AWS errors during share retrieval', async () => {
      mockShareManager.retrieveAndCombineShares = jest.fn().mockRejectedValue(
        new Error('AWS Secrets Manager throttled')
      );

      await expect(
        mpcSigningService.signMessageMPC({ walletId: 'mpc-test', message: 'test' })
      ).rejects.toThrow('Failed to sign with MPC');
    });
  });

  describe('signOrderPayloadMPC', () => {
    const testPrivateKey = 'a'.repeat(128);

    it('should serialize order and sign with MPC', async () => {
      mockShareManager.retrieveAndCombineShares = jest.fn().mockResolvedValue(testPrivateKey);

      const orderPayload = {
        action: 'order',
        coin: 'BTC',
        isBuy: true,
        sz: 1.0,
        limitPx: 50000
      };

      const result = await mpcSigningService.signOrderPayloadMPC('mpc-test', orderPayload);

      expect(result.signature).toMatch(/^0x[a-f0-9]{128}$/);
      expect(result.publicKey).toMatch(/^0x[a-f0-9]{64}$/);
      expect(result.walletId).toBe('mpc-test');
    });
  });

  describe('getPublicKey', () => {
    it('should retrieve from metadata without share reconstruction', async () => {
      mockShareManager.getPublicKeyMetadata = jest.fn().mockResolvedValue({
        publicKey: '0xmpcpublic',
        walletType: 'mpc',
        threshold: '2-of-3',
        createdAt: '2025-11-30'
      });

      const publicKey = await mpcSigningService.getPublicKey('mpc-test');

      expect(publicKey).toBe('0xmpcpublic');
      expect(mockShareManager.retrieveAndCombineShares).not.toHaveBeenCalled();
    });

    it('should fallback to share reconstruction if metadata missing', async () => {
      const testPrivateKey = 'a'.repeat(128);
      
      mockShareManager.getPublicKeyMetadata = jest.fn().mockRejectedValue(
        new Error('Wallet metadata not found')
      );
      mockShareManager.retrieveAndCombineShares = jest.fn().mockResolvedValue(testPrivateKey);
      mockShareManager.storePublicKeyMetadata = jest.fn().mockResolvedValue(undefined);

      const publicKey = await mpcSigningService.getPublicKey('mpc-test');

      expect(publicKey).toMatch(/^0x[a-f0-9]{64}$/);
      expect(mockShareManager.retrieveAndCombineShares).toHaveBeenCalled();
      expect(mockShareManager.storePublicKeyMetadata).toHaveBeenCalled();
    });
  });

  describe('listMPCWallets', () => {
    it('should return unique wallet IDs from shares', async () => {
      mockShareManager.listShares = jest.fn().mockResolvedValue([
        'mpc-share-wallet1-1',
        'mpc-share-wallet1-2',
        'mpc-share-wallet1-3',
        'mpc-share-wallet2-1',
        'mpc-share-wallet2-2'
      ]);

      const wallets = await mpcSigningService.listMPCWallets();

      expect(wallets).toContain('wallet1');
      expect(wallets).toContain('wallet2');
      expect(wallets.length).toBe(2);
    });
  });
});
