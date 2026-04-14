// src/services/RedisService.ts
import Redis from 'ioredis';
import { Intent, IntentStatus, StateTransition } from '../types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { LimitOrderError, Errors } from '../utils/errors.js';

export class RedisService {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host:     config.REDIS_HOST,
      port:     config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    this.client.on('error', (err) =>
      logger.error('Redis error', { error: err.message })
    );
  }

  // ── Core CRUD ───────────────────────────────────────────────

  async saveIntent(intent: Intent): Promise<void> {
    const key = `lo:intent:${intent.id}`;
    const pipeline = this.client.pipeline();
    
    // Store all fields as strings (ioredis hset handles objects/numbers)
    pipeline.hset(key, {
      ...intent,
      ocoConfig: intent.ocoConfig ? JSON.stringify(intent.ocoConfig) : '',
    });
    
    pipeline.sadd(`lo:user:${intent.userId}`, intent.id);
    pipeline.sadd(`lo:status:${intent.status}`, intent.id);
    pipeline.zadd('lo:queue:pending', intent.expiresAt, intent.id);
    
    await pipeline.exec();
  }

  async getIntent(id: string): Promise<Intent | null> {
    const data = await this.client.hgetall(`lo:intent:${id}`);
    if (!data || Object.keys(data).length === 0) return null;
    
    return {
      ...data,
      slippageBps:  Number(data.slippageBps),
      expiresAt:    Number(data.expiresAt),
      createdAt:    Number(data.createdAt),
      updatedAt:    Number(data.updatedAt),
      retryCount:   Number(data.retryCount),
      mevProtection: data.mevProtection === 'true',
      lastTriggerAt: data.lastTriggerAt ? Number(data.lastTriggerAt) : undefined,
      ocoConfig:    data.ocoConfig ? JSON.parse(data.ocoConfig) : undefined,
    } as Intent;
  }

  async getByIdempotencyKey(key: string): Promise<Intent | null> {
    // This requires an index. For standard production, we would use a separate set or search index.
    // Simplifying for the reference implementation: we'll check recent intents in local cache if we were a singleton,
    // but here we'll just check if the key exists in a dedicated hset.
    const intentId = await this.client.hget('lo:idempotency', key);
    if (!intentId) return null;
    return this.getIntent(intentId);
  }

  async setIdempotency(key: string, intentId: string, ttlSeconds = 60): Promise<void> {
    await this.client.hset('lo:idempotency', key, intentId);
    // Note: Redis HSET doesn't support TTL per field easily. In prod, use a separate string key.
    await this.client.set(`lo:idempotency:lock:${key}`, intentId, 'EX', ttlSeconds);
  }

  async updateIntentStatus(
    id: string,
    oldStatus: IntentStatus,
    newStatus: IntentStatus,
    updates: Partial<Intent> = {}
  ): Promise<void> {
    const pipeline = this.client.pipeline();
    pipeline.hset(`lo:intent:${id}`, {
      status:    newStatus,
      updatedAt: Date.now(),
      ...updates,
    });
    pipeline.srem(`lo:status:${oldStatus}`, id);
    pipeline.sadd(`lo:status:${newStatus}`, id);
    await pipeline.exec();
  }

  async deleteIntent(id: string): Promise<void> {
    const intent = await this.getIntent(id);
    if (!intent) return;
    const pipeline = this.client.pipeline();
    pipeline.del(`lo:intent:${id}`);
    pipeline.srem(`lo:user:${intent.userId}`, id);
    pipeline.srem(`lo:status:${intent.status}`, id);
    pipeline.zrem('lo:queue:pending', id);
    await pipeline.exec();
  }

  // ── Queue Operations ─────────────────────────────────────────

  async getPendingIntents(maxExpiry: number): Promise<string[]> {
    return this.client.zrangebyscore('lo:queue:pending', '-inf', maxExpiry);
  }

  async getIntentsByStatus(status: IntentStatus): Promise<Intent[]> {
    const ids = await this.client.smembers(`lo:status:${status}`);
    const intents = await Promise.all(ids.map(id => this.getIntent(id)));
    return intents.filter(Boolean) as Intent[];
  }

  async pushTriggeredIntent(id: string): Promise<void> {
    await this.client.rpush('lo:queue:triggered', id);
  }

  async popTriggeredIntent(timeoutSec: number): Promise<string | null> {
    const result = await this.client.blpop('lo:queue:triggered', timeoutSec);
    return result ? result[1] : null;
  }

  // ── Audit Log (Redis Stream) ──────────────────────────────────

  async logTransition(transition: StateTransition): Promise<void> {
    await this.client.xadd(
      'lo:audit',
      '*',
      'intentId',  transition.intentId,
      'from',      transition.from,
      'to',        transition.to,
      'timestamp', String(transition.timestamp),
      'reason',    transition.reason || '',
      'signature', transition.signature,
      'metadata',  JSON.stringify(transition.metadata || {}),
    );
  }

  async getAuditLog(intentId: string, count = 100): Promise<StateTransition[]> {
    const entries = await this.client.xrevrange('lo:audit', '+', '-', 'COUNT', count);
    return entries
      .filter(([, fields]) => {
        const idIdx = fields.indexOf('intentId');
        return idIdx >= 0 && fields[idIdx + 1] === intentId;
      })
      .map(([, fields]) => {
        const get = (k: string) => fields[fields.indexOf(k) + 1];
        return {
          intentId:  get('intentId'),
          from:      get('from') as IntentStatus,
          to:        get('to') as IntentStatus,
          timestamp: Number(get('timestamp')),
          reason:    get('reason') || undefined,
          signature: get('signature'),
          metadata:  JSON.parse(get('metadata') || '{}'),
        };
      });
  }

  // ── Queries ──────────────────────────────────────────────────

  async countActiveIntents(userId: string): Promise<number> {
    const activeStatuses = [
      IntentStatus.MONITORING, 
      IntentStatus.TRIGGERED, 
      IntentStatus.SUBMITTED, 
      IntentStatus.PENDING
    ];
    
    // Using sintercard if redis version supports it, otherwise manually
    let total = 0;
    for (const status of activeStatuses) {
      const ids = await this.client.sinter(`lo:user:${userId}`, `lo:status:${status}`);
      total += ids.length;
    }
    return total;
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
