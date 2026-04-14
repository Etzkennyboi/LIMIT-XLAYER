import json, os, hashlib, time
from pathlib import Path
from typing import Dict, Optional, List
from dataclasses import dataclass, asdict

@dataclass
class LimitOrder:
    orderId: str
    status: str
    createdAt: int
    deadline: int
    teeWallet: str
    poolKey: Dict
    zeroForOne: bool
    amountIn: str
    targetSqrtPriceX96: str
    targetPriceHuman: float
    execution: Optional[Dict] = None
    executionNonce: Optional[str] = None  # idempotency guard

class IntentStorage:
    def __init__(self, chain: str = "x_layer"):
        # Matches PRD path: ~/.limit_orders/x_layer
        self.base_dir = Path.home() / ".limit_orders" / chain
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _get_path(self, order_id: str) -> Path:
        return self.base_dir / f'{order_id}.json'

    def save(self, order: LimitOrder) -> str:
        path = self._get_path(order.orderId)
        with open(path, 'w') as f:
            json.dump(asdict(order), f, indent=2)
        return str(path)

    def load(self, order_id: str) -> Optional[LimitOrder]:
        path = self._get_path(order_id)
        if not path.exists(): return None
        with open(path, 'r') as f:
            data = json.load(f)
            # Handle potential missing keys if needed, but PRD schema is strict
            return LimitOrder(**data)

    def update_status(self, order_id: str, status: str, execution=None, nonce=None):
        order = self.load(order_id)
        if not order: raise ValueError(f'Order {order_id} not found')
        order.status = status
        if execution: order.execution = execution
        if nonce is not None: order.executionNonce = nonce
        self.save(order)

    def list_all(self, status=None) -> List[LimitOrder]:
        orders = []
        if not self.base_dir.exists(): return []
        for fp in self.base_dir.glob('*.json'):
            try:
                with open(fp) as f:
                    o = LimitOrder(**json.load(f))
                    if status is None or o.status == status:
                        orders.append(o)
            except Exception:
                continue # Skip malformed intents
        return sorted(orders, key=lambda x: x.createdAt, reverse=True)

    def delete(self, order_id: str) -> bool:
        path = self._get_path(order_id)
        if path.exists(): path.unlink(); return True
        return False

    def generate_order_id(self, tee_wallet: str, ts: int) -> str:
        data = f'{tee_wallet}:{ts}:{os.urandom(16).hex()}'
        return '0x' + hashlib.sha256(data.encode()).hexdigest()[:40]

storage = IntentStorage()
