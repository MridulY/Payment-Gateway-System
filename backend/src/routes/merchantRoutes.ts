import express from 'express';
import { db } from '../database/db.js';
import {
  registerWebhook,
  getWebhooksByMerchant,
  deactivateWebhook,
  getWebhookDeliveries,
} from '../services/webhookService.js';
import type { Merchant } from '../types/types.js';

const router = express.Router();

// Get merchant by address
router.get('/merchants/:address', (req, res) => {
  try {
    const { address } = req.params;

    const merchant = db
      .prepare('SELECT * FROM merchants WHERE address = ?')
      .get(address) as Merchant | undefined;

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    res.json({
      success: true,
      data: merchant,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all merchants
router.get('/merchants', (req, res) => {
  try {
    const { isActive, limit = '50', offset = '0' } = req.query;

    let query = 'SELECT * FROM merchants WHERE 1=1';
    const params: any[] = [];

    if (isActive !== undefined) {
      query += ' AND is_active = ?';
      params.push(isActive === 'true' ? 1 : 0);
    }

    query += ' ORDER BY registered_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const merchants = db.prepare(query).all(...params) as Merchant[];

    res.json({
      success: true,
      data: merchants,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Register webhook
router.post('/merchants/:address/webhooks', (req, res) => {
  try {
    const { address } = req.params;
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrl is required' });
    }

    // Validate URL format
    try {
      new URL(webhookUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid webhook URL format' });
    }

    // Check if merchant exists
    const merchant = db
      .prepare('SELECT * FROM merchants WHERE address = ?')
      .get(address) as Merchant | undefined;

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const secret = registerWebhook(address, webhookUrl);

    res.json({
      success: true,
      data: {
        webhookUrl,
        secret,
        message: 'Webhook registered successfully. Keep the secret safe for signature verification.',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get merchant webhooks
router.get('/merchants/:address/webhooks', (req, res) => {
  try {
    const { address } = req.params;

    const webhooks = getWebhooksByMerchant(address);

    // Don't expose the secret in the response
    const sanitizedWebhooks = webhooks.map((webhook) => ({
      id: webhook.id,
      webhookUrl: webhook.webhookUrl,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    }));

    res.json({
      success: true,
      data: sanitizedWebhooks,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Deactivate webhook
router.delete('/webhooks/:webhookId', (req, res) => {
  try {
    const { webhookId } = req.params;

    deactivateWebhook(Number(webhookId));

    res.json({
      success: true,
      message: 'Webhook deactivated successfully',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get webhook deliveries
router.get('/webhooks/:webhookId/deliveries', (req, res) => {
  try {
    const { webhookId } = req.params;
    const { limit = '50' } = req.query;

    const deliveries = getWebhookDeliveries(Number(webhookId), Number(limit));

    res.json({
      success: true,
      data: deliveries,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get indexer status
router.get('/status', (req, res) => {
  try {
    const indexerState = db
      .prepare('SELECT * FROM indexer_state WHERE id = 1')
      .get() as { last_indexed_block: number; last_indexed_at: number } | undefined;

    const totalMerchants = db
      .prepare('SELECT COUNT(*) as count FROM merchants')
      .get() as { count: number };

    const totalPayments = db
      .prepare('SELECT COUNT(*) as count FROM payment_intents')
      .get() as { count: number };

    const completedPayments = db
      .prepare('SELECT COUNT(*) as count FROM payment_intents WHERE status = 1')
      .get() as { count: number };

    res.json({
      success: true,
      data: {
        indexer: {
          lastIndexedBlock: indexerState?.last_indexed_block || 0,
          lastIndexedAt: indexerState?.last_indexed_at || 0,
        },
        statistics: {
          totalMerchants: totalMerchants.count,
          totalPayments: totalPayments.count,
          completedPayments: completedPayments.count,
        },
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
