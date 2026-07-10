// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {BatchExecutor} from "../src/BatchExecutor.sol";

contract BatchExecutorTest is Test {
    BatchExecutor exec;

    function setUp() public {
        exec = new BatchExecutor();
    }

    function test_executesSequentialCalls() public {
        BatchExecutor.Call[] memory calls = new BatchExecutor.Call[](2);
        calls[0] = BatchExecutor.Call({target: address(this), value: 0, data: abi.encodeWithSignature("ping()")});
        calls[1] = BatchExecutor.Call({target: address(this), value: 0, data: abi.encodeWithSignature("ping()")});
        exec.execute(calls);
        assertEq(pingCount, 2);
    }

    uint256 public pingCount;
    function ping() external {
        pingCount++;
    }
}
