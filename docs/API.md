# API Documentation

## Base URL

```
http://localhost:3000/api
```

For production, use your deployed backend URL.

## Authentication

Currently, the API does not require authentication. For production deployment, implement:
- API keys for merchant access
- JWT tokens for session management
- Rate limiting per merchant

## Response Format

All responses follow this format:

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "error": "Error message"
}
```

## Status Codes

- `200` - Success
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error

## Payment Status Enum

```typescript
enum PaymentStatus {
  Pending = 0,
  Completed = 1,
  Expired = 2,
  Refunded = 3,
  Cancelled = 4
}
```

---

## Endpoints

### 1. Get Payment by ID

Retrieve details of a specific payment intent.

**Endpoint**:
```
GET /api/payments/:paymentId
```

**Parameters**:
- `paymentId` (path) - Bytes32 hex string of payment ID

**Example Request**:
```bash
curl http://localhost:3000/api/payments/0x1234...
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "payment_id": "0x1234...",
    "merchant": "0xAbcD...",
    "token_address": "0xToken...",
    "amount": "100000000",
    "expiry_timestamp": 1234567890,
    "status": 1,
    "created_at": 1234567800,
    "payer": "0xPayer...",
    "paid_at": 1234567850,
    "platform_fee": "250000",
    "block_number": 12345,
    "transaction_hash": "0xTx..."
  }
}
```

---

### 2. Get Merchant Payments

Retrieve all payments for a specific merchant with optional filtering.

**Endpoint**:
```
GET /api/merchants/:merchantAddress/payments
```

**Parameters**:
- `merchantAddress` (path) - Ethereum address of merchant
- `status` (query, optional) - Filter by status (0-4)
- `limit` (query, optional) - Number of results (default: 50)
- `offset` (query, optional) - Pagination offset (default: 0)

**Example Request**:
```bash
# Get all completed payments
curl "http://localhost:3000/api/merchants/0xMerchant.../payments?status=1&limit=20"
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "payment_id": "0x1234...",
      "merchant": "0xMerchant...",
      "amount": "100000000",
      "status": 1,
      "created_at": 1234567800,
      "paid_at": 1234567850
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0
  }
}
```

---

### 3. Get Merchant Statistics

Get aggregated statistics for a merchant.

**Endpoint**:
```
GET /api/merchants/:merchantAddress/stats
```

**Parameters**:
- `merchantAddress` (path) - Ethereum address of merchant

**Example Request**:
```bash
curl http://localhost:3000/api/merchants/0xMerchant.../stats
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "total_payments": 150,
    "completed_payments": 120,
    "pending_payments": 15,
    "total_volume": "15000000000"
  }
}
```

---

### 4. Search Payments

Search payments with multiple filters.

**Endpoint**:
```
GET /api/payments
```

**Query Parameters**:
- `merchant` (optional) - Filter by merchant address
- `payer` (optional) - Filter by payer address
- `status` (optional) - Filter by status (0-4)
- `fromDate` (optional) - Unix timestamp (inclusive)
- `toDate` (optional) - Unix timestamp (inclusive)
- `limit` (optional) - Results per page (default: 50)
- `offset` (optional) - Pagination offset (default: 0)

**Example Request**:
```bash
# Get all completed payments from a specific merchant in date range
curl "http://localhost:3000/api/payments?merchant=0xMerchant...&status=1&fromDate=1234567800&toDate=1234597800"
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "payment_id": "0x1234...",
      "merchant": "0xMerchant...",
      "payer": "0xPayer...",
      "amount": "100000000",
      "status": 1,
      "created_at": 1234567850
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0
  }
}
```

---

### 5. Verify Payment (Idempotent)

Verify the status of a payment. This endpoint is idempotent and can be called multiple times.

**Endpoint**:
```
POST /api/payments/:paymentId/verify
```

**Parameters**:
- `paymentId` (path) - Bytes32 hex string of payment ID

**Example Request**:
```bash
curl -X POST http://localhost:3000/api/payments/0x1234.../verify
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "paymentId": "0x1234...",
    "status": 1,
    "merchant": "0xMerchant...",
    "amount": "100000000",
    "payer": "0xPayer...",
    "paidAt": 1234567850,
    "verifiedAt": 1234567900,
    "isCompleted": true,
    "isPending": false,
    "isExpired": false,
    "isRefunded": false,
    "isCancelled": false
  }
}
```

---

### 6. Get Merchant Details

Get information about a specific merchant.

**Endpoint**:
```
GET /api/merchants/:address
```

**Parameters**:
- `address` (path) - Ethereum address of merchant

**Example Request**:
```bash
curl http://localhost:3000/api/merchants/0xMerchant...
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "address": "0xMerchant...",
    "business_name": "My Shop",
    "is_active": 1,
    "registered_at": 1234567800,
    "total_payments_received": "15000000000"
  }
}
```

---

### 7. List All Merchants

Get a list of all registered merchants.

**Endpoint**:
```
GET /api/merchants
```

**Query Parameters**:
- `isActive` (optional) - Filter by active status ("true" or "false")
- `limit` (optional) - Results per page (default: 50)
- `offset` (optional) - Pagination offset (default: 0)

**Example Request**:
```bash
# Get all active merchants
curl "http://localhost:3000/api/merchants?isActive=true&limit=20"
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "address": "0xMerchant1...",
      "business_name": "Shop One",
      "is_active": 1,
      "registered_at": 1234567800,
      "total_payments_received": "5000000000"
    },
    {
      "address": "0xMerchant2...",
      "business_name": "Shop Two",
      "is_active": 1,
      "registered_at": 1234567900,
      "total_payments_received": "8000000000"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0
  }
}
```

---

### 8. Register Webhook

Register a webhook URL to receive payment notifications.

**Endpoint**:
```
POST /api/merchants/:address/webhooks
```

**Parameters**:
- `address` (path) - Ethereum address of merchant

**Request Body**:
```json
{
  "webhookUrl": "https://yourdomain.com/webhooks/payment"
}
```

**Example Request**:
```bash
curl -X POST http://localhost:3000/api/merchants/0xMerchant.../webhooks \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "https://yourdomain.com/webhooks/payment"}'
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "webhookUrl": "https://yourdomain.com/webhooks/payment",
    "secret": "a1b2c3d4e5f6...generated_secret_key",
    "message": "Webhook registered successfully. Keep the secret safe for signature verification."
  }
}
```

**Important**: Save the `secret` securely. You'll need it to verify webhook signatures.

---

### 9. Get Merchant Webhooks

List all webhooks registered for a merchant.

**Endpoint**:
```
GET /api/merchants/:address/webhooks
```

**Parameters**:
- `address` (path) - Ethereum address of merchant

**Example Request**:
```bash
curl http://localhost:3000/api/merchants/0xMerchant.../webhooks
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "webhookUrl": "https://yourdomain.com/webhooks/payment",
      "isActive": 1,
      "createdAt": 1234567800
    }
  ]
}
```

**Note**: The `secret` is not returned for security reasons.

---

### 10. Deactivate Webhook

Deactivate a webhook endpoint.

**Endpoint**:
```
DELETE /api/webhooks/:webhookId
```

**Parameters**:
- `webhookId` (path) - ID of the webhook to deactivate

**Example Request**:
```bash
curl -X DELETE http://localhost:3000/api/webhooks/1
```

**Example Response**:
```json
{
  "success": true,
  "message": "Webhook deactivated successfully"
}
```

---

### 11. Get Webhook Deliveries

Get delivery history for a webhook (for debugging).

**Endpoint**:
```
GET /api/webhooks/:webhookId/deliveries
```

**Parameters**:
- `webhookId` (path) - ID of the webhook
- `limit` (query, optional) - Number of results (default: 50)

**Example Request**:
```bash
curl "http://localhost:3000/api/webhooks/1/deliveries?limit=20"
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "webhook_config_id": 1,
      "payment_id": "0x1234...",
      "event_type": "payment.completed",
      "payload": "{\"paymentId\":\"0x1234...\",\"status\":\"completed\"}",
      "status": "success",
      "attempts": 1,
      "last_attempt_at": 1234567850,
      "next_retry_at": null,
      "created_at": 1234567850
    },
    {
      "id": 122,
      "webhook_config_id": 1,
      "payment_id": "0x5678...",
      "event_type": "payment.created",
      "payload": "{\"paymentId\":\"0x5678...\",\"status\":\"pending\"}",
      "status": "failed",
      "attempts": 5,
      "last_attempt_at": 1234567800,
      "next_retry_at": null,
      "created_at": 1234567700
    }
  ]
}
```

---

### 12. Get System Status

Get current status of the indexer and system statistics.

**Endpoint**:
```
GET /api/status
```

**Example Request**:
```bash
curl http://localhost:3000/api/status
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "indexer": {
      "lastIndexedBlock": 12345678,
      "lastIndexedAt": 1234567890
    },
    "statistics": {
      "totalMerchants": 150,
      "totalPayments": 5000,
      "completedPayments": 4200
    },
    "timestamp": 1234567900
  }
}
```

---

### 13. Health Check

Simple health check endpoint for monitoring.

**Endpoint**:
```
GET /health
```

**Example Request**:
```bash
curl http://localhost:3000/health
```

**Example Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "Payment Gateway Backend"
}
```

