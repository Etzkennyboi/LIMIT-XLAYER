// workers/monitor.worker.ts
import http from 'http';
import { RedisService } from '../src/services/RedisService.js';
import { TeeService } from '../src/services/TeeService.js';
import { StateMachine } from '../src/services/StateMachine.js';
import { WebSocketManager } from '../src/services/WebSocketManager.js';
import { PriceConsensus } from '../src/services/PriceConsensus.js';
import { MonitorEngine } from '../src/engine/MonitorEngine.js';
import { logger } from '../src/utils/logger.js';
async function main() {
    logger.info('Monitor worker starting...');
    // Instantiate infrastructure first
    const redis = new RedisService();
    const tee = new TeeService();
    const stateMachine = new StateMachine(redis, tee);
    const wsManager = new WebSocketManager();
    const priceConsensus = new PriceConsensus(wsManager);
    // Build engine with all dependencies
    const engine = new MonitorEngine(redis, stateMachine, priceConsensus);
    // Health endpoint
    http.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/') {
            res.writeHead(200);
            res.end('ok');
        }
        else {
            res.writeHead(404);
            res.end();
        }
    }).listen(8080);
    // Graceful shutdown
    const shutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down gracefully`);
        await engine.stop();
        await redis.close();
        process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    await engine.start();
}
main().catch(err => {
    console.error('Monitor worker fatal error:', err);
    process.exit(1);
});
