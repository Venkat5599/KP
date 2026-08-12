// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {NoYeetGuard} from "../src/NoYeetGuard.sol";

/// @dev An executor contract that re-enters executeGuarded from inside its own call.
///      The guard's nonReentrant lock must refuse it with NOYEET/1:REENTRANT.
contract ReentrantExecutor {
    NoYeetGuard internal guard;

    function bind(NoYeetGuard guard_) external {
        guard = guard_;
    }

    /// @notice Called by the guard; immediately tries to re-enter the guard.
    function reenter() external {
        NoYeetGuard.Call[] memory calls = new NoYeetGuard.Call[](0);
        NoYeetGuard.Invariant[] memory inv = new NoYeetGuard.Invariant[](0);
        guard.executeGuarded(calls, inv);
    }
}

contract ReentrancyTest is Test {
    function testReentrantCallIsRefused() public {
        // A guard whose only executor is a contract that re-enters on call.
        ReentrantExecutor reentrant = new ReentrantExecutor();
        address[] memory execs = new address[](1);
        execs[0] = address(reentrant);
        NoYeetGuard guarded = new NoYeetGuard(execs);

        // Point the executor at the real guard after construction (its binding is
        // mutable, unlike the guard's executor list).
        reentrant.bind(guarded);

        NoYeetGuard.Call[] memory calls = new NoYeetGuard.Call[](1);
        calls[0] = NoYeetGuard.Call({
            target: address(reentrant), value: 0, data: abi.encodeWithSelector(ReentrantExecutor.reenter.selector)
        });
        NoYeetGuard.Invariant[] memory inv = new NoYeetGuard.Invariant[](0);

        vm.prank(address(reentrant));
        vm.expectRevert("NOYEET/1:REENTRANT");
        guarded.executeGuarded(calls, inv);
    }
}
