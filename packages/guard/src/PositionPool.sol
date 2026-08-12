// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title PositionPool
/// @notice The demo position contract the guard's invariant reads.
///
///         The deployed Sepolia target behaves identically: `borrowMore(uint256)`
///         moves the caller's health factor, and `getUserAccountData(address)` returns
///         it at word index 5 — the shape the invariant probe (`0xbf92857c`, word 5)
///         and the chaos proofs assume. Shipping the source makes the whole demo
///         reproducible from a clean clone: deploy pool, deploy guard with the
///         executor, seed the position, execute.
///
///         noyeet never assumes anything about a lending pool beyond this shape.
///         A production deployment points the same invariant at a real pool.
contract PositionPool {
    address public immutable owner;

    mapping(address => uint256) public healthFactor;

    constructor(address owner_) {
        owner = owner_;
    }

    /// @notice Seed or repair a position. Owner-only, so the demo position can be
    ///         initialised without going through the guard (which would refuse a
    ///         below-floor state by construction).
    function setHealthFactor(address who, uint256 hf) external {
        if (msg.sender != owner) revert("NOT_OWNER");
        healthFactor[who] = hf;
    }

    /// @notice The operation the guard executes. Sets the caller's health factor to
    ///         the borrowed amount — the same deterministic behaviour the deployed
    ///         Sepolia target exhibits (probe evidence: borrow 1.5e18 -> HF 1.5,
    ///         borrow 1.12e18 -> HF 1.12, INV:0:1120...:1400...).
    function borrowMore(uint256 amount) external {
        healthFactor[msg.sender] = amount;
    }

    /// @notice Aave-shaped read. Word index 5 is the health factor; the guard's
    ///         invariant probe reads exactly that word.
    function getUserAccountData(address who)
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        uint256 hf = healthFactor[who];
        return (0, 0, 0, 0, 0, hf);
    }
}
