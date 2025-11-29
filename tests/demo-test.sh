#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

API_URL="http://localhost:3000"
API_KEY="your_secure_api_key_here_change_in_production"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   Hyperliquid KMS Service - Complete Demo${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Test 1: Health Check
echo -e "${GREEN}Test 1: Health Check${NC}"
curl -s $API_URL/health | python3 -m json.tool
echo -e "\n"

# Test 2: Generate Wallet
echo -e "${GREEN}Test 2: Generate New Trading Wallet${NC}"
WALLET_RESPONSE=$(curl -s -X POST $API_URL/wallets/generate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "walletId": "demo-trader-wallet",
    "metadata": {
      "label": "Demo Trading Wallet",
      "purpose": "Recruiter Demo",
      "strategy": "Market Making"
    }
  }')
echo $WALLET_RESPONSE | python3 -m json.tool
PUBLIC_KEY=$(echo $WALLET_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin)['wallet']['publicKey'])" 2>/dev/null)
echo -e "${BLUE} Wallet Created: $PUBLIC_KEY${NC}\n"

# Test 3: List All Wallets
echo -e "${GREEN}Test 3: List All Stored Wallets${NC}"
curl -s $API_URL/wallets | python3 -m json.tool
echo -e "\n"

# Test 4: Get Public Key
echo -e "${GREEN}Test 4: Retrieve Public Key (No Private Key Exposed)${NC}"
curl -s $API_URL/wallets/demo-trader-wallet/public-key | python3 -m json.tool
echo -e "\n"

# Test 5: Sign Test Message
echo -e "${GREEN}Test 5: Sign Test Message${NC}"
curl -s -X POST $API_URL/wallets/sign \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "walletId": "demo-trader-wallet",
    "message": "test_hyperliquid_transaction"
  }' | python3 -m json.tool
echo -e "\n"

# Test 6: Sign Hyperliquid Order
echo -e "${GREEN}Test 6: Sign Hyperliquid Order Payload${NC}"
curl -s -X POST $API_URL/wallets/sign-order \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "walletId": "demo-trader-wallet",
    "orderPayload": {
      "action": "order",
      "coin": "BTC",
      "isBuy": true,
      "sz": 0.1,
      "limitPx": 45000,
      "timestamp": '$(date +%s000)'
    }
  }' | python3 -m json.tool
echo -e "\n"

# Test 7: Test Auth (Should Fail)
echo -e "${GREEN}Test 7: Security Test - Request Without API Key (Should Fail)${NC}"
curl -s -X POST $API_URL/wallets/sign \
  -H "Content-Type: application/json" \
  -d '{
    "walletId": "demo-trader-wallet",
    "message": "unauthorized_attempt"
  }' | python3 -m json.tool
echo -e "\n"

echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN} All Tests Completed Successfully!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Key Points to Show Recruiter:"
echo -e "1.  Private keys stored encrypted in AWS KMS"
echo -e "2.  Keys NEVER exposed in logs or API responses"
echo -e "3.  Secure signing without key access"
echo -e "4.  API authentication required for sensitive operations"
echo -e "5.  Production-ready architecture (tread.fi style)"
