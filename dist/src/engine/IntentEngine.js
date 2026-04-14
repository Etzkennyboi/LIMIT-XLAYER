// src/engine/IntentEngine.ts
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { IntentStatus } from '../types.js';
import { validateIntentParams } from '../validators/intentValidator.js';
import { LimitOrderError, Errors } from '../utils/errors.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
export class IntentEngine {
    redis;
    stateMachine;
    priceConsensus;
    constructor(redis, stateMachine, priceConsensus) {
        this.redis = redis;
        this.stateMachine = stateMachine;
        this.priceConsensus = priceConsensus;
    }
    async createIntent(params) {
        // Step 1: Generate idempotency key
        const idempotencyKey = crypto
            .createHash('sha256')
            .update(`${params.userId}:${params.tokenIn}:${params.amount}:${params.triggerPrice}:${params.chain}`)
            .digest('hex')
            .slice(0, 32);
        // Step 2: Duplicate check (60s window)
        const existing = await this.redis.getByIdempotencyKey(idempotencyKey);
        if (existing && Date.now() - existing.createdAt < 60_000) {
            throw new LimitOrderError(Errors.DUPLICATE_INTENT.code, Errors.DUPLICATE_INTENT.message, { existingId: existing.id });
        }
        // Step 3: Rate limit
        const activeCount = await this.redis.countActiveIntents(params.userId);
        if (activeCount >= config.MAX_ACTIVE_INTENTS_PER_USER) {
            throw new LimitOrderError(Errors.RATE_LIMIT.code, Errors.RATE_LIMIT.message, { current: activeCount, max: config.MAX_ACTIVE_INTENTS_PER_USER });
        }
        // Step 7: Get current price and validate
        const currentPrice = await this.priceConsensus.getPrice(params.chain, params.tokenIn);
        if (!currentPrice) {
            throw new LimitOrderError(Errors.LOW_CONFIDENCE_PRICE.code, 'Unable to obtain price consensus');
        }
        // Step 8: Full validation (throws on failure)
        validateIntentParams(params, currentPrice, '999999999999999999999');
        // Step 9: Build intent
        const now = Date.now();
        const intent = {
            id: uuidv4(),
            userId: params.userId,
            walletAddress: params.walletAddress,
            type: params.type,
            status: IntentStatus.PENDING,
            chain: params.chain,
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amount: params.amount,
            triggerPrice: params.triggerPrice,
            slippageBps: params.slippageBps,
            expiresAt: now + params.expiresInHours * 3_600_000,
            createdAt: now,
            updatedAt: now,
            idempotencyKey,
            mevProtection: params.mevProtection,
            ocoConfig: params.ocoConfig,
            retryCount: 0,
        };
        // Step 10: Persist
        await this.redis.saveIntent(intent);
        await this.redis.setIdempotency(idempotencyKey, intent.id);
        // Step 11: Transition to MONITORING
        await this.stateMachine.transition(intent.id, IntentStatus.PENDING, IntentStatus.MONITORING, 'Intent created and validated');
        logger.info('Intent created', { intentId: intent.id, type: intent.type, userId: intent.userId });
        return { ...intent, status: IntentStatus.MONITORING };
    }
    async cancelIntent(intentId, userId) {
        const intent = await this.redis.getIntent(intentId);
        if (!intent)
            throw new LimitOrderError('83020', 'Intent not found');
        if (intent.userId !== userId)
            throw new LimitOrderError('83021', 'Unauthorised');
        const terminalStates = [IntentStatus.SETTLED, IntentStatus.CANCELLED];
        if (terminalStates.includes(intent.status)) {
            throw new LimitOrderError('83022', 'Intent already in terminal state');
        }
        await this.stateMachine.transition(intentId, intent.status, IntentStatus.CANCELLED, 'User cancelled');
    }
}