---

## Webhook Events

When registered, your webhook endpoint will receive POST requests for these events:

### Event Types

1. **payment.created** - Payment intent was created
2. **payment.completed** - Payment was successfully completed
3. **payment.refunded** - Payment was refunded
4. **payment.expired** - Payment expired
5. **payment.cancelled** - Payment was cancelled by merchant

### Webhook Payload

All webhook events follow this format:

```json
{
  "id": 123,
  "event": "payment.completed",
  "timestamp": 1234567890,
  "data": {
    "paymentId": "0x1234...",
    "merchant": "0xMerchant...",
    "payer": "0xPayer...",
    "amount": "100000000",
    "platformFee": "250000",
    "status": "completed",
    "timestamp": 1234567850
  }
}
```

### Webhook Headers

```
Content-Type: application/json
X-Webhook-Signature: <hmac_sha256_signature>
X-Webhook-Timestamp: <unix_timestamp>
X-Webhook-Event: <event_type>
```

### Signature Verification

**Your webhook endpoint should verify the signature**:

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(req, secret) {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// In your webhook handler
app.post('/webhooks/payment', (req, res) => {
  const secret = 'your_webhook_secret';

  if (!verifyWebhookSignature(req, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, data } = req.body;

  switch (event) {
    case 'payment.completed':
      // Mark order as paid, fulfill order
      break;
    case 'payment.created':
      // Log payment intent creation
      break;
    // Handle other events
  }

  // Always return 200 to acknowledge receipt
  res.status(200).json({ received: true });
});
```

### Webhook Retry Logic

If your endpoint fails (non-200 response or timeout):
- Attempt 1: Immediate
- Attempt 2: +1 minute
- Attempt 3: +5 minutes
- Attempt 4: +15 minutes
- Attempt 5: +1 hour
- Attempt 6: +2 hours

After 6 failed attempts, the delivery is marked as failed.

### Webhook Best Practices

1. **Return 200 quickly** - Process webhooks asynchronously
2. **Verify signatures** - Always verify the HMAC signature
3. **Be idempotent** - Handle duplicate deliveries gracefully
4. **Log everything** - Keep audit logs of webhook deliveries
5. **Use HTTPS** - Webhooks should only go to HTTPS endpoints in production
6. **Implement timeout** - Webhook processing should complete quickly (<5s)

---

## Error Handling

### Common Errors

**404 Not Found**:
```json
{
  "error": "Payment not found"
}
```

**400 Bad Request**:
```json
{
  "error": "Invalid webhook URL format"
}
```

**500 Internal Server Error**:
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limiting

**Current**: No rate limiting (development)

**Recommended for Production**:
- 100 requests per minute per IP
- 1000 requests per hour per merchant
- Use Redis for distributed rate limiting

---

## CORS

**Current**: All origins allowed (development)

**Recommended for Production**:
```javascript
app.use(cors({
  origin: ['https://yourdomain.com'],
  credentials: true
}));
```

---

## Example Integration

### Node.js/Express Example

```javascript
const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

// Get payment status
async function getPaymentStatus(paymentId) {
  const response = await axios.get(`${API_BASE}/payments/${paymentId}`);
  return response.data.data;
}

// Get merchant payments
async function getMerchantPayments(merchantAddress, status) {
  const response = await axios.get(
    `${API_BASE}/merchants/${merchantAddress}/payments`,
    { params: { status, limit: 50 } }
  );
  return response.data.data;
}

// Register webhook
async function registerWebhook(merchantAddress, webhookUrl) {
  const response = await axios.post(
    `${API_BASE}/merchants/${merchantAddress}/webhooks`,
    { webhookUrl }
  );
  return response.data.data;
}

// Verify payment
async function verifyPayment(paymentId) {
  const response = await axios.post(
    `${API_BASE}/payments/${paymentId}/verify`
  );
  return response.data.data;
}
```

### Python Example

```python
import requests

API_BASE = 'http://localhost:3000/api'

def get_payment_status(payment_id):
    response = requests.get(f'{API_BASE}/payments/{payment_id}')
    return response.json()['data']

def get_merchant_payments(merchant_address, status=None):
    params = {'status': status} if status else {}
    response = requests.get(
        f'{API_BASE}/merchants/{merchant_address}/payments',
        params=params
    )
    return response.json()['data']

def register_webhook(merchant_address, webhook_url):
    response = requests.post(
        f'{API_BASE}/merchants/{merchant_address}/webhooks',
        json={'webhookUrl': webhook_url}
    )
    return response.json()['data']
```

---

## Testing the API

### Using cURL

```bash
# Get system status
curl http://localhost:3000/api/status

# Get a payment
curl http://localhost:3000/api/payments/0x1234...

# Get merchant payments
curl "http://localhost:3000/api/merchants/0xABC.../payments?status=1"

# Register webhook
curl -X POST http://localhost:3000/api/merchants/0xABC.../webhooks \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "https://example.com/webhook"}'
```

### Using Postman

Import this collection:

```json
{
  "info": {
    "name": "Payment Gateway API"
  },
  "item": [
    {
      "name": "Get Payment",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/api/payments/{{payment_id}}"
      }
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:3000"
    }
  ]
}
```

---

For more information, see [ARCHITECTURE.md](./ARCHITECTURE.md) for system design details.
