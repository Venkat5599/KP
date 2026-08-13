// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title PositionPool
/// @notice The demo position contract the guard's invariant reads — a real,
///         collateralised lending position, not a setter.
///
///         Each borrower holds a position: collateral and debt. `borrowMore`
///         increases debt, which monotonically lowers the health factor —
///         `collateral * LTV / debt` — exactly like a lending pool. The invariant
///         probe reads `getUserAccountData(address)` word index 5 (the health
///         factor), the shape the guard, the chaos proofs, and the dapp assume.
///
///         Collateral is deposited as native ETH and accounted per borrower.
///         noyeet never assumes anything about a lending pool beyond this shape; a
///         production deployment points the same invariant at a real pool.
contract PositionPool {
    address public immutable owner;
    uint256 public constant LTV_BPS = 7500; // 75% — same as the liquidation threshold

    struct Position {
        uint256 collateral; // wei of ETH
        uint256 debt; // wei of debt
    }

    mapping(address => Position) public positions;

    event Borrowed(address indexed borrower, uint256 amount, uint256 healthFactorAfter);
    event CollateralDeposited(address indexed borrower, uint256 amount);

    constructor(address owner_) {
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert("NOT_OWNER");
        _;
    }

    /// @notice Seed or repair a position (owner-only). The demo position is
    ///         initialised here because depositing through the guard would need an
    ///         executeGuarded round trip before the position exists.
    function initialize(address who, uint256 collateral, uint256 debt) external onlyOwner {
        positions[who] = Position(collateral, debt);
    }

    /// @notice Accept ETH as collateral for the caller's position.
    function depositCollateral() external payable {
        positions[msg.sender].collateral += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    /// @notice The operation the guard executes: borrow more against the position.
    ///         Debt grows, health factor falls. The invariant then decides whether
    ///         the post-state is acceptable — the guard reverts the whole
    ///         transaction if the floor breaks.
    /// @dev    Payable so a single guarded call can deposit collateral and borrow —
    ///         the value carried with the call is added to the caller's collateral.
    function borrowMore(uint256 amount) external payable {
        positions[msg.sender].collateral += msg.value;
        positions[msg.sender].debt += amount;
        emit Borrowed(msg.sender, amount, healthFactorOf(msg.sender));
    }

    /// @notice Reduce debt, restoring the health factor. The counterpart of
    ///         borrowMore: a keeper below the floor repays, never borrows more.
    function repay(uint256 amount) external {
        Position storage p = positions[msg.sender];
        uint256 paid = amount > p.debt ? p.debt : amount;
        p.debt -= paid;
        emit Borrowed(msg.sender, 0, healthFactorOf(msg.sender));
    }

    receive() external payable {}

    /// @notice Health factor, 1e18-scaled. Infinite while the position has no debt.
    function healthFactorOf(address who) public view returns (uint256) {
        Position memory p = positions[who];
        if (p.debt == 0) return type(uint256).max;
        return ((p.collateral * LTV_BPS) / 10000) * 1e18 / p.debt;
    }

    /// @notice Aave-shaped read. Word index 5 is the health factor; the guard's
    ///         invariant probe reads exactly that word.
    function getUserAccountData(address who)
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        Position memory p = positions[who];
        uint256 hf = p.debt == 0 ? type(uint256).max : ((p.collateral * LTV_BPS) / 10000) * 1e18 / p.debt;
        return (p.collateral, p.debt, 0, 0, 0, hf);
    }
}
