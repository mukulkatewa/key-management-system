export interface Wallet {
    walletId: string;
    publicKey: string;
    createdAt: string;
    metadata?: {
      label?: string;
      purpose?: string;
      [key: string]: any;
    };
  }
  
  export interface SignatureRequest {
    walletId: string;
    message: string;
  }
  
  export interface SignatureResponse {
    signature: string;
    publicKey: string;
    walletId: string;
  }
  