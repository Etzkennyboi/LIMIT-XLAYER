// src/index.ts
import { IntentEngine } from './engine/IntentEngine.js';
import { MonitorEngine } from './engine/MonitorEngine.js';
import { ExecutionEngine } from './engine/ExecutionEngine.js';
import { RedisService } from './services/RedisService.js';
import { StateMachine } from './services/StateMachine.js';
import { PriceConsensus } from './services/PriceConsensus.js';
import { TeeService } from './services/TeeService.js';
import { WebSocketManager } from './services/WebSocketManager.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

export {
  IntentEngine,
  MonitorEngine,
  ExecutionEngine,
  RedisService,
  StateMachine,
  PriceConsensus,
  TeeService,
  WebSocketManager,
  config,
  logger
};

/**
 * Doctor function to verify the skill health
 */
export async function diagnostics() {
  logger.info('Running SKILL DOCTOR diagnostics...');
  
  const results = {
    config: !!config,
    redis: 'PENDING',
    tee: 'PENDING'
  };

  try {
    const redis = new RedisService();
    results.redis = 'OK';
    await redis.close();
  } catch (e) {
    results.redis = `FAIL: ${(e as Error).message}`;
  }

  logger.info('Diagnostics complete', results);
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  diagnostics().catch(console.error);
}
