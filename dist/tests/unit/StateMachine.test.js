// tests/unit/StateMachine.test.ts
import { StateMachine } from '../../src/services/StateMachine.js';
import { IntentStatus } from '../../src/types.js';
import { LimitOrderError } from '../../src/utils/errors.js';
describe('StateMachine', () => {
    let sm;
    let mockRedis;
    let mockTee;
    beforeAll(() => {
        mockRedis = {
            updateIntentStatus: jest.fn().mockResolvedValue(undefined),
            logTransition: jest.fn().mockResolvedValue(undefined)
        };
        mockTee = {
            signTransition: jest.fn().mockResolvedValue('test-sig')
        };
        sm = new StateMachine(mockRedis, mockTee);
    });
    test('valid transition PENDING -> MONITORING succeeds', async () => {
        await sm.transition('id-1', IntentStatus.PENDING, IntentStatus.MONITORING);
        expect(mockRedis.updateIntentStatus).toHaveBeenCalledWith('id-1', IntentStatus.PENDING, IntentStatus.MONITORING);
        expect(mockRedis.logTransition).toHaveBeenCalled();
    });
    test('invalid transition SETTLED -> MONITORING throws', async () => {
        await expect(sm.transition('id-2', IntentStatus.SETTLED, IntentStatus.MONITORING)).rejects.toThrow(LimitOrderError);
    });
    test('CONFIRMED can only go to SETTLED', async () => {
        await expect(sm.transition('id-3', IntentStatus.CONFIRMED, IntentStatus.CANCELLED)).rejects.toThrow(LimitOrderError);
    });
});
