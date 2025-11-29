import Fastify from 'fastify';
import { SigningService } from './services/signing.service';
import { apiKeyAuth } from './middleware/auth.middleware';
import * as dotenv from 'dotenv';

dotenv.config();

const fastify = Fastify({ logger: true });
const signingService = new SigningService();

// Health check (no auth required)
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', service: 'hyperliquid-kms' };
});

// Generate new wallet (PROTECTED)
fastify.post<{
  Body: { walletId: string; metadata?: any }
}>('/wallets/generate', { preHandler: apiKeyAuth }, async (request, reply) => {
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

// Sign message/transaction (PROTECTED)
fastify.post<{
  Body: { walletId: string; message: string }
}>('/wallets/sign', { preHandler: apiKeyAuth }, async (request, reply) => {
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

// Sign Hyperliquid order (PROTECTED)
fastify.post<{
  Body: { walletId: string; orderPayload: any }
}>('/wallets/sign-order', { preHandler: apiKeyAuth }, async (request, reply) => {
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

// Get public key (read-only, optional auth)
fastify.get<{
  Params: { walletId: string }
}>('/wallets/:walletId/public-key', async (request, reply) => {
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

// List all wallets (read-only, optional auth)
fastify.get('/wallets', async (request, reply) => {
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

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await fastify.listen({ port, host: '0.0.0.0' });
    
    const authEnabled = process.env.API_KEY ? '🔒 Enabled' : '⚠️  Disabled (Dev Mode)';
    
    console.log(`
🚀 Hyperliquid KMS Service Running!
📍 Server: http://localhost:${port}
🔐 KMS Key: ${process.env.AWS_KMS_KEY_ID}
🌍 Region: ${process.env.AWS_REGION}
🔑 API Auth: ${authEnabled}
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
