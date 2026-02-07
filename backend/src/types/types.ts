export enum PaymentStatus {
  Pending = 0,
  Completed = 1,
  Expired = 2,
  Refunded = 3,
  Cancelled = 4,
}

export interface Merchant {
  address: string;
  businessName: string;
  isActive: boolean;
  registeredAt: number;
  totalPaymentsReceived: string;
}

export interface PaymentIntent {
  paymentId: string;
  merchant: string;
  tokenAddress: string;
  amount: string;
  expiryTimestamp: number;
  status: PaymentStatus;
  createdAt: number;
  payer: string | null;
  paidAt: number | null;
  platformFee: string | null;
  blockNumber: number;
  transactionHash: string;
}

export interface WebhookConfig {
  id: number;
  merchantAddress: string;
  webhookUrl: string;
  secret: string;
  isActive: boolean;
  createdAt: number;
}

export interface WebhookDelivery {
  id: number;
  webhookConfigId: number;
  paymentId: string;
  eventType: string;
  payload: string;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  lastAttemptAt: number | null;
  nextRetryAt: number | null;
  createdAt: number;
}

export interface EventLog {
  blockNumber: number;
  transactionHash: string;
  eventName: string;
  args: any;
  timestamp: number;
}

export interface ChainReorgEvent {
  fromBlock: number;
  toBlock: number;
  detectedAt: number;
}
