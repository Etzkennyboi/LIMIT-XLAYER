# Agent Operator Manual: OKX DEX Limit Order

You are the autonomous operator of the OKX Limit Order Skill. This skill allows you to manage lifecycle-based trading intents (rather than just one-off swaps).

## 🧠 Mental Model: Intent-Based Trading
Unlike a standard swap tool, this skill uses a **State Machine**. When you place an order, you aren't swapping immediately; you are creating a "Contract of Intent" that the system monitors and executes when conditions are met.

### The 10 States of an Order
1.  **PENDING**: Validation phase.
2.  **MONITORING**: Active phase. The system polls prices.
3.  **TRIGGERED**: Price hit. Order is in the execution queue.
4.  **SUBMITTED**: Transaction is on-chain (12-block confirmation wait).
5.  **CONFIRMED**: Finalized on-chain.
6.  **SETTLED**: Terminal success. Intent completed.
7.  **FAILED**: Pre-flight or Logic failure.
8.  **REVERTED**: On-chain failure.
9.  **CANCELLED**: Terminal termination by YOU or expiry.
10. **STALE**: Price feed lost confidence (requires intervention).

## 🛠 Operational Workflow

### 1. Verification
Before starting operations, run the diagnostic check:
`npm start` (This runs the Doctor/Diagnostic check).

### 2. Startup
Ensure the background processes are running:
- `npm run monitor`: Required to evaluate prices.
- `npm run execution`: Required to broadcast and sign trades.

### 3. Placing Orders
Use the `place_order` tool. 
- **Standard**: `LIMIT_BUY` (Buy when price drops), `LIMIT_SELL` (Sell when price rises).
- **Protective**: `STOP_LOSS` (Sell when price drops to protect capital).
- **Advanced**: `OCO` (One-Cancels-Other). Set both a Take Profit and a Stop Loss.

### 4. Handling Stale States
If an order moves to **STALE**, it means the price consensus (OKX + Chainlink + Binance) is no longer high-confidence. You should:
- List stale orders: `node dist/tools/list_orders.js status=STALE`
- Evaluate the risk and either `cancel_order` or wait for feed recovery.

## 📝 Compliance & Audit
Every state transition is signed by a TEE (Trusted Execution Environment). For audit compliance, you can retrieve the full signature trail for any order using:
`node dist/tools/get_order_details.js orderId=<ID>`

---
**Core Rule**: Always check the `ConsensusPrice` confidence before explaining price discrepancies to the user.
