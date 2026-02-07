# Deployment Guide

This guide provides step-by-step instructions for deploying the Payment Gateway System to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Smart Contract Deployment](#smart-contract-deployment)
3. [Backend Deployment](#backend-deployment)
4. [Frontend Deployment](#frontend-deployment)
5. [Post-Deployment](#post-deployment)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Accounts & Services

1. **Ethereum/Polygon Wallet**
   - Private key with sufficient native tokens for gas
   - Sepolia ETH: https://sepoliafaucet.com
   - Polygon Amoy MATIC: https://faucet.polygon.technology

2. **RPC Provider** (choose one)
   - Alchemy: https://alchemy.com
   - Infura: https://infura.io
   - QuickNode: https://quicknode.com
   - Public RPCs (not recommended for production)

3. **Block Explorer API Keys** (optional, for verification)
   - Etherscan: https://etherscan.io/apis
   - Polygonscan: https://polygonscan.com/apis

4. **Server** (for backend)
   - VPS (DigitalOcean, AWS EC2, etc.)
   - Minimum: 1 vCPU, 1GB RAM
   - Recommended: 2 vCPU, 2GB RAM
   - OS: Ubuntu 22.04 LTS

5. **Domain Name** (optional)
   - For backend API
   - For frontend

## Smart Contract Deployment

### Step 1: Prepare Environment

```bash
# Clone repository
git clone <repository-url>
cd BitFia-Assessment

# Install dependencies
npm install
```

### Step 2: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env
nano .env
```

Add the following:
```env
# Your wallet private key (NEVER commit this!)
PRIVATE_KEY=0x...your_private_key_here

# RPC URLs (use your provider)
POLYGON_AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_API_KEY
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# API keys for contract verification
POLYGONSCAN_API_KEY=your_polygonscan_api_key
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### Step 3: Compile Contracts

```bash
npm run compile
```

Expected output:
```
Compiled 10 Solidity files successfully
```

### Step 4: Run Tests

```bash
npm test
```

Ensure all tests pass before deployment.

### Step 5: Deploy to Testnet

**For Polygon Amoy:**
```bash
npm run deploy:amoy
```

**For Ethereum Sepolia:**
```bash
npm run deploy:sepolia
```

**Example output:**
```
 Starting deployment...

Deploying contracts with account: 0x123...
Account balance: 1.5 ETH

 Deploying MockUSDT...
  MockUSDT deployed to: 0xABC...

 Deploying PaymentGateway...
  PaymentGateway deployed to: 0xDEF...

  Configuring PaymentGateway...
  USDT token support enabled

============================================================
 DEPLOYMENT SUMMARY
============================================================
Network: polygonAmoy
Deployer: 0x123...
MockUSDT: 0xABC...
PaymentGateway: 0xDEF...
Fee Collector: 0x123...
Platform Fee: 25 basis points (0.25%)
============================================================

 Deployment info saved to: deployments/polygonAmoy-1234567890.json
```

**Save these addresses! You'll need them for the backend and frontend.**

### Step 6: Verify Contracts

```bash
# Verify MockUSDT
npx hardhat verify --network polygonAmoy 0xABC...

# Verify PaymentGateway
npx hardhat verify --network polygonAmoy 0xDEF... "0x123..."
```

**Verification success:**
```
Successfully verified contract PaymentGateway on Polygonscan
https://amoy.polygonscan.com/address/0xDEF...#code
```

## Backend Deployment

### Step 1: Prepare Server

```bash
# SSH into your server
ssh user@your-server-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install build essentials (for better-sqlite3)
sudo apt install -y build-essential

# Verify installation
node --version  # Should be v18+
npm --version
```

### Step 2: Clone and Setup

```bash
# Clone repository
git clone <repository-url>
cd BitFia-Assessment/backend

# Install dependencies
npm install

# Create data directory
mkdir -p data
```

### Step 3: Configure Environment

```bash
# Create .env file
cp .env.example .env
nano .env
```

Add the following:
```env
# Server configuration
PORT=3000
NODE_ENV=production

# Blockchain configuration (use deployed contract address)
RPC_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_API_KEY
CONTRACT_ADDRESS=0xDEF...your_deployed_contract

# Chain ID
CHAIN_ID=80002

# Indexer configuration
POLL_INTERVAL=5000
START_BLOCK=0
```

### Step 4: Build TypeScript

```bash
npm run build
```

Expected output:
```
Compiled successfully!
```

### Step 5: Test Backend

```bash
# Start in development mode first
npm run start:dev
```

Check logs:
```
 Starting Payment Gateway Backend...
  Initializing database...
  Database initialized successfully
 Webhook retry worker started
 Starting event indexer...
  Indexer started (polling every 5000ms)
  Server running on port 3000
```

Test the API:
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"...","service":"Payment Gateway Backend"}
```

### Step 6: Setup PM2 (Process Manager)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the backend with PM2
pm2 start dist/index.js --name payment-gateway

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions printed
```

**PM2 Commands:**
```bash
pm2 status              # Check status
pm2 logs payment-gateway # View logs
pm2 restart payment-gateway # Restart
pm2 stop payment-gateway    # Stop
pm2 delete payment-gateway  # Remove
```

### Step 7: Setup Nginx (Reverse Proxy)

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/payment-gateway
```

Add the following configuration:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;  # Replace with your domain

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:
```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/payment-gateway /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Step 8: Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d api.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

Your API is now accessible at `https://api.yourdomain.com`

### Step 9: Setup Firewall

```bash
# Allow SSH
sudo ufw allow OpenSSH

# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

## Frontend Deployment

### Option 1: Vercel (Recommended)

1. **Prepare Repository**
```bash
# Ensure frontend files are in repository
git add frontend/
git commit -m "Add frontend files"
git push origin main
```

2. **Deploy to Vercel**
   - Go to https://vercel.com
   - Click "Import Project"
   - Select your repository
   - Set root directory to `frontend`
   - Click "Deploy"

3. **Configure Environment**
   - In Vercel dashboard, go to Settings > Environment Variables
   - Add:
     ```
     GATEWAY_ADDRESS=0xDEF...
     USDT_ADDRESS=0xABC...
     ```

4. **Update Frontend Config**
   - Edit `merchant.js` and `customer.js`
   - Update `CONFIG` object with deployed addresses

### Option 2: Netlify

1. **Install Netlify CLI**
```bash
npm install -g netlify-cli
```

2. **Deploy**
```bash
cd frontend
netlify deploy --prod
```

Follow the prompts to link your site.

### Option 3: Static Hosting (AWS S3, GitHub Pages, etc.)

1. **Update Configuration**
```bash
cd frontend
# Edit merchant.js and customer.js with contract addresses
```

2. **Upload Files**
   - Upload all files in `frontend/` directory
   - Ensure CORS is configured if using S3
   - Set up CloudFront for HTTPS (AWS)

## Post-Deployment

### 1. Verify Smart Contract

Check contract on block explorer:
- **Polygon Amoy**: https://amoy.polygonscan.com/address/YOUR_CONTRACT
- **Sepolia**: https://sepolia.etherscan.io/address/YOUR_CONTRACT

### 2. Test Backend API

```bash
# Health check
curl https://api.yourdomain.com/health

# Get status
curl https://api.yourdomain.com/api/status

# Should return indexer status and statistics
```

### 3. Test Frontend

1. Open `https://yourdomain.com/merchant.html`
2. Connect MetaMask
3. Register as merchant
4. Create a test payment intent
5. Open customer payment link
6. Complete payment

### 4. Setup Monitoring

**PM2 Monitoring:**
```bash
pm2 install pm2-logrotate  # Log rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

**Basic Health Check Script:**
```bash
#!/bin/bash
# health-check.sh

BACKEND_URL="https://api.yourdomain.com/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $BACKEND_URL)

if [ $RESPONSE -ne 200 ]; then
    echo "Backend is down! Response code: $RESPONSE"
    # Send alert (email, Slack, etc.)
    pm2 restart payment-gateway
fi
```

Add to crontab:
```bash
# Run every 5 minutes
*/5 * * * * /path/to/health-check.sh
```

### 5. Setup Backups

**Database Backup Script:**
```bash
#!/bin/bash
# backup-db.sh

BACKUP_DIR="/home/user/backups"
DB_PATH="/home/user/BitFia-Assessment/backend/data/payment-gateway.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp $DB_PATH "$BACKUP_DIR/payment-gateway-$TIMESTAMP.db"

# Keep only last 7 days of backups
find $BACKUP_DIR -name "payment-gateway-*.db" -mtime +7 -delete
```

Add to crontab:
```bash
# Run daily at 2 AM
0 2 * * * /path/to/backup-db.sh
```

## Monitoring

### Recommended Monitoring Tools

1. **Uptime Monitoring**
   - UptimeRobot (free tier)
   - Pingdom
   - StatusCake

2. **Application Monitoring**
   - PM2 Plus (paid)
   - New Relic
   - Datadog

3. **Log Management**
   - Papertrail
   - Loggly
   - ELK Stack

### Key Metrics to Monitor

- **Backend Health**: `/health` endpoint uptime
- **Indexer Lag**: Blocks behind current block
- **API Response Time**: Average response time
- **Webhook Success Rate**: % of successful deliveries
- **Database Size**: Monitor disk usage
- **Error Rate**: Track 5xx errors

## Troubleshooting

### Backend Won't Start

**Check logs:**
```bash
pm2 logs payment-gateway
```

**Common issues:**

1. **Port already in use**
```bash
# Find process using port 3000
lsof -i :3000
# Kill the process
kill -9 <PID>
```

2. **Database locked**
```bash
# Remove lock file
rm backend/data/payment-gateway.db-shm
rm backend/data/payment-gateway.db-wal
```

3. **Permissions error**
```bash
# Fix permissions
chmod 755 backend/data/
chmod 644 backend/data/*.db
```

### Indexer Not Syncing

**Check:**
1. RPC URL is correct and accessible
2. Contract address is correct
3. Network connection is stable

**Reset indexer:**
```bash
# Stop backend
pm2 stop payment-gateway

# Reset indexer state
sqlite3 backend/data/payment-gateway.db "DELETE FROM indexer_state;"

# Restart backend
pm2 start payment-gateway
```

### Frontend Not Connecting

**Check:**
1. Contract addresses in `merchant.js` and `customer.js`
2. MetaMask is on the correct network
3. Browser console for errors

**Common issues:**

1. **Wrong network**
   - Switch MetaMask to Polygon Amoy or Sepolia

2. **Contract address mismatch**
   - Verify addresses match deployed contracts

### Webhooks Not Delivering

**Check:**
1. Webhook URL is accessible (test with curl)
2. Webhook endpoint returns 200 status code
3. Check webhook deliveries table for errors

```bash
# Query failed deliveries
sqlite3 backend/data/payment-gateway.db "SELECT * FROM webhook_deliveries WHERE status = 'failed' LIMIT 10;"
```

## Security Checklist

- [ ] Private keys are not committed to repository
- [ ] Environment files are in `.gitignore`
- [ ] Firewall is configured
- [ ] SSL/HTTPS is enabled
- [ ] CORS is properly configured
- [ ] Rate limiting is implemented
- [ ] Database backups are automated
- [ ] Monitoring is setup
- [ ] PM2 is configured to restart on crash
- [ ] Server auto-updates are enabled

## Production Readiness Checklist

- [ ] Smart contracts are audited
- [ ] Smart contracts are verified on block explorer
- [ ] Backend is deployed with PM2
- [ ] Nginx reverse proxy is configured
- [ ] SSL certificate is installed
- [ ] Database backups are automated
- [ ] Monitoring is setup
- [ ] Health checks are running
- [ ] Frontend is deployed to CDN
- [ ] Webhook signatures are verified
- [ ] Rate limiting is enabled
- [ ] Error tracking is configured
- [ ] Documentation is updated

## Scaling Considerations

### When to Scale

- API response time > 1 second
- Indexer lag > 100 blocks
- Webhook delivery success rate < 95%
- Database queries > 100ms

### Horizontal Scaling

1. **Multiple Backend Instances**
   - Use load balancer (Nginx, HAProxy, AWS ALB)
   - Share database (PostgreSQL cluster)
   - Use Redis for indexer coordination

2. **Database Scaling**
   - Migrate from SQLite to PostgreSQL
   - Setup read replicas
   - Implement connection pooling

3. **Caching Layer**
   - Add Redis for frequently accessed data
   - Cache payment status queries
   - Cache merchant statistics

### Vertical Scaling

- Upgrade server resources (CPU, RAM, disk)
- Optimize database indexes
- Implement query caching

---

**Need Help?**
- Check logs: `pm2 logs payment-gateway`
- Test API: `curl https://api.yourdomain.com/api/status`
- Verify contract: Check block explorer
- Join community: [Link to Discord/Telegram]

**Support:** support@yourdomain.com
