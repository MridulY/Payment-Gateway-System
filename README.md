# Blockchain Payment Gateway System

A production-ready blockchain-based payment gateway that enables merchants to accept crypto payments with reliable transaction verification, settlement tracking, and merchant integration capabilities.

##  Overview

This system provides a Web3 alternative to traditional payment gateways like Stripe or PayPal, allowing merchants to:
- Accept cryptocurrency payments (ERC-20 tokens)
- Create payment intents with expiry timestamps
- Track payment status in real-time
- Receive webhook notifications for payment events
- Query historical payment data via REST API

##  Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Deployment](#-deployment)
- [API Documentation](#-api-documentation)
- [Testing](#-testing)
- [Security](#-security)
- [License](#-license)

##  Features

### Smart Contract Features
-   Merchant registration and lifecycle management
-   Payment intent creation with unique IDs
-   Multi-token support (ERC-20)
-   Automatic payment expiry handling
-   Refund mechanism for completed payments
-   Platform fee collection (configurable)
-   Emergency pause mechanism
-   Gas-optimized design
-   Prevention of duplicate/replay payments

### Backend Features
-   Real-time event indexing from blockchain
-   REST API for payment queries
-   Webhook system with retry logic
-   Chain reorganization handling
-   Idempotent payment verification
-   SQLite database for fast queries
-   TypeScript for type safety

### Frontend Features
-   Merchant dashboard for payment management
-   Customer payment interface
-   MetaMask integration
-   Real-time payment status updates
-   Payment link generation
-   Mobile-responsive design

##  Architecture

```
                  
                                                                      
   Frontend        Smart Contract     Backend       
   (Web3)                   (Ethereum/                  (Indexer +    
                             Polygon)                    API)         
                  
                                                                 
                                                                 
                                                                 
                                                         
                                                            Database    
                                                            (SQLite)    
                                                         
                                                                 
                                                                 
                                                         
                                       Webhooks    
                                                             (Merchant)  
                                                          
```

### High-Level Flow
1. **Merchant** creates a payment intent on-chain
2. **Customer** approves tokens and executes payment
3. **Smart Contract** emits payment event and transfers funds
4. **Backend Indexer** catches the event and stores in database
5. **Webhook Service** notifies merchant of payment completion
6. **Merchant** can query payment status via API

##  Tech Stack

### Smart Contracts
- **Solidity** ^0.8.20
- **Hardhat** - Development environment
- **OpenZeppelin** - Secure contract libraries
- **Ethers.js** - Ethereum library

### Backend
- **Node.js** + **TypeScript**
- **Express.js** - REST API framework
- **Ethers.js** v6 - Blockchain interaction
- **Better-SQLite3** - Database
- **Axios** - HTTP client for webhooks

### Frontend
- **Vanilla JavaScript** + **HTML/CSS**
- **Ethers.js** v5 - Web3 integration
- **MetaMask** - Wallet connection

### Infrastructure
- **Ethereum Sepolia** - Testnet
- **Polygon Amoy** - L2 Testnet

##  Project Structure

```
BitFia-Assessment/
 contracts/              # Smart contracts
    PaymentGateway.sol # Main payment gateway contract
    MockUSDT.sol       # Test ERC-20 token
 scripts/               # Deployment scripts
    deploy.js          # Contract deployment script
 test/                  # Smart contract tests
    PaymentGateway.test.js
 frontend/              # Web interface
    merchant.html      # Merchant dashboard
    merchant.js        # Merchant logic
    customer.html      # Customer payment page
    customer.js        # Customer logic
 backend/               # Indexer and API service
    src/
       index.ts       # Main server entry
       indexer/       # Event indexing logic
       routes/        # API routes
       services/      # Business logic (webhooks)
       database/      # Database setup
       types/         # TypeScript types
    package.json
    tsconfig.json
 hardhat.config.js      # Hardhat configuration
 package.json           # Project dependencies
 README.md              # This file
```

##  Quick Start

### Prerequisites
- Node.js v18+ and npm
- MetaMask wallet
- Test ETH/MATIC for deployment

### 1. Clone and Install

```bash
git clone <repository-url>
cd BitFia-Assessment
npm install
cd backend && npm install && cd ..
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add:
# - Your private key
# - RPC URLs
# - API keys (optional, for verification)
```

### 3. Compile Contracts

```bash
npm run compile
```

### 4. Run Tests

```bash
npm test
```

### 5. Deploy Contracts

For local development:
```bash
# Terminal 1: Start local node
npx hardhat node

# Terminal 2: Deploy contracts
npm run deploy:local
```

For testnets:
```bash
# Deploy to Polygon Amoy
npm run deploy:amoy

# Deploy to Ethereum Sepolia
npm run deploy:sepolia
```

### 6. Start Backend Service

```bash
cd backend
cp .env.example .env

# Edit backend/.env with:
# - RPC_URL
# - CONTRACT_ADDRESS (from deployment)

npm run dev
```

The backend will:
- Initialize the database
- Start indexing blockchain events
- Start the API server on port 3000
- Start webhook retry worker

### 7. Start Frontend

```bash
cd frontend

# Update merchant.js and customer.js with:
# - GATEWAY_ADDRESS
# - USDT_ADDRESS

# Serve files (use any web server, e.g., Live Server in VS Code)
# Or use Python:
python3 -m http.server 8080
```

Access:
- Merchant Dashboard: `http://localhost:8080/merchant.html`
- Customer Payment: `http://localhost:8080/customer.html`

##  Deployment

### Smart Contract Deployment

1. **Configure Network**
```javascript
// hardhat.config.js already configured for:
// - Polygon Amoy (chainId: 80002)
// - Ethereum Sepolia (chainId: 11155111)
```

2. **Deploy**
```bash
npm run deploy:amoy    # or deploy:sepolia
```

3. **Verify on Explorer**
```bash
npx hardhat verify --network polygonAmoy <CONTRACT_ADDRESS> "<FEE_COLLECTOR_ADDRESS>"
```

### Backend Deployment

1. **Build TypeScript**
```bash
cd backend
npm run build
```

2. **Start Production Server**
```bash
npm start
```

Or use PM2:
```bash
npm install -g pm2
pm2 start dist/index.js --name payment-gateway
```

### Frontend Deployment

Deploy static files to:
- **Vercel** (recommended)
- **Netlify**
- **GitHub Pages**
- **AWS S3** + CloudFront

##  API Documentation

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### Get Payment Status
```http
GET /api/payments/:paymentId
```

Response:
```json
{
  "success": true,
  "data": {
    "paymentId": "0x...",
    "merchant": "0x...",
    "amount": "100000000",
    "status": 1,
    "payer": "0x...",
    "paidAt": 1234567890
  }
}
```

#### Get Merchant Payments
```http
GET /api/merchants/:address/payments?status=1&limit=50&offset=0
```

#### Get Merchant Stats
```http
GET /api/merchants/:address/stats
```

#### Register Webhook
```http
POST /api/merchants/:address/webhooks
Content-Type: application/json

{
  "webhookUrl": "https://yourdomain.com/webhooks"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "webhookUrl": "https://yourdomain.com/webhooks",
    "secret": "generated_secret_for_signature_verification",
    "message": "Webhook registered successfully"
  }
}
```

#### Verify Payment (Idempotent)
```http
POST /api/payments/:paymentId/verify
```

### Webhook Events

Merchants receive POST requests with these event types:
- `payment.created`
- `payment.completed`
- `payment.refunded`
- `payment.expired`
- `payment.cancelled`

Webhook Payload:
```json
{
  "id": 123,
  "event": "payment.completed",
  "timestamp": 1234567890,
  "data": {
    "paymentId": "0x...",
    "merchant": "0x...",
    "payer": "0x...",
    "amount": "100000000",
    "status": "completed"
  }
}
```

Headers:
```
X-Webhook-Signature: hmac_sha256_signature
X-Webhook-Timestamp: 1234567890
X-Webhook-Event: payment.completed
```

### Webhook Signature Verification

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

##  Testing

### Run Contract Tests
```bash
npm test
```

Test coverage includes:
- Merchant registration/lifecycle
- Payment intent creation
- Payment execution
- Refunds and cancellations
- Access control
- Edge cases and error handling

### Gas Reporting
```bash
REPORT_GAS=true npm test
```

##  Security

### Smart Contract Security
-   **ReentrancyGuard** on payment functions
-   **Pausable** for emergency stops
-   **Ownable** with clear ownership
-   **SafeERC20** for token transfers
-   Custom errors for gas efficiency
-   Input validation on all functions
-   Prevention of integer overflow (Solidity ^0.8.0)

### Backend Security
-   **Helmet.js** for HTTP security headers
-   **CORS** configuration
-   **HMAC signatures** for webhook verification
-   **Rate limiting** (recommended for production)
-   **Input validation** on all endpoints

### Recommended Audits
Before mainnet deployment:
1. Smart contract audit by reputable firm
2. Penetration testing of backend API
3. Frontend security review
4. Gas optimization review

##  Design Decisions & Trade-offs

### 1. Payment Verification
**Decision**: On-chain finality with MIN_CONFIRMATIONS = 1

**Trade-offs**:
-   Fast confirmation for better UX
-  Slight risk of chain reorganization
-  Solution: Backend tracks block numbers and handles reorgs

### 2. Double-Spending Prevention
**Decision**: Payment status stored on-chain, checked before execution

**Implementation**:
- Single payment per payment ID
- Status transitions are one-way (Pending → Completed)
- Reentrant protection via ReentrancyGuard

### 3. Gas Efficiency
**Optimizations**:
- Custom errors instead of require strings
- Minimal storage updates
- Efficient data structures
- Compiler optimization enabled (runs: 200)

### 4. Scalability
**Current**: ~50-100 TPS depending on network

**Future improvements**:
- Batch payment processing
- Layer 2 deployment (already supports Polygon)
- Payment channels for micro-transactions

##  Additional Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Detailed system architecture
- [API.md](./docs/API.md) - Complete API reference
- [DEPLOYMENT.md](./docs/DEPLOYMENT.md) - Production deployment guide
- [SECURITY.md](./docs/SECURITY.md) - Security best practices

##  Contributing

This is an assignment project. For production use, please:
1. Complete security audit
2. Add comprehensive monitoring
3. Implement rate limiting
4. Add analytics and metrics
5. Create admin dashboard

##  License

ISC

##  Author

Built as part of BitFia Assessment

##  Acknowledgments

- OpenZeppelin for secure contract libraries
- Hardhat for excellent development tools
- Ethers.js for blockchain interaction

---

**Note**: This system is designed for testnet use. Production deployment requires additional security audits, monitoring, and infrastructure setup.
