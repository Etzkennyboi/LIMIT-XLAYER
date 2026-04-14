// src/engine/MonitorEngine.ts
import BigNumber from 'bignumber.js';
import { Intent, IntentStatus, IntentType } from '../types.js';
import { RedisService } from '../services/RedisService.js';
import { StateMachine } from '../services/StateMachine.js';
import { PriceConsensus } from '../services/PriceConsensus.js';
import { PriceConfidence } from '../types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export class MonitorEngine {
  private running = false;
  private pollIntervalMs = 5_000;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly redis: RedisService,
    private readonly stateMachine: StateMachine,
    private readonly priceConsensus: PriceConsensus
  ) {}

  async start(): Promise<void> {
    this.running = true;
    logger.info('MonitorEngine started');
    await this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    logger.info('MonitorEngine stopped');
  }

  private async poll(): Promise<void> {
    if (!this.running) return;
    try {
      await this.evaluateAll();
    } catch (err) {
      logger.error('MonitorEngine poll error', { error: (err as Error).message });
    }
    this.timer = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  private async evaluateAll(): Promise<void> {
    const intents = await this.redis.getIntentsByStatus(IntentStatus.MONITORING);
    const now = Date.now();

    await Promise.all(intents.map(intent => this.evaluateIntent(intent, now)));
  }

  private async evaluateIntent(intent: Intent, now: number): Promise<void> {
    // Expiry check
    if (now >= intent.expiresAt) {
      await this.stateMachine.transition(
        intent.id, IntentStatus.MONITORING, IntentStatus.CANCELLED, 'Intent expired'
      );
      return;
    }

    // Debounce: skip if recently triggered
    if (intent.lastTriggerAt && now - intent.lastTriggerAt < config.TRIGGER_DEBOUNCE_MS) return;

    // Get consensus price
    const consensus = await this.priceConsensus.getPrice(intent.chain, intent.tokenIn);
    if (!consensus) {
      logger.warn('No price consensus for intent', { intentId: intent.id });
      return;
    }

    // Stale check
    if (now - consensus.timestamp > config.STALE_THRESHOLD_MS) {
      await this.stateMachine.transition(
        intent.id, IntentStatus.MONITORING, IntentStatus.STALE, 'Price feed stale'
      );
      return;
    }

    if (consensus.confidence === PriceConfidence.LOW) return;

    const current = new BigNumber(consensus.price);
    const triggered = this.checkTrigger(intent, current);

    if (triggered) {
      await this.redis.updateIntentStatus(
        intent.id, IntentStatus.MONITORING, IntentStatus.MONITORING,
        { lastTriggerAt: now }
      );
      await this.stateMachine.transition(
        intent.id, IntentStatus.MONITORING, IntentStatus.TRIGGERED,
        `Trigger hit at price ${current.toFixed(4)}`,
        { price: current.toFixed(18), confidence: consensus.confidence }
      );
      await this.redis.pushTriggeredIntent(intent.id);

      // OCO cancel partner
      if (intent.ocoConfig?.linkedIntentId) {
        const linked = await this.redis.getIntent(intent.ocoConfig.linkedIntentId);
        if (linked && linked.status === IntentStatus.MONITORING) {
          await this.stateMachine.transition(
            linked.id, IntentStatus.MONITORING, IntentStatus.CANCELLED,
            'OCO partner triggered'
          );
        }
      }
    }
  }

  private checkTrigger(intent: Intent, currentPrice: BigNumber): boolean {
    const trigger = new BigNumber(intent.triggerPrice);
    switch (intent.type) {
      case IntentType.LIMIT_BUY:  return currentPrice.lte(trigger);
      case IntentType.LIMIT_SELL: return currentPrice.gte(trigger);
      case IntentType.STOP_LOSS:  return currentPrice.lte(trigger);
      case IntentType.OCO: {
        if (!intent.ocoConfig) return false;
        const tp = new BigNumber(intent.ocoConfig.takeProfitPrice);
        const sl = new BigNumber(intent.ocoConfig.stopLossPrice);
        return currentPrice.gte(tp) || currentPrice.lte(sl);
      }
      default: return false;
    }
  }
}
