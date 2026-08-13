// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AnchorStore} from "../src/AnchorStore.sol";

/**
 * AnchorStore is the on-chain half of receipt anchoring. The off-chain tree is
 * sorted-pair and OZ-compatible (packages/receipts/src/merkle.ts), so the on-chain
 * verifier here must mirror exactly: sibling pairs hashed with the smaller hash
 * first. If the two drift, proofs that verify here fail in the SDK and vice versa.
 *
 * Every anchor also binds the policy hash that was in force for the batch, so a
 * committed batch records not only that receipts existed, but under which policy.
 */
contract AnchorStoreTest is Test {
    AnchorStore internal store;
    address internal admin = address(0xA11CE);
    address internal stranger = address(0xBAD);
    bytes32 internal policy = keccak256("policy-v1");

    function setUp() public {
        store = new AnchorStore(admin);
    }

    function testOnlyAdminCanAnchor() public {
        vm.prank(stranger);
        vm.expectRevert("NOYEET/1:NOT_ADMIN");
        store.anchor(1, keccak256("x"), policy);
    }

    function testAnchorsAndRecordsBlockNumberAndPolicy() public {
        bytes32 root = keccak256("root");
        vm.prank(admin);
        uint256 blockNumber = store.anchor(7, root, policy);
        assertEq(blockNumber, block.number);
        (bytes32 stored, bytes32 storedPolicy, uint256 storedBlock) = store.anchors(7);
        assertEq(stored, root);
        assertEq(storedPolicy, policy);
        assertEq(storedBlock, block.number);
    }

    function testSameRootReAnchorIsIdempotent() public {
        bytes32 root = keccak256("root");
        vm.prank(admin);
        store.anchor(7, root, policy);
        vm.prank(admin);
        uint256 blockNumber = store.anchor(7, root, policy);
        assertEq(blockNumber, block.number);
        (bytes32 stored,,) = store.anchors(7);
        assertEq(stored, root);
    }

    function testDifferentRootForSameBatchReverts() public {
        vm.prank(admin);
        store.anchor(7, keccak256("a"), policy);
        vm.prank(admin);
        vm.expectRevert("NOYEET/1:ANCHOR_CONFLICT");
        store.anchor(7, keccak256("b"), policy);
    }

    function testDifferentPolicyForSameBatchReverts() public {
        vm.prank(admin);
        store.anchor(7, keccak256("a"), policy);
        vm.prank(admin);
        vm.expectRevert("NOYEET/1:ANCHOR_CONFLICT");
        store.anchor(7, keccak256("a"), keccak256("policy-v2"));
    }

    function testVerifyAcceptsHonestProof() public {
        // Leaves chosen so the pair order is unambiguous: leaf0 < leaf1 lexicographically.
        bytes32 leaf0 = bytes32(uint256(1));
        bytes32 leaf1 = bytes32(uint256(2));
        bytes32 root = keccak256(abi.encodePacked(leaf0, leaf1));

        vm.prank(admin);
        store.anchor(3, root, policy);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        assertTrue(store.verify(3, leaf0, proof, 0));

        proof[0] = leaf0;
        assertTrue(store.verify(3, leaf1, proof, 1));
    }

    function testVerifyRejectsWrongLeaf() public {
        bytes32 leaf0 = bytes32(uint256(1));
        bytes32 leaf1 = bytes32(uint256(2));
        bytes32 root = keccak256(abi.encodePacked(leaf0, leaf1));

        vm.prank(admin);
        store.anchor(3, root, policy);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        assertFalse(store.verify(3, keccak256("other"), proof, 0));
    }

    function testVerifyRejectsUnknownBatch() public {
        bytes32[] memory proof = new bytes32[](0);
        assertFalse(store.verify(99, keccak256("x"), proof, 0));
    }

    function test_setAdmin_rotates() public {
        vm.prank(admin);
        store.setAdmin(stranger);
        assertEq(store.admin(), stranger);
    }

    function test_setAdmin_old_admin_cannot_anchor_after_rotation() public {
        vm.prank(admin);
        store.setAdmin(stranger);
        vm.prank(admin);
        vm.expectRevert(bytes("NOYEET/1:NOT_ADMIN"));
        store.anchor(99, bytes32(uint256(1)), policy);
    }

    function test_setAdmin_new_admin_can_anchor() public {
        vm.prank(admin);
        store.setAdmin(stranger);
        vm.prank(stranger);
        store.anchor(99, keccak256("r"), policy);
        (bytes32 stored,,) = store.anchors(99);
        assertEq(stored, keccak256("r"));
    }

    function test_setAdmin_rejects_zero() public {
        vm.prank(admin);
        vm.expectRevert(bytes("NOYEET/1:NOT_ADMIN"));
        store.setAdmin(address(0));
    }
}
