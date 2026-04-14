#!/usr/bin/env python3
import argparse, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.storage import storage

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--order-id', required=True)
    args = parser.parse_args()
    order = storage.load(args.order_id)
    if not order:
        print(json.dumps({'success': False, 'error': 'Order not found'}))
        sys.exit(1)
    if order.status != 'PENDING':
        print(json.dumps({'success': False, 'error': f'Cannot cancel: order is {order.status}'}))
        sys.exit(1)
    
    storage.delete(args.order_id)
    print(json.dumps({
        'success': True, 
        'operation': 'cancel', 
        'orderId': args.order_id,
        'note': 'Order intent deleted. Tokens were never locked.'
    }, indent=2))

if __name__ == '__main__': main()
