// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @dev Mirrors Aave's getUserAccountData shape: six words, health factor is word 5.
contract MockLendingPool {
    uint256 public healthFactor = 2e18;
    uint256 public collateral = 100e18;

    function setHealthFactor(uint256 hf) external {
        healthFactor = hf;
    }

    function borrowMore(uint256 newHf) external {
        healthFactor = newHf;
    }

    function getUserAccountData(address)
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        return (collateral, 0, 0, 0, 0, healthFactor);
    }

    /// @dev A probe that reverts, exercising PROBE_FAILED.
    function boom() external pure {
        revert("probe exploded");
    }

    /// @dev Returns a single word, so asking for word 3 exercises PROBE_SHORT.
    function short() external pure returns (bool) {
        return true;
    }
}

/// @dev Balance holder used for relative-bound tests.
contract MockVault {
    uint256 public balance = 1000e18;

    function withdraw(uint256 amount) external {
        balance -= amount;
    }

    function deposit(uint256 amount) external {
        balance += amount;
    }

    /// @dev Reverts with a reason, which the guard must bubble verbatim.
    function fail() external pure {
        revert("call reverted");
    }

    /// @dev Reverts with no return data at all, exercising the CALL_FAILED fallback.
    function failSilent() external pure {
        assembly {
            revert(0, 0)
        }
    }
}
