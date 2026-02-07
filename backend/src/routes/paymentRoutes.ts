import express from 'express';
import { db } from '../database/db.js';
import type { PaymentIntent } from '../types/types.js';

const router = express.Router();

// Get payment intent by ID
router.get('/payments/:paymentId', (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = db
      .prepare('SELECT * FROM payment_intents WHERE payment_id = ?')
      .get(paymentId) as PaymentIntent | undefined;

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get payments by merchant
router.get('/merchants/:merchantAddress/payments', (req, res) => {
  try {
    const { merchantAddress } = req.params;
    const { status, limit = '50', offset = '0' } = req.query;

    let query = 'SELECT * FROM payment_intents WHERE merchant = ?';
    const params: any[] = [merchantAddress];

    if (status !== undefined) {
      query += ' AND status = ?';
      params.push(Number(status));
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const payments = db.prepare(query).all(...params) as PaymentIntent[];

    const countQuery = status !== undefined
      ? 'SELECT COUNT(*) as count FROM payment_intents WHERE merchant = ? AND status = ?'
      : 'SELECT COUNT(*) as count FROM payment_intents WHERE merchant = ?';

    const countParams = status !== undefined ? [merchantAddress, Number(status)] : [merchantAddress];
    const { count } = db.prepare(countQuery).get(...countParams) as { count: number };

    res.json({
      success: true,
      data: payments,
      pagination: {
        total: count,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get payment statistics
router.get('/merchants/:merchantAddress/stats', (req, res) => {
  try {
    const { merchantAddress } = req.params;

    const stats = db
      .prepare(
        `
        SELECT
          COUNT(*) as total_payments,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as completed_payments,
          SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as pending_payments,
          SUM(CASE WHEN status = 1 THEN CAST(amount AS INTEGER) ELSE 0 END) as total_volume
        FROM payment_intents
        WHERE merchant = ?
      `
      )
      .get(merchantAddress) as any;

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Search payments
router.get('/payments', (req, res) => {
  try {
    const { merchant, payer, status, fromDate, toDate, limit = '50', offset = '0' } = req.query;

    let query = 'SELECT * FROM payment_intents WHERE 1=1';
    const params: any[] = [];

    if (merchant) {
      query += ' AND merchant = ?';
      params.push(merchant);
    }

    if (payer) {
      query += ' AND payer = ?';
      params.push(payer);
    }

    if (status !== undefined) {
      query += ' AND status = ?';
      params.push(Number(status));
    }

    if (fromDate) {
      query += ' AND created_at >= ?';
      params.push(Number(fromDate));
    }

    if (toDate) {
      query += ' AND created_at <= ?';
      params.push(Number(toDate));
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const payments = db.prepare(query).all(...params) as PaymentIntent[];

    res.json({
      success: true,
      data: payments,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Verify payment status (idempotent endpoint)
router.post('/payments/:paymentId/verify', (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = db
      .prepare('SELECT * FROM payment_intents WHERE payment_id = ?')
      .get(paymentId) as PaymentIntent | undefined;

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Return payment status with verification timestamp
    res.json({
      success: true,
      data: {
        paymentId: payment.paymentId,
        status: payment.status,
        merchant: payment.merchant,
        amount: payment.amount,
        payer: payment.payer,
        paidAt: payment.paidAt,
        verifiedAt: Math.floor(Date.now() / 1000),
        isCompleted: payment.status === 1,
        isPending: payment.status === 0,
        isExpired: payment.status === 2,
        isRefunded: payment.status === 3,
        isCancelled: payment.status === 4,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
