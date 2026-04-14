// src/services/PriceConsensus.ts
import axios from 'axios';
import BigNumber from 'bignumber.js';
import { PriceConfidence } from '../types.js';
import { config, CHAINLINK_RPCS } from '../config.js';
import { logger } from '../utils/logger.js';
const WEIGHTS = { okx: 0.5, chainlink: 0.3, binance: 0.2 };
export class PriceConsensus {
    cache = new Map();
    wsManager;
    constructor(wsManager) {
        this.wsManager = wsManager;
    }
    async getPrice(chain, tokenAddress) {
        const cacheKey = `${chain}:${tokenAddress.toLowerCase()}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt)
            return cached.consensus;
        const [okxPrice, chainlinkPrice, binancePrice] = await Promise.allSettled([
            this.getOkxPrice(chain, tokenAddress),
            this.getChainlinkPrice(chain, tokenAddress),
            this.getBinancePrice(tokenAddress),
        ]);
        const sources = [];
        if (okxPrice.status === 'fulfilled' && okxPrice.value) {
            sources.push({ price: new BigNumber(okxPrice.value), weight: WEIGHTS.okx });
        }
        if (chainlinkPrice.status === 'fulfilled' && chainlinkPrice.value) {
            sources.push({ price: new BigNumber(chainlinkPrice.value), weight: WEIGHTS.chainlink });
        }
        if (binancePrice.status === 'fulfilled' && binancePrice.value) {
            sources.push({ price: new BigNumber(binancePrice.value), weight: WEIGHTS.binance });
        }
        // Require at least 2 sources
        if (sources.length < 2) {
            logger.warn('Insufficient price sources', { chain, tokenAddress, count: sources.length });
            return null;
        }
        // Weighted mean (renormalise weights for available sources)
        const totalWeight = sources.reduce((s, x) => s + x.weight, 0);
        const weightedMean = sources
            .reduce((sum, { price, weight }) => sum.plus(price.multipliedBy(weight / totalWeight)), new BigNumber(0));
        const prices = sources.map(s => s.price);
        const max = BigNumber.max(...prices);
        const min = BigNumber.min(...prices);
        const variance = max.minus(min).dividedBy(weightedMean).toNumber();
        const confidence = variance < 0.01 ? PriceConfidence.HIGH :
            variance < 0.02 ? PriceConfidence.MEDIUM :
                PriceConfidence.LOW;
        const consensus = {
            price: weightedMean.toFixed(18),
            confidence,
            variance,
            sources: sources.length,
            timestamp: Date.now(),
        };
        this.cache.set(cacheKey, {
            consensus,
            expiresAt: Date.now() + config.PRICE_CACHE_TTL_MS,
        });
        return consensus;
    }
    async getOkxPrice(_chain, tokenAddress) {
        // First try WebSocket (real-time); fallback to REST
        const wsPrice = this.wsManager.getLastPrice(tokenAddress);
        if (wsPrice)
            return wsPrice;
        try {
            const { data } = await axios.get(`https://www.okx.com/api/v5/dex/aggregator/quote`, {
                params: {
                    chainId: '1',
                    fromTokenAddress: tokenAddress,
                    toTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                    amount: '1000000000000000000'
                },
                timeout: 3000
            });
            return data?.data?.[0]?.toTokenAmount ?? null;
        }
        catch {
            return null;
        }
    }
    async getChainlinkPrice(chain, tokenAddress) {
        const rpc = CHAINLINK_RPCS[chain];
        if (!rpc)
            return null; // gracefully skip — not configured
        try {
            // Logic for eth_call latestRoundData()...
            const { data } = await axios.post(rpc, {
                jsonrpc: '2.0', id: 1, method: 'eth_call',
                params: [{ to: tokenAddress, data: '0xfeaf968c' }, 'latest'],
            }, { timeout: 5000 });
            const raw = data?.result;
            if (!raw || raw === '0x')
                return null;
            const answer = BigInt('0x' + raw.slice(66, 130));
            return (Number(answer) / 1e8).toString();
        }
        catch {
            return null;
        }
    }
    async getBinancePrice(tokenAddress) {
        const symbolMap = {
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'ETHUSDT',
            '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'BTCUSDT',
        };
        const symbol = symbolMap[tokenAddress.toLowerCase()];
        if (!symbol)
            return null;
        try {
            const { data } = await axios.get(`${config.BINANCE_REST_URL}/api/v3/ticker/price`, { params: { symbol }, timeout: 3000 });
            return data?.price ?? null;
        }
        catch {
            return null;
        }
    }
}
