import * as nacl from 'tweetnacl';
import { KMSService } from './kms.service';
import { Wallet, SignatureRequest, SignatureResponse } from '../models/wallet.model';

export class SigningService {
  private kmsService: KMSService;

  constructor() {
    this.kmsService = new KMSService();
  }

  /**
   * Generate a new Hyperliquid agent wallet (Ed25519 keypair)
   */
  async generateWallet(walletId: string, metadata?: any): Promise<Wallet> {
    try {
      // Generate Ed25519 keypair for Hyperliquid
      const keypair = nacl.sign.keyPair();
      
      // Convert to hex strings
      const privateKeyHex = Buffer.from(keypair.secretKey).toString('hex');
      const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex');

      // Store encrypted private key in AWS Secrets Manager
      await this.kmsService.storePrivateKey(walletId, privateKeyHex, metadata);

      console.log(`✅ Generated wallet ${walletId}`);
      console.log(`   Public Key: 0x${publicKeyHex}`);
      
      return {
        walletId,
        publicKey: `0x${publicKeyHex}`,
        createdAt: new Date().toISOString(),
        metadata: metadata || {}
      };
    } catch (error) {
      console.error('Generate Wallet Error:', error);
      throw new Error(`Failed to generate wallet: ${error}`);
    }
  }

  /**
   * Sign a message/transaction for Hyperliquid
   */
  async signMessage(request: SignatureRequest): Promise<SignatureResponse> {
    try {
      const { walletId, message } = request;

      // Retrieve and decrypt private key from AWS KMS
      const privateKeyHex = await this.kmsService.getPrivateKey(walletId);
      
      // Convert hex to Uint8Array
      const privateKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
      
      // Get public key from private key
      const keypair = nacl.sign.keyPair.fromSecretKey(privateKey);
      const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex');

      // Sign the message
      const messageBytes = Buffer.from(message, 'utf-8');
      const signature = nacl.sign.detached(messageBytes, privateKey);
      const signatureHex = Buffer.from(signature).toString('hex');

      console.log(`✅ Signed message with wallet ${walletId}`);

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
   * Get public key for a wallet (without exposing private key)
   */
  async getPublicKey(walletId: string): Promise<string> {
    try {
      const privateKeyHex = await this.kmsService.getPrivateKey(walletId);
      const privateKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
      const keypair = nacl.sign.keyPair.fromSecretKey(privateKey);
      const publicKeyHex = Buffer.from(keypair.publicKey).toString('hex');
      
      return `0x${publicKeyHex}`;
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
