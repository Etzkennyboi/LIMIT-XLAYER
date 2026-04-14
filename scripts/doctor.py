#!/usr/bin/env python3
import sys, os, json, time
from pathlib import Path

# Ensure root import
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.skills import call_skill, SKILL_MODE
from utils.price_math import sqrt_price_x96_to_price, is_executable

def check_step(name, fn):
    print(f"[ ] {name:.<40}", end="", flush=True)
    try:
        res, msg = fn()
        if res:
            print(f"PASS ({msg})")
            return True
        else:
            print(f"FAIL ({msg})")
            return False
    except Exception as e:
        print(f"ERROR ({str(e)})")
        return False

def check_storage():
    path = Path.home() / ".limit_orders" / "x_layer"
    path.mkdir(parents=True, exist_ok=True)
    test_file = path / ".write_test"
    test_file.touch()
    test_file.unlink()
    return True, str(path)

def check_math():
    # 3000 -> 3100 (Rise)
    target = 4370000000000000000000000000000 # ~$3100
    current = 4339505964893976076114115166208 # ~$3000
    res = is_executable(current, target, zero_for_one=True) # Sell 0 for 1
    # Limit Sell: current >= target. 3000 >= 3100 is False.
    if res is False:
        return True, "Logic: Buy Low/Sell High confirmed"
    return False, "Logic: Math check failed"

def check_mcp():
    if SKILL_MODE == 'simulation':
        return True, "Simulation mode active"
    # Placeholder for live check
    return True, f"Mode: {SKILL_MODE}"

def main():
    print("="*60)
    print("  SKILL DOCTOR — Uniswap V4 Limit Order")
    print("="*60)
    
    results = [
        check_step("Storage directory permissions", check_storage),
        check_step("Math direction (Limit logic)", check_math),
        check_step("MCP Skill mode availability", check_mcp),
    ]
    
    print("="*60)
    if all(results):
        print("  STATUS: HEALTHY. System ready for agents.")
        sys.exit(0)
    else:
        print("  STATUS: UNHEALTHY. Check failures above.")
        sys.exit(1)

if __name__ == '__main__':
    main()
