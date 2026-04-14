// src/services/WebSocketManager.ts
import { logger } from '../utils/logger.js';
/**
 * A stub/placeholder for the OKX price WebSocket streams.
 * In production, this would manage live feeds and cache the latest prices.
 */
export class WebSocketManager {
    lastPrices = new Map();
    constructor() {
        logger.info('WebSocketManager initialized');
    }
    getLastPrice(tokenAddress) {
        return this.lastPrices.get(tokenAddress.toLowerCase()) || null;
    }
    setPrice(tokenAddress, price) {
        this.lastPrices.set(tokenAddress.toLowerCase(), price);
    }
}
