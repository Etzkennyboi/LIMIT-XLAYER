#!/usr/bin/env python3
import argparse, json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.price_math import sqrt_price_x96_to_price, calculate_distance, is_executable
from utils.storage import storage
from utils.skills import call_skill

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--order-id', required=True)
    args = parser.parse_args()
    
    order = storage.load(args.order_id)
    if not order:
        print(json.dumps({'success': False, 'error': 'Order not found'}))
        sys.exit(1)
        
    pool_data = call_skill('uniswap-pool-data', 'getSlot0', {
        'token0': order.poolKey['currency0'], 
        'token1': order.poolKey['currency1'],
        'fee': order.poolKey['fee']
    })
    
    if not pool_data.get('success'):
        print(json.dumps({'success': False, 'error': f"Failed to get pool data: {pool_data.get('error')}"}))
        sys.exit(1)
        
    current = int(pool_data['sqrtPriceX96'])
    target  = int(order.targetSqrtPriceX96)
    
    # Check if order is expired
    expired = time.time() > order.deadline
    
    executable = is_executable(current, target, order.zeroForOne) and not expired
    
    quote_data = {}
    if executable:
        # Determine tokens for quote
        token_in = order.poolKey['currency0'] if order.zeroForOne else order.poolKey['currency1']
        token_out = order.poolKey['currency1'] if order.zeroForOne else order.poolKey['currency0']
        
        q = call_skill('uniswap-quote', 'quoteExactInputSingle', {
            'tokenIn': token_in,
            'tokenOut': token_out,
            'amount': order.amountIn,
            'sqrtPriceLimitX96': order.targetSqrtPriceX96
        })
        if q.get('success'):
            quote_data = {
                'expectedOutput': q.get('outputAmount'), 
                'gasEstimate': q.get('gasEstimate'),
                'priceImpact': q.get('priceImpact')
            }
        else:
            quote_data = {'error': q.get('error')}

    print(json.dumps({
        'success': True, 
        'orderId': args.order_id,
        'status': order.status,
        'executable': executable,
        'expired': expired,
        'currentPriceHuman': sqrt_price_x96_to_price(current),
        'targetPriceHuman': order.targetPriceHuman,
        'distancePercent': calculate_distance(current, target, order.zeroForOne),
        'quote': quote_data if executable else None
    }, indent=2))

if __name__ == '__main__': main()
