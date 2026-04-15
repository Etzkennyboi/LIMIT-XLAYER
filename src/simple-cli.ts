#!/usr/bin/env node
/**
 * Simple Limit Order CLI - OKX DEX
 * 
 * Usage:
 *   npx ts-node src/simple-cli.ts "set a limit buy 1$ of okb at 80$"
 *   npx ts-node src/simple-cli.ts "buy 100 okb when price is below 80"
 *   npx ts-node src/simple-cli.ts "limit sell 50 okb at 100$"
 *   npx ts-node src/simple-cli.ts "cancel order abc123"
 *   npx ts-node src/simple-cli.ts "list orders"
 * 
 * No Redis, no workers - just simple limit orders!
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// File-based storage (no Redis needed!)
const DATA_FILE = path.join(process.cwd(), '.limit-orders.json');
const TOKEN_PRICES = new Map();

function loadOrders(): Map<string, Order> {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      const map = new Map<string, Order>();
      for (const [id, order] of Object.entries(data)) {
        map.set(id, {
          ...order as Order,
          createdAt: new Date((order as Order).createdAt),
          expiresAt: new Date((order as Order).expiresAt),
          lastChecked: (order as Order).lastChecked ? new Date((order as Order).lastChecked!) : undefined,
        });
      }
      return map;
    }
  } catch (e) {
    console.error('Failed to load orders:', e);
  }
  return new Map();
}

function saveOrders(orders: Map<string, Order>) {
  const data: Record<string, any> = {};
  for (const [id, order] of orders) {
    data[id] = order;
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const orders = loadOrders();

// OKB token address on XLayer (mainnet)
const TOKENS: Record<string, { address: string; symbol: string; decimals: number }> = {
  'okb': { address: '0x18b9f5c4d21d86f3d09de7f5a195eddf7c8a5d9e', symbol: 'OKB', decimals: 18 },
  'usdc': { address: '0x74b7f16337b389202cb093102821bbedc16bb3d0', symbol: 'USDC', decimals: 6 },
  'usdt': { address: '0xef04fe30834c5f2837580c5a900e7c0992a8e0fd', symbol: 'USDT', decimals: 6 },
  'eth': { address: '0x5a77c83bad877c6d98fa3ce160ec7c2823a8f012', symbol: 'ETH', decimals: 18 },
  'btc': { address: '0xb12c5bfd15d2c35e38d024b05ad3b271d726f43f', symbol: 'BTC', decimals: 18 },
};

interface Order {
  id: string;
  type: 'BUY' | 'SELL';
  token: string;
  amount: number;
  amountCurrency: 'USD' | 'TOKEN';
  targetPrice: number;
  status: 'ACTIVE' | 'TRIGGERED' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
  createdAt: Date;
  expiresAt: Date;
  currentPrice?: number;
  lastChecked?: Date;
}

// =====================
// Price Fetching
// =====================

async function fetchPrice(symbol: string): Promise<number | null> {
  try {
    // Try OKX API
    const response = await axios.get(
      `https://www.okx.com/api/v5/market/ticker?instId=${symbol.toUpperCase()}-USDT`,
      { timeout: 5000 }
    );
    
    if (response.data?.data?.[0]?.last) {
      return parseFloat(response.data.data[0].last);
    }
    
    // Fallback: check if we have a mock price
    if (TOKEN_PRICES.has(symbol.toLowerCase())) {
      return TOKEN_PRICES.get(symbol.toLowerCase())!;
    }
    
    return null;
  } catch (error) {
    // Fallback: return mock price for demo
    const mockPrices: Record<string, number> = {
      'okb': 85.50,
      'eth': 3450.00,
      'btc': 87500.00,
      'usdc': 1.00,
      'usdt': 1.00,
    };
    return mockPrices[symbol.toLowerCase()] || null;
  }
}

// =====================
// Order Parsing
// =====================

function parseCommand(input: string): { action: string; params: any } | null {
  const lower = input.toLowerCase().trim();
  
  // Pattern 1: "set a limit buy $X of TOKEN at $Y"
  // Pattern 2: "buy $X TOKEN when price is below $Y"
  // Pattern 3: "limit sell X TOKEN at $Y"
  // Pattern 4: "cancel order [id]"
  // Pattern 5: "list orders"
  
  // BUY orders
  const buyPatterns = [
    // "set a limit buy 1$ of okb at 80$"
    /set\s+a?\s*limit\s+buy\s+\$?(\d+(?:\.\d+)?)\s*(?:\$)?\s+of\s+(\w+)\s+at\s+\$?(\d+(?:\.\d+)?)/,
    // "buy $100 of okb at 80"
    /buy\s+\$?(\d+(?:\.\d+)?)\s*(?:\$)?\s+of\s+(\w+)\s+(?:at|when price is|when)\s+\$?(\d+(?:\.\d+)?)/,
    // "limit buy 1 okb at 80"
    /limit\s+buy\s+(\d+(?:\.\d+)?)\s+(\w+)\s+at\s+\$?(\d+(?:\.\d+)?)/,
  ];
  
  for (const pattern of buyPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const amount = parseFloat(match[1]);
      const token = match[2].toLowerCase();
      const price = parseFloat(match[3]);
      return {
        action: 'create_buy',
        params: { amount, token, price, amountIsUsd: lower.includes('$') || input.includes('$') }
      };
    }
  }
  
  // SELL orders
  const sellPatterns = [
    // "set a limit sell 1$ of okb at 80$"
    /set\s+a?\s*limit\s+sell\s+\$?(\d+(?:\.\d+)?)\s*(?:\$)?\s+of\s+(\w+)\s+at\s+\$?(\d+(?:\.\d+)?)/,
    // "sell $100 of okb at 80"
    /sell\s+\$?(\d+(?:\.\d+)?)\s*(?:\$)?\s+of\s+(\w+)\s+(?:at|when price is|when)\s+\$?(\d+(?:\.\d+)?)/,
    // "limit sell 1 okb at 80"
    /limit\s+sell\s+(\d+(?:\.\d+)?)\s+(\w+)\s+at\s+\$?(\d+(?:\.\d+)?)/,
  ];
  
  for (const pattern of sellPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const amount = parseFloat(match[1]);
      const token = match[2].toLowerCase();
      const price = parseFloat(match[3]);
      return {
        action: 'create_sell',
        params: { amount, token, price, amountIsUsd: lower.includes('$') || input.includes('$') }
      };
    }
  }
  
  // Cancel order
  if (lower.includes('cancel')) {
    const idMatch = lower.match(/cancel\s+(?:order\s+)?([a-z0-9-]+)/);
    if (idMatch) {
      return { action: 'cancel', params: { orderId: idMatch[1] } };
    }
  }
  
  // List orders
  if (lower.includes('list') && (lower.includes('order') || lower.includes('orders'))) {
    return { action: 'list', params: {} };
  }
  
  // Check order
  if (lower.includes('check') || lower.includes('status')) {
    const idMatch = lower.match(/(?:check|status)\s+(?:order\s+)?([a-z0-9-]+)/);
    if (idMatch) {
      return { action: 'check', params: { orderId: idMatch[1] } };
    }
  }
  
  return null;
}

// =====================
// Order Management
// =====================

async function createOrder(
  type: 'BUY' | 'SELL',
  token: string,
  amount: number,
  targetPrice: number,
  amountIsUsd: boolean
): Promise<Order> {
  if (!TOKENS[token]) {
    throw new Error(`Unknown token: ${token}. Supported: ${Object.keys(TOKENS).join(', ')}`);
  }
  
  const currentPrice = await fetchPrice(token);
  if (!currentPrice) {
    throw new Error(`Unable to fetch price for ${token}`);
  }
  
  const order: Order = {
    id: uuidv4().split('-')[0], // Short ID
    type,
    token,
    amount,
    amountCurrency: amountIsUsd ? 'USD' : 'TOKEN',
    targetPrice,
    status: 'ACTIVE',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    currentPrice,
    lastChecked: new Date(),
  };
  
  orders.set(order.id, order);
  saveOrders(orders);
  
  // Check if order should trigger immediately
  const shouldTrigger = type === 'BUY' 
    ? currentPrice <= targetPrice
    : currentPrice >= targetPrice;
  
  if (shouldTrigger) {
    order.status = 'TRIGGERED';
    saveOrders(orders);
  }
  
  return order;
}

function cancelOrder(orderId: string): boolean {
  const order = orders.get(orderId);
  if (!order) return false;
  if (order.status === 'FILLED' || order.status === 'CANCELLED') return false;

  order.status = 'CANCELLED';
  saveOrders(orders);
  return true;
}

function getOrder(orderId: string): Order | undefined {
  return orders.get(orderId);
}

function listOrders(): Order[] {
  return Array.from(orders.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// =====================
// Display Functions
// =====================

function formatOrder(order: Order): string {
  const amountStr = order.amountCurrency === 'USD' 
    ? `$${order.amount.toFixed(2)}` 
    : `${order.amount} ${order.token.toUpperCase()}`;
  
  const statusEmoji = {
    'ACTIVE': '⏳',
    'TRIGGERED': '🔔',
    'FILLED': '✅',
    'CANCELLED': '❌',
    'EXPIRED': '⏰',
  }[order.status];
  
  let lines = [
    `${statusEmoji} Order #${order.id}`,
    `   Type: ${order.type} ${order.token.toUpperCase()}`,
    `   Amount: ${amountStr}`,
    `   Target: $${order.targetPrice.toFixed(4)}`,
    `   Current: $${order.currentPrice?.toFixed(4) || 'N/A'}`,
    `   Status: ${order.status}`,
    `   Created: ${order.createdAt.toLocaleString()}`,
  ];
  
  return lines.join('\n');
}

// =====================
// Main CLI
// =====================

async function main() {
  const input = process.argv.slice(2).join(' ');
  
  if (!input) {
    console.log(`
╔════════════════════════════════════════════════════════╗
║     OKX DEX Simple Limit Order - AI Ready            ║
╠════════════════════════════════════════════════════════╣
║                                                        ║
║  Examples:                                             ║
║  • Set a limit buy 1$ of okb at 80$                    ║
║  • Buy 100 okb when price is below 80                  ║
║  • Limit sell 50 okb at 100$                           ║
║  • Sell $500 of eth at 3500                            ║
║  • List orders                                         ║
║  • Cancel order abc123                                 ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
    `);
    process.exit(0);
  }
  
  console.log(`\n🤖 Parsing: "${input}"\n`);
  
  const parsed = parseCommand(input);
  
  if (!parsed) {
    console.log('❌ Could not understand command. Try:');
    console.log('   • "set a limit buy 1$ of okb at 80$"');
    console.log('   • "limit sell 50 okb at 100$"');
    console.log('   • "list orders"');
    process.exit(1);
  }
  
  try {
    switch (parsed.action) {
      case 'create_buy': {
        const { amount, token, price, amountIsUsd } = parsed.params;
        const order = await createOrder('BUY', token, amount, price, amountIsUsd);
        
        console.log('✅ Limit Buy Order Created!\n');
        console.log(formatOrder(order));
        console.log('\n📌 Use this ID to cancel: ' + order.id);
        
        if (order.status === 'TRIGGERED') {
          console.log('\n⚡ Order would trigger immediately (price already at target)!');
        } else {
          const currentPrice = order.currentPrice!;
          const diff = ((price - currentPrice) / currentPrice * 100).toFixed(2);
          console.log(`\n⏳ Waiting for price to drop ${diff}% to trigger...`);
        }
        break;
      }
      
      case 'create_sell': {
        const { amount, token, price, amountIsUsd } = parsed.params;
        const order = await createOrder('SELL', token, amount, price, amountIsUsd);
        
        console.log('✅ Limit Sell Order Created!\n');
        console.log(formatOrder(order));
        console.log('\n📌 Use this ID to cancel: ' + order.id);
        
        if (order.status === 'TRIGGERED') {
          console.log('\n⚡ Order would trigger immediately (price already at target)!');
        } else {
          const currentPrice = order.currentPrice!;
          const diff = ((currentPrice - price) / currentPrice * 100).toFixed(2);
          console.log(`\n⏳ Waiting for price to rise ${diff}% to trigger...`);
        }
        break;
      }
      
      case 'cancel': {
        const { orderId } = parsed.params;
        const success = cancelOrder(orderId);
        if (success) {
          console.log(`✅ Order ${orderId} cancelled successfully`);
        } else {
          console.log(`❌ Order ${orderId} not found or already filled/cancelled`);
        }
        break;
      }
      
      case 'list': {
        const allOrders = listOrders();
        if (allOrders.length === 0) {
          console.log('📭 No orders found');
        } else {
          console.log(`📋 Found ${allOrders.length} order(s):\n`);
          allOrders.forEach(order => {
            console.log(formatOrder(order));
            console.log('');
          });
        }
        break;
      }
      
      case 'check': {
        const { orderId } = parsed.params;
        const order = getOrder(orderId);
        if (order) {
          console.log(formatOrder(order));
        } else {
          console.log(`❌ Order ${orderId} not found`);
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
