// src/types.ts
// Version: 1.0.0 | Strict TypeScript — zero 'any'

export enum IntentStatus {
  PENDING    = 'PENDING',
  MONITORING = 'MONITORING',
  TRIGGERED  = 'TRIGGERED',
  SUBMITTED  = 'SUBMITTED',
  CONFIRMED  = 'CONFIRMED',
  SETTLED    = 'SETTLED',
  FAILED     = 'FAILED',
  REVERTED   = 'REVERTED',
  CANCELLED  = 'CANCELLED',
  STALE      = 'STALE',
  UNCERTAIN  = 'UNCERTAIN',
}

export enum IntentType {
  LIMIT_BUY  = 'LIMIT_BUY',
  LIMIT_SELL = 'LIMIT_SELL',
  STOP_LOSS  = 'STOP_LOSS',
  OCO        = 'OCO',
}

export enum SupportedChain {
  ETHEREUM  = 'ethereum',
  ARBITRUM  = 'arbitrum',
  OPTIMISM  = 'optimism',
  POLYGON   = 'polygon',
  XLAYER    = 'xlayer',
  MANTLE    = 'mantle',
}

export enum PriceConfidence {
  HIGH   = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW    = 'LOW',
}

export interface OCOConfig {
  takeProfitPrice: string;
  stopLossPrice:   string;
  linkedIntentId?: string;
}

export interface Intent {
  id:             string;
  userId:         string;
  walletAddress:  string;
  type:           IntentType;
  status:         IntentStatus;
  chain:          SupportedChain;
  tokenIn:        string;   // contract address
  tokenOut:       string;   // contract address
  amount:         string;   // BigNumber string, wei
  triggerPrice:   string;   // USD, 18 decimals
  slippageBps:    number;   // 10-5000
  expiresAt:      number;   // Unix ms
  createdAt:      number;
  updatedAt:      number;
  idempotencyKey: string;
  mevProtection:  boolean;
  ocoConfig?:     OCOConfig;
  txHash?:        string;
  errorCode?:     string;
  errorMessage?:  string;
  retryCount:     number;
  lastTriggerAt?: number;
}

export interface StateTransition {
  intentId:  string;
  from:      IntentStatus;
  to:        IntentStatus;
  timestamp: number;
  reason?:   string;
  signature: string;   // TEE or HMAC signature
  metadata?: Record<string, string>;
}

export interface ConsensusPrice {
  price:      string;   // weighted mean, 18 decimals
  confidence: PriceConfidence;
  variance:   number;   // 0-1 ratio
  sources:    number;   // contributing source count
  timestamp:  number;
}

export interface CreateIntentParams {
  userId:        string;
  walletAddress: string;
  type:          IntentType;
  chain:         SupportedChain;
  tokenIn:       string;
  tokenOut:      string;
  amount:        string;
  triggerPrice:  string;
  slippageBps:   number;
  expiresInHours: number;
  mevProtection:  boolean;
  ocoConfig?:    Omit<OCOConfig, 'linkedIntentId'>;
}

export interface ExecutionResult {
  intentId: string;
  txHash:   string;
  gasUsed:  string;
  amountOut: string;
  executedAt: number;
}

export interface AppError {
  code:    string;   // 83xxx range
  message: string;
  context?: Record<string, unknown>;
}
