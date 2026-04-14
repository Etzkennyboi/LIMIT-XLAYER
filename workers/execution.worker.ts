// workers/execution.worker.ts
import { RedisService }    from '../src/services/RedisService.js';
import { TeeService }      from '../src/services/TeeService.js';
import { StateMachine }    from '../src/services/StateMachine.js';
import { WebSocketManager } from '../src/services/WebSocketManager.js';
import { PriceConsensus }  from '../src/services/PriceConsensus.js';
import { ExecutionEngine } from '../src/engine/ExecutionEngine.js';
import { logger }          from '../src/utils/logger.js';

async function main(): Promise<void> {
  logger.info('Execution worker starting...');

  // Instantiate infrastructure first
  const redis         = new RedisService();
  const tee           = new TeeService();
  const stateMachine  = new StateMachine(redis, tee);
  const wsManager     = new WebSocketManager();
  const priceConsensus = new PriceConsensus(wsManager);

  // Engine receives all injected dependencies
  const engine = new ExecutionEngine(redis, stateMachine, priceConsensus, tee);

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    await engine.stop();
    await redis.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  await engine.start();
}

main().catch(err => {
  console.error('Execution worker fatal error:', err);
  process.exit(1);
});
