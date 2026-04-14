#!/usr/bin/env python3
import argparse, json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.price_math import sqrt_price_x96_to_price, calculate_target_price
from utils.storage import storage, LimitOrder
from utils.skills import call_skill

def place_limit_order(pool_key, amount_in, target_offset, zero_for_one, duration_minutes):
    """
    pool_key: Dict with currency0, currency1, fee
    amount_in: raw amount string
    target_offset: float (e.g. 0.05 for 5% move)
    zero_for_one: bool (direction of swap)
    """
    wallet = call_skill('okx-agentic-wallet', 'getAddress', {})
    if not wallet.get('success'):
        return {"success": False, "error": "TEE wallet not available"}
    tee_wallet = wallet['address']

    pool_data = call_skill('uniswap-pool-data', 'getSlot0', {
        'token0': pool_key['currency0'], 'token1': pool_key['currency1'],
        'fee': pool_key['fee']
    })
    if not pool_data.get('success'):
        return {"success": False, "error": f"Failed to get pool data: {pool_data.get('error')}"}

    current_sqrt = int(pool_data['sqrtPriceX96'])
    current_price = sqrt_price_x96_to_price(current_sqrt)
    
    # Using the corrected Limit Order math (Buy Low, Sell High)
    target_sqrt = calculate_target_price(current_price, target_offset, zero_for_one)
    target_price_human = sqrt_price_x96_to_price(target_sqrt)

    ts = int(time.time())
    order_id = storage.generate_order_id(tee_wallet, ts)

    order = LimitOrder(
        orderId=order_id, status='PENDING', createdAt=ts,
        deadline=ts + duration_minutes * 60, teeWallet=tee_wallet,
        poolKey=pool_key, zeroForOne=zero_for_one, amountIn=amount_in,
        targetSqrtPriceX96=str(target_sqrt), targetPriceHuman=target_price_human
    )
    path = storage.save(order)
    return {
        "success": True, "operation": "place",
        "orderId": order_id, "status": "PENDING",
        "currentPriceHuman": current_price, "targetPriceHuman": target_price_human,
        "zeroForOne": zero_for_one,
        "storagePath": path
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pool-key', required=True, help='JSON string of pool key')
    parser.add_argument('--amount-in', required=True, help='Raw amount of tokenIn')
    parser.add_argument('--target-offset', type=float, required=True, help='Offset from current price (e.g. 0.05)')
    parser.add_argument('--zero-for-one', action='store_true', help='Set if selling token0 for token1 (Limit Sell)')
    parser.add_argument('--duration-minutes', type=int, default=1440, help='Order TTL in minutes')
    args = parser.parse_args()
    
    try:
        pool_key = json.loads(args.pool_key)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid pool-key JSON: {e}"}))
        sys.exit(1)
        
    result = place_limit_order(
        pool_key, args.amount_in,
        args.target_offset, args.zero_for_one, args.duration_minutes
    )
    print(json.dumps(result, indent=2))
    if not result['success']: sys.exit(1)

if __name__ == '__main__': main()
