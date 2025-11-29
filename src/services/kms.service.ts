import { 
    EncryptCommand, 
    DecryptCommand, 
    GenerateDataKeyCommand 
  } from '@aws-sdk/client-kms';
  import { 
    CreateSecretCommand, 
    GetSecretValueCommand,
    UpdateSecretCommand,
    ListSecretsCommand
  } from '@aws-sdk/client-secrets-manager';
  import { kmsClient, secretsClient, KMS_KEY_ID, SECRETS_PREFIX } from '../config/aws.config';
  import * as crypto from 'crypto';
  
  export class KMSService {
    
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
     * Store encrypted private key in AWS Secrets Manager
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
          console.log(`✅ Stored new wallet: ${walletId}`);
        } catch (err: any) {
          // If secret already exists, update it
          if (err.name === 'ResourceExistsException') {
            const updateCommand = new UpdateSecretCommand({
              SecretId: secretName,
              SecretString: secretValue,
              KmsKeyId: KMS_KEY_ID,
            });
  
            await secretsClient.send(updateCommand);
            console.log(`✅ Updated existing wallet: ${walletId}`);
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
     * Retrieve and decrypt private key from AWS Secrets Manager
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
          .filter(id => id.length > 0);
  
        return walletIds;
      } catch (error) {
        console.error('List Wallets Error:', error);
        throw new Error(`Failed to list wallets: ${error}`);
      }
    }
  }
  