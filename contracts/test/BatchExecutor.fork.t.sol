// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {BatchExecutor} from "../src/BatchExecutor.sol";

contract BatchExecutorForkTest is Test {
    BatchExecutor exec;

    function setUp() public {
        vm.createSelectFork("celo", 69_685_872);
        exec = new BatchExecutor();
    }

    function test_fork_externalCallerRevertsConsistently() public {
        for (uint256 i = 0; i < 100; i++) {
            BatchExecutor.Call[] memory calls = new BatchExecutor.Call[](1);
            calls[0] = BatchExecutor.Call({
                target: address(uint160(uint256(keccak256(abi.encode(i))))),
                value: 0,
                data: bytes(abi.encode(i))
            });
            vm.expectRevert(BatchExecutor.OnlySelfDelegated.selector);
            exec.execute(calls);
        }
    }
}
