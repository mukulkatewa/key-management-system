import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { SigningService } from './services/signing.service';
import { apiKeyAuth } from './middleware/auth.middleware';
import * as dotenv from 'dotenv';
import { MPCSigningService } from './services/mpc/mpc-signing.service';
import { isMPCEnabled } from './config/mpc.config';
import { 
  rateLimitConfig, 
  walletGenerationRateLimit, 
  signingRateLimit,
  mpcWalletGenerationRateLimit,
  readOperationsRateLimit,
  healthCheckRateLimit
} from './config/rate-limit.config';
import { RotationService } from './services/rotation.service';

dotenv.config();

const fastify = Fastify({ logger: true });
const signingService = new SigningService();
const mpcSigningService = new MPCSigningService();
const rotationService = new RotationService();

// Register rate limiting plugin globally (100 requests per 5 minutes)
fastify.register(rateLimit, rateLimitConfig);

// ============================================================================
// STANDARD ENDPOINTS (Single-Key KMS)
// ============================================================================

// Health check (no auth required, lenient rate limit)
fastify.get('/health', { 
  config: { 
    rateLimit: healthCheckRateLimit // 1000 per 5 minutes
  } 
}, async (request, reply) => {
  return { status: 'ok', service: 'hyperliquid-kms' };
});

