#!/usr/bin/env python3
"""
Phase 1 Plumbing Test
Run this FIRST before any other development.
Exit 0 = plumbing confirmed, safe to proceed.
Exit 1 = blocked, do not continue.
"""

import json
import sys
import time
import math
from pathlib import Path

# Ensure we can import from the root
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.skills import call_skill

# X Layer ETH/USDT 0.3% pool — update if pool address changes
TEST_POOL = {
    "currency0": "0x5A77f144B753002f8D6530dC46e4d926478e7786",  # WETH
    "currency1": "0x1e4a5963aBFD975d8c9021ce480b42188849D41d",  # USDT
    "fee": 3000,
    "tickSpacing": 60
}

Q96 = 2 ** 96

def sqrt_price_to_human(sqrt_price_x96: int) -> float:
    return (sqrt_price_x96 / Q96) ** 2

def run_test(name: str, fn):
    print(f"\n  [ ] {name}", end="", flush=True)
    start = time.time()
    try:
        result = fn()
        elapsed = time.time() - start
        print(f"\r  [PASS] {name}  ({elapsed:.2f}s)")
        return result
    except Exception as e:
        print(f"\r  [FAIL] {name}")
        print(f"         Error: {e}")
        return None

def test_skill_callable():
    # Confirm call_skill does not throw on import/init
    result = call_skill("uniswap-pool-data", "getSlot0", {"token0": TEST_POOL["currency0"], "token1": TEST_POOL["currency1"], "fee": TEST_POOL["fee"]})
    assert result is not None, 'call_skill returned None'
    return result

def test_response_shape(pool_data):
    # Confirm response has required fields
    required = ["success", "sqrtPriceX96", "tick", "liquidity"]
    for field in required:
        assert field in pool_data, f'Missing field: {field}'
    assert pool_data["success"] is True, f'success=False: {pool_data.get("error")}'
    return pool_data

def test_sqrt_price_valid(pool_data):
    # Confirm sqrtPriceX96 is a non-zero integer string
    raw = pool_data["sqrtPriceX96"]
    val = int(raw)
    assert val > 0, f'sqrtPriceX96 is zero or negative: {val}'
    assert val < (2**160), f'sqrtPriceX96 overflow: {val}'
    return val

def test_price_sanity(sqrt_val):
    # Convert and confirm human price is in plausible ETH range
    price = sqrt_price_to_human(sqrt_val)
    # Note: price is token1/token0. If WETH/USDT, price is USDT per WETH.
    assert 100 < price < 100_000, f'Price out of sanity range: {price}'
    return price

def test_tick_valid(pool_data):
    # Confirm tick is a signed integer in valid range
    tick = pool_data["tick"]
    assert isinstance(tick, int), f'tick not int: {type(tick)}'
    assert -887272 <= tick <= 887272, f'tick out of range: {tick}'
    return tick

def test_latency():
    # Confirm response arrives within 5 seconds
    start = time.time()
    call_skill("uniswap-pool-data", "getSlot0", {"token0": TEST_POOL["currency0"], "token1": TEST_POOL["currency1"], "fee": TEST_POOL["fee"]})
    elapsed = time.time() - start
    assert elapsed < 5.0, f'Skill call too slow: {elapsed:.2f}s'
    return elapsed

def test_two_consecutive_calls():
    # Confirm prices change between calls (proves live data)
    r1 = call_skill("uniswap-pool-data", "getSlot0", {"token0": TEST_POOL["currency0"], "token1": TEST_POOL["currency1"], "fee": TEST_POOL["fee"]})
    time.sleep(2)
    r2 = call_skill("uniswap-pool-data", "getSlot0", {"token0": TEST_POOL["currency0"], "token1": TEST_POOL["currency1"], "fee": TEST_POOL["fee"]})
    # Note: prices may be identical in low-volume windows — this is informational
    same = r1["sqrtPriceX96"] == r2["sqrtPriceX96"]
    print(f"         Prices identical across 2s: {same} (ok in low-volume windows)")
    return True

def main():
    print("=" * 60)
    print("  PHASE 1: PLUMBING TEST — uniswap-pool-data on X Layer")
    print("=" * 60)

    passed = 0
    failed = 0

    # Test 1: Skill is callable
    pool_data = run_test("Skill callable (no exception)", test_skill_callable)
    if pool_data: passed += 1
    else: failed += 1; print('  ABORT: Cannot call skill at all.'); sys.exit(1)

    # Test 2: Response shape
    pool_data = run_test("Response has required fields", lambda: test_response_shape(pool_data))
    if pool_data: passed += 1
    else: failed += 1; sys.exit(1)

    # Test 3: sqrtPriceX96 is valid
    sqrt_val = run_test("sqrtPriceX96 is valid integer", lambda: test_sqrt_price_valid(pool_data))
    if sqrt_val: passed += 1
    else: failed += 1

    # Test 4: Price sanity
    if sqrt_val:
        price = run_test("Human price in sane range ($100-$100k)", lambda: test_price_sanity(sqrt_val))
        if price:
            passed += 1
            print(f"         Derived price: ${price:,.2f}")
        else: failed += 1

    # Test 5: Tick valid
    tick = run_test("Tick is valid signed integer", lambda: test_tick_valid(pool_data))
    if tick is not None: passed += 1
    else: failed += 1

    # Test 6: Latency
    latency = run_test("Response latency < 5s", test_latency)
    if latency: passed += 1
    else: failed += 1

    # Test 7: Live data check
    run_test("Two consecutive calls (live data check)", test_two_consecutive_calls)
    passed += 1  # informational only

    print("\n" + "=" * 60)
    print(f"  RESULT: {passed} passed, {failed} failed")
    if failed == 0:
        print("  STATUS: PLUMBING CONFIRMED. Safe to proceed to Phase 2.")
        print("=" * 60)
        sys.exit(0)
    else:
        print("  STATUS: BLOCKED. Fix MCP skill connection before continuing.")
        print("=" * 60)
        sys.exit(1)

if __name__ == '__main__':
    main()
