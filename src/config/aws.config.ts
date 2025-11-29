import { KMSClient } from '@aws-sdk/client-kms';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import * as dotenv from 'dotenv';

dotenv.config();

export const awsConfig = {
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
};

export const kmsClient = new KMSClient(awsConfig);
export const secretsClient = new SecretsManagerClient(awsConfig);

export const KMS_KEY_ID = process.env.AWS_KMS_KEY_ID!;
export const SECRETS_PREFIX = process.env.SECRETS_PREFIX || 'hyperliquid/wallets/';