// Generate new wallet (PROTECTED + STRICT RATE LIMIT)
fastify.post<{
  Body: { walletId: string; metadata?: any }
}>('/wallets/generate', { 
  preHandler: apiKeyAuth,
  config: {
    rateLimit: walletGenerationRateLimit // 5 per 5 minutes
  }
}, async (request, reply) => {
  try {
    const { walletId, metadata } = request.body;
    
    if (!walletId) {
      return reply.code(400).send({ error: 'walletId is required' });
    }

    const wallet = await signingService.generateWallet(walletId, metadata);
    
    return {
      success: true,
      wallet: {
        walletId: wallet.walletId,
        publicKey: wallet.publicKey,
        createdAt: wallet.createdAt
      }
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

// Sign message/transaction (PROTECTED + SIGNING RATE LIMIT)
fastify.post<{
  Body: { walletId: string; message: string }
}>('/wallets/sign', { 
  preHandler: apiKeyAuth,
  config: {
    rateLimit: signingRateLimit // 50 per 5 minutes
  }
}, async (request, reply) => {
  try {
    const { walletId, message } = request.body;
    
    if (!walletId || !message) {
      return reply.code(400).send({ error: 'walletId and message are required' });
    }

    const signature = await signingService.signMessage({ walletId, message });
    
    return {
      success: true,
      signature: signature.signature,
      publicKey: signature.publicKey,
      walletId: signature.walletId
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

// Sign Hyperliquid order (PROTECTED + SIGNING RATE LIMIT)
fastify.post<{
  Body: { walletId: string; orderPayload: any }
}>('/wallets/sign-order', { 
  preHandler: apiKeyAuth,
  config: {
    rateLimit: signingRateLimit // 50 per 5 minutes
  }
}, async (request, reply) => {
  try {
    const { walletId, orderPayload } = request.body;
    
    if (!walletId || !orderPayload) {
      return reply.code(400).send({ error: 'walletId and orderPayload are required' });
    }

    const signature = await signingService.signOrderPayload(walletId, orderPayload);
    
    return {
      success: true,
      signature: signature.signature,
      publicKey: signature.publicKey,
      walletId: signature.walletId
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

// Get public key (read-only, lenient rate limit)
fastify.get<{
  Params: { walletId: string }
}>('/wallets/:walletId/public-key', {
  config: {
    rateLimit: readOperationsRateLimit // 200 per 5 minutes
  }
}, async (request, reply) => {
  try {
    const { walletId } = request.params;
    const publicKey = await signingService.getPublicKey(walletId);
    
    return {
      success: true,
      walletId,
      publicKey
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(404).send({ error: error.message });
  }
});

// List all wallets (read-only, lenient rate limit)
fastify.get('/wallets', {
  config: {
    rateLimit: readOperationsRateLimit // 200 per 5 minutes
  }
}, async (request, reply) => {
  try {
    const wallets = await signingService.listWallets();
    
    return {
      success: true,
      wallets,
      count: wallets.length
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

// ============================================================================
// WALLET ROTATION ENDPOINTS
// ============================================================================

// Rotate wallet to new version
fastify.post<{
  Body: { walletId: string; reason?: string }
}>('/wallets/rotate', { 
  preHandler: apiKeyAuth,
  config: {
    rateLimit: { max: 3, timeWindow: '5 minutes' } // Very restrictive
  }
}, async (request, reply) => {
  try {
    const { walletId, reason } = request.body;
    
    if (!walletId) {
      return reply.code(400).send({ error: 'walletId is required' });
    }

    const result = await rotationService.rotateWallet(walletId, reason);
    
    return {
      success: true,
      rotation: result
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

// Get rotation history
fastify.get<{
  Params: { walletId: string }
}>('/wallets/:walletId/rotation-history', {
  config: {
    rateLimit: readOperationsRateLimit
  }
}, async (request, reply) => {
  try {
    const { walletId } = request.params;
    
    const history = await rotationService.getRotationHistory(walletId);
    
    if (!history) {
      return reply.code(404).send({ 
        error: 'No rotation history found. Wallet may not exist or not migrated to versioned system.' 
      });
    }
    
    return {
      success: true,
      walletId,
      history
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(404).send({ error: error.message });
  }
});

// Migrate legacy wallet to versioned system
fastify.post<{
  Body: { walletId: string }
}>('/wallets/migrate', { 
  preHandler: apiKeyAuth,
  config: {
    rateLimit: { max: 5, timeWindow: '5 minutes' }
  }
}, async (request, reply) => {
  try {
    const { walletId } = request.body;
    
    if (!walletId) {
      return reply.code(400).send({ error: 'walletId is required' });
    }

    await rotationService.migrateLegacyWallet(walletId);
    
    return {
      success: true,
      message: `Wallet ${walletId} migrated to versioned system`,
      walletId
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

// ============================================================================
// MPC ENDPOINTS (Multi-Party Computation with Threshold Signatures)
// ============================================================================

// MPC Status endpoint
fastify.get('/mpc/status', {
  config: {
    rateLimit: healthCheckRateLimit // 1000 per 5 minutes
  }
}, async (request, reply) => {
  return {
    mpcEnabled: isMPCEnabled(),
    threshold: process.env.MPC_THRESHOLD_REQUIRED,
    totalShares: process.env.MPC_THRESHOLD_TOTAL,
    algorithm: 'Shamir\'s Secret Sharing',
    description: isMPCEnabled() 
      ? `${process.env.MPC_THRESHOLD_REQUIRED}-of-${process.env.MPC_THRESHOLD_TOTAL} threshold signature scheme`
      : 'MPC disabled - using single-key mode'
  };
});

// Generate MPC wallet (PROTECTED + VERY STRICT RATE LIMIT)
fastify.post<{
  Body: { walletId: string; metadata?: any }
}>('/mpc/wallets/generate', { 
  preHandler: apiKeyAuth,
  config: {
    rateLimit: mpcWalletGenerationRateLimit // 3 per 5 minutes
  }
}, async (request, reply) => {
  try {
    const { walletId, metadata } = request.body;
    
    if (!walletId) {
      return reply.code(400).send({ error: 'walletId is required' });
    }

    if (!isMPCEnabled()) {
      return reply.code(400).send({ 
        error: 'MPC is not enabled. Set MPC_ENABLED=true in .env' 
      });
    }

    const wallet = await mpcSigningService.generateMPCWallet(walletId, metadata);
    
    return {
      success: true,
      wallet: {
        walletId: wallet.walletId,
        publicKey: wallet.publicKey,
        createdAt: wallet.createdAt,
        mpcEnabled: true,
        metadata: wallet.metadata
      }
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

// Sign message with MPC (PROTECTED + SIGNING RATE LIMIT)
fastify.post<{
  Body: { walletId: string; message: string }
}>('/mpc/wallets/sign', { 
  preHandler: apiKeyAuth,
  config: {
    rateLimit: signingRateLimit // 50 per 5 minutes
  }
}, async (request, reply) => {
  try {
    const { walletId, message } = request.body;
    
    if (!walletId || !message) {
      return reply.code(400).send({ error: 'walletId and message are required' });
    }

    if (!isMPCEnabled()) {
      return reply.code(400).send({ 
        error: 'MPC is not enabled. Set MPC_ENABLED=true in .env' 
      });
    }

    const signature = await mpcSigningService.signMessageMPC({ walletId, message });
    
    return {
      success: true,
      signature: signature.signature,
      publicKey: signature.publicKey,
      walletId: signature.walletId,
      mpcSigning: true
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

// Sign Hyperliquid order with MPC (PROTECTED + SIGNING RATE LIMIT)
fastify.post<{
  Body: { walletId: string; orderPayload: any }
}>('/mpc/wallets/sign-order', { 
  preHandler: apiKeyAuth,
  config: {
    rateLimit: signingRateLimit // 50 per 5 minutes
  }
}, async (request, reply) => {
  try {
    const { walletId, orderPayload } = request.body;
    
    if (!walletId || !orderPayload) {
      return reply.code(400).send({ error: 'walletId and orderPayload are required' });
    }

    if (!isMPCEnabled()) {
      return reply.code(400).send({ 
        error: 'MPC is not enabled. Set MPC_ENABLED=true in .env' 
      });
    }

    const signature = await mpcSigningService.signOrderPayloadMPC(walletId, orderPayload);
    
    return {
      success: true,
      signature: signature.signature,
      publicKey: signature.publicKey,
      walletId: signature.walletId,
      mpcSigning: true
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(500).send({ error: error.message });
  }
});

// Get MPC wallet public key
fastify.get<{
  Params: { walletId: string }
}>('/mpc/wallets/:walletId/public-key', {
  config: {
    rateLimit: readOperationsRateLimit // 200 per 5 minutes
  }
}, async (request, reply) => {
  try {
    const { walletId } = request.params;
    
    if (!isMPCEnabled()) {
      return reply.code(400).send({ 
        error: 'MPC is not enabled. Set MPC_ENABLED=true in .env' 
      });
    }
    
    const publicKey = await mpcSigningService.getPublicKey(walletId);
    
    return {
      success: true,
      walletId,
      publicKey,
      mpcEnabled: true
    };
  } catch (error: any) {
    fastify.log.error(error);
    return reply.code(404).send({ error: error.message });
  }
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await fastify.listen({ port, host: '0.0.0.0' });
    
    const authEnabled = process.env.API_KEY ? '🔒 Enabled' : '⚠️  Disabled (Dev Mode)';
    const mpcStatus = isMPCEnabled() ? '🔐 Enabled (2-of-3)' : '⚠️  Disabled';
    
    console.log(`
🚀 Hyperliquid KMS Service Running!
📍 Server: http://localhost:${port}
🔐 KMS Key: ${process.env.AWS_KMS_KEY_ID}
🌍 Region: ${process.env.AWS_REGION}
🔑 API Auth: ${authEnabled}
🔒 MPC Mode: ${mpcStatus}
🚦 Rate Limiting: Enabled (100 req / 5 min globally)
🔄 Key Rotation: Enabled (annual rotation recommended)

Rate Limits (per 5 minutes):
  - Global: 100 requests
  - Health Checks: 1000 requests
  - Wallet Generation: 5 requests
  - MPC Wallet Generation: 3 requests
  - Wallet Rotation: 3 requests
  - Signing Operations: 50 requests
  - Read Operations: 200 requests

Available Endpoints:
  Standard KMS:
    POST /wallets/generate
    POST /wallets/sign
    POST /wallets/sign-order
    GET  /wallets/:id/public-key
    GET  /wallets
  
  Key Rotation:
    POST /wallets/rotate
    GET  /wallets/:id/rotation-history
    POST /wallets/migrate
  
  MPC Enhanced:
    GET  /mpc/status
    POST /mpc/wallets/generate
    POST /mpc/wallets/sign
    POST /mpc/wallets/sign-order
    GET  /mpc/wallets/:id/public-key
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
