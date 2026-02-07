import axios from 'axios';
import crypto from 'crypto';
import { db } from '../database/db.js';
import type { WebhookConfig, WebhookDelivery } from '../types/types.js';

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAYS = [60, 300, 900, 3600, 7200]; // seconds: 1min, 5min, 15min, 1hr, 2hr

export async function triggerWebhook(
  merchantAddress: string,
  paymentId: string,
  eventType: string,
  payload: any
) {
  const webhooks = db
    .prepare('SELECT * FROM webhook_configs WHERE merchant_address = ? AND is_active = 1')
    .all(merchantAddress) as WebhookConfig[];

  for (const webhook of webhooks) {
    const deliveryId = createWebhookDelivery(webhook.id, paymentId, eventType, payload);
    await sendWebhook(deliveryId);
  }
}

function createWebhookDelivery(
  webhookConfigId: number,
  paymentId: string,
  eventType: string,
  payload: any
): number {
  const stmt = db.prepare(`
    INSERT INTO webhook_deliveries (webhook_config_id, payment_id, event_type, payload, status)
    VALUES (?, ?, ?, ?, 'pending')
  `);
  const result = stmt.run(webhookConfigId, paymentId, eventType, JSON.stringify(payload));
  return result.lastInsertRowid as number;
}

async function sendWebhook(deliveryId: number) {
  const delivery = db
    .prepare(
      `
      SELECT wd.*, wc.webhook_url, wc.secret, wc.merchant_address
      FROM webhook_deliveries wd
      JOIN webhook_configs wc ON wd.webhook_config_id = wc.id
      WHERE wd.id = ?
    `
    )
    .get(deliveryId) as (WebhookDelivery & { webhook_url: string; secret: string; merchant_address: string }) | undefined;

  if (!delivery) {
    console.error(`Webhook delivery ${deliveryId} not found`);
    return;
  }

  try {
    const payload = JSON.parse(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000);

    // Create webhook payload (accessing snake_case column names from DB)
    const deliveryRecord = delivery as any;
    const webhookPayload = {
      id: delivery.id,
      event: deliveryRecord.event_type,
      timestamp,
      data: payload,
    };

    // Generate signature
    const signature = generateSignature(webhookPayload, delivery.secret);

    // Send webhook
    const response = await axios.post(delivery.webhook_url, webhookPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': timestamp.toString(),
        'X-Webhook-Event': deliveryRecord.event_type,
      },
      timeout: 10000,
    });

    if (response.status >= 200 && response.status < 300) {
      // Success
      db.prepare(`
        UPDATE webhook_deliveries
        SET status = 'success', attempts = attempts + 1, last_attempt_at = strftime('%s', 'now')
        WHERE id = ?
      `).run(deliveryId);

      console.log(`  Webhook delivered: ${deliveryRecord.event_type} to ${delivery.merchant_address}`);
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error: any) {
    console.error(`Webhook delivery failed (attempt ${delivery.attempts + 1}):`, error.message);

    const attempts = delivery.attempts + 1;
    const now = Math.floor(Date.now() / 1000);

    if (attempts >= MAX_RETRY_ATTEMPTS) {
      // Max retries reached
      db.prepare(`
        UPDATE webhook_deliveries
        SET status = 'failed', attempts = ?, last_attempt_at = ?
        WHERE id = ?
      `).run(attempts, now, deliveryId);
    } else {
      // Schedule retry
      const nextRetryDelay = RETRY_DELAYS[attempts - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      const nextRetryAt = now + nextRetryDelay;

      db.prepare(`
        UPDATE webhook_deliveries
        SET attempts = ?, last_attempt_at = ?, next_retry_at = ?
        WHERE id = ?
      `).run(attempts, now, nextRetryAt, deliveryId);

      console.log(`Webhook retry scheduled in ${nextRetryDelay}s`);
    }
  }
}

export function generateSignature(payload: any, secret: string): string {
  const payloadString = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
}

export function verifySignature(payload: any, signature: string, secret: string): boolean {
  const expectedSignature = generateSignature(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

export function startWebhookRetryWorker() {
  setInterval(async () => {
    const now = Math.floor(Date.now() / 1000);

    const pendingRetries = db
      .prepare(
        `
        SELECT id FROM webhook_deliveries
        WHERE status = 'pending'
          AND next_retry_at IS NOT NULL
          AND next_retry_at <= ?
          AND attempts < ?
      `
      )
      .all(now, MAX_RETRY_ATTEMPTS) as { id: number }[];

    for (const retry of pendingRetries) {
      await sendWebhook(retry.id);
    }
  }, 30000); // Check every 30 seconds

  console.log('Webhook retry worker started');
}

export function registerWebhook(merchantAddress: string, webhookUrl: string): string {
  // Generate a secret for signature verification
  const secret = crypto.randomBytes(32).toString('hex');

  const stmt = db.prepare(`
    INSERT INTO webhook_configs (merchant_address, webhook_url, secret, is_active)
    VALUES (?, ?, ?, 1)
  `);
  stmt.run(merchantAddress, webhookUrl, secret);

  return secret;
}

export function getWebhooksByMerchant(merchantAddress: string): WebhookConfig[] {
  return db
    .prepare('SELECT * FROM webhook_configs WHERE merchant_address = ?')
    .all(merchantAddress) as WebhookConfig[];
}

export function deactivateWebhook(webhookId: number) {
  db.prepare('UPDATE webhook_configs SET is_active = 0 WHERE id = ?').run(webhookId);
}

export function getWebhookDeliveries(webhookConfigId: number, limit: number = 50): WebhookDelivery[] {
  return db
    .prepare(
      `
      SELECT * FROM webhook_deliveries
      WHERE webhook_config_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(webhookConfigId, limit) as WebhookDelivery[];
}
