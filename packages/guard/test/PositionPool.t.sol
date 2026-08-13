// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PositionPool} from "../src/PositionPool.sol";
import {NoYeetGuard} from "../src/NoYeetGuard.sol";

/// @notice The demo position contract must behave like a real collateralised pool:
///         borrowMore raises debt and lowers the health factor monotonically, the
///         guard's invariant (word 5 GTE floor) decides the verdict, and ETH can be
///         deposited as collateral.
contract PositionPoolTest is Test {
    PositionPool internal pool;
    NoYeetGuard internal guard;
    address internal executor = address(0xB0B);
    address internal stranger = address(0xC0C);

    uint256 internal constant COLLATERAL = 100e18;
    // HF = collateral * 0.75 / debt -> debt for HF 1.6 is 46.875e18
    uint256 internal constant DEBT = 46.875e18;
    uint256 internal constant FLOOR = 1.4e18;

    function setUp() public {
        pool = new PositionPool(address(this));
        address[] memory executors = new address[](1);
        executors[0] = executor;
        guard = new NoYeetGuard(executors);
        pool.initialize(address(guard), COLLATERAL, DEBT);
    }

    function test_seeded_health_factor_is_1_6() public view {
        assertEq(pool.healthFactorOf(address(guard)), 1.6e18);
    }

    function test_getUserAccountData_word5_is_health_factor() public view {
        (uint256 a, uint256 b,,,, uint256 f) = pool.getUserAccountData(address(guard));
        assertEq(a, COLLATERAL);
        assertEq(b, DEBT);
        assertEq(f, 1.6e18);
    }

    function test_borrowMore_increases_debt_and_lowers_hf() public {
        vm.prank(address(guard));
        pool.borrowMore(0.5e18);
        (uint256 _c, uint256 debtAfter) = pool.positions(address(guard));
        assertEq(debtAfter, DEBT + 0.5e18);
        // 75e18 * 1e18 / 47.375e18 = 1.5831e18
        assertEq(pool.healthFactorOf(address(guard)), 1583113456464379947);
    }

    function test_depositCollateral_accepts_eth() public {
        vm.deal(address(guard), 10e18);
        vm.prank(address(guard));
        pool.depositCollateral{value: 5e18}();
        (uint256 collateralAfter,) = pool.positions(address(guard));
        assertEq(collateralAfter, COLLATERAL + 5e18);
    }

    function test_receive_accepts_eth() public {
        (bool ok,) = address(pool).call{value: 1e18}("");
        assertTrue(ok);
    }

    function test_guard_allows_small_borrow() public {
        // debt 46.875 -> 47.375e18, HF 1.583 >= floor 1.4
        vm.prank(executor);
        guard.executeGuarded(
            _calls(address(pool), abi.encodeCall(PositionPool.borrowMore, (0.5e18))), _invariants(FLOOR)
        );
        (uint256 _c2, uint256 debtAfterGuard) = pool.positions(address(guard));
        assertEq(debtAfterGuard, DEBT + 0.5e18);
    }

    function test_guard_refuses_big_borrow() public {
        // debt 46.875 -> 61.875e18, HF 1.212 < floor 1.4
        vm.prank(executor);
        vm.expectRevert(bytes("NOYEET/1:INV:0:1212121212121212121:1400000000000000000"));
        guard.executeGuarded(
            _calls(address(pool), abi.encodeCall(PositionPool.borrowMore, (15e18))), _invariants(FLOOR)
        );
    }

    function test_repay_reduces_debt_and_restores_hf() public {
        vm.prank(address(guard));
        pool.borrowMore(5e18);
        vm.prank(address(guard));
        pool.repay(5e18);
        assertEq(pool.healthFactorOf(address(guard)), 1.6e18);
    }

    function test_guard_allows_repay_below_floor() public {
        // force HF below the floor: debt 55e18 -> HF 75/55 = 1.3636 < 1.4
        vm.prank(address(guard));
        pool.borrowMore(8.125e18);
        assertEq(pool.healthFactorOf(address(guard)), 1363636363636363636);
        // repay 5e18 -> debt 50e18 -> HF 1.5 >= floor 1.4: the guard must allow it
        vm.prank(executor);
        guard.executeGuarded(_calls(address(pool), abi.encodeCall(PositionPool.repay, (5e18))), _invariants(FLOOR));
        assertEq(pool.healthFactorOf(address(guard)), 1500000000000000000);
    }

    function test_guard_refuses_stranger() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("NOYEET/1:NOT_EXECUTOR"));
        guard.executeGuarded(
            _calls(address(pool), abi.encodeCall(PositionPool.borrowMore, (0.5e18))), _invariants(FLOOR)
        );
    }

    function _calls(address target, bytes memory data) internal pure returns (NoYeetGuard.Call[] memory calls) {
        calls = new NoYeetGuard.Call[](1);
        calls[0] = NoYeetGuard.Call({target: target, value: 0, data: data});
    }

    function _invariants(uint256 floor) internal view returns (NoYeetGuard.Invariant[] memory inv) {
        inv = new NoYeetGuard.Invariant[](1);
        inv[0] = NoYeetGuard.Invariant({
            target: address(pool),
            probe: abi.encodeCall(PositionPool.getUserAccountData, (address(guard))),
            word: 5,
            op: NoYeetGuard.Op.GTE,
            threshold: floor
        });
    }
}
