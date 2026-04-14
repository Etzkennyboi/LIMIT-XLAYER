# AGENT_INSTRUCTIONS.md - Mental Model for AI Agents

Welcome, Agent. If you are reading this, you are responsible for maintaining or operating the **Uniswap V4 Limit Order Skill**.

## 🧠 Mental Model
This is an **Intent-Based** system. 
- **Intents** are stored as JSON files in `~/.limit_orders/x_layer/`.
- **The Source of Truth** is the local file system, not the blockchain (until execution).
- **Execution** is "Just-In-Time"—the agent is the "executor" that bridges the gap between the stored intent and the live Uniswap swap.

## 🛠 Operation Protocol

### 1. Discovery
When you first start, run:
```bash
python scripts/doctor.py
```
This ensures the environment (X Layer RPC/MCP) is healthy.

### 2. Monitoring
The "Live" state of the system is managed by `monitor_orders.py`. 
- **Isolation**: Each order is handled in an isolated `try/except` block. If one fails (e.g., malformed JSON), do not stop the loop.
- **Polling**: Default is 30 seconds. In high volatility, reduce to 10 seconds.

### 3. Execution & Idempotency
- **Never swap without a quote**: Always run `quote_order.py` before `execute_order.py`.
- **Idempotency**: Check the `executionNonce` in the order JSON. If a nonce exists, it means a signature was previously attempted. Investigate the transaction hash before clearing the nonce.

## 📈 Math Context (Critical)
We use **Limit Order Logic** (Buy Low / Sell High):
- **Limit Sell (zero_for_one=True)**: Execute when `currentPrice >= targetPrice`.
- **Limit Buy (zero_for_one=False)**: Execute when `currentPrice <= targetPrice`.

## 🆘 Troubleshooting
- **"Pool Not Found"**: Token ordering might be wrong. Remember: Uniswap V4 addresses must be sorted.
- **"Price Out of Range"**: Check if the human price corresponds to the correct base/quote pair (usually USDT is the quote).
