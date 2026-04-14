// src/services/WebSocketManager.ts
import { logger } from '../utils/logger.js';

/**
 * A stub/placeholder for the OKX price WebSocket streams.
 * In production, this would manage live feeds and cache the latest prices.
 */
export class WebSocketManager {
  private lastPrices: Map<string, string> = new Map();

  constructor() {
    logger.info('WebSocketManager initialized');
  }

  public getLastPrice(tokenAddress: string): string | null {
    return this.lastPrices.get(tokenAddress.toLowerCase()) || null;
  }

  public setPrice(tokenAddress: string, price: string): void {
    this.lastPrices.set(tokenAddress.toLowerCase(), price);
  }
}
