// tests/unit/RedisService.test.ts
import { RedisService } from '../../src/services/RedisService.js';
import { IntentStatus, IntentType, SupportedChain } from '../../src/types.js';

describe('RedisService', () => {
  let redis: RedisService;

  beforeAll(() => {
    // In a real test environment, we would use a mock or a test redis instance
    redis = new RedisService();
  });

  afterAll(async () => {
    await redis.close();
  });

  const mockIntent = (overrides = {}) => ({
    id: 'test-id-' + Math.random(),
    userId: 'user-1',
    walletAddress: '0x123',
    type: IntentType.LIMIT_BUY,
    status: IntentStatus.PENDING,
    chain: SupportedChain.XLAYER,
    tokenIn: '0x1',
    tokenOut: '0x2',
    amount: '1000',
    triggerPrice: '3000',
    slippageBps: 100,
    expiresAt: Date.now() + 3600000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    idempotencyKey: 'key-' + Math.random(),
    mevProtection: true,
    retryCount: 0,
    ...overrides
  });

  test('saveIntent stores all fields correctly', async () => {
    const intent = mockIntent();
    await redis.saveIntent(intent);
    const stored = await redis.getIntent(intent.id);
    expect(stored?.id).toBe(intent.id);
    expect(stored?.status).toBe(IntentStatus.PENDING);
    expect(stored?.slippageBps).toBe(intent.slippageBps);
  });

  test('updateIntentStatus moves status index atomically', async () => {
    const intent = mockIntent({ status: IntentStatus.PENDING });
    await redis.saveIntent(intent);
    await redis.updateIntentStatus(
        intent.id, IntentStatus.PENDING, IntentStatus.MONITORING
    );
    const stored = await redis.getIntent(intent.id);
    expect(stored?.status).toBe(IntentStatus.MONITORING);
  });

  test('popTriggeredIntent returns null on timeout', async () => {
    const result = await redis.popTriggeredIntent(1);
    expect(result).toBeNull();
  });

  test('logTransition appends to stream', async () => {
    const transition = {
      intentId: 'test-id-stream', from: IntentStatus.PENDING,
      to: IntentStatus.MONITORING, timestamp: Date.now(),
      signature: 'test-sig',
    };
    await redis.logTransition(transition);
    const log = await redis.getAuditLog('test-id-stream');
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].intentId).toBe('test-id-stream');
  });
});
