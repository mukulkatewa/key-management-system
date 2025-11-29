import { 
    EncryptCommand, 
    DecryptCommand, 
    GenerateDataKeyCommand 
  } from '@aws-sdk/client-kms';
  import { 
    CreateSecretCommand, 
    GetSecretValueCommand,
    UpdateSecretCommand,
    ListSecretsCommand,
    PutSecretValueCommand
  } from '@aws-sdk/client-secrets-manager';
  import { kmsClient, secretsClient, KMS_KEY_ID, SECRETS_PREFIX } from '../config/aws.config';
  import { WalletVersionMetadata } from '../models/wallet-version.model';
  import * as crypto from 'crypto';
  
  export class KMSService {
    private secretPrefix: string;
  
    constructor() {
      this.secretPrefix = SECRETS_PREFIX;
    }
    
    /**
     * Encrypt data using AWS KMS (for small data like private keys)
     */
    async encryptData(plaintext: string): Promise<string> {
      try {
        const command = new EncryptCommand({
          KeyId: KMS_KEY_ID,
          Plaintext: Buffer.from(plaintext, 'utf-8'),
        });
  
        const response = await kmsClient.send(command);
        
        if (!response.CiphertextBlob) {
          throw new Error('Encryption failed: No ciphertext returned');
        }
  
        // Return base64 encoded ciphertext
        return Buffer.from(response.CiphertextBlob).toString('base64');
      } catch (error) {
        console.error('KMS Encryption Error:', error);
        throw new Error(`Failed to encrypt data: ${error}`);
      }
    }
  
    /**
     * Decrypt data using AWS KMS
     */
    async decryptData(ciphertext: string): Promise<string> {
      try {
        const command = new DecryptCommand({
          KeyId: KMS_KEY_ID,
          CiphertextBlob: Buffer.from(ciphertext, 'base64'),
        });
  
        const response = await kmsClient.send(command);
        
        if (!response.Plaintext) {
          throw new Error('Decryption failed: No plaintext returned');
        }
  
        return Buffer.from(response.Plaintext).toString('utf-8');
      } catch (error) {
        console.error('KMS Decryption Error:', error);
        throw new Error(`Failed to decrypt data: ${error}`);
      }
    }
  
    /**
     * Store encrypted private key in AWS Secrets Manager (LEGACY - for backward compatibility)
     */
    async storePrivateKey(walletId: string, privateKey: string, metadata?: any): Promise<void> {
      try {
        const secretName = `${SECRETS_PREFIX}${walletId}`;
        
        // Encrypt the private key first
        const encryptedKey = await this.encryptData(privateKey);
        
        const secretValue = JSON.stringify({
          encryptedPrivateKey: encryptedKey,
          walletId: walletId,
          createdAt: new Date().toISOString(),
          metadata: metadata || {}
        });
  
        try {
          // Try to create new secret
          const createCommand = new CreateSecretCommand({
            Name: secretName,
            SecretString: secretValue,
            KmsKeyId: KMS_KEY_ID,
            Description: `Hyperliquid agent wallet: ${walletId}`,
          });
  
          await secretsClient.send(createCommand);
          console.log(` Stored new wallet: ${walletId}`);
        } catch (err: any) {
          // If secret already exists, update it
          if (err.name === 'ResourceExistsException') {
            const updateCommand = new UpdateSecretCommand({
              SecretId: secretName,
              SecretString: secretValue,
              KmsKeyId: KMS_KEY_ID,
            });
  
            await secretsClient.send(updateCommand);
            console.log(` Updated existing wallet: ${walletId}`);
          } else {
            throw err;
          }
        }
      } catch (error) {
        console.error('Store Private Key Error:', error);
        throw new Error(`Failed to store private key: ${error}`);
      }
    }
  
    /**
     * Retrieve and decrypt private key from AWS Secrets Manager (LEGACY)
     */
    async getPrivateKey(walletId: string): Promise<string> {
      try {
        const secretName = `${SECRETS_PREFIX}${walletId}`;
        
        const command = new GetSecretValueCommand({
          SecretId: secretName,
        });
  
        const response = await secretsClient.send(command);
        
        if (!response.SecretString) {
          throw new Error('No secret value found');
        }
  
        const secretData = JSON.parse(response.SecretString);
        
        // Decrypt the private key
        const privateKey = await this.decryptData(secretData.encryptedPrivateKey);
        
        return privateKey;
      } catch (error: any) {
        if (error.name === 'ResourceNotFoundException') {
          throw new Error(`Wallet not found: ${walletId}`);
        }
        console.error('Get Private Key Error:', error);
        throw new Error(`Failed to retrieve private key: ${error}`);
      }
    }
  
    /**
     * Store versioned private key
     */
    async storeVersionedPrivateKey(
      walletId: string, 
      version: number, 
      privateKey: string, 
      metadata?: any
    ): Promise<void> {
      const secretName = `${this.secretPrefix}${walletId}-v${version}`;
      
      try {
        // Encrypt the private key first
        const encryptedKey = await this.encryptData(privateKey);
        
        const secretValue = JSON.stringify({
          encryptedPrivateKey: encryptedKey,
          walletId: walletId,
          version: version,
          createdAt: new Date().toISOString(),
          metadata: metadata || {}
        });
  
        const createCommand = new CreateSecretCommand({
          Name: secretName,
          SecretString: secretValue,
          KmsKeyId: KMS_KEY_ID,
          Description: `Hyperliquid wallet ${walletId} version ${version}`,
          Tags: [
            { Key: 'WalletId', Value: walletId },
            { Key: 'Version', Value: version.toString() }
          ]
        });
  
        await secretsClient.send(createCommand);
        console.log(` Stored wallet version: ${walletId}-v${version}`);
      } catch (error: any) {
        if (error.name === 'ResourceExistsException') {
          // Version already exists, update it
          const updateCommand = new PutSecretValueCommand({
            SecretId: secretName,
            SecretString: JSON.stringify({
              encryptedPrivateKey: await this.encryptData(privateKey),
              walletId: walletId,
              version: version,
              updatedAt: new Date().toISOString(),
              metadata: metadata || {}
            })
          });
          await secretsClient.send(updateCommand);
          console.log(` Updated wallet version: ${walletId}-v${version}`);
        } else {
          throw new Error(`Failed to store versioned key: ${error.name}`);
        }
      }
    }
  
    /**
     * Get versioned private key
     */
    async getVersionedPrivateKey(walletId: string, version: number): Promise<string> {
      const secretName = `${this.secretPrefix}${walletId}-v${version}`;
      
      try {
        const command = new GetSecretValueCommand({
          SecretId: secretName,
        });
  
        const response = await secretsClient.send(command);
        
        if (!response.SecretString) {
          throw new Error('No secret value found');
        }
  
        const secretData = JSON.parse(response.SecretString);
        
        // Decrypt the private key
        const privateKey = await this.decryptData(secretData.encryptedPrivateKey);
        
        return privateKey;
      } catch (error: any) {
        if (error.name === 'ResourceNotFoundException') {
          throw new Error(`Wallet version not found: ${walletId}-v${version}`);
        }
        throw new Error(`Failed to retrieve versioned key: ${error.name}`);
      }
    }
  
    /**
     * Get wallet version metadata
     */
    async getWalletVersionMetadata(walletId: string): Promise<WalletVersionMetadata | null> {
      const secretName = `${this.secretPrefix}${walletId}-version-metadata`;
      
      try {
        const command = new GetSecretValueCommand({
          SecretId: secretName
        });
  
        const response = await secretsClient.send(command);
        
        if (!response.SecretString) {
          return null;
        }
  
        return JSON.parse(response.SecretString);
      } catch (error: any) {
        if (error.name === 'ResourceNotFoundException') {
          return null;
        }
        throw new Error(`Failed to get version metadata: ${error.name}`);
      }
    }
  
    /**
     * Store wallet version metadata
     */
    async storeWalletVersionMetadata(metadata: WalletVersionMetadata): Promise<void> {
      const secretName = `${this.secretPrefix}${metadata.walletId}-version-metadata`;
      
      try {
        const command = new CreateSecretCommand({
          Name: secretName,
          SecretString: JSON.stringify(metadata),
          Description: `Version metadata for wallet ${metadata.walletId}`,
          Tags: [
            { Key: 'WalletId', Value: metadata.walletId },
            { Key: 'Type', Value: 'version-metadata' },
            { Key: 'CurrentVersion', Value: metadata.currentVersion.toString() }
          ]
        });
  
        await secretsClient.send(command);
      } catch (error: any) {
        if (error.name === 'ResourceExistsException') {
          // Update existing
          const updateCommand = new PutSecretValueCommand({
            SecretId: secretName,
            SecretString: JSON.stringify(metadata)
          });
          await secretsClient.send(updateCommand);
        } else {
          throw new Error(`Failed to store version metadata: ${error.name}`);
        }
      }
    }
  
    /**
     * Store public key metadata separately (unencrypted - it's public!)
     * This avoids expensive key reconstruction for read-only operations
     */
    async storePublicKeyMetadata(walletId: string, metadata: {
      publicKey: string;
      walletType: 'standard' | 'mpc';
      threshold?: string;
      createdAt?: string;
    }): Promise<void> {
      const secretName = `${this.secretPrefix}${walletId}-metadata`;
      
      try {
        console.log(` Storing public key metadata for ${walletId}`);
        
        const secretData = {
          publicKey: metadata.publicKey,
          walletType: metadata.walletType,
          threshold: metadata.threshold || 'N/A',
          createdAt: metadata.createdAt || new Date().toISOString(),
          isMetadata: true
        };
  
        const command = new CreateSecretCommand({
          Name: secretName,
          SecretString: JSON.stringify(secretData),
          Description: `Public key metadata for ${walletId}`,
          Tags: [
            { Key: 'WalletId', Value: walletId },
            { Key: 'Type', Value: 'metadata' },
            { Key: 'WalletType', Value: metadata.walletType }
          ]
        });
  
        await secretsClient.send(command);
        console.log(`    Metadata stored: ${secretName}`);
      } catch (error: any) {
        if (error.name === 'ResourceExistsException') {
          // Metadata already exists, update it
          await this.updatePublicKeyMetadata(walletId, metadata);
        } else {
          console.error('Store Metadata Error:', error);
          throw new Error(`Failed to store metadata: ${error.name}`);
        }
      }
    }
  
    /**
     * Update existing public key metadata
     */
    async updatePublicKeyMetadata(walletId: string, metadata: {
      publicKey: string;
      walletType: 'standard' | 'mpc';
      threshold?: string;
      createdAt?: string;
    }): Promise<void> {
      const secretName = `${this.secretPrefix}${walletId}-metadata`;
      
      try {
        const secretData = {
          publicKey: metadata.publicKey,
          walletType: metadata.walletType,
          threshold: metadata.threshold || 'N/A',
          createdAt: metadata.createdAt || new Date().toISOString(),
          isMetadata: true,
          updatedAt: new Date().toISOString()
        };
  
        const command = new PutSecretValueCommand({
          SecretId: secretName,
          SecretString: JSON.stringify(secretData)
        });
  
        await secretsClient.send(command);
        console.log(`    Metadata updated: ${secretName}`);
      } catch (error: any) {
        console.error('Update Metadata Error:', error);
        throw new Error(`Failed to update metadata: ${error.name}`);
      }
    }
  
    /**
     * Retrieve public key metadata (fast - no decryption needed!)
     */
    async getPublicKeyMetadata(walletId: string): Promise<{
      publicKey: string;
      walletType: 'standard' | 'mpc';
      threshold: string;
      createdAt: string;
    }> {
      const secretName = `${this.secretPrefix}${walletId}-metadata`;
      
      try {
        const command = new GetSecretValueCommand({
          SecretId: secretName
        });
  
        const response = await secretsClient.send(command);
        
        if (!response.SecretString) {
          throw new Error(`No metadata found for wallet: ${walletId}`);
        }
  
        const metadata = JSON.parse(response.SecretString);
        
        return {
          publicKey: metadata.publicKey,
          walletType: metadata.walletType,
          threshold: metadata.threshold,
          createdAt: metadata.createdAt
        };
      } catch (error: any) {
        if (error.name === 'ResourceNotFoundException') {
          throw new Error(`Wallet metadata not found: ${walletId}`);
        }
        console.error('Get Metadata Error:', error);
        throw new Error(`Failed to retrieve metadata: ${error.name}`);
      }
    }
  
    /**
     * Mark old version as deprecated (soft delete)
     */
    async deprecateWalletVersion(walletId: string, version: number): Promise<void> {
      const versionMetadata = await this.getWalletVersionMetadata(walletId);
      
      if (!versionMetadata) {
        throw new Error(`No version metadata found for wallet: ${walletId}`);
      }
  
      if (versionMetadata.versions[version]) {
        versionMetadata.versions[version].status = 'deprecated';
        versionMetadata.versions[version].rotatedAt = new Date().toISOString();
        
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 day grace period
        versionMetadata.versions[version].expiresAt = expiresAt.toISOString();
  
        await this.storeWalletVersionMetadata(versionMetadata);
        console.log(`⚠️  Deprecated wallet version: ${walletId}-v${version} (expires in 30 days)`);
      }
    }
  
    /**
     * List all stored wallets
     */
    async listWallets(): Promise<string[]> {
      try {
        const command = new ListSecretsCommand({
          Filters: [
            {
              Key: 'name',
              Values: [SECRETS_PREFIX]
            }
          ]
        });
  
        const response = await secretsClient.send(command);
        
        const walletIds = (response.SecretList || [])
          .map(secret => secret.Name?.replace(SECRETS_PREFIX, '') || '')
          .filter(id => id.length > 0 && !id.endsWith('-metadata')) // Exclude metadata entries
          .filter(id => !id.startsWith('mpc-share-')) // Exclude MPC shares
          .filter(id => !id.endsWith('-version-metadata')) // Exclude version metadata
          .filter(id => !id.match(/-v\d+$/)); // Exclude versioned wallets
    
        return walletIds;
      } catch (error) {
        console.error('List Wallets Error:', error);
        throw new Error(`Failed to list wallets: ${error}`);
      }
    }
  }
  