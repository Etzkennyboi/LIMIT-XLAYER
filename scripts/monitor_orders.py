#!/usr/bin/env python3
import argparse, json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.price_math import is_executable
from utils.storage import storage
from utils.skills import call_skill
from scripts.execute_order import execute_limit_order

def check_order_executable(order):
    """Checks if an order is ready for execution based on current price."""
    pool_data = call_skill('uniswap-pool-data', 'getSlot0', {
        'token0': order.poolKey['currency0'],
        'token1': order.poolKey['currency1'],
        'fee': order.poolKey['fee']
    })
    if not pool_data.get('success'):
        return {'orderId': order.orderId, 'executable': False, 'error': f"Price fetch failed: {pool_data.get('error')}"}
    
    current = int(pool_data['sqrtPriceX96'])
    target  = int(order.targetSqrtPriceX96)
    
    return {
        'orderId': order.orderId,
        'executable': is_executable(current, target, order.zeroForOne),
        'currentPrice': str(current),
        'targetPrice': str(target)
    }

def monitor_loop(poll_interval, auto_execute):
    print(f"Starting monitor loop (Polling every {poll_interval}s)...")
    try:
        while True:
            pending = storage.list_all(status='PENDING')
            results = []
            
            for order in pending:
                try:
                    # 1. Check expiration
                    if time.time() > order.deadline:
                        storage.update_status(order.orderId, 'EXPIRED')
                        results.append({'orderId': order.orderId, 'status': 'EXPIRED'})
                        continue
                    
                    # 2. Check price
                    check = check_order_executable(order)
                    
                    # 3. Handle execution
                    if check['executable']:
                        if auto_execute:
                            print(f"Triggering execution for {order.orderId}...")
                            exec_res = execute_limit_order(order.orderId)
                            results.append(exec_res)
                        else:
                            results.append({**check, 'status': 'EXECUTABLE (Manual trigger required)'})
                    else:
                        # Still pending, no action needed
                        pass
                        
                except Exception as e:
                    results.append({'orderId': order.orderId, 'error': f"Unexpected error: {str(e)}"})
            
            if results or pending:
                print(json.dumps({'timestamp': int(time.time()), 'results': results}, indent=2))
            
            if not pending:
                print("No pending orders. Sleeping...")
            
            time.sleep(poll_interval)
            
    except KeyboardInterrupt:
        print("\nMonitor loop stopped by user.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--poll-interval', type=int, default=30)
    parser.add_argument('--auto-execute', action='store_true')
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    
    if args.once:
        pending = storage.list_all(status='PENDING')
        results = []
        for o in pending:
            results.append(check_order_executable(o))
        print(json.dumps(results, indent=2))
    else:
        monitor_loop(args.poll_interval, args.auto_execute)

if __name__ == '__main__': main()
