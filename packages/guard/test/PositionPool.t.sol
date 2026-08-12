// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PositionPool} from "../src/PositionPool.sol";
import {NoYeetGuard} from "../src/NoYeetGuard.sol";

/// @notice The demo position contract must behave the way the invariant probe assumes:
///         word 5 of getUserAccountData is the caller's health factor, and
///         borrowMore sets it deterministically.
contract PositionPoolTest is Test {
    PositionPool internal pool;
    NoYeetGuard internal guard;
    address internal executor = address(0xB0B);
    address internal stranger = address(0xC0C);

    function setUp() public {
        pool = new PositionPool(address(this));
        address[] memory executors = new address[](1);
        executors[0] = executor;
        guard = new NoYeetGuard(executors);
        pool.setHealthFactor(address(guard), 1.2e18);
    }

    function test_seed_sets_health_factor() public view {
        assertEq(pool.healthFactor(address(guard)), 1.2e18);
    }

    function test_getUserAccountData_word5_is_health_factor() public view {
        (uint256 a, uint256 b, uint256 c, uint256 d, uint256 e, uint256 f) = pool.getUserAccountData(address(guard));
        assertEq(a, 0);
        assertEq(b, 0);
        assertEq(c, 0);
        assertEq(d, 0);
        assertEq(e, 0);
        assertEq(f, 1.2e18);
    }

    function test_borrowMore_sets_caller_health_factor() public {
        vm.prank(address(guard));
        pool.borrowMore(1.5e18);
        assertEq(pool.healthFactor(address(guard)), 1.5e18);
    }

    function test_guard_allows_above_floor() public {
        // borrowMore(1.5e18) -> HF 1.5 >= floor 1.4
        vm.prank(executor);
        guard.executeGuarded(
            _calls(address(pool), abi.encodeCall(PositionPool.borrowMore, (1.5e18))), _invariants(1.4e18)
        );
        assertEq(pool.healthFactor(address(guard)), 1.5e18);
    }

    function test_guard_refuses_below_floor() public {
        vm.prank(executor);
        vm.expectRevert(bytes("NOYEET/1:INV:0:1120000000000000000:1400000000000000000"));
        guard.executeGuarded(
            _calls(address(pool), abi.encodeCall(PositionPool.borrowMore, (1.12e18))), _invariants(1.4e18)
        );
    }

    function test_guard_refuses_stranger() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("NOYEET/1:NOT_EXECUTOR"));
        guard.executeGuarded(
            _calls(address(pool), abi.encodeCall(PositionPool.borrowMore, (1.5e18))), _invariants(1.4e18)
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
