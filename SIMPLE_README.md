# OKX DEX Limit Order - Simple AI Version

## 🚀 Quick Start for AI Agents

After cloning this repo, you can immediately set limit orders. No Redis, no workers needed!

### Installation
```bash
npm install
```

### Usage Examples

```bash
# Set a limit buy order
npm run order "set a limit buy 1$ of okb at 80$"

# Set a limit sell order
npm run order "limit sell 50 okb at 100$"

# List all orders
npm run order "list orders"

# Cancel an order
npm run order "cancel order abc123"
```

### Supported Commands

- **Buy**: `set a limit buy $AMOUNT of TOKEN at $PRICE`
- **Sell**: `limit sell $AMOUNT TOKEN at $PRICE`
- **List**: `list orders`
- **Cancel**: `cancel order ORDER_ID`

### Supported Tokens

- okb, usdc, usdt, eth, btc

### How It Works

1. The order is created and stored in memory
2. Prices are fetched from OKX API
3. If the target price is hit, the order shows as "TRIGGERED"
4. In a production setup, the order would be executed on-chain via TEE signing

That's it! Simple, fast, and AI-friendly.
