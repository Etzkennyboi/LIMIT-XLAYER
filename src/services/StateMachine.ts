// src/services/StateMachine.ts
import { IntentStatus, StateTransition } from '../types.js';
import { RedisService } from './RedisService.js';
import { TeeService } from './TeeService.js';
import { LimitOrderError, Errors } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const VALID_TRANSITIONS: Record<IntentStatus, IntentStatus[]> = {
  [IntentStatus.PENDING]:    [IntentStatus.MONITORING, IntentStatus.CANCELLED],
  [IntentStatus.MONITORING]: [IntentStatus.TRIGGERED, IntentStatus.STALE, IntentStatus.CANCELLED],
  [IntentStatus.STALE]:      [IntentStatus.MONITORING, IntentStatus.CANCELLED],
  [IntentStatus.TRIGGERED]:  [IntentStatus.SUBMITTED, IntentStatus.FAILED, IntentStatus.CANCELLED],
  [IntentStatus.SUBMITTED]:  [IntentStatus.CONFIRMED, IntentStatus.REVERTED, IntentStatus.FAILED],
  [IntentStatus.CONFIRMED]:  [IntentStatus.SETTLED],
  [IntentStatus.FAILED]:     [IntentStatus.SUBMITTED, IntentStatus.CANCELLED],
  [IntentStatus.REVERTED]:   [IntentStatus.FAILED, IntentStatus.CANCELLED],
  [IntentStatus.UNCERTAIN]:  [IntentStatus.MONITORING, IntentStatus.CANCELLED],
  [IntentStatus.SETTLED]:    [],
  [IntentStatus.CANCELLED]:  [],
};

export class StateMachine {
  constructor(
    private readonly redis: RedisService,
    private readonly tee: TeeService
  ) {}

  async transition(
    intentId: string,
    fromStatus: IntentStatus,
    toStatus: IntentStatus,
    reason?: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    if (!this.isValidTransition(fromStatus, toStatus)) {
      throw new LimitOrderError(
        Errors.INVALID_TRANSITION.code,
        `Invalid transition: ${fromStatus} -> ${toStatus}`,
        { intentId, fromStatus, toStatus }
      );
    }

    const transitionData = {
      intentId,
      from: fromStatus,
      to: toStatus,
      timestamp: Date.now(),
      reason,
    };

    const signature = await this.tee.signTransition(transitionData);

    const transition: StateTransition = {
      ...transitionData,
      signature,
      metadata,
    };

    // Atomic: update status + write audit log
    await this.redis.updateIntentStatus(intentId, fromStatus, toStatus);
    await this.redis.logTransition(transition);

    logger.info('State transition', { intentId, from: fromStatus, to: toStatus, reason });
  }

  private isValidTransition(from: IntentStatus, to: IntentStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  async getAuditTrail(intentId: string): Promise<StateTransition[]> {
    return this.redis.getAuditLog(intentId);
  }

  // Recover intents stuck in SUBMITTED > threshold without CONFIRMED/REVERTED
  async recoverStalled(thresholdMs = 300_000): Promise<void> {
    const submitted = await this.redis.getIntentsByStatus(IntentStatus.SUBMITTED);
    const now = Date.now();
    for (const intent of submitted) {
      if (now - intent.updatedAt > thresholdMs) {
        logger.warn('Recovering stalled intent', { intentId: intent.id });
        await this.transition(
          intent.id,
          IntentStatus.SUBMITTED,
          IntentStatus.UNCERTAIN,
          'Stalled: no confirmation within threshold'
        );
      }
    }
  }
}
