import os
from typing import Dict, Any

SKILL_MODE = os.getenv('SKILL_MODE', 'simulation')

def call_skill(skill_name: str, method: str, params: Dict) -> Dict[str, Any]:
    if SKILL_MODE == 'mcp':
        return _mcp_call(skill_name, method, params)
    return _simulate(skill_name, method, params)

def _mcp_call(skill_name, method, params):
    # Antigravity runtime injects MCP transport here
    # This is a placeholder for the hackathon runtime
    raise NotImplementedError(f"Skill '{skill_name}' is not reachable in current mode. Set SKILL_MODE=simulation for local dev.")

def _simulate(skill_name, method, params):
    sims = {
        'uniswap-pool-data': _sim_pool_data,
        'uniswap-quote':     _sim_quote,
        'uniswap-swap':      _sim_swap,
        'okx-agentic-wallet':_sim_wallet,
    }
    if skill_name not in sims:
        return {"success": False, "error": f"Unknown skill: {skill_name}"}
    return sims[skill_name](method, params)

def _sim_pool_data(method, params):
    if method == 'getSlot0':
        return {
            "success": True,
            "sqrtPriceX96": "4339505964893976076114115166208", # ~$3000
            "tick": 0,
            "liquidity": "1234567890123456789012345678",
            "fee": params.get("fee", 3000)
        }
    return {"success": False, "error": "Unknown method"}

def _sim_quote(method, params):
    return {
        "success": True,
        "outputAmount": "357142857142857142",
        "sqrtPriceX96After": "75265030740440047501975031463368",
        "gasEstimate": 150000,
        "priceImpact": "0.0012"
    }

def _sim_swap(method, params):
    return {
        "success": True,
        "calldata": "0x" + "c" * 200,
        "to": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        "gasEstimate": 180000
    }

def _sim_wallet(method, params):
    if method == 'getAddress':
        return {"success": True, "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb", "walletType": "TEE"}
    if method == 'signTransaction':
        return {"success": True, "signedTx": "0x" + "f" * 120, "attestation": True}
    return {"success": False, "error": "Unknown method"}
