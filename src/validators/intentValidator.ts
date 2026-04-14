// src/validators/intentValidator.ts
import BigNumber from 'bignumber.js';
import { CreateIntentParams, IntentType, SupportedChain } from '../types.js';
import { ConsensusPrice, PriceConfidence } from '../types.js';
import { LimitOrderError, Errors } from '../utils/errors.js';
import { config } from '../config.js';

export function validateIntentParams(
  params: CreateIntentParams,
  currentPrice: ConsensusPrice,
  walletBalance: string
): void {
  // 1. Amount
  const amount = new BigNumber(params.amount);
  if (amount.lte(0) || amount.gt(walletBalance)) {
    throw new LimitOrderError(Errors.INVALID_AMOUNT.code, Errors.INVALID_AMOUNT.message,
      { amount: params.amount, balance: walletBalance });
  }

  // 2. Chain
  if (!Object.values(SupportedChain).includes(params.chain)) {
    throw new LimitOrderError(Errors.UNSUPPORTED_CHAIN.code, Errors.UNSUPPORTED_CHAIN.message);
  }

  // 3. Slippage
  if (params.slippageBps < 10 || params.slippageBps > 5000) {
    throw new LimitOrderError(Errors.INVALID_SLIPPAGE.code, Errors.INVALID_SLIPPAGE.message);
  }

  // 4. Expiry
  if (params.expiresInHours < 1 || params.expiresInHours > 2160) {
    throw new LimitOrderError(Errors.INVALID_EXPIRY.code, Errors.INVALID_EXPIRY.message);
  }

  // 5. Price consensus quality
  if (currentPrice.confidence === PriceConfidence.LOW || currentPrice.sources < 2) {
    throw new LimitOrderError(Errors.LOW_CONFIDENCE_PRICE.code, Errors.LOW_CONFIDENCE_PRICE.message,
      { confidence: currentPrice.confidence, sources: currentPrice.sources });
  }

  // 6. Trigger price delta — with OCO carve-out
  const trigger = new BigNumber(params.triggerPrice);
  const current = new BigNumber(currentPrice.price);
  const deltaBps = trigger.minus(current).abs().dividedBy(current).multipliedBy(10000);

  if (params.type === IntentType.OCO && params.ocoConfig) {
    const tp = new BigNumber(params.ocoConfig.takeProfitPrice);
    const sl = new BigNumber(params.ocoConfig.stopLossPrice);
    
    if (tp.lte(current)) {
      throw new LimitOrderError(Errors.INVALID_OCO.code, 'OCO take-profit must be above current price');
    }
    if (sl.gte(current)) {
      throw new LimitOrderError(Errors.INVALID_OCO.code, 'OCO stop-loss must be below current price');
    }
    
    // Stop-loss: minimum 1% delta (not 10%) — OCO carve-out
    const slDelta = current.minus(sl).dividedBy(current).multipliedBy(10000);
    if (slDelta.lt(config.MIN_OCO_STOP_DELTA_BPS)) {
      throw new LimitOrderError(Errors.INVALID_OCO.code,
        `OCO stop-loss must be at least ${config.MIN_OCO_STOP_DELTA_BPS / 100}% below current price`);
    }
  } else {
    // Standard intents: minimum 10% delta
    if (deltaBps.lt(config.MIN_TRIGGER_DELTA_BPS)) {
      throw new LimitOrderError(Errors.INVALID_TRIGGER.code, Errors.INVALID_TRIGGER.message,
        { deltaBps: deltaBps.toFixed(2), required: String(config.MIN_TRIGGER_DELTA_BPS) });
    }
  }
}
