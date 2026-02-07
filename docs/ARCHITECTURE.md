# System Architecture

## Overview

The Payment Gateway System is built as a three-tier architecture:
1. **Smart Contract Layer** (On-chain)
2. **Backend Indexer & API Layer** (Off-chain)
3. **Frontend Layer** (Web3 Interface)

## 1. Smart Contract Layer

### PaymentGateway.sol

**Purpose**: Core payment processing logic on-chain

**Key Components**:

```solidity
struct Merchant {
    address merchantAddress;
    string businessName;
    bool isActive;
    uint256 registeredAt;
    uint256 totalPaymentsReceived;
}

struct PaymentIntent {
    bytes32 paymentId;
    address merchant;
    address tokenAddress;
    uint256 amount;
    uint256 expiryTimestamp;
    PaymentStatus status;
    uint256 createdAt;
    address payer;
    uint256 paidAt;
}

enum PaymentStatus {
    Pending,
    Completed,
    Expired,
    Refunded,
    Cancelled
}
```

**State Transitions**:
```
Pending 
                     
    executePayment()  markPaymentExpired()
                      or expiryTimestamp passes
                     
Completed          Expired
   
    refundPayment()
   
Refunded

Pending  Cancelled
       (cancelPaymentIntent)
```

**Security Features**:
- **ReentrancyGuard**: Prevents reentrancy attacks on payment execution
- **Pausable**: Emergency stop mechanism
- **Ownable**: Admin functions restricted to owner
- **SafeERC20**: Safe token transfers
- **Custom Errors**: Gas-efficient error handling

**Gas Optimization**:
- Using `bytes32` for payment IDs (cheaper than strings)
- Minimal storage updates
- Efficient mappings
- Compiler optimization enabled

### MockUSDT.sol

**Purpose**: Test ERC-20 token for development and testing

**Features**:
- Standard ERC-20 implementation
- 6 decimals (matching real USDT)
- Faucet function for easy testing
- Mint function for owner

## 2. Backend Layer

### Architecture Overview

```

                    Backend Service                       

                                                          
         
                                                 
    Event         Database      REST API  
    Indexer           (SQLite)                   
                                                 
         
                                                     
                                                     
                                                     
   
            Webhook Service (with Retry Logic)       
   
                                                      

                           
                           
                  
                    Merchant      
                    Webhook       
                    Endpoint      
                  
```

### Event Indexer

**Purpose**: Listen to blockchain events and index them in the database

**Process**:
1. Poll blockchain every 5 seconds (configurable)
2. Fetch new blocks since last indexed block
3. Parse event logs from PaymentGateway contract
4. Store events in database
5. Trigger webhooks for relevant events

**Event Types Indexed**:
- `MerchantRegistered`
- `MerchantDeactivated`
- `MerchantReactivated`
- `PaymentIntentCreated`
- `PaymentCompleted`
- `PaymentRefunded`
- `PaymentExpired`
- `PaymentCancelled`

**Chain Reorganization Handling**:
- Stores block numbers with each event
- Can detect and handle chain reorgs
- Maintains event logs for reorg recovery

**Code Structure**:
```typescript
class EventIndexer {
  private provider: JsonRpcProvider;
  private contract: Contract;

  async start() {
    // Start polling for events
  }

  private async syncEvents() {
    // Sync from last indexed block to current block
  }

  private async handleEvent(eventName, args, log) {
    // Process specific event type
  }
}
```

### Database Schema

**Database**: SQLite (for simplicity and portability)

**Tables**:

```sql
-- Merchants
CREATE TABLE merchants (
    address TEXT PRIMARY KEY,
    business_name TEXT NOT NULL,
    is_active INTEGER NOT NULL,
    registered_at INTEGER NOT NULL,
    total_payments_received TEXT NOT NULL
);

-- Payment Intents
CREATE TABLE payment_intents (
    payment_id TEXT PRIMARY KEY,
    merchant TEXT NOT NULL,
    token_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    expiry_timestamp INTEGER NOT NULL,
    status INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    payer TEXT,
    paid_at INTEGER,
    platform_fee TEXT,
    block_number INTEGER NOT NULL,
    transaction_hash TEXT NOT NULL,
    FOREIGN KEY (merchant) REFERENCES merchants(address)
);

-- Webhook Configurations
CREATE TABLE webhook_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant_address TEXT NOT NULL,
    webhook_url TEXT NOT NULL,
    secret TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (merchant_address) REFERENCES merchants(address)
);

-- Webhook Deliveries (for retry tracking)
CREATE TABLE webhook_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_config_id INTEGER NOT NULL,
    payment_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER,
    next_retry_at INTEGER,
    FOREIGN KEY (webhook_config_id) REFERENCES webhook_configs(id)
);

-- Indexer State
CREATE TABLE indexer_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_indexed_block INTEGER NOT NULL
);

-- Event Logs (for chain reorg handling)
CREATE TABLE event_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_number INTEGER NOT NULL,
    transaction_hash TEXT NOT NULL,
    event_name TEXT NOT NULL,
    args TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);
```

