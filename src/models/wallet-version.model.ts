export interface WalletVersion {
    walletId: string;
    version: number;
    publicKey: string;
    createdAt: Date;
    rotatedAt?: Date;
    status: 'active' | 'rotating' | 'deprecated' | 'deleted';
    previousVersion?: number;
    expiresAt?: Date;
  }
  
  export interface WalletVersionMetadata {
    walletId: string;
    currentVersion: number;
    versions: {
      [version: number]: {
        publicKey: string;
        status: 'active' | 'rotating' | 'deprecated' | 'deleted';
        createdAt: string;
        rotatedAt?: string;
        expiresAt?: string;
      };
    };
    rotationHistory: Array<{
      fromVersion: number;
      toVersion: number;
      rotatedAt: string;
      reason?: string;
    }>;
  }
  