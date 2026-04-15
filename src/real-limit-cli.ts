#!/usr/bin/env node
/**
 * REAL On-Chain Limit Order CLI - Uses OKX DEX swap when triggered
 * 
 * This version actually executes swaps via OKX DEX when price hits target
 */

import axios from 'axios';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), '.real-orders.json');

// Token mapping for OKX CLI
const TOKEN_SYMBOLS: Record<string, string> = {
  'okb': 'okb',
  'usdt': 'usdt',
  'usdc': 'usdc',
  'eth': 'eth',
  'wbtc': 'wbtc',
  'btc': 'wbtc',
};

const CHAIN_IDS: Record<string, string> = {
  'xlayer': '196',
  'ethereum': '1',
  'eth': '1',
  'arbitrum': '42161',
  'arb': '42161',
  'optimism': '10',
  'op': '10',
  'polygon': '137',
  'matic': '137',
  'bsc': '56',
  'base': '8453',
};

interface Order {
  id: string;
  type: 'BUY' | 'SELL';
  fromToken: string;
  toToken: string;
  spendAmount: number;
  targetPrice: number;
  chain: string;
  wallet: string;
  status: 'ACTIVE' | 'TRIGGERED' | 'EXECUTING' | 'FILLED' | 'FAILED' | 'CANCELLED';
  txHash?: string;
  createdAt: Date;
  executedAt?: Date;
}

// Load/save orders
function loadOrders(): Map<string, Order> {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(rawData) as Record<string, Order>;
      const map = new Map<string, Order>();
      for (const [id, orderData] of Object.entries(data)) {
        const order = orderData;
        map.set(id, {
          ...order,
          createdAt: new Date(order.createdAt),
          executedAt: order.executedAt ? new Date(order.executedAt) : undefined,
        });
      }
      return map;
    }
  } catch (e) {}
  return new Map();
}

function saveOrders(orders: Map<string, Order>) {
  const data: Record<string, Order> = {};
  for (const [id, order] of orders) {
    data[id] = order;
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const orders = loadOrders();

// Fetch OKB price
async function fetchOKBPrice(): Promise<number> {
  try {
    const response = await axios.get(
      'https://www.okx.com/api/v5/market/ticker?instId=OKB-USDT',
      { timeout: 5000 }
    );
    if (response.data?.data?.[0]?.last) {
      return parseFloat(response.data.data[0].last);
    }
  } catch (e) {}
  return 85.15; // fallback
}

// Execute OKX swap
async function executeSwap(
  fromToken: string,
  toToken: string,
  amount: string,
  chain: string,
  wallet: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  return new Promise((resolve) => {
    console.log(`\n🚀 Executing swap: ${amount} ${fromToken} → ${toToken} on chain ${chain}`);
    console.log(`   Wallet: ${wallet}`);
    
    const proc = spawn('onchainos', [
      'swap', 'execute',
      '--from', fromToken,
      '--to', toToken,
      '--readable-amount', amount,
      '--chain', chain,
      '--wallet', wallet,
    ], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => stdout += data.toString());
    proc.stderr.on('data', (data) => stderr += data.toString());

    proc.on('close', (code) => {
      console.log('\n📤 Command output:', stdout);
      if (stderr) console.log('⚠️  Errors:', stderr);
      
      if (code === 0) {
        // Extract txHash from output
        const txMatch = stdout.match(/swapTxHash["']?\s*[:\[]?\s*["']?([a-f0-9x]+)/i);
        const txHash = txMatch?.[1];
        
        if (txHash) {
          resolve({ success: true, txHash });
        } else {
          resolve({ success: false, error: 'Could not extract txHash from output' });
        }
      } else {
        resolve({ success: false, error: stderr || stdout || `Exit code ${code}` });
      }
    });

    proc.on('error', (err) => resolve({ success: false, error: err.message }));
    setTimeout(() => { proc.kill(); resolve({ success: false, error: 'Timeout' }); }, 120000);
  });
}

// Parse command
function parseCommand(input: string): any {
  const lower = input.toLowerCase().trim();
  
  // Pattern: "0.05 usdt buy of okb at 84 on xlayer"
  const match = lower.match(
    /(\d+\.?\d*)\s*(usdt|usdc)\s*buy\s+of\s+(okb|eth|btc)\s+at\s+\$?(\d+\.?\d*)\s+on\s+(xlayer|ethereum|arbitrum|optimism|polygon|base|bsc)/
  );
  
  if (match) {
    return {
      action: 'create_real_limit_buy',
      spendAmount: parseFloat(match[1]),
      spendToken: match[2],
      buyToken: match[3],
      targetPrice: parseFloat(match[4]),
      chain: match[5],
    };
  }
  
  // Pattern: "list orders"
  if (lower.includes('list') && lower.includes('order')) {
    return { action: 'list' };
  }
  
  // Pattern: "cancel order [id]"
  const cancelMatch = lower.match(/cancel\s+(?:order\s+)?([a-z0-9-]+)/);
  if (cancelMatch) {
    return { action: 'cancel', orderId: cancelMatch[1] };
  }
  
  // Pattern: "check order [id]"
  const checkMatch = lower.match(/check\s+(?:order\s+)?([a-z0-9-]+)/);
  if (checkMatch) {
    return { action: 'check', orderId: checkMatch[1] };
  }
  
  return null;
}

// Create order
async function createOrder(params: any, wallet: string): Promise<Order> {
  const order: Order = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    type: 'BUY',
    fromToken: params.spendToken,
    toToken: params.buyToken,
    spendAmount: params.spendAmount,
    targetPrice: params.targetPrice,
    chain: params.chain,
    wallet,
    status: 'ACTIVE',
    createdAt: new Date(),
  };
  
  orders.set(order.id, order);
  saveOrders(orders);
  
  // Check if should execute immediately
  const currentPrice = await fetchOKBPrice();
  if (currentPrice <= order.targetPrice) {
    console.log(`\n⚡ Price already at target! Executing immediately...`);
    await executeOrder(order);
  } else {
    console.log(`\n⏳ Price monitoring started...`);
    console.log(`   Current: $${currentPrice.toFixed(4)} | Target: $${order.targetPrice}`);
    console.log(`   Will execute when price drops ${((currentPrice - order.targetPrice) / currentPrice * 100).toFixed(2)}%`);
    
    // Start monitoring (in real implementation, this would be a background worker)
    startMonitoring(order.id);
  }
  
  return order;
}

// Execute order
async function executeOrder(order: Order): Promise<void> {
  order.status = 'EXECUTING';
  saveOrders(orders);
  
  const fromTokenSymbol = TOKEN_SYMBOLS[order.fromToken];
  const toTokenSymbol = TOKEN_SYMBOLS[order.toToken];
  const chainId = CHAIN_IDS[order.chain];
  
  const result = await executeSwap(
    fromTokenSymbol,
    toTokenSymbol,
    order.spendAmount.toString(),
    chainId,
    order.wallet
  );
  
  if (result.success) {
    order.status = 'FILLED';
    order.txHash = result.txHash;
    order.executedAt = new Date();
    console.log(`\n✅ Order executed! TX: ${result.txHash}`);
  } else {
    order.status = 'FAILED';
    console.log(`\n❌ Execution failed: ${result.error}`);
  }
  
  saveOrders(orders);
}

// Simple monitoring loop
async function startMonitoring(orderId: string) {
  const order = orders.get(orderId);
  if (!order || order.status !== 'ACTIVE') return;
  
  console.log(`\n🔍 Monitoring order #${orderId}... (Press Ctrl+C to stop)`);
  
  const interval = setInterval(async () => {
    const currentPrice = await fetchOKBPrice();
    const order = orders.get(orderId);
    
    if (!order || order.status !== 'ACTIVE') {
      clearInterval(interval);
      return;
    }
    
    console.log(`[${new Date().toLocaleTimeString()}] Price: $${currentPrice.toFixed(4)} | Target: $${order.targetPrice}`);
    
    if (currentPrice <= order.targetPrice) {
      console.log(`\n🎯 Target price hit! Executing order...`);
      clearInterval(interval);
      await executeOrder(order);
    }
  }, 5000); // Check every 5 seconds
}

// Main
async function main() {
  const input = process.argv.slice(2).join(' ');
  
  if (!input) {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║     REAL On-Chain Limit Order CLI - OKX DEX                   ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Usage:                                                          ║
║  • "0.05 usdt buy of okb at 84 on xlayer"                       ║
║  • "0.1 usdc buy of eth at 2300 on ethereum"                    ║
║  • "list orders"                                                 ║
║  • "cancel order abc123"                                        ║
║  • "check order abc123"                                         ║
║                                                                  ║
║  Supported chains: xlayer, ethereum, arbitrum, optimism,         ║
║                    polygon, base, bsc                          ║
║                                                                  ║
║  Requirements:                                                   ║
║  • Must be logged in: onchainos wallet login                    ║
║  • Must have sufficient balance for the trade                   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
    `);
    process.exit(0);
  }
  
  console.log(`\n🤖 Parsing: "${input}"\n`);
  
  const parsed = parseCommand(input);
  if (!parsed) {
    console.log('❌ Could not understand command. Try:"0.05 usdt buy of okb at 84 on xlayer"');
    process.exit(1);
  }
  
  // Get wallet address
  const wallet = process.env.WALLET_ADDRESS || '0x1ef1034e7cd690b40a329bd64209ce563f95bb5c';
  
  try {
    switch (parsed.action) {
      case 'create_real_limit_buy': {
        const order = await createOrder(parsed, wallet);
        console.log('\n' + '='.repeat(60));
        console.log('✅ REAL Limit Order Created');
        console.log('='.repeat(60));
        console.log(`Order ID: ${order.id}`);
        console.log(`Type: BUY ${order.toToken.toUpperCase()}`);
        console.log(`Spending: ${order.spendAmount} ${order.fromToken.toUpperCase()}`);
        console.log(`Target Price: $${order.targetPrice}`);
        console.log(`Chain: ${order.chain}`);
        console.log(`Wallet: ${order.wallet}`);
        console.log(`Status: ${order.status}`);
        console.log('='.repeat(60));
        
        if (order.status === 'ACTIVE') {
          console.log('\n💡 This order will execute automatically when price hits target.');
          console.log('   Keep this terminal open or run "npm run monitor" in another window.');
        }
        break;
      }
      
      case 'list': {
        const allOrders = Array.from(orders.values());
        if (allOrders.length === 0) {
          console.log('📭 No orders found');
        } else {
          console.log(`📋 Found ${allOrders.length} order(s):\n`);
          allOrders.forEach(o => {
            const emoji = { ACTIVE: '⏳', TRIGGERED: '🔔', EXECUTING: '⚙️', FILLED: '✅', FAILED: '❌', CANCELLED: '🚫' }[o.status];
            console.log(`${emoji} Order #${o.id}`);
            console.log(`   ${o.type} ${o.toToken.toUpperCase()} | Spend: ${o.spendAmount} ${o.fromToken.toUpperCase()}`);
            console.log(`   Target: $${o.targetPrice} | Chain: ${o.chain}`);
            console.log(`   Status: ${o.status}${o.txHash ? ' | TX: ' + o.txHash : ''}`);
            console.log('');
          });
        }
        break;
      }
      
      case 'cancel': {
        const order = orders.get(parsed.orderId);
        if (order && order.status === 'ACTIVE') {
          order.status = 'CANCELLED';
          saveOrders(orders);
          console.log(`✅ Order ${parsed.orderId} cancelled`);
        } else {
          console.log(`❌ Order ${parsed.orderId} not found or not active`);
        }
        break;
      }
      
      case 'check': {
        const order = orders.get(parsed.orderId);
        if (order) {
          console.log(`\n📊 Order #${order.id}`);
          console.log(`   Status: ${order.status}`);
          console.log(`   Type: ${order.type} ${order.toToken.toUpperCase()}`);
          console.log(`   Spending: ${order.spendAmount} ${order.fromToken.toUpperCase()}`);
          console.log(`   Target: $${order.targetPrice} | Current: $${(await fetchOKBPrice()).toFixed(4)}`);
          if (order.txHash) console.log(`   TX Hash: ${order.txHash}`);
        } else {
          console.log(`❌ Order not found`);
        }
        break;
      }
    }
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
    process.exit(1);
  }
  
  console.log('');
}

main().catch(console.error);
