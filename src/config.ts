// src/config.ts
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const ConfigSchema = z.object({
  NODE_ENV:         z.enum(['development', 'staging', 'production']).default('development'),
  REDIS_HOST:       z.string().default('localhost'),
  REDIS_PORT:       z.string().default('6379').transform(Number),
  REDIS_PASSWORD:   z.string().optional(),
  TEE_ENDPOINT:     z.string().url().optional(),
  DEV_SECRET:       z.string().default('default_dev_secret_32_chars_long_!!').transform(v => v.padEnd(32, '0')),
  OKX_WS_URL:       z.string().url().default('wss://wspap.okx.com/ws/v5/public'),
  BINANCE_REST_URL: z.string().url().default('https://api.binance.com'),
  CHAINLINK_RPCS:   z.string().optional(),  // JSON: { ethereum: 'https://...', ... }
  MAX_ACTIVE_INTENTS_PER_USER: z.string().default('100').transform(Number),
  PRICE_CACHE_TTL_MS: z.string().default('30000').transform(Number),
  TRIGGER_DEBOUNCE_MS: z.string().default('30000').transform(Number),
  STALE_THRESHOLD_MS: z.string().default('300000').transform(Number),
  EXECUTION_RETRY_MAX: z.string().default('3').transform(Number),
  GAS_COST_MAX_RATIO: z.string().default('0.5').transform(Number),
  MIN_TRIGGER_DELTA_BPS: z.string().default('1000').transform(Number), // 10%
  MIN_OCO_STOP_DELTA_BPS: z.string().default('100').transform(Number), // 1%
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Config validation failed:', JSON.stringify(parsed.error.format(), null, 2));
  if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
    process.exit(1);
  }
}

export const config = parsed.data || ConfigSchema.parse({});

export const CHAINLINK_RPCS: Record<string, string> = config.CHAINLINK_RPCS
  ? JSON.parse(config.CHAINLINK_RPCS)
  : {};

export async function getSupportedChains(): Promise<string[]> {
  const { SupportedChain } = await import('./types.js');
  return Object.values(SupportedChain);
}
