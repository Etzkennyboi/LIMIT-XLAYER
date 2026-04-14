---
name: uniswap-v4-limit-order
version: 1.0.0
description: Trustless limit orders using live X Layer Uniswap V4. 
  Off-chain intent storage with on-chain execution via official 
  Uniswap skills and TEE wallet signing. No custom hooks.
author: Emmanuel
tools: [Read, Bash, Python]
dependencies:
  - uniswap-pool-data
  - uniswap-quote
  - uniswap-swap
  - okx-agentic-wallet
---

# Uniswap V4 Limit Order Skill (X Layer)

This skill enables users to place trustless limit orders on X Layer Uniswap V4 without requiring custom hook deployment. It stores "intents" locally as JSON and monitors the market to execute swaps atomically when price targets are hit.

## When to Use
- **Limit Buy**: "Buy ETH when it drops to $2800"
- **Limit Sell**: "Sell ETH when it hits $3500"
- **Automation**: Building DCA or grid trading loops.

## Core Operations

| Operation | Script | Description |
|-----------|-------------------|---------------------------------------|
| **place** | `place_order.py` | Create a new limit order intent |
| **list** | `list_orders.py` | View all active/past intents |
| **monitor**| `monitor_orders.py` | Polling loop for auto-execution |
| **execute**| `execute_order.py` | Manual execution of a PENDING order |
| **cancel** | `cancel_order.py` | Delete an intent (tokens never locked)|
| **quote** | `quote_order.py` | Check distance and expected output |

## Quick Start

### 1. Verification (Plumbing)
Ensure you can reach the X Layer pools:
```bash
python scripts/test_plumbing.py
```

### 2. Place a Limit Buy (Price Drop)
Example: Buy ETH (currency0) with USDT (currency1) if price drops 5%:
```bash
# zero_for_one = False means Selling currency1 (USDT)
python scripts/place_order.py \
  --pool-key '{"currency0":"0x5A77...","currency1":"0x1e4a...","fee":3000}' \
  --amount-in 1000000000 \
  --target-offset 0.05
```

### 3. Start Monitoring
Keep the monitor running to auto-execute when targets are hit:
```bash
python scripts/monitor_orders.py --poll-interval 30 --auto-execute
```

## Safety Features
- **Idempotency Guard**: Uses an `executionNonce` to prevent double-swaps.
- **Error Isolation**: One failing order won't crash the monitor loop for others.
- **No-Hook Architecture**: Tokens stay in your TEE wallet until the moment of execution.
