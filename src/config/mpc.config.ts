import * as dotenv from 'dotenv';

dotenv.config();

export const mpcConfig = {
  // 2-of-3 threshold: need 2 shares to sign, split into 3 shares
  threshold: {
    required: parseInt(process.env.MPC_THRESHOLD_REQUIRED || '2'),
    total: parseInt(process.env.MPC_THRESHOLD_TOTAL || '3')
  },
  
  // Storage locations for shares
  shareStoragePrefix: 'mpc-share-',
  
  // Enable/disable MPC mode
  enabled: process.env.MPC_ENABLED === 'true'
};

export const isMPCEnabled = () => mpcConfig.enabled;
