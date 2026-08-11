// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {NoYeetGuard} from "../src/NoYeetGuard.sol";
import {MockLendingPool, MockVault} from "./Mocks.sol";

/**
 * Reverts are asserted against the exact reason string, not merely "it reverted".
 *
 * That is deliberate: KeeperHub decodes `Error(string)` into `revertReason`, and the
 * executor parses that string to name the violated invariant in the receipt. If the grammar
 * drifts, the deny path silently degrades to "something went wrong", so the grammar is part
 * of the contract's public interface and is pinned here.
 */
contract NoYeetGuardTest is Test {
    NoYeetGuard internal guard;
    MockLendingPool internal pool;
    MockVault internal vault;

    address internal admin = address(0xA11CE);
    address internal executor = address(0xE0E0);
    address internal stranger = address(0xBAD);

    uint256 internal constant HF_FLOOR = 1.4e18;

    function setUp() public {
        address[] memory execs = new address[](1);
        execs[0] = executor;

        vm.prank(admin);
        guard = new NoYeetGuard(execs);

        pool = new MockLendingPool();
        vault = new MockVault();
    }

    // ---------------------------------------------------------------- helpers

    function _invariantBroken(uint256 index, uint256 got, uint256 want)
        internal
        pure
        returns (bytes memory)
    {
        return bytes(
            string.concat(
                "NOYEET/1:INV:",
                vm.toString(index),
                ":",
                vm.toString(got),
                ":",
                vm.toString(want)
            )
        );
    }

    function _hfInvariant(NoYeetGuard.Op op, uint256 threshold)
        internal
        view
        returns (NoYeetGuard.Invariant[] memory inv)
    {
        inv = new NoYeetGuard.Invariant[](1);
        inv[0] = NoYeetGuard.Invariant({
            target: address(pool),
            probe: abi.encodeWithSelector(MockLendingPool.getUserAccountData.selector, address(guard)),
            word: 5,
            op: op,
            threshold: threshold
        });
    }

    function _balanceInvariant(NoYeetGuard.Op op, uint256 threshold)
        internal
        view
        returns (NoYeetGuard.Invariant[] memory inv)
    {
        inv = new NoYeetGuard.Invariant[](1);
        inv[0] = NoYeetGuard.Invariant({
            target: address(vault),
            probe: abi.encodeWithSignature("balance()"),
            word: 0,
            op: op,
            threshold: threshold
        });
    }

    function _setHf(uint256 newHf) internal view returns (NoYeetGuard.Call[] memory calls) {
        calls = new NoYeetGuard.Call[](1);
        calls[0] = NoYeetGuard.Call({
            target: address(pool),
            value: 0,
            data: abi.encodeWithSelector(MockLendingPool.borrowMore.selector, newHf)
        });
    }

    function _withdraw(uint256 amount) internal view returns (NoYeetGuard.Call[] memory calls) {
        calls = new NoYeetGuard.Call[](1);
        calls[0] = NoYeetGuard.Call({
            target: address(vault),
            value: 0,
            data: abi.encodeWithSelector(MockVault.withdraw.selector, amount)
        });
    }

    // ------------------------------------------------------------ allow path

    function test_allows_when_invariant_holds() public {
        vm.prank(executor);
        guard.executeGuarded(_setHf(1.5e18), _hfInvariant(NoYeetGuard.Op.GTE, HF_FLOOR));

        assertEq(pool.healthFactor(), 1.5e18);
    }

    /// @notice The kill shot: calldata is structurally legal, the outcome is not.
    function test_denies_when_post_state_breaks_floor() public {
        vm.prank(executor);
        vm.expectRevert(_invariantBroken(0, 1.12e18, HF_FLOOR));
        guard.executeGuarded(_setHf(1.12e18), _hfInvariant(NoYeetGuard.Op.GTE, HF_FLOOR));

        // state rolled back atomically
        assertEq(pool.healthFactor(), 2e18);
    }

    /// @notice The exact reason string is what the executor parses; pin it literally.
    function test_reason_grammar_is_stable() public {
        vm.prank(executor);
        vm.expectRevert(bytes("NOYEET/1:INV:0:1120000000000000000:1400000000000000000"));
        guard.executeGuarded(_setHf(1.12e18), _hfInvariant(NoYeetGuard.Op.GTE, HF_FLOOR));
    }

    function testFuzz_gte_boundary(uint256 resulting) public {
        resulting = bound(resulting, 0, 100e18);

        vm.prank(executor);
        if (resulting < HF_FLOOR) {
            vm.expectRevert(_invariantBroken(0, resulting, HF_FLOOR));
        }
        guard.executeGuarded(_setHf(resulting), _hfInvariant(NoYeetGuard.Op.GTE, HF_FLOOR));
    }

    // ------------------------------------------------------------- operators

    function test_lte_and_eq() public {
        vm.prank(executor);
        guard.executeGuarded(_setHf(1e18), _hfInvariant(NoYeetGuard.Op.LTE, 1e18));

        vm.prank(executor);
        guard.executeGuarded(_setHf(7e18), _hfInvariant(NoYeetGuard.Op.EQ, 7e18));

        vm.prank(executor);
        vm.expectRevert(_invariantBroken(0, 8e18, 7e18));
        guard.executeGuarded(_setHf(8e18), _hfInvariant(NoYeetGuard.Op.EQ, 7e18));
    }

    function testFuzz_relative_decrease_bound(uint256 amount) public {
        amount = bound(amount, 0, 1000e18);
        uint256 maxDrop = 100e18;

        vm.prank(executor);
        if (amount > maxDrop) {
            vm.expectRevert(_invariantBroken(0, amount, maxDrop));
        }
        guard.executeGuarded(
            _withdraw(amount), _balanceInvariant(NoYeetGuard.Op.REL_DEC_MAX, maxDrop)
        );
    }

    function test_relative_increase_bound() public {
        NoYeetGuard.Call[] memory calls = new NoYeetGuard.Call[](1);
        calls[0] = NoYeetGuard.Call({
            target: address(vault),
            value: 0,
            data: abi.encodeWithSelector(MockVault.deposit.selector, 500e18)
        });

        vm.prank(executor);
        vm.expectRevert(_invariantBroken(0, 500e18, 10e18));
        guard.executeGuarded(calls, _balanceInvariant(NoYeetGuard.Op.REL_INC_MAX, 10e18));
    }

    // ----------------------------------------------------------- probe edges

    function test_probe_revert_surfaces_as_PROBE_FAILED() public {
        NoYeetGuard.Invariant[] memory inv = new NoYeetGuard.Invariant[](1);
        inv[0] = NoYeetGuard.Invariant({
            target: address(pool),
            probe: abi.encodeWithSelector(MockLendingPool.boom.selector),
            word: 0,
            op: NoYeetGuard.Op.GTE,
            threshold: 0
        });

        vm.prank(executor);
        vm.expectRevert(bytes("NOYEET/1:PROBE_FAILED:0"));
        guard.executeGuarded(_setHf(2e18), inv);
    }

    function test_probe_return_too_short() public {
        NoYeetGuard.Invariant[] memory inv = new NoYeetGuard.Invariant[](1);
        inv[0] = NoYeetGuard.Invariant({
            target: address(pool),
            probe: abi.encodeWithSelector(MockLendingPool.short.selector),
            word: 3,
            op: NoYeetGuard.Op.GTE,
            threshold: 0
        });

        vm.prank(executor);
        vm.expectRevert(bytes("NOYEET/1:PROBE_SHORT:0:32:128"));
        guard.executeGuarded(_setHf(2e18), inv);
    }

    // ---------------------------------------------------------------- access

    function test_only_executor_may_execute() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("NOYEET/1:NOT_EXECUTOR"));
        guard.executeGuarded(_setHf(2e18), _hfInvariant(NoYeetGuard.Op.GTE, HF_FLOOR));
    }

    function test_only_admin_may_rotate_executors() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("NOYEET/1:NOT_ADMIN"));
        guard.setExecutor(stranger, true);

        vm.prank(admin);
        guard.setExecutor(stranger, true);
        assertTrue(guard.isExecutor(stranger));
    }

    /// @notice A rogue executor is still bound by the invariants. That is the security argument.
    function test_rogue_executor_cannot_breach_bounds() public {
        vm.prank(admin);
        guard.setExecutor(stranger, true);

        vm.prank(stranger);
        vm.expectRevert(_invariantBroken(0, 0.5e18, HF_FLOOR));
        guard.executeGuarded(_setHf(0.5e18), _hfInvariant(NoYeetGuard.Op.GTE, HF_FLOOR));
    }

    // ------------------------------------------------------------- call fail

    /// @notice A protocol's own error is more useful than ours, so it must survive unchanged.
    function test_failing_call_bubbles_the_targets_reason() public {
        NoYeetGuard.Call[] memory calls = new NoYeetGuard.Call[](1);
        calls[0] = NoYeetGuard.Call({
            target: address(vault),
            value: 0,
            data: abi.encodeWithSelector(MockVault.fail.selector)
        });

        vm.prank(executor);
        vm.expectRevert(bytes("call reverted"));
        guard.executeGuarded(calls, _hfInvariant(NoYeetGuard.Op.GTE, HF_FLOOR));
    }

    function test_silent_failure_falls_back_to_CALL_FAILED() public {
        NoYeetGuard.Call[] memory calls = new NoYeetGuard.Call[](1);
        calls[0] = NoYeetGuard.Call({
            target: address(vault),
            value: 0,
            data: abi.encodeWithSelector(MockVault.failSilent.selector)
        });

        vm.prank(executor);
        vm.expectRevert(bytes("NOYEET/1:CALL_FAILED"));
        guard.executeGuarded(calls, _hfInvariant(NoYeetGuard.Op.GTE, HF_FLOOR));
    }

    function test_empty_invariants_still_executes() public {
        NoYeetGuard.Invariant[] memory none = new NoYeetGuard.Invariant[](0);

        vm.prank(executor);
        guard.executeGuarded(_setHf(3e18), none);
        assertEq(pool.healthFactor(), 3e18);
    }
}
