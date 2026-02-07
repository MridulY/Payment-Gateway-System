import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabase } from './database/db.js';
import { EventIndexer } from './indexer/eventIndexer.js';
import { startWebhookRetryWorker } from './services/webhookService.js';
import paymentRoutes from './routes/paymentRoutes.js';
import merchantRoutes from './routes/merchantRoutes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Payment Gateway Backend',
  });
});

// API Routes
app.use('/api', paymentRoutes);
app.use('/api', merchantRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize application
async function start() {
  try {
    console.log('Starting Payment Gateway Backend...\n');

    // Initialize database
    initializeDatabase();

    // Start webhook retry worker
    startWebhookRetryWorker();

    // Start event indexer
    const rpcUrl = process.env.RPC_URL;
    const contractAddress = process.env.CONTRACT_ADDRESS;
    const startBlock = parseInt(process.env.START_BLOCK || '0', 10);

    if (!rpcUrl || !contractAddress) {
      throw new Error('RPC_URL and CONTRACT_ADDRESS must be set in environment variables');
    }

    const indexer = new EventIndexer(rpcUrl, contractAddress, 5000, startBlock);
    await indexer.start();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\nServer running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`API endpoints:`);
      console.log(`   - GET  /api/payments/:paymentId`);
      console.log(`   - GET  /api/merchants/:address/payments`);
      console.log(`   - GET  /api/merchants/:address/stats`);
      console.log(`   - GET  /api/merchants/:address`);
      console.log(`   - POST /api/merchants/:address/webhooks`);
      console.log(`   - GET  /api/merchants/:address/webhooks`);
      console.log(`   - GET  /api/status`);
      console.log(`\nContract: ${contractAddress}`);
      console.log(`RPC: ${rpcUrl}\n`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n Shutting down gracefully...');
      await indexer.stop();
      closeDatabase();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

start();
