#!/usr/bin/env python3
"""Generate executeGuarded calldata for the chaos-fork-current proof."""
import sys

def w32(v):
    if isinstance(v, str) and v.startswith("0x"):
        return v[2:].lower().zfill(64)
    return hex(int(v))[2:].zfill(64)

def borrow_more(a): return "0x9d0bf2e9" + hex(a)[2:].zfill(64)
def repay(a): return "0x371fd8e6" + hex(a)[2:].zfill(64)
def probe(g): return "0xbf92857c" + g[2:].lower().zfill(64)

def encode_bytes(b):
    if b.startswith("0x"): b = b[2:]
    if len(b) % 2: b = "0" + b
    n = len(b) // 2  # bytes
    pad = (32 - (n % 32)) % 32
    return w32(n) + b + "0" * (pad * 2)

def enc_tuples(elems):
    head, tail = "", ""
    for e in elems:
        if len(e) == 3:  # (address, uint256, bytes)
            head += w32(e[0]) + w32(e[1]) + w32(96 + len(tail) // 2)
            tail += encode_bytes(e[2])
        else:  # (address, bytes, uint8, uint8, uint256)
            head += w32(e[0]) + w32(160 + len(tail) // 2) + w32(e[2]) + w32(e[3]) + w32(e[4])
            tail += encode_bytes(e[1])
    return head + tail

def composite(calls, invs):
    cht = enc_tuples(calls)
    iht = enc_tuples(invs)
    return "0x71b8feeb" + w32(0x40) + w32(0x40 + 32 + len(cht) // 2) + w32(len(calls)) + cht + w32(len(invs)) + iht

POOL = sys.argv[1]
GUARD = sys.argv[2]
FLOOR = "1400000000000000000"

# safe: repay 4.3478e18 — the keeper's own rebalance, HF 1.379 -> 1.5
safe = composite(
    [[POOL, "0", repay(4347826086956523520)]],
    [[POOL, probe(GUARD), 5, 0, FLOOR]],
)
# unsafe: borrow 50 ETH — HF collapses to 75/104.34 = 0.719 < floor
unsafe = composite(
    [[POOL, "0", borrow_more(50000000000000000000)]],
    [[POOL, probe(GUARD), 5, 0, FLOOR]],
)
print(safe)
print(unsafe)
