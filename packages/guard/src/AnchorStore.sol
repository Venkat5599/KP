// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title AnchorStore
/// @notice An append-only log of receipt Merkle roots. Each root is committed to
///         chain, so the batch it represents becomes verifiable after the fact: if a
///         receipt's leaf is in the committed root, the decision it records existed
///         before the anchor transaction.
/// @dev    Roots are keyed by batch id and chain-timestamped by the block number.
///         There is no update path: a wrong root is permanent, which is the point.
contract AnchorStore {
    event RootAnchored(uint256 indexed batchId, bytes32 root, bytes32 policyHash, uint256 blockNumber);
    event AdminSet(address indexed previous, address indexed next);

    address public admin;

    struct Anchor {
        bytes32 root;
        bytes32 policyHash;
        uint256 blockNumber;
    }

    mapping(uint256 => Anchor) public anchors;

    constructor(address admin_) {
        admin = admin_;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert("NOYEET/1:NOT_ADMIN");
        _;
    }

    /// @notice Rotate the admin. The constructor admin is the deployer; rotation lets
    ///         custody move to the signing wallet without a redeploy, so the org key
    ///         can anchor even when it did not deploy the store.
    function setAdmin(address next) external onlyAdmin {
        if (next == address(0)) revert("NOYEET/1:NOT_ADMIN");
        emit AdminSet(admin, next);
        admin = next;
    }

    /// @notice Commit `root` as batch `batchId` together with the policy hash that
    ///         was in force for that batch. Idempotent: re-anchoring the same batch
    ///         with the same root and policy hash is a no-op rather than an
    ///         overwrite. Any difference (root or policy hash) is a conflict: the
    ///         batch's record is permanent.
    function anchor(uint256 batchId, bytes32 root, bytes32 policyHash)
        external
        onlyAdmin
        returns (uint256 blockNumber)
    {
        Anchor storage existing = anchors[batchId];
        if (existing.root != bytes32(0)) {
            if (existing.root != root || existing.policyHash != policyHash) {
                revert("NOYEET/1:ANCHOR_CONFLICT");
            }
            return existing.blockNumber;
        }
        blockNumber = block.number;
        anchors[batchId] = Anchor({root: root, policyHash: policyHash, blockNumber: blockNumber});
        emit RootAnchored(batchId, root, policyHash, blockNumber);
    }

    /// @notice Prove `leaf` was in `batchId`'s committed root.
    function verify(uint256 batchId, bytes32 leaf, bytes32[] calldata proof, uint256 index)
        external
        view
        returns (bool)
    {
        bytes32 root = anchors[batchId].root;
        if (root == bytes32(0)) return false;
        bytes32 computed = leaf;
        for (uint256 i; i < proof.length; ++i) {
            bytes32 sibling = proof[i];
            // Mirror the off-chain sorter: the left sibling is the smaller hash.
            computed = computed <= sibling
                ? keccak256(abi.encodePacked(computed, sibling))
                : keccak256(abi.encodePacked(sibling, computed));
        }
        return computed == root;
    }
}
