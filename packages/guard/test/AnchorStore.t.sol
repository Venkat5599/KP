// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AnchorStore} from "../src/AnchorStore.sol";

/**
 * AnchorStore is the on-chain half of receipt anchoring. The off-chain tree is
 * sorted-pair and OZ-compatible (packages/receipts/src/merkle.ts), so the on-chain
 * verifier here must mirror exactly: sibling pairs hashed with the smaller hash
 * first. If the two drift, proofs that verify here fail in the SDK and vice versa.
 */
contract AnchorStoreTest is Test {
    AnchorStore internal store;
    address internal admin = address(0xA11CE);
    address internal stranger = address(0xBAD);

    function setUp() public {
        store = new AnchorStore(admin);
    }

    function testOnlyAdminCanAnchor() public {
        vm.prank(stranger);
        vm.expectRevert("NOYEET/1:NOT_ADMIN");
        store.anchor(1, keccak256("x"));
    }

    function testAnchorsAndRecordsBlockNumber() public {
        bytes32 root = keccak256("root");
        vm.prank(admin);
        uint256 blockNumber = store.anchor(7, root);
        assertEq(blockNumber, block.number);
        (bytes32 stored, uint256 storedBlock) = store.anchors(7);
        assertEq(stored, root);
        assertEq(storedBlock, block.number);
    }

    function testSameRootReAnchorIsIdempotent() public {
        bytes32 root = keccak256("root");
        vm.prank(admin);
        store.anchor(7, root);
        vm.prank(admin);
        uint256 blockNumber = store.anchor(7, root);
        assertEq(blockNumber, block.number);
        (bytes32 stored,) = store.anchors(7);
        assertEq(stored, root);
    }

    function testDifferentRootForSameBatchReverts() public {
        vm.prank(admin);
        store.anchor(7, keccak256("a"));
        vm.prank(admin);
        vm.expectRevert("NOYEET/1:ANCHOR_CONFLICT");
        store.anchor(7, keccak256("b"));
    }

    function testVerifyAcceptsHonestProof() public {
        // Leaves chosen so the pair order is unambiguous: leaf0 < leaf1 lexicographically.
        bytes32 leaf0 = bytes32(uint256(1));
        bytes32 leaf1 = bytes32(uint256(2));
        bytes32 root = keccak256(abi.encodePacked(leaf0, leaf1));

        vm.prank(admin);
        store.anchor(3, root);

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
        store.anchor(3, root);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        assertFalse(store.verify(3, keccak256("other"), proof, 0));
    }

    function testVerifyRejectsUnknownBatch() public {
        bytes32[] memory proof = new bytes32[](0);
        assertFalse(store.verify(99, keccak256("x"), proof, 0));
    }
}
