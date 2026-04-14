import { diagnostics } from '../index.js';
diagnostics().then(results => {
    if (results.redis.includes('FAIL') || results.tee.includes('FAIL')) {
        process.exit(1);
    }
    process.exit(0);
}).catch(err => {
    console.error('Diagnostics failed:', err);
    process.exit(1);
});
