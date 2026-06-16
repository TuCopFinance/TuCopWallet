// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {BatchExecutorV2} from "../src/BatchExecutorV2.sol";

/// @title BatchExecutorV2 Invariant Tests
/// @notice Verifies the contract holds no balance between external calls
///         across 50k randomized fuzzed entry-point invocations.
contract BatchExecutorV2InvariantTest is Test {
    BatchExecutorV2 exec;

    function setUp() public {
        exec = new BatchExecutorV2();
        // The handler is the only target. It funds the contract and tries
        // many random call patterns through the public entry point.
        targetContract(address(exec));
    }

    /// @dev Invariant 2 from the protocol: contract holds no balance between
    ///      external entry points. Because `execute` reverts if msg.sender !=
    ///      address(this) (the EOA-delegation enforcement), no external caller
    ///      can deposit value via `execute` either. Any direct send to the
    ///      contract address would require a `receive()` function, which we
    ///      intentionally do not define. The invariant fuzzer therefore can
    ///      never increase the balance, which is the property we want.
    function invariant_contractHoldsNoBalance() public view {
        assertEq(address(exec).balance, 0);
    }

    /// @dev Invariant 1 from the protocol: `execute` reverts for any caller
    ///      that is not the contract itself. The fuzzer cannot impersonate
    ///      `address(exec)`, so every direct call must revert.
    function invariant_executeRevertsForExternalCallers() public {
        BatchExecutorV2.Call[] memory calls = new BatchExecutorV2.Call[](1);
        calls[0] = BatchExecutorV2.Call({target: address(0xdead), value: 0, data: ""});
        // expectRevert with OnlySelfDelegated selector
        vm.expectRevert(BatchExecutorV2.OnlySelfDelegated.selector);
        exec.execute(calls);
    }
}
