// src/config.ts
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const ConfigSchema = z.object({
  NODE_ENV:         z.enum(['development', 'staging', 'production']).default('development'),
  REDIS_HOST:       z.string().min(1).default('localhost'),
  REDIS_PORT:       z.string().transform(Number).default('6379'),
  REDIS_PASSWORD:   z.string().optional(),
  TEE_ENDPOINT:     z.string().url().optional(),
  DEV_SECRET:       z.string().min(32).optional(),
  OKX_WS_URL:       z.string().url().default('wss://wspap.okx.com/ws/v5/public'),
  BINANCE_REST_URL: z.string().url().default('https://api.binance.com'),
  CHAINLINK_RPCS:   z.string().optional(),  // JSON: { ethereum: 'https://...', ... }
  MAX_ACTIVE_INTENTS_PER_USER: z.string().transform(Number).default('100'),
  PRICE_CACHE_TTL_MS: z.string().transform(Number).default('30000'),
  TRIGGER_DEBOUNCE_MS: z.string().transform(Number).default('30000'),
  STALE_THRESHOLD_MS: z.string().transform(Number).default('300000'),
  EXECUTION_RETRY_MAX: z.string().transform(Number).default('3'),
  GAS_COST_MAX_RATIO: z.string().transform(Number).default('0.5'),
  MIN_TRIGGER_DELTA_BPS: z.string().transform(Number).default('1000'), // 10%
  MIN_OCO_STOP_DELTA_BPS: z.string().transform(Number).default('100'), // 1%
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Config validation failed:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;

export const CHAINLINK_RPCS: Record<string, string> = config.CHAINLINK_RPCS
  ? JSON.parse(config.CHAINLINK_RPCS)
  : {};

export async function getSupportedChains(): Promise<string[]> {
  const { SupportedChain } = await import('./types.js');
  return Object.values(SupportedChain);
}
