import math

Q96 = 2 ** 96

def sqrt_price_x96_to_price(sqrt_price_x96: int) -> float:
    """Convert Uniswap Q64.96 to human-readable price (token1/token0)."""
    sqrt_price = sqrt_price_x96 / Q96
    return sqrt_price ** 2

def price_to_sqrt_price_x96(price: float) -> int:
    """Convert human price (token1/token0) to Uniswap Q64.96."""
    sqrt_price = math.sqrt(price)
    return int(sqrt_price * Q96)

def calculate_target_price(
    current_price: float, offset: float, zero_for_one: bool
) -> int:
    """
    Calculate target price for a standard Limit Order.
    offset is positive (e.g. 0.05 for 5% move).
    zero_for_one (Sell 0, Buy 1): Want higher price (Limit Sell).
    one_for_zero (Sell 1, Buy 0): Want lower price (Limit Buy).
    """
    if zero_for_one:
        # Limit Sell: Execute when price rises above current + offset
        target = current_price * (1 + offset)
    else:
        # Limit Buy: Execute when price drops below current - offset
        target = current_price * (1 - offset)
    return price_to_sqrt_price_x96(target)

def is_executable(
    current_sqrt_price_x96: int,
    target_sqrt_price_x96: int,
    zero_for_one: bool
) -> bool:
    """
    Standard Limit Order execution condition.
    zero_for_one (Sell 0, Buy 1): Execute if price >= target (Limit Sell).
    one_for_zero (Sell 1, Buy 0): Execute if price <= target (Limit Buy).
    """
    if zero_for_one:
        return current_sqrt_price_x96 >= target_sqrt_price_x96
    else:
        return current_sqrt_price_x96 <= target_sqrt_price_x96

def calculate_distance(
    current_sqrt_price_x96: int,
    target_sqrt_price_x96: int,
    zero_for_one: bool
) -> float:
    """Returns distance in percentage points till execution."""
    current_price = sqrt_price_x96_to_price(current_sqrt_price_x96)
    target_price  = sqrt_price_x96_to_price(target_sqrt_price_x96)
    
    if zero_for_one:
        # Limit Sell: Distance is how much we need price to rise
        return max(0, ((target_price - current_price) / current_price) * 100)
    else:
        # Limit Buy: Distance is how much we need price to fall
        return max(0, ((current_price - target_price) / current_price) * 100)

def tick_to_price(tick: int) -> float:
    return 1.0001 ** tick

def price_to_tick(price: float) -> int:
    return int(math.log(price) / math.log(1.0001))
