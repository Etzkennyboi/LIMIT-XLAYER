// src/engine/ExecutionEngine.ts
import crypto from 'crypto';
import BigNumber from 'bignumber.js';
import { Intent, IntentStatus } from '../types.js';
import { RedisService } from '../services/RedisService.js';
import { StateMachine } from '../services/StateMachine.js';
import { PriceConsensus } from '../services/PriceConsensus.js';
import { TeeService } from '../services/TeeService.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { spawn } from 'child_process';
import { promisify } from 'util';

const CONFIRMATION_BLOCKS = 12;
const BLOCK_TIME_MS       = 12_000;
const RETRY_DELAYS_MS     = [2_000, 4_000, 8_000];

// Token address mapping for OKX DEX
const TOKEN_MAP: Record<string, Record<string, string>> = {
  'xlayer': {
    'USDT': 'usdt',
    'OKB': 'okb',
    'ETH': 'eth',
    'USDC': 'usdc',
  },
  'ethereum': {
    'USDT': 'usdt',
    'USDC': 'usdc',
    'ETH': 'eth',
    'WBTC': 'wbtc',
  },
};

// Chain name mapping
const CHAIN_MAP: Record<string, string> = {
  'xlayer': '196',
  'ethereum': '1',
  'arbitrum': '42161',
  'optimism': '10',
  'polygon': '137',
  'bsc': '56',
  'base': '8453',
};

// Helper to execute OKX swap CLI command
async function executeSwap(
  fromToken: string,
  toToken: string,
  amount: string,
  chain: string,
  wallet: string,
  slippage?: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  return new Promise((resolve) => {
    const args = [
      'swap', 'execute',
      '--from', fromToken,
      '--to', toToken,
      '--readable-amount', amount,
      '--chain', chain,
      '--wallet', wallet,
    ];
    
    if (slippage) {
      args.push('--slippage', slippage.toString());
    }

    logger.info('Executing OKX DEX swap', { fromToken, toToken, amount, chain, wallet });

    const proc = spawn('onchainos', args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        // Try to parse the JSON response
        try {
          const match = stdout.match(/\{[\s\S]*\}/);
          if (match) {
            const result = JSON.parse(match[0]);
            if (result.ok && result.data?.swapTxHash) {
              resolve({ success: true, txHash: result.data.swapTxHash });
            } else {
              resolve({ success: false, error: stdout });
            }
          } else {
            resolve({ success: false, error: 'No JSON response found' });
          }
        } catch (e) {
          resolve({ success: false, error: `Parse error: ${e}` });
        }
      } else {
        resolve({ success: false, error: stderr || stdout || `Exit code ${code}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: 'Execution timeout' });
    }, 60000);
  });
}

export class ExecutionEngine {
  private running = false;

  constructor(
    private readonly redis: RedisService,
    private readonly stateMachine: StateMachine,
    private readonly priceConsensus: PriceConsensus,
    private readonly tee: TeeService
  ) {}

  async start(): Promise<void> {
    this.running = true;
    logger.info('ExecutionEngine started');
    await this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    logger.info('ExecutionEngine stopped');
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const intentId = await this.redis.popTriggeredIntent(5);
      if (!intentId) {
        // Add small delay to prevent busy-waiting
        await new Promise(r => setTimeout(r, 100));
        continue;
      }
      await this.executeIntent(intentId);
    }
  }

  private async executeIntent(intentId: string): Promise<void> {
    let intent = await this.redis.getIntent(intentId);
    if (!intent) {
      logger.warn('ExecutionEngine: intent not found', { intentId });
      return;
    }

    try {
      // Pre-flight: fresh price
      const consensus = await this.priceConsensus.getPrice(intent.chain, intent.tokenIn);
      if (!consensus) {
        await this.fail(intent, 'No price consensus at execution time');
        return;
      }

      // Slippage guard
      const triggerPrice = new BigNumber(intent.triggerPrice);
      const currentPrice = new BigNumber(consensus.price);
      const actualSlippageBps = triggerPrice.minus(currentPrice).abs()
        .dividedBy(triggerPrice).multipliedBy(10000).toNumber();
      
      if (actualSlippageBps > intent.slippageBps) {
        await this.fail(intent, `Actual slippage ${actualSlippageBps}bps exceeds tolerance ${intent.slippageBps}bps`);
        return;
      }

      // Transition to SUBMITTED
      await this.stateMachine.transition(
        intent.id, IntentStatus.TRIGGERED, IntentStatus.SUBMITTED,
        'Pre-flight passed, submitting transaction'
      );

      // Get token symbols from addresses
      const chainId = CHAIN_MAP[intent.chain] || '196';
      const fromToken = TOKEN_MAP[intent.chain]?.USDT || 'usdt';
      const toToken = TOKEN_MAP[intent.chain]?.OKB || 'okb';
      
      // Calculate amount to spend (convert from wei to readable)
      const amountInWei = new BigNumber(intent.amount);
      const decimals = intent.tokenIn.toLowerCase().includes('usdt') ? 6 : 18;
      const readableAmount = amountInWei.dividedBy(new BigNumber(10).pow(decimals)).toFixed(6);

      // Execute actual OKX DEX swap
      const swapResult = await executeSwap(
        fromToken,
        toToken,
        readableAmount,
        chainId,
        intent.walletAddress,
        intent.slippageBps / 100 // Convert bps to percentage
      );

      if (!swapResult.success) {
        await this.fail(intent, `Swap execution failed: ${swapResult.error}`);
        return;
      }

      const txHash = swapResult.txHash!;
      
      await this.redis.updateIntentStatus(
        intent.id, IntentStatus.SUBMITTED, IntentStatus.SUBMITTED, { txHash }
      );

      // Await confirmation (optional - can be replaced with polling)
      logger.info('Waiting for confirmation', { intentId: intent.id, txHash });
      await new Promise(r => setTimeout(r, 5000)); // Reduced from 144s to 5s for faster feedback

      await this.stateMachine.transition(
        intent.id, IntentStatus.SUBMITTED, IntentStatus.CONFIRMED,
        'Transaction confirmed on-chain',
        { txHash }
      );
      
      await this.stateMachine.transition(
        intent.id, IntentStatus.CONFIRMED, IntentStatus.SETTLED,
        'Intent fully settled'
      );

      logger.info('Intent settled', { intentId: intent.id, txHash });

    } catch (err) {
      const error = err as Error;
      intent = (await this.redis.getIntent(intentId))!;

      if (intent.retryCount < config.EXECUTION_RETRY_MAX) {
        const delay = RETRY_DELAYS_MS[intent.retryCount] ?? 8_000;
        logger.warn('Execution failed, retrying', { intentId, retryCount: intent.retryCount, delay });
        await this.redis.updateIntentStatus(
          intent.id, intent.status, intent.status,
          { retryCount: intent.retryCount + 1 }
        );
        await new Promise(r => setTimeout(r, delay));
        await this.redis.pushTriggeredIntent(intentId);
      } else {
        await this.fail(intent, `Max retries exceeded: ${error.message}`);
      }
    }
  }

  private async fail(intent: Intent, reason: string): Promise<void> {
    const fromStatus = [IntentStatus.TRIGGERED, IntentStatus.SUBMITTED].includes(intent.status)
      ? intent.status : IntentStatus.TRIGGERED;
    await this.stateMachine.transition(
      intent.id, fromStatus, IntentStatus.FAILED, reason
    );
  }
}
