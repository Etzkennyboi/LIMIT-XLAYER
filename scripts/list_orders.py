#!/usr/bin/env python3
import argparse, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.storage import storage

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--status', choices=['PENDING','EXECUTED','EXPIRED','CANCELLED'])
    parser.add_argument('--summary', action='store_true', help='Output a concise summary for AI agents')
    args = parser.parse_args()
    
    orders = storage.list_all(status=args.status)
    
    if args.summary:
        stats = {
            'total': len(orders),
            'pending': len([o for o in orders if o.status == 'PENDING']),
            'executed': len([o for o in orders if o.status == 'EXECUTED']),
            'expired': len([o for o in orders if o.status == 'EXPIRED']),
            'cancelled': len([o for o in orders if o.status == 'CANCELLED'])
        }
        print(json.dumps({'success': True, 'summary': stats}, indent=2))
        return

    print(json.dumps({
        'success': True, 'count': len(orders),
        'orders': [{'orderId': o.orderId, 'status': o.status,
                    'targetPriceHuman': o.targetPriceHuman,
                    'zeroForOne': o.zeroForOne,
                    'amountIn': o.amountIn, 'deadline': o.deadline,
                    'createdAt': o.createdAt,
                    'execution': o.execution} for o in orders]
    }, indent=2))

if __name__ == '__main__': main()
