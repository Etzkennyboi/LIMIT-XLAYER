// src/utils/errors.ts
export const Errors = {
  DUPLICATE_INTENT:     { code: '83000', message: 'Duplicate intent within 60s window' },
  INVALID_AMOUNT:       { code: '83001', message: 'Amount must be > 0 and <= balance' },
  INVALID_TRIGGER:      { code: '83002', message: 'Trigger price must be >= 10% from current' },
  INVALID_SLIPPAGE:     { code: '83003', message: 'Slippage must be 10-5000 bps' },
  INVALID_EXPIRY:       { code: '83004', message: 'Expiry must be 1-2160 hours' },
  UNSUPPORTED_CHAIN:    { code: '83005', message: 'Chain not supported' },
  TOKEN_SECURITY_FAIL:  { code: '83006', message: 'Token failed security scan' },
  INVALID_OCO:          { code: '83007', message: 'OCO legs invalid relative to current price' },
  RATE_LIMIT:           { code: '83008', message: 'Max active intents per user exceeded' },
  POLICY_VIOLATION:     { code: '83009', message: 'Wallet policy check failed' },
  INSUFFICIENT_BALANCE: { code: '83010', message: 'Insufficient balance including gas buffer' },
  LOW_CONFIDENCE_PRICE: { code: '83011', message: 'Price consensus below minimum threshold' },
  SLIPPAGE_EXCEEDED:    { code: '83012', message: 'Actual slippage exceeds tolerance' },
  GAS_TOO_HIGH:         { code: '83013', message: 'Gas cost exceeds 50% of trade value' },
  INVALID_TRANSITION:   { code: '83014', message: 'Invalid state machine transition' },
  TEE_UNAVAILABLE:      { code: '83015', message: 'TEE service unavailable' },
  REDIS_ERROR:          { code: '83016', message: 'Redis operation failed' },
} as const;

export class LimitOrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'LimitOrderError';
  }
}
