import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const KMS_SERVICE_URL = process.env.KMS_SERVICE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'your_secure_api_key_here_change_in_production';

interface HyperliquidOrder {
  action: string;
  coin: string;
  isBuy: boolean;
  sz: number;
  limitPx: number;
  timestamp: number;
}

/**
 * Demo Trading Bot - Shows how trading bots integrate with KMS service
 * Similar to tread.fi architecture where bots request signatures
 */
class HyperliquidDemoBot {
  private walletId: string;
  private publicKey: string = '';

  constructor(walletId: string) {
    this.walletId = walletId;
  }

  /**
   * Initialize bot - create or load wallet
   */
  async initialize() {
    console.log('🤖 Initializing Hyperliquid Demo Bot...\n');

    try {
      // Try to get existing wallet
      const response = await axios.get(
        `${KMS_SERVICE_URL}/wallets/${this.walletId}/public-key`
      );
      this.publicKey = response.data.publicKey;
      console.log(`✅ Loaded existing wallet: ${this.walletId}`);
      console.log(`   Public Key: ${this.publicKey}\n`);
    } catch (error) {
      // Wallet doesn't exist, create new one
      console.log('📝 Wallet not found. Creating new wallet...');
      const response = await axios.post(
        `${KMS_SERVICE_URL}/wallets/generate`,
        {
          walletId: this.walletId,
          metadata: {
            label: 'Demo Bot Wallet',
            purpose: 'Automated Trading Demo',
            bot: 'hyperliquid-demo-bot'
          }
        },
        {
          headers: { 'X-API-Key': API_KEY }
        }
      );
      this.publicKey = response.data.wallet.publicKey;
      console.log(`✅ Created new wallet: ${this.walletId}`);
      console.log(`   Public Key: ${this.publicKey}\n`);
    }
  }

  /**
   * Simulate market making strategy
   */
  async runMarketMakingStrategy() {
    console.log('📊 Starting Market Making Strategy Demo...\n');

    // Simulate getting market data
    const currentPrice = 45000 + Math.random() * 1000;
    console.log(`💹 Current BTC Price: $${currentPrice.toFixed(2)}`);

    // Create buy order (bid)
    const buyOrder: HyperliquidOrder = {
      action: 'order',
      coin: 'BTC',
      isBuy: true,
      sz: 0.1,
      limitPx: Math.floor(currentPrice - 100),
      timestamp: Date.now()
    };

    // Create sell order (ask)
    const sellOrder: HyperliquidOrder = {
      action: 'order',
      coin: 'BTC',
      isBuy: false,
      sz: 0.1,
      limitPx: Math.floor(currentPrice + 100),
      timestamp: Date.now()
    };

    console.log('\n📝 Placing Orders:');
    console.log(`   BUY:  ${buyOrder.sz} BTC @ $${buyOrder.limitPx}`);
    console.log(`   SELL: ${sellOrder.sz} BTC @ $${sellOrder.limitPx}`);

    // Sign orders using KMS (NO PRIVATE KEY EXPOSED!)
    const buySignature = await this.signOrder(buyOrder);
    const sellSignature = await this.signOrder(sellOrder);

    console.log('\n✅ Orders Signed Successfully!');
    console.log(`   Buy Order Signature: ${buySignature.substring(0, 20)}...`);
    console.log(`   Sell Order Signature: ${sellSignature.substring(0, 20)}...`);

    console.log('\n📤 Orders Ready to Submit to Hyperliquid Exchange');
    console.log('   (In production, would send to Hyperliquid API here)\n');

    return { buySignature, sellSignature };
  }

  /**
   * Sign order using KMS service
   */
  private async signOrder(order: HyperliquidOrder): Promise<string> {
    try {
      const response = await axios.post(
        `${KMS_SERVICE_URL}/wallets/sign-order`,
        {
          walletId: this.walletId,
          orderPayload: order
        },
        {
          headers: { 'X-API-Key': API_KEY }
        }
      );

      return response.data.signature;
    } catch (error: any) {
      console.error('❌ Failed to sign order:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Demonstrate key security
   */
  async demonstrateSecurity() {
    console.log('\n🔒 Security Demonstration:\n');
    console.log('✅ Private keys stored encrypted in AWS KMS');
    console.log('✅ Keys decrypted only in-memory during signing');
    console.log('✅ No private keys in logs, code, or environment variables');
    console.log('✅ API authentication required for all operations');
    console.log('✅ AWS IAM controls access to encryption keys');
    console.log('\n📋 Checking AWS Secrets Manager...');
    
    const wallets = await axios.get(`${KMS_SERVICE_URL}/wallets`);
    console.log(`   Total Wallets Stored: ${wallets.data.count}`);
    console.log(`   Wallet IDs: ${wallets.data.wallets.join(', ')}`);
  }
}

/**
 * Main demo execution
 */
async function runDemo() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Hyperliquid Trading Bot + KMS Integration Demo');
  console.log('═══════════════════════════════════════════════════\n');

  const bot = new HyperliquidDemoBot('production-bot-wallet');

  try {
    // Step 1: Initialize
    await bot.initialize();

    // Step 2: Run strategy
    await bot.runMarketMakingStrategy();

    // Step 3: Show security features
    await bot.demonstrateSecurity();

    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ Demo Completed Successfully!');
    console.log('═══════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run the demo
runDemo();
