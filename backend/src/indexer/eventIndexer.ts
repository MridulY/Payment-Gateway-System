import { ethers } from 'ethers';
import { db, getLastIndexedBlock, updateLastIndexedBlock } from '../database/db.js';
import { PaymentStatus } from '../types/types.js';
import { triggerWebhook } from '../services/webhookService.js';

const PAYMENT_GATEWAY_ABI = [
  'event MerchantRegistered(address indexed merchant, string businessName, uint256 timestamp)',
  'event MerchantDeactivated(address indexed merchant, uint256 timestamp)',
  'event MerchantReactivated(address indexed merchant, uint256 timestamp)',
  'event PaymentIntentCreated(bytes32 indexed paymentId, address indexed merchant, address tokenAddress, uint256 amount, uint256 expiryTimestamp)',
  'event PaymentCompleted(bytes32 indexed paymentId, address indexed payer, address indexed merchant, uint256 amount, uint256 platformFee, uint256 timestamp)',
  'event PaymentRefunded(bytes32 indexed paymentId, address indexed merchant, address indexed payer, uint256 amount, uint256 timestamp)',
  'event PaymentExpired(bytes32 indexed paymentId, uint256 timestamp)',
  'event PaymentCancelled(bytes32 indexed paymentId, address indexed merchant, uint256 timestamp)',
];

export class EventIndexer {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private isRunning: boolean = false;
  private pollInterval: number;
  private startBlock: number;