**Indexes**:
```sql
CREATE INDEX idx_payment_intents_merchant ON payment_intents(merchant);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
```

### REST API

**Framework**: Express.js with TypeScript

**Endpoints**:

#### Payment Endpoints
- `GET /api/payments/:paymentId` - Get payment by ID
- `GET /api/merchants/:address/payments` - Get merchant's payments
- `GET /api/merchants/:address/stats` - Get merchant statistics
- `POST /api/payments/:paymentId/verify` - Verify payment (idempotent)

#### Merchant Endpoints
- `GET /api/merchants/:address` - Get merchant details
- `GET /api/merchants` - List all merchants
- `POST /api/merchants/:address/webhooks` - Register webhook
- `GET /api/merchants/:address/webhooks` - List webhooks
- `DELETE /api/webhooks/:id` - Deactivate webhook
- `GET /api/webhooks/:id/deliveries` - Get webhook delivery history

#### System Endpoints
- `GET /api/status` - Get indexer status
- `GET /health` - Health check

### Webhook Service

**Purpose**: Deliver real-time notifications to merchants

**Features**:
- HMAC-SHA256 signature verification
- Automatic retry with exponential backoff
- Delivery tracking
- Failed delivery logging

**Retry Strategy**:
```
Attempt 1: Immediate
Attempt 2: +1 minute
Attempt 3: +5 minutes
Attempt 4: +15 minutes
Attempt 5: +1 hour
Attempt 6: +2 hours
(After 6 attempts, mark as failed)
```

**Webhook Payload**:
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

**Headers**:
```
X-Webhook-Signature: <hmac_sha256_hex>
X-Webhook-Timestamp: <unix_timestamp>
X-Webhook-Event: <event_type>
Content-Type: application/json
```

**Signature Generation**:
```typescript
function generateSignature(payload: any, secret: string): string {
  const payloadString = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}
```

**Merchant Verification**:
```javascript
// Merchant's webhook endpoint should verify signature
const crypto = require('crypto');

function verifyWebhook(req) {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;
  const secret = 'your_webhook_secret';

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

## 3. Frontend Layer

### Merchant Dashboard

**Purpose**: Interface for merchants to manage payments

**Features**:
- Merchant registration
- Payment intent creation
- Payment history viewing
- Statistics display
- Payment link generation

**Tech Stack**:
- Vanilla JavaScript
- Ethers.js v5
- MetaMask integration

**Flow**:
```
1. Connect MetaMask
2. Register as Merchant (if not registered)
3. Create Payment Intent
   - Enter payment ID
   - Set amount in USDT
   - Set expiry time
4. Generate Payment Link
5. Share link with customer
6. Monitor payments in dashboard
```

### Customer Payment Interface

**Purpose**: Interface for customers to complete payments

**Features**:
- Payment intent viewing
- Token approval
- Payment execution
- Transaction confirmation

**Flow**:
```
1. Open payment link
2. View payment details (merchant, amount, expiry)
3. Connect MetaMask
4. Approve USDT tokens
5. Execute payment
6. Receive confirmation + transaction link
```

### Web3 Integration

**Wallet Connection**:
```javascript
async function connectWallet() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}
```

**Contract Interaction**:
```javascript
const gateway = new ethers.Contract(
  GATEWAY_ADDRESS,
  GATEWAY_ABI,
  signer
);

// Create payment intent
await gateway.createPaymentIntent(
  paymentIdBytes32,
  tokenAddress,
  amount,
  expiryTimestamp
);

