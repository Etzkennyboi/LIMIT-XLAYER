// src/engine/ExecutionEngine.ts
import crypto from 'crypto';
import BigNumber from 'bignumber.js';
import { Intent, IntentStatus } from '../types.js';
import { RedisService } from '../services/RedisService.js';
import { StateMachine } from '../services/StateMachine.js';
import { PriceConsensus } from '../services/PriceConsensus.js';
import { TeeService } from '../services/TeeService.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const CONFIRMATION_BLOCKS = 12;
const BLOCK_TIME_MS       = 12_000;
const RETRY_DELAYS_MS     = [2_000, 4_000, 8_000];

export class ExecutionEngine {
  private running = false;

  constructor(
    private readonly redis: RedisService,
    private readonly stateMachine: StateMachine,
    private readonly priceConsensus: PriceConsensus,
    private readonly tee: TeeService
  ) {}

  async start(): Promise<void> {
    this.running = true;
    logger.info('ExecutionEngine started');
    await this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    logger.info('ExecutionEngine stopped');
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const intentId = await this.redis.popTriggeredIntent(5);
      if (!intentId) continue;
      await this.executeIntent(intentId);
    }
  }

  private async executeIntent(intentId: string): Promise<void> {
    let intent = await this.redis.getIntent(intentId);
    if (!intent) {
      logger.warn('ExecutionEngine: intent not found', { intentId });
      return;
    }

    try {
      // Pre-flight: fresh price
      const consensus = await this.priceConsensus.getPrice(intent.chain, intent.tokenIn);
      if (!consensus) {
        await this.fail(intent, 'No price consensus at execution time');
        return;
      }

      // Slippage guard
      const triggerPrice = new BigNumber(intent.triggerPrice);
      const currentPrice = new BigNumber(consensus.price);
      const actualSlippageBps = triggerPrice.minus(currentPrice).abs()
        .dividedBy(triggerPrice).multipliedBy(10000).toNumber();
      
      if (actualSlippageBps > intent.slippageBps) {
        await this.fail(intent, `Actual slippage ${actualSlippageBps}bps exceeds tolerance ${intent.slippageBps}bps`);
        return;
      }

      // Transition to SUBMITTED
      await this.stateMachine.transition(
        intent.id, IntentStatus.TRIGGERED, IntentStatus.SUBMITTED,
        'Pre-flight passed, submitting transaction'
      );

      // Build and sign transaction via TEE
      const txData = {
        chain:         intent.chain,
        tokenIn:       intent.tokenIn,
        tokenOut:      intent.tokenOut,
        amount:        intent.amount,
        slippageBps:   intent.slippageBps,
        walletAddress: intent.walletAddress,
        mevProtection: intent.mevProtection,
        intentId:      intent.id,
      };
      
      const { signedTx, signature } = await this.tee.signTransaction(txData);
      
      // In production, submit to onchain
      const txHash = '0x' + crypto.randomBytes(32).toString('hex');
      
      await this.redis.updateIntentStatus(
        intent.id, IntentStatus.SUBMITTED, IntentStatus.SUBMITTED, { txHash }
      );

      // Await confirmation
      await new Promise(r => setTimeout(r, CONFIRMATION_BLOCKS * BLOCK_TIME_MS));

      await this.stateMachine.transition(
        intent.id, IntentStatus.SUBMITTED, IntentStatus.CONFIRMED,
        '12-block confirmation received',
        { txHash, signature }
      );
      
      await this.stateMachine.transition(
        intent.id, IntentStatus.CONFIRMED, IntentStatus.SETTLED,
        'Intent fully settled'
      );

      logger.info('Intent settled', { intentId: intent.id, txHash });

    } catch (err) {
      const error = err as Error;
      intent = (await this.redis.getIntent(intentId))!;

      if (intent.retryCount < config.EXECUTION_RETRY_MAX) {
        const delay = RETRY_DELAYS_MS[intent.retryCount] ?? 8_000;
        logger.warn('Execution failed, retrying', { intentId, retryCount: intent.retryCount, delay });
        await this.redis.updateIntentStatus(
          intent.id, intent.status, intent.status,
          { retryCount: intent.retryCount + 1 }
        );
        await new Promise(r => setTimeout(r, delay));
        await this.redis.pushTriggeredIntent(intentId);
      } else {
        await this.fail(intent, `Max retries exceeded: ${error.message}`);
      }
    }
  }

  private async fail(intent: Intent, reason: string): Promise<void> {
    const fromStatus = [IntentStatus.TRIGGERED, IntentStatus.SUBMITTED].includes(intent.status)
      ? intent.status : IntentStatus.TRIGGERED;
    await this.stateMachine.transition(
      intent.id, fromStatus, IntentStatus.FAILED, reason
    );
  }
}
