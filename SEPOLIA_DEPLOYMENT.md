#  Sepolia Deployment Guide

Complete step-by-step guide to deploy the Payment Gateway on Ethereum Sepolia testnet.

##  Prerequisites

### 1. Get Sepolia ETH
- Visit [Sepolia Faucet](https://sepoliafaucet.com/)
- Or use [Alchemy Sepolia Faucet](https://sepoliafaucet.com/)
- You'll need ~0.5 ETH for deployment and testing

### 2. Get RPC URL
**Option A: Use Infura** (Free)
1. Go to [Infura.io](https://infura.io/)
2. Create account and new project
3. Copy the Sepolia endpoint: `https://sepolia.infura.io/v3/YOUR_PROJECT_ID`

**Option B: Use Alchemy** (Free)
1. Go to [Alchemy.com](https://alchemy.com/)
2. Create account and new app (select Sepolia)
3. Copy the HTTPS endpoint

**Option C: Use public RPC**
- `https://rpc.sepolia.org` (may be slower)

### 3. Get Etherscan API Key (Optional - for verification)
1. Go to [Etherscan.io](https://etherscan.io/apis)
2. Create account
3. Generate API key

##  Step 1: Configure Environment

```bash
cd /Users/mriduly/Desktop/BitFia-Assesment

# Open .env file
nano .env
```

Update with your values:
```env
# Network RPC URLs (Sepolia Testnet)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID

# Your wallet private key (NEVER commit this!)
PRIVATE_KEY=your_private_key_here

# API key for contract verification on Etherscan
ETHERSCAN_API_KEY=your_etherscan_api_key

# Backend will be updated after deployment
BACKEND_PORT=3000
CONTRACT_ADDRESS=
RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
```

##  Step 2: Install Dependencies

```bash
# Install main project dependencies
npm install

# Install backend dependencies (use Node v20)
nvm use 20
cd backend
npm install
cd ..
```

##  Step 3: Compile Contracts

```bash
npm run compile
```

Expected output:
```
Compiled 10 Solidity files successfully
```

##   Step 4: Run Tests

```bash
npm test
```

Make sure all 67 tests pass!

##  Step 5: Deploy to Sepolia

```bash
npm run deploy:sepolia
```

**Expected output:**
```
 Starting deployment...

Deploying contracts with account: 0x123...
Account balance: 0.5 ETH

 Deploying MockUSDT...
  MockUSDT deployed to: 0xABC123...

 Deploying PaymentGateway...
  PaymentGateway deployed to: 0xDEF456...

  Configuring PaymentGateway...
  USDT token support enabled

 Minting test tokens...
  Minted 100,000 USDT to deployer

============================================================
 DEPLOYMENT SUMMARY
============================================================
Network: sepolia
Deployer: 0x123...
MockUSDT: 0xABC123...
PaymentGateway: 0xDEF456...
Fee Collector: 0x123...
Platform Fee: 25 basis points (0.25%)
============================================================

 Deployment info saved to: deployments/sepolia-1234567890.json
```

** IMPORTANT: Save these addresses!**
- MockUSDT: `0xABC123...`
- PaymentGateway: `0xDEF456...`

##  Step 6: Verify Contracts on Etherscan

```bash
# Verify MockUSDT
npx hardhat verify --network sepolia 0xABC123...

# Verify PaymentGateway (include constructor argument)
npx hardhat verify --network sepolia 0xDEF456... "0x123..."
```

Success message:
```
Successfully verified contract PaymentGateway on Etherscan.
https://sepolia.etherscan.io/address/0xDEF456...#code
```

##  Step 7: Configure Backend

```bash
cd backend

# Create .env file
cp .env.example .env
nano .env
```

Update with deployed addresses:
```env
PORT=3000
NODE_ENV=development

# Use your deployed contract address
RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
CONTRACT_ADDRESS=0xDEF456...

CHAIN_ID=11155111
POLL_INTERVAL=5000
START_BLOCK=0
LOG_LEVEL=info
```

##  Step 8: Start Backend

```bash
# Still in backend directory
npm run dev
```

Expected output:
```
 Starting Payment Gateway Backend...
  Initializing database...
  Database initialized successfully
 Webhook retry worker started
 Starting event indexer...
 Syncing blocks 12345 to 12350...
  Synced up to block 12350
  Indexer started (polling every 5000ms)

  Server running on port 3000
 Health check: http://localhost:3000/health
 API endpoints:
   - GET  /api/payments/:paymentId
   - GET  /api/merchants/:address/payments
   ...

 Contract: 0xDEF456...
 RPC: https://sepolia.infura.io/v3/...
```

Test the backend:
```bash
# In another terminal
curl http://localhost:3000/health
# Should return: {"status":"ok",...}

curl http://localhost:3000/api/status
# Should return indexer status
```

##  Step 9: Configure Frontend

```bash
cd ../frontend

# Edit merchant.js
nano merchant.js
```

Update CONFIG at the top:
```javascript
const CONFIG = {
    GATEWAY_ADDRESS: '0xDEF456...', // Your deployed PaymentGateway
    USDT_ADDRESS: '0xABC123...',    // Your deployed MockUSDT
    CHAIN_ID: 11155111,              // Sepolia
    RPC_URL: 'https://rpc.sepolia.org'
};
```

Do the same for `customer.js`:
```javascript
const CONFIG = {
    GATEWAY_ADDRESS: '0xDEF456...',
    USDT_ADDRESS: '0xABC123...',
    CHAIN_ID: 11155111,
    EXPLORER_URL: 'https://sepolia.etherscan.io'
};
```

##  Step 10: Start Frontend

```bash
# Still in frontend directory
python3 -m http.server 8080
```

Or use any web server:
```bash
npx serve .
```

##  Step 11: Test the System

### Test Merchant Flow:

1. **Open Merchant Dashboard**
   - Go to `http://localhost:8080/merchant.html`
   - Connect MetaMask (make sure you're on Sepolia)

2. **Register as Merchant**
   - Enter business name: "Test Shop"
   - Click "Register Merchant"
   - Confirm transaction in MetaMask
   - Wait for confirmation

3. **Create Payment Intent**
   - Payment ID: `test-payment-001`
   - Amount: `100` USDT
   - Expiry: `60` minutes
   - Click "Create Payment Intent"
   - Copy the payment link

### Test Customer Flow:

1. **Switch MetaMask Account**
   - Switch to a different account (customer)
   - Make sure you have some Sepolia ETH

2. **Get Test USDT**
   - Go to Sepolia Etherscan
   - Find MockUSDT contract: `0xABC123...`
   - Call `faucet` function with your address and amount
   - Or call from merchant account to mint USDT to customer

3. **Open Payment Link**
   - Open the payment link from step 3 of merchant flow
   - Click "Connect Wallet"
   - Verify payment details

4. **Approve Tokens**
   - Click "1. Approve Tokens"
   - Confirm transaction in MetaMask
   - Wait for confirmation

5. **Complete Payment**
   - Click "2. Complete Payment"
   - Confirm transaction in MetaMask
   - Wait for confirmation
   - See success message with transaction link

### Verify on Etherscan:

1. Click the transaction link
2. See the payment transaction on Sepolia Etherscan
3. Verify tokens were transferred

### Check Backend:

```bash
# Get payment status
curl "http://localhost:3000/api/payments/0x..." # Use actual payment ID

# Get merchant payments
curl "http://localhost:3000/api/merchants/0x.../payments"
```

##  Verification Checklist

- [ ] Contracts deployed to Sepolia
- [ ] Contracts verified on Etherscan
- [ ] Backend running and syncing blocks
- [ ] Frontend configured with correct addresses
- [ ] Merchant registration works
- [ ] Payment intent creation works
- [ ] Payment link generates correctly
- [ ] Customer can approve tokens
- [ ] Customer can complete payment
- [ ] Transaction appears on Etherscan
- [ ] Backend indexes the payment
- [ ] API returns correct payment status

##  Troubleshooting

### "Please switch to Sepolia testnet"
- Open MetaMask
- Click network dropdown
- Select "Sepolia test network"
- If not visible, enable "Show test networks" in Settings

### "Insufficient funds for gas"
- Get more Sepolia ETH from faucet
- Wait a few minutes and try again

### "Contract not found"
- Double-check contract addresses in frontend files
- Verify deployment was successful
- Check on Sepolia Etherscan

### Backend not syncing
- Check RPC_URL in backend/.env
- Check CONTRACT_ADDRESS matches deployed contract
- Check console for errors
- Verify network connectivity

### Deployment failed
- Check you have enough Sepolia ETH
- Verify RPC URL is correct
- Check private key is valid
- Try again with `npm run deploy:sepolia`

##  Next Steps

1. **Register Webhook** (optional)
```bash
curl -X POST http://localhost:3000/api/merchants/0xYourAddress/webhooks \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "https://yourdomain.com/webhook"}'
```

2. **Deploy Frontend** to Vercel/Netlify
3. **Deploy Backend** to a VPS or cloud service
4. **Setup Monitoring** with PM2 or similar
5. **Add Real USDT** support (for production)

##  Deployed URLs

**Sepolia Etherscan:**
- Network: https://sepolia.etherscan.io
- PaymentGateway: https://sepolia.etherscan.io/address/0xDEF456...
- MockUSDT: https://sepolia.etherscan.io/address/0xABC123...

**Local Development:**
- Backend API: http://localhost:3000
- Merchant Dashboard: http://localhost:8080/merchant.html
- Customer Payment: http://localhost:8080/customer.html

##  Need Help?

- Check [README.md](./README.md) for overview
- Check [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for system design
- Check [API.md](./docs/API.md) for API reference
- Check [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for production deployment

---

** Congratulations! Your Payment Gateway is now live on Sepolia!**

You can now accept crypto payments on the Ethereum testnet. For production, deploy to Ethereum mainnet and use real USDT/USDC.
