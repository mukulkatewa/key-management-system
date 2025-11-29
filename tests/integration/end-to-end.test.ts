import request from 'supertest';
import Fastify from 'fastify';
// Import your app setup (you might need to refactor index.ts to export the fastify instance)

describe('End-to-End Integration Tests', () => {
  const API_KEY = 'your_secure_api_key_here_change_in_production';
  
  jest.setTimeout(15000);

  describe('Health Checks', () => {
    it('GET /health should return OK', async () => {
      const response = await request('http://localhost:3000')
        .get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        service: 'hyperliquid-kms'
      });
    });

    it('GET /mpc/status should return MPC configuration', async () => {
      const response = await request('http://localhost:3000')
        .get('/mpc/status');
      
      expect(response.status).toBe(200);
      expect(response.body.mpcEnabled).toBe(true);
      expect(response.body.threshold).toBe('2');
    });
  });

  describe('Authentication', () => {
    it('should reject requests without API key', async () => {
      const response = await request('http://localhost:3000')
        .post('/wallets/generate')
        .send({ walletId: 'test' });
      
      expect(response.status).toBe(401);
    });

    it('should accept requests with valid API key', async () => {
      const response = await request('http://localhost:3000')
        .post('/wallets/generate')
        .set('X-API-Key', API_KEY)
        .send({ walletId: `integration-test-${Date.now()}` });
      
      expect(response.status).toBe(200);
    });
  });

  describe('Standard Wallet Flow', () => {
    let walletId: string;

    beforeAll(() => {
      walletId = `integration-standard-${Date.now()}`;
    });

    it('should create, sign, and retrieve wallet', async () => {
      // Create wallet
      const createResponse = await request('http://localhost:3000')
        .post('/wallets/generate')
        .set('X-API-Key', API_KEY)
        .send({ walletId });
      
      expect(createResponse.status).toBe(200);
      expect(createResponse.body.success).toBe(true);
      const publicKey = createResponse.body.wallet.publicKey;

      // Sign message
      const signResponse = await request('http://localhost:3000')
        .post('/wallets/sign')
        .set('X-API-Key', API_KEY)
        .send({ walletId, message: 'test' });
      
      expect(signResponse.status).toBe(200);
      expect(signResponse.body.publicKey).toBe(publicKey);
      expect(signResponse.body.signature).toMatch(/^0x[a-f0-9]{128}$/);

      // Get public key
      const pkResponse = await request('http://localhost:3000')
        .get(`/wallets/${walletId}/public-key`);
      
      expect(pkResponse.status).toBe(200);
      expect(pkResponse.body.publicKey).toBe(publicKey);
    });
  });

  describe('Key Rotation Flow', () => {
    let walletId: string;
    let originalPublicKey: string;

    beforeAll(async () => {
      walletId = `integration-rotation-${Date.now()}`;
      
      const createResponse = await request('http://localhost:3000')
        .post('/wallets/generate')
        .set('X-API-Key', API_KEY)
        .send({ walletId });
      
      originalPublicKey = createResponse.body.wallet.publicKey;
    });

    it('should rotate key and update active version', async () => {
      // Rotate
      const rotateResponse = await request('http://localhost:3000')
        .post('/wallets/rotate')
        .set('X-API-Key', API_KEY)
        .send({ walletId, reason: 'Integration test' });
      
      expect(rotateResponse.status).toBe(200);
      expect(rotateResponse.body.rotation.newPublicKey).not.toBe(originalPublicKey);
      expect(rotateResponse.body.rotation.oldPublicKey).toBe(originalPublicKey);

      // Verify rotation history
      const historyResponse = await request('http://localhost:3000')
        .get(`/wallets/${walletId}/rotation-history`);
      
      expect(historyResponse.status).toBe(200);
      expect(historyResponse.body.history.currentVersion).toBe(2);
      expect(historyResponse.body.history.versions['1'].status).toBe('deprecated');
      expect(historyResponse.body.history.versions['2'].status).toBe('active');
    });
  });
});
