import { RedisService } from '../services/RedisService.js';
import { IntentStatus } from '../types.js';
async function main() {
    const statusArg = process.argv[2];
    const redis = new RedisService();
    try {
        let orders;
        if (statusArg && Object.values(IntentStatus).includes(statusArg)) {
            orders = await redis.getIntentsByStatus(statusArg);
        }
        else {
            // Just fetch some pending ones to show logic
            const ids = await redis.getPendingIntents(Date.now() + 8640000000);
            orders = await Promise.all(ids.map(id => redis.getIntent(id)));
        }
        console.log(JSON.stringify({
            success: true,
            count: orders.length,
            orders: orders.filter(Boolean)
        }, null, 2));
    }
    catch (err) {
        console.error(JSON.stringify({ success: false, error: err.message }));
    }
    finally {
        await redis.close();
    }
}
main();
