import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Created data directory');
}

const dbPath = path.join(dataDir, 'payment-gateway.db');
export const db: Database.Database = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

export function initializeDatabase() {
  console.log('Initializing database...');

  // Merchants table
  db.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      address TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      registered_at INTEGER NOT NULL,
      total_payments_received TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Payment intents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_intents (
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
      indexed_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (merchant) REFERENCES merchants(address)
    )
  `);

  // Webhook configurations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_address TEXT NOT NULL,
      webhook_url TEXT NOT NULL,
      secret TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (merchant_address) REFERENCES merchants(address)
    )
  `);

  // Webhook deliveries table
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_config_id INTEGER NOT NULL,
      payment_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at INTEGER,
      next_retry_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (webhook_config_id) REFERENCES webhook_configs(id),
      FOREIGN KEY (payment_id) REFERENCES payment_intents(payment_id)
    )
  `);

  // Indexer state table (to track last indexed block)
  db.exec(`
    CREATE TABLE IF NOT EXISTS indexer_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_indexed_block INTEGER NOT NULL,
      last_indexed_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Event logs table (for chain reorganization handling)
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_number INTEGER NOT NULL,
      transaction_hash TEXT NOT NULL,
      event_name TEXT NOT NULL,
      args TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      indexed_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create indexes for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_payment_intents_merchant ON payment_intents(merchant);
    CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status);
    CREATE INDEX IF NOT EXISTS idx_payment_intents_block ON payment_intents(block_number);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at);
    CREATE INDEX IF NOT EXISTS idx_event_logs_block ON event_logs(block_number);
  `);

  console.log('  Database initialized successfully');
}

export function getLastIndexedBlock(): number {
  const row = db.prepare('SELECT last_indexed_block FROM indexer_state WHERE id = 1').get() as { last_indexed_block: number } | undefined;
  return row?.last_indexed_block || 0;
}

export function updateLastIndexedBlock(blockNumber: number) {
  db.prepare(`
    INSERT INTO indexer_state (id, last_indexed_block)
    VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET
      last_indexed_block = excluded.last_indexed_block,
      last_indexed_at = strftime('%s', 'now')
  `).run(blockNumber);
}

export function closeDatabase() {
  db.close();
}
