// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title BatchExecutor V2 - production candidate for EIP-7702 delegation
/// @notice When delegated to via EIP-7702, this contract runs in the context
///         of the user's EOA. msg.sender == address(this) == the delegated EOA
///         throughout `execute`. The `onlySelf` modifier enforces that only the
///         delegated EOA can invoke the batch.
/// @dev Minimal-surface design: ~30-50 LOC, no admin, no upgrade, no balance
///      held between calls. See docs/spikes/s4-self-audit-protocol.md.
contract BatchExecutorV2 is ReentrancyGuard {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    error CallFailed(uint256 index, bytes reason);
    error EmptyBatch();
    error OnlySelfDelegated();

    /// @dev Only callable by the delegated EOA itself (msg.sender == address(this)).
    modifier onlySelf() {
        if (msg.sender != address(this)) revert OnlySelfDelegated();
        _;
    }

    /// @notice Execute a batch of calls atomically.
    /// @dev Reentrancy-guarded. Callable only by self (the delegated EOA).
    ///      Any inner call failure reverts the entire batch.
    function execute(Call[] calldata calls) external payable nonReentrant onlySelf {
        uint256 len = calls.length;
        if (len == 0) revert EmptyBatch();
        for (uint256 i = 0; i < len; ++i) {
            (bool ok, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, ret);
        }
    }
}
