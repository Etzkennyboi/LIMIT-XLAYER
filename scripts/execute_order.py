#!/usr/bin/env python3
import json, sys, time, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.storage import storage
from utils.skills import call_skill

def execute_limit_order(order_id):
    order = storage.load(order_id)
    if not order:
        return {'success': False, 'error': 'Order not found'}
    
    if order.status != 'PENDING':
        return {'success': False, 'error': f'Order is {order.status}, cannot execute'}

    # Use a nonce to prevent double execution if the script crashes
    if order.executionNonce:
        # In a real system, we'd check if this nonce corresponds to a successful tx
        return {'success': False, 'error': 'Order has a pending execution nonce'}

    token_in = order.poolKey['currency0'] if order.zeroForOne else order.poolKey['currency1']
    token_out = order.poolKey['currency1'] if order.zeroForOne else order.poolKey['currency0']

    # 1. Get Quote
    quote = call_skill('uniswap-quote', 'quoteExactInputSingle', {
        'tokenIn': token_in, 'tokenOut': token_out,
        'amount': order.amountIn, 'sqrtPriceLimitX96': order.targetSqrtPriceX96
    })
    if not quote.get('success'):
        return {'success': False, 'error': f'Quote failed: {quote.get("error")}'}

    # 2. Prep Swap
    swap = call_skill('uniswap-swap', 'swapExactInputSingle', {
        'tokenIn': token_in, 'tokenOut': token_out,
        'amount': order.amountIn, 'sqrtPriceLimitX96': order.targetSqrtPriceX96
    })
    if not swap.get('success'):
        return {'success': False, 'error': f'Swap prep failed: {swap.get("error")}'}

    # 3. Set Nonce before signing (Idempotency Guard)
    nonce = '0x' + os.urandom(16).hex()
    storage.update_status(order.orderId, 'PENDING', nonce=nonce)

    # 4. Sign Transaction
    wallet = call_skill('okx-agentic-wallet', 'signTransaction', {
        'transaction': {
            'to': swap.get('to'), 
            'data': swap.get('calldata'),
            'value': '0', 
            'gasLimit': swap.get('gasEstimate', 200000)
        },
        'attestationRequired': True
    })
    if not wallet.get('success'):
        # Clear nonce on failure so it can be retried
        storage.update_status(order.orderId, 'PENDING', nonce="")
        return {'success': False, 'error': f'TEE signing failed: {wallet.get("error")}'}

    # 5. Finalize State
    execution = {
        'executedAt': int(time.time()),
        'txHash': '0x' + 'e' * 64, # Placeholder for real broadcast result
        'actualOutput': quote.get('outputAmount'),
        'executionPrice': order.targetSqrtPriceX96
    }
    storage.update_status(order.orderId, 'EXECUTED', execution)
    return {'success': True, 'orderId': order.orderId, 'txHash': execution['txHash']}

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--order-id', required=True)
    args = parser.parse_args()
    print(json.dumps(execute_limit_order(args.order_id), indent=2))