// Execute payment
await token.approve(gatewayAddress, amount);
await gateway.executePayment(paymentIdBytes32);
```

## 4. Payment Flow (End-to-End)

### Complete Payment Lifecycle

```

 1. MERCHANT CREATES PAYMENT INTENT                          

                         
                         
           
             Smart Contract         
             - Validates merchant   
             - Creates intent       
             - Emits event          
           
                         
                         

 2. BACKEND INDEXES EVENT                                    

                         
                         
           
             Event Indexer          
             - Catches event        
             - Stores in DB         
             - Triggers webhook     
           
                         
                         

 3. MERCHANT RECEIVES WEBHOOK                                
    Event: payment.created                                   

                         
                         

 4. MERCHANT SHARES PAYMENT LINK WITH CUSTOMER               

                         
                         

 5. CUSTOMER OPENS LINK AND APPROVES TOKENS                  

                         
                         
           
             ERC20 Token            
             - approve() called     
           
                         
                         

 6. CUSTOMER EXECUTES PAYMENT                                

                         
                         
           
             Smart Contract         
             - Validates payment    
             - Transfers tokens     
             - Updates status       
             - Emits event          
           
                         
                         

 7. BACKEND INDEXES PAYMENT COMPLETION                       

                         
                         
           
             Event Indexer          
             - Catches event        
             - Updates DB           
             - Triggers webhook     
           
                         
                         

 8. MERCHANT RECEIVES WEBHOOK                                
    Event: payment.completed                                 
    - Mark order as paid                                     
    - Fulfill order                                          

```

## 5. Security Considerations

### Smart Contract Security

**Reentrancy Protection**:
```solidity
function executePayment(bytes32 paymentId) external nonReentrant {
    // Safe from reentrancy attacks
}
```

**Access Control**:
```solidity
modifier onlyActiveMerchant() {
    require(merchants[msg.sender].isActive, "MerchantNotActive");
    _;
}

modifier onlyOwner() {
    require(msg.sender == owner, "OwnableUnauthorizedAccount");
    _;
}
```

**Integer Overflow Prevention**:
- Solidity ^0.8.0 has built-in overflow checks
- All arithmetic operations are safe

**Safe Token Transfers**:
```solidity
using SafeERC20 for IERC20;
token.safeTransferFrom(msg.sender, merchant, amount);
```

### Backend Security

**API Security**:
- Helmet.js for security headers
- CORS configuration
- Input validation
- Rate limiting (recommended)

**Webhook Security**:
- HMAC-SHA256 signatures
- Timestamp validation (prevent replay)
- HTTPS enforcement (production)

### Frontend Security

**Web3 Security**:
- Transaction simulation before signing
- Clear user prompts
- Amount validation
- MetaMask integration (no private key handling)

## 6. Scalability & Performance

### Current Limitations

**Throughput**: ~50-100 TPS (network dependent)
**Latency**:
- Transaction confirmation: 5-15 seconds
- Backend indexing: 5-10 seconds
- Webhook delivery: <1 second

### Scaling Strategies

**Horizontal Scaling**:
- Multiple backend instances with load balancer
- Distributed database (PostgreSQL cluster)
- Message queue for webhooks (RabbitMQ/Redis)

**Vertical Optimization**:
- Database indexing
- Query optimization
- Caching layer (Redis)
- CDN for frontend

**Layer 2 Solutions**:
- Already supports Polygon (lower fees, faster)
- Can deploy to Arbitrum, Optimism, Base
- ZK-rollups for future scaling

## 7. Monitoring & Observability

### Recommended Metrics

**Smart Contract**:
- Transaction success rate
- Gas costs per operation
- Failed transaction reasons

**Backend**:
- Indexer lag (blocks behind)
- API response times
- Webhook success rate
- Database query performance

**Suggested Tools**:
- **Monitoring**: Prometheus + Grafana
- **Logging**: Winston + ELK Stack
- **APM**: New Relic or Datadog
- **Blockchain Monitoring**: Tenderly

## 8. Future Enhancements

1. **GraphQL API** - More flexible querying
2. **Payment Batching** - Reduce gas costs
3. **Multi-chain Support** - Cross-chain payments
4. **Payment Streaming** - Continuous payments
5. **Subscription Payments** - Recurring charges
6. **Escrow System** - Dispute resolution
7. **Admin Dashboard** - Platform management
8. **Analytics Dashboard** - Business intelligence

---

This architecture is designed for production use with proper security, scalability, and reliability considerations.
