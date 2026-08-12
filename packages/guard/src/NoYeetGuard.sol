// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title NoYeetGuard
/// @notice Executes an agent's calls, then asserts post-state invariants and reverts if any
///         are broken. Simulating this function predicts the outcome; broadcasting it enforces
///         the same assertion atomically. Prediction and enforcement are the same code path.
/// @dev    Assets live in this contract. The executor (a KeeperHub/Turnkey wallet) can move
///         them only through `executeGuarded`, so an agent holding the executor key still
///         cannot breach the declared bounds.
///
///         Reverts carry a structured `Error(string)` payload rather than a custom error.
///         KeeperHub's simulation endpoint documents decoding of `Error(string)` into
///         `revertReason`; custom-error decoding is not documented. A denial reason must
///         survive the round trip into a receipt, so the guaranteed-decodable encoding is the
///         correct trade, and it costs gas only on paths that already revert.
///
///         Reason grammar, version pinned so parsers can reject unknown shapes:
///           NOYEET/1:INV:<index>:<got>:<want>
///           NOYEET/1:PROBE_FAILED:<index>
///           NOYEET/1:PROBE_SHORT:<index>:<length>:<needed>
///           NOYEET/1:NOT_EXECUTOR
///           NOYEET/1:NOT_ADMIN
///           NOYEET/1:REENTRANT
///           NOYEET/1:CALL_FAILED
///         A failing inner call bubbles the target's own revert data verbatim, because the
///         protocol's message is more useful than anything this contract could synthesise.
contract NoYeetGuard {
    // ----------------------------------------------------------------- types

    enum Op {
        GTE, // got >= threshold
        LTE, // got <= threshold
        EQ, // got == threshold
        REL_DEC_MAX, // before - got <= threshold
        REL_INC_MAX // got - before <= threshold
    }

    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    struct Invariant {
        address target; // contract to read after execution
        bytes probe; // staticcall calldata, e.g. getUserAccountData(addr)
        uint8 word; // which 32-byte word of the return value to compare
        Op op;
        uint256 threshold; // absolute bound, or max delta for REL_*
    }

    // ---------------------------------------------------------------- events

    event Guarded(bytes32 indexed callsHash, uint256 invariantCount);
    event ExecutorSet(address indexed executor, bool allowed);

    // ----------------------------------------------------------------- state

    string private constant PREFIX = "NOYEET/1:";

    address public immutable admin;
    mapping(address => bool) public isExecutor;

    uint256 private _lock = 1;

    // ------------------------------------------------------------- modifiers

    modifier onlyExecutor() {
        if (!isExecutor[msg.sender]) revert(string.concat(PREFIX, "NOT_EXECUTOR"));
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert(string.concat(PREFIX, "NOT_ADMIN"));
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert(string.concat(PREFIX, "REENTRANT"));
        _lock = 2;
        _;
        _lock = 1;
    }

    // ------------------------------------------------------------- lifecycle

    constructor(address[] memory executors) {
        admin = msg.sender;
        for (uint256 i; i < executors.length; ++i) {
            isExecutor[executors[i]] = true;
            emit ExecutorSet(executors[i], true);
        }
    }

    /// @notice Admin may only rotate executors. It cannot move funds or bypass invariants.
    function setExecutor(address executor, bool allowed) external onlyAdmin {
        isExecutor[executor] = allowed;
        emit ExecutorSet(executor, allowed);
    }

    // ------------------------------------------------------------- execution

    /// @notice Run `calls`, then assert every invariant. Reverts atomically on any violation.
    /// @dev    Simulate this exact call for a verdict; broadcast the same call to enforce it.
    function executeGuarded(Call[] calldata calls, Invariant[] calldata inv)
        external
        payable
        onlyExecutor
        nonReentrant
        returns (bytes[] memory results)
    {
        uint256[] memory snapshot = _snapshot(inv);
        results = _execute(calls);
        _assert(inv, snapshot);
        emit Guarded(keccak256(abi.encode(calls)), inv.length);
    }

    // -------------------------------------------------------------- internal

    function _snapshot(Invariant[] calldata inv) internal view returns (uint256[] memory vals) {
        vals = new uint256[](inv.length);
        for (uint256 i; i < inv.length; ++i) {
            Op op = inv[i].op;
            if (op == Op.REL_DEC_MAX || op == Op.REL_INC_MAX) {
                vals[i] = _probe(inv[i], i);
            }
        }
    }

    function _probe(Invariant calldata iv, uint256 i) internal view returns (uint256 value) {
        (bool ok, bytes memory ret) = iv.target.staticcall(iv.probe);
        if (!ok) {
            revert(string.concat(PREFIX, "PROBE_FAILED:", _toString(i)));
        }

        uint256 needed = (uint256(iv.word) + 1) * 32;
        if (ret.length < needed) {
            revert(
                string.concat(PREFIX, "PROBE_SHORT:", _toString(i), ":", _toString(ret.length), ":", _toString(needed))
            );
        }

        uint256 offset = uint256(iv.word) * 32;
        assembly {
            value := mload(add(add(ret, 0x20), offset))
        }
    }

    function _execute(Call[] calldata calls) internal returns (bytes[] memory results) {
        results = new bytes[](calls.length);
        for (uint256 i; i < calls.length; ++i) {
            (bool ok, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!ok) _bubble(ret);
            results[i] = ret;
        }
    }

    /// @dev Re-throw the callee's revert data unchanged so the protocol's own message survives.
    function _bubble(bytes memory ret) private pure {
        if (ret.length == 0) revert(string.concat(PREFIX, "CALL_FAILED"));
        assembly {
            revert(add(ret, 0x20), mload(ret))
        }
    }

    function _assert(Invariant[] calldata inv, uint256[] memory snapshot) internal view {
        for (uint256 i; i < inv.length; ++i) {
            uint256 got = _probe(inv[i], i);
            uint256 want = inv[i].threshold;
            Op op = inv[i].op;

            if (op == Op.GTE) {
                if (got < want) _broken(i, got, want);
            } else if (op == Op.LTE) {
                if (got > want) _broken(i, got, want);
            } else if (op == Op.EQ) {
                if (got != want) _broken(i, got, want);
            } else if (op == Op.REL_DEC_MAX) {
                uint256 start = snapshot[i];
                if (got < start) {
                    uint256 delta;
                    unchecked {
                        delta = start - got;
                    }
                    if (delta > want) _broken(i, delta, want);
                }
            } else {
                uint256 start = snapshot[i];
                if (got > start) {
                    uint256 delta;
                    unchecked {
                        delta = got - start;
                    }
                    if (delta > want) _broken(i, delta, want);
                }
            }
        }
    }

    function _broken(uint256 index, uint256 got, uint256 want) private pure {
        revert(string.concat(PREFIX, "INV:", _toString(index), ":", _toString(got), ":", _toString(want)));
    }

    /// @dev Base-10 uint to ASCII. Kept local so the guard carries no external dependency.
    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";

        uint256 digits;
        for (uint256 probe = value; probe != 0; probe /= 10) {
            ++digits;
        }

        bytes memory buffer = new bytes(digits);
        uint256 remaining = value;
        for (uint256 i = digits; i > 0; --i) {
            buffer[i - 1] = bytes1(uint8(48 + (remaining % 10)));
            remaining /= 10;
        }
        return string(buffer);
    }

    receive() external payable {}
}
