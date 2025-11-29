import * as nacl from 'tweetnacl';
import { KMSService } from './kms.service';
import { Wallet, SignatureRequest, SignatureResponse } from '../models/wallet.model';
import { WalletVersionMetadata } from '../models/wallet-version.model';

export class SigningService {
  private kmsService: KMSService;

  constructor() {
    this.kmsService = new KMSService();
  }

  /**
   * Generate a new Hyperliquid agent wallet (Ed25519 keypair)
   * Now with version support!
   */
  async generateWallet(walletId: string, metadata?: any): Promise<Wallet> {
    console.log(`\n🔐 Generating Standard Wallet: ${walletId}`);
    
    try {
      // Generate Ed25519 keypair for Hyperliquid
      const keypair = nacl.sign.keyPair();
      
      // Convert to hex strings
      const privateKeyHex = Buffer.from(keypair.secretKey).toString('hex');
      const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex');

      console.log(`   ✅ Generated Ed25519 keypair`);
      console.log(`   Public Key: 0x${publicKeyHex}`);

      const version = 1; // Initial version

      // Store versioned private key
      await this.kmsService.storeVersionedPrivateKey(walletId, version, privateKeyHex, metadata);

      // Store public key metadata
      await this.kmsService.storePublicKeyMetadata(`${walletId}-v${version}`, {
        publicKey: `0x${publicKeyHex}`,
        walletType: 'standard',
        createdAt: new Date().toISOString()
      });

      // Initialize version metadata
      const versionMetadata: WalletVersionMetadata = {
        walletId,
        currentVersion: version,
        versions: {
          [version]: {
            publicKey: `0x${publicKeyHex}`,
            status: 'active',
            createdAt: new Date().toISOString()
          }
        },
        rotationHistory: []
      };

      await this.kmsService.storeWalletVersionMetadata(versionMetadata);

      console.log(`\n✅ Standard Wallet Created Successfully!`);
      console.log(`   Wallet ID: ${walletId}`);
      console.log(`   Version: v${version}`);
      console.log(`   Public Key: 0x${publicKeyHex}`);
      console.log(`   🔄 Key rotation enabled (rotate annually for compliance)\n`);
      
      return {
        walletId,
        publicKey: `0x${publicKeyHex}`,
        createdAt: new Date().toISOString(),
        metadata: metadata || {}
      };
    } catch (error) {
      console.error('❌ Generate Wallet Error:', error);
      throw new Error(`Failed to generate wallet: ${error}`);
    }
  }

  /**
   * Sign a message/transaction for Hyperliquid
   * Automatically uses the active version
   */
  async signMessage(request: SignatureRequest): Promise<SignatureResponse> {
    try {
      const { walletId, message } = request;

      // Get active version
      const versionMetadata = await this.kmsService.getWalletVersionMetadata(walletId);
      const version = versionMetadata ? versionMetadata.currentVersion : 1;

      console.log(`📝 Signing with ${walletId} v${version}`);

      // Retrieve and decrypt private key from active version
      const privateKeyHex = await this.kmsService.getVersionedPrivateKey(walletId, version);
      
      // Convert hex to Uint8Array
      const privateKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
      
      // Get public key from private key
      const keypair = nacl.sign.keyPair.fromSecretKey(privateKey);
      const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex');

      // Sign the message
      const messageBytes = Buffer.from(message, 'utf-8');
      const signature = nacl.sign.detached(messageBytes, privateKey);
      const signatureHex = Buffer.from(signature).toString('hex');

      // Clean up
      privateKey.fill(0);
      keypair.secretKey.fill(0);

      console.log(`✅ Signed message with wallet ${walletId} v${version}`);

      return {
        signature: `0x${signatureHex}`,
        publicKey: `0x${publicKeyHex}`,
        walletId
      };
    } catch (error) {
      console.error('Sign Message Error:', error);
      throw new Error(`Failed to sign message: ${error}`);
    }
  }

  /**
   * Sign Hyperliquid order payload (JSON)
   */
  async signOrderPayload(walletId: string, orderPayload: any): Promise<SignatureResponse> {
    try {
      // Convert order payload to string for signing
      const message = JSON.stringify(orderPayload);
      
      return await this.signMessage({ walletId, message });
    } catch (error) {
      console.error('Sign Order Error:', error);
      throw new Error(`Failed to sign order: ${error}`);
    }
  }

  /**
   * Get public key for a wallet (optimized - uses metadata!)
   * Automatically uses the active version
   */
  async getPublicKey(walletId: string): Promise<string> {
    try {
      console.log(`📖 Retrieving public key for ${walletId} (fast lookup)`);
      
      // Get active version
      const versionMetadata = await this.kmsService.getWalletVersionMetadata(walletId);
      const version = versionMetadata ? versionMetadata.currentVersion : 1;

      const versionedWalletId = `${walletId}-v${version}`;

      // Try metadata first (fast - no decryption!)
      try {
        const metadata = await this.kmsService.getPublicKeyMetadata(versionedWalletId);
        console.log(`   ✅ Retrieved from metadata (~50ms) [v${version}]`);
        return metadata.publicKey;
      } catch (metadataError) {
        // Fallback: reconstruct from private key
        console.log(`   ⚠️  Metadata not found, reconstructing from private key (slow)`);
        const privateKeyHex = await this.kmsService.getVersionedPrivateKey(walletId, version);
        const privateKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
        const keypair = nacl.sign.keyPair.fromSecretKey(privateKey);
        const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex');
        
        // Store metadata for next time
        await this.kmsService.storePublicKeyMetadata(versionedWalletId, {
          publicKey: `0x${publicKeyHex}`,
          walletType: 'standard',
          createdAt: new Date().toISOString()
        });
        
        // Clean up
        privateKey.fill(0);
        keypair.secretKey.fill(0);
        
        return `0x${publicKeyHex}`;
      }
    } catch (error) {
      console.error('Get Public Key Error:', error);
      throw new Error(`Failed to get public key: ${error}`);
    }
  }

  /**
   * List all available wallets
   */
  async listWallets(): Promise<string[]> {
    return await this.kmsService.listWallets();
  }
}