  constructor(rpcUrl: string, contractAddress: string, pollInterval: number = 5000, startBlock: number = 0) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(contractAddress, PAYMENT_GATEWAY_ABI, this.provider);
    this.pollInterval = pollInterval;
    this.startBlock = startBlock;
  }

  async start() {
    if (this.isRunning) {
      console.log('WARNING: Indexer is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting event indexer...');

    // Initial sync
    await this.syncEvents();

    // Start polling for new events
    setInterval(async () => {
      if (this.isRunning) {
        await this.syncEvents();
      }
    }, this.pollInterval);

    console.log(`  Indexer started (polling every ${this.pollInterval}ms)`);
  }

  async stop() {
    this.isRunning = false;
    console.log('Indexer stopped');
  }

  private async syncEvents() {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const lastIndexedBlock = getLastIndexedBlock();

      // Use configured startBlock if this is the first sync, otherwise continue from last indexed block
      let startBlock: number;
      if (lastIndexedBlock === 0) {
        // First sync - use configured start block or look back 1000 blocks
        startBlock = this.startBlock > 0 ? this.startBlock : currentBlock - 1000;
      } else {
        // Continue from last indexed block
        startBlock = lastIndexedBlock + 1;
      }

      if (startBlock > currentBlock) {
        return; // No new blocks to process
      }

      console.log(`Syncing blocks ${startBlock} to ${currentBlock}...`);

      // Fetch events in batches to avoid rate limits
      const batchSize = 1000;
      for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += batchSize) {
        const toBlock = Math.min(fromBlock + batchSize - 1, currentBlock);
        await this.processBlockRange(fromBlock, toBlock);
      }

      updateLastIndexedBlock(currentBlock);
      console.log(`  Synced up to block ${currentBlock}`);
    } catch (error) {
      console.error('Error syncing events:', error);
    }
  }

  private async processBlockRange(fromBlock: number, toBlock: number) {
    const filter = {
      address: await this.contract.getAddress(),
      fromBlock,
      toBlock,
    };

    const logs = await this.provider.getLogs(filter);

    for (const log of logs) {
      try {
        const parsedLog = this.contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (parsedLog) {
          await this.handleEvent(parsedLog.name, parsedLog.args, log);
        }
      } catch (error) {
        console.error('Error parsing log:', error);
      }
    }
  }

  private async handleEvent(eventName: string, args: any, log: ethers.Log) {
    const block = await this.provider.getBlock(log.blockNumber);
    const timestamp = block?.timestamp || Math.floor(Date.now() / 1000);

    // Store event log for chain reorg handling
    this.storeEventLog(log.blockNumber, log.transactionHash, eventName, args, timestamp);

    switch (eventName) {
      case 'MerchantRegistered':
        await this.handleMerchantRegistered(args, log.blockNumber, log.transactionHash);
        break;
      case 'MerchantDeactivated':
        await this.handleMerchantDeactivated(args);
        break;
      case 'MerchantReactivated':
        await this.handleMerchantReactivated(args);
        break;
      case 'PaymentIntentCreated':
        await this.handlePaymentIntentCreated(args, log.blockNumber, log.transactionHash, timestamp);
        break;
      case 'PaymentCompleted':
        await this.handlePaymentCompleted(args, timestamp);
        break;
      case 'PaymentRefunded':
        await this.handlePaymentRefunded(args);
        break;
      case 'PaymentExpired':
        await this.handlePaymentExpired(args);
        break;
      case 'PaymentCancelled':
        await this.handlePaymentCancelled(args);
        break;
    }
  }

  private storeEventLog(blockNumber: number, txHash: string, eventName: string, args: any, timestamp: number) {
    const stmt = db.prepare(`
      INSERT INTO event_logs (block_number, transaction_hash, event_name, args, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    // Convert BigInt values to strings for JSON serialization
    const argsString = JSON.stringify(args, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    stmt.run(blockNumber, txHash, eventName, argsString, timestamp);
  }

  private async handleMerchantRegistered(args: any, blockNumber: number, txHash: string) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO merchants (address, business_name, is_active, registered_at, total_payments_received)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(args.merchant, args.businessName, 1, Number(args.timestamp), '0');
    console.log(`Merchant registered: ${args.merchant}`);
  }

  private async handleMerchantDeactivated(args: any) {
    const stmt = db.prepare('UPDATE merchants SET is_active = 0 WHERE address = ?');
    stmt.run(args.merchant);
    console.log(`Merchant deactivated: ${args.merchant}`);
  }

  private async handleMerchantReactivated(args: any) {
    const stmt = db.prepare('UPDATE merchants SET is_active = 1 WHERE address = ?');
    stmt.run(args.merchant);
    console.log(`Merchant reactivated: ${args.merchant}`);
  }

  private async handlePaymentIntentCreated(args: any, blockNumber: number, txHash: string, timestamp: number) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO payment_intents
      (payment_id, merchant, token_address, amount, expiry_timestamp, status, created_at, block_number, transaction_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      args.paymentId,
      args.merchant,
      args.tokenAddress,
      args.amount.toString(),
      Number(args.expiryTimestamp),
      PaymentStatus.Pending,
      timestamp,
      blockNumber,
      txHash
    );
    console.log(`Payment intent created: ${args.paymentId}`);

    // Trigger webhook
    await triggerWebhook(args.merchant, args.paymentId, 'payment.created', {
      paymentId: args.paymentId,
      merchant: args.merchant,
      amount: args.amount.toString(),
      tokenAddress: args.tokenAddress,
      expiryTimestamp: Number(args.expiryTimestamp),
      status: 'pending',
    });
  }

  private async handlePaymentCompleted(args: any, timestamp: number) {
    const stmt = db.prepare(`
      UPDATE payment_intents
      SET status = ?, payer = ?, paid_at = ?, platform_fee = ?
      WHERE payment_id = ?
    `);
    stmt.run(
      PaymentStatus.Completed,
      args.payer,
      Number(args.timestamp),
      args.platformFee.toString(),
      args.paymentId
    );

    // Update merchant total
    const updateMerchant = db.prepare(`
      UPDATE merchants
      SET total_payments_received = CAST(total_payments_received AS INTEGER) + ?
      WHERE address = ?
    `);
    updateMerchant.run(args.amount.toString(), args.merchant);

    console.log(`  Payment completed: ${args.paymentId}`);

    // Trigger webhook
    await triggerWebhook(args.merchant, args.paymentId, 'payment.completed', {
      paymentId: args.paymentId,
      merchant: args.merchant,
      payer: args.payer,
      amount: args.amount.toString(),
      platformFee: args.platformFee.toString(),
      status: 'completed',
      timestamp: Number(args.timestamp),
    });
  }

  private async handlePaymentRefunded(args: any) {
    const stmt = db.prepare('UPDATE payment_intents SET status = ? WHERE payment_id = ?');
    stmt.run(PaymentStatus.Refunded, args.paymentId);
    console.log(`Payment refunded: ${args.paymentId}`);

    // Trigger webhook
    const payment = db.prepare('SELECT merchant FROM payment_intents WHERE payment_id = ?').get(args.paymentId) as { merchant: string } | undefined;
    if (payment) {
      await triggerWebhook(payment.merchant, args.paymentId, 'payment.refunded', {
        paymentId: args.paymentId,
        amount: args.amount.toString(),
        status: 'refunded',
      });
    }
  }

  private async handlePaymentExpired(args: any) {
    const stmt = db.prepare('UPDATE payment_intents SET status = ? WHERE payment_id = ?');
    stmt.run(PaymentStatus.Expired, args.paymentId);
    console.log(`Payment expired: ${args.paymentId}`);

    // Trigger webhook
    const payment = db.prepare('SELECT merchant FROM payment_intents WHERE payment_id = ?').get(args.paymentId) as { merchant: string } | undefined;
    if (payment) {
      await triggerWebhook(payment.merchant, args.paymentId, 'payment.expired', {
        paymentId: args.paymentId,
        status: 'expired',
      });
    }
  }

  private async handlePaymentCancelled(args: any) {
    const stmt = db.prepare('UPDATE payment_intents SET status = ? WHERE payment_id = ?');
    stmt.run(PaymentStatus.Cancelled, args.paymentId);
    console.log(`Payment cancelled: ${args.paymentId}`);

    // Trigger webhook
    await triggerWebhook(args.merchant, args.paymentId, 'payment.cancelled', {
      paymentId: args.paymentId,
      status: 'cancelled',
    });
  }
}
