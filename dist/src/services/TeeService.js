// src/services/TeeService.ts
import crypto from 'crypto';
import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { LimitOrderError, Errors } from '../utils/errors.js';
export class TeeService {
    isProd = config.NODE_ENV === 'production';
    async signTransition(data) {
        if (this.isProd) {
            return this.callTeeEndpoint('/sign/transition', data);
        }
        // Dev/staging: HMAC-SHA256 (requires DEV_SECRET in .env)
        if (!config.DEV_SECRET) {
            throw new LimitOrderError(Errors.TEE_UNAVAILABLE.code, 'DEV_SECRET must be set in non-production environments');
        }
        return crypto
            .createHmac('sha256', config.DEV_SECRET)
            .update(JSON.stringify(data))
            .digest('hex');
    }
    async signTransaction(txData) {
        if (this.isProd) {
            return this.callTeeEndpoint('/sign/transaction', txData);
        }
        const signature = crypto
            .createHmac('sha256', config.DEV_SECRET)
            .update(JSON.stringify(txData))
            .digest('hex');
        return { signedTx: JSON.stringify(txData), signature };
    }
    async verifySignature(signature, data) {
        if (this.isProd) {
            return this.callTeeEndpoint('/verify', { signature, data });
        }
        const expected = crypto
            .createHmac('sha256', config.DEV_SECRET)
            .update(JSON.stringify(data))
            .digest('hex');
        return signature === expected;
    }
    async callTeeEndpoint(path, body) {
        if (!config.TEE_ENDPOINT) {
            throw new LimitOrderError(Errors.TEE_UNAVAILABLE.code, 'TEE_ENDPOINT not configured');
        }
        try {
            const { data } = await axios.post(`${config.TEE_ENDPOINT}${path}`, body, { timeout: 5000 });
            return data;
        }
        catch (err) {
            logger.error('TEE endpoint error', { path, error: err.message });
            throw new LimitOrderError(Errors.TEE_UNAVAILABLE.code, 'TEE signing failed');
        }
    }
}
