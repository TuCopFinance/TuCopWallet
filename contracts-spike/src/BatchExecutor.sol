// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal batch call executor for EIP-7702 delegation spike.
/// @dev SPIKE-ONLY. NOT for mainnet deployment with user funds.
contract BatchExecutor {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    error CallFailed(uint256 index, bytes reason);

    function execute(Call[] calldata calls) external payable {
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, ret);
        }
    }
}
