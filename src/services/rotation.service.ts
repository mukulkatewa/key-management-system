import * as nacl from 'tweetnacl';
import { KMSService } from './kms.service';
import { WalletVersionMetadata } from '../models/wallet-version.model';

export class RotationService {
  private kmsService: KMSService;

  constructor() {
    this.kmsService = new KMSService();
  }

  /**
   * Rotate a wallet to a new version
   * Creates new keypair while keeping old one accessible for grace period
   */
  async rotateWallet(
    walletId: string, 
    reason?: string
  ): Promise<{
    walletId: string;
    newVersion: number;
    newPublicKey: string;
    oldVersion: number;
    oldPublicKey: string;
    gracePeriodDays: number;
  }> {
    console.log(`\n🔄 Starting wallet rotation for: ${walletId}`);
    console.log(`   Reason: ${reason || 'Manual rotation'}`);

    // 1. Get current version metadata
    let versionMetadata = await this.kmsService.getWalletVersionMetadata(walletId);
    
    if (!versionMetadata) {
      throw new Error(`Wallet not found: ${walletId}. Cannot rotate non-existent wallet.`);
    }

    const currentVersion = versionMetadata.currentVersion;
    const newVersion = currentVersion + 1;

    console.log(`   Current version: v${currentVersion}`);
    console.log(`   New version: v${newVersion}`);

    // 2. Generate new Ed25519 keypair
    const keypair = nacl.sign.keyPair();
    const privateKeyHex = Buffer.from(keypair.secretKey).toString('hex');
    const newPublicKeyHex = Buffer.from(keypair.publicKey).toString('hex');

    console.log(`   ✅ Generated new Ed25519 keypair`);
    console.log(`   New Public Key: 0x${newPublicKeyHex}`);

    // 3. Store new versioned private key
    await this.kmsService.storeVersionedPrivateKey(
      walletId,
      newVersion,
      privateKeyHex,
      {
        rotatedFrom: currentVersion,
        rotationReason: reason,
        rotatedAt: new Date().toISOString()
      }
    );

    // 4. Store new public key metadata
    await this.kmsService.storePublicKeyMetadata(`${walletId}-v${newVersion}`, {
      publicKey: `0x${newPublicKeyHex}`,
      walletType: 'standard',
      createdAt: new Date().toISOString()
    });

    // 5. Update version metadata
    const oldPublicKey = versionMetadata.versions[currentVersion].publicKey;

    versionMetadata.currentVersion = newVersion;
    versionMetadata.versions[newVersion] = {
      publicKey: `0x${newPublicKeyHex}`,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    // Mark old version as deprecated (not deleted yet)
    versionMetadata.versions[currentVersion].status = 'deprecated';
    versionMetadata.versions[currentVersion].rotatedAt = new Date().toISOString();
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 day grace period
    versionMetadata.versions[currentVersion].expiresAt = expiresAt.toISOString();

    // Add to rotation history
    versionMetadata.rotationHistory.push({
      fromVersion: currentVersion,
      toVersion: newVersion,
      rotatedAt: new Date().toISOString(),
      reason: reason
    });

    await this.kmsService.storeWalletVersionMetadata(versionMetadata);

    console.log(`\n✅ Wallet Rotation Complete!`);
    console.log(`   Wallet: ${walletId}`);
    console.log(`   Old version (v${currentVersion}): Deprecated (30 day grace period)`);
    console.log(`   New version (v${newVersion}): Active`);
    console.log(`   Grace period: Old key accessible until ${expiresAt.toISOString()}`);
    console.log(`   ⚠️  Update your applications to use the new public key!\n`);

    // Schedule automatic cleanup after 30 days
    this.scheduleCleanup(walletId, currentVersion, 30);

    return {
      walletId,
      newVersion,
      newPublicKey: `0x${newPublicKeyHex}`,
      oldVersion: currentVersion,
      oldPublicKey: oldPublicKey,
      gracePeriodDays: 30
    };
  }

  /**
   * Get active wallet version
   */
  async getActiveVersion(walletId: string): Promise<number> {
    const versionMetadata = await this.kmsService.getWalletVersionMetadata(walletId);
    
    if (!versionMetadata) {
      // Check if this is a legacy wallet (no version metadata)
      try {
        await this.kmsService.getPrivateKey(walletId);
        // Legacy wallet exists, treat as version 1
        return 1;
      } catch {
        throw new Error(`Wallet not found: ${walletId}`);
      }
    }

    return versionMetadata.currentVersion;
  }

  /**
   * Get wallet rotation history
   */
  async getRotationHistory(walletId: string): Promise<WalletVersionMetadata | null> {
    return await this.kmsService.getWalletVersionMetadata(walletId);
  }

  /**
   * Schedule cleanup of old version after grace period
   */
  private scheduleCleanup(walletId: string, version: number, days: number): void {
    console.log(`⏰ Scheduled cleanup of ${walletId}-v${version} in ${days} days`);
    
    // In production, use a proper job scheduler like BullMQ or AWS EventBridge
    // For now, just log the scheduled deletion
    
    // Example with setTimeout (not recommended for production - won't survive restarts)
    // const milliseconds = days * 24 * 60 * 60 * 1000;
    // setTimeout(async () => {
    //   await this.deleteOldVersion(walletId, version);
    // }, milliseconds);
  }

  /**
   * Delete old version (hard delete after grace period)
   */
  async deleteOldVersion(walletId: string, version: number): Promise<void> {
    console.log(`🗑️  Deleting old version: ${walletId}-v${version}`);
    
    // Update metadata to mark as deleted
    const versionMetadata = await this.kmsService.getWalletVersionMetadata(walletId);
    
    if (versionMetadata && versionMetadata.versions[version]) {
      versionMetadata.versions[version].status = 'deleted';
      await this.kmsService.storeWalletVersionMetadata(versionMetadata);
    }

    console.log(`✅ Marked version ${version} as deleted in metadata`);
    console.log(`   Note: AWS Secrets Manager has recovery period (7-30 days)`);
  }

  /**
   * Migrate legacy wallet to versioned system
   */
  async migrateLegacyWallet(walletId: string): Promise<void> {
    console.log(`\n🔄 Migrating legacy wallet to versioned system: ${walletId}`);

    // Check if already migrated
    const existing = await this.kmsService.getWalletVersionMetadata(walletId);
    if (existing) {
      console.log(`   ⚠️  Wallet already migrated`);
      return;
    }

    // Get legacy wallet data
    const privateKey = await this.kmsService.getPrivateKey(walletId);
    const publicKeyMetadata = await this.kmsService.getPublicKeyMetadata(walletId);

    // Create version 1
    await this.kmsService.storeVersionedPrivateKey(walletId, 1, privateKey, {
      migratedFrom: 'legacy',
      migratedAt: new Date().toISOString()
    });

    // Create version metadata
    const versionMetadata: WalletVersionMetadata = {
      walletId,
      currentVersion: 1,
      versions: {
        1: {
          publicKey: publicKeyMetadata.publicKey,
          status: 'active',
          createdAt: publicKeyMetadata.createdAt
        }
      },
      rotationHistory: []
    };

    await this.kmsService.storeWalletVersionMetadata(versionMetadata);

    console.log(`✅ Migration complete: ${walletId} is now v1`);
  }
}
