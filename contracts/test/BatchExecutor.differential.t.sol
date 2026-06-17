// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {BatchExecutor} from "../src/BatchExecutor.sol";

contract Recorder {
    uint256[] public records;
    function record(uint256 v) external { records.push(v); }
    function count() external view returns (uint256) { return records.length; }
}

contract BatchExecutorDifferentialTest is Test {
    BatchExecutor exec;
    Recorder rec;

    function setUp() public {
        exec = new BatchExecutor();
        rec = new Recorder();
    }

    function test_batchedVsSequentialEquivalence(uint256[] memory inputs) public {
        vm.assume(inputs.length > 0 && inputs.length < 10);

        // Sequential reference
        Recorder seq = new Recorder();
        for (uint256 i = 0; i < inputs.length; i++) seq.record(inputs[i]);
        uint256 seqCount = seq.count();

        // Batched (impersonating delegated EOA via vm.prank with self-address)
        Recorder bat = new Recorder();
        BatchExecutor.Call[] memory calls = new BatchExecutor.Call[](inputs.length);
        for (uint256 i = 0; i < inputs.length; i++) {
            calls[i] = BatchExecutor.Call({
                target: address(bat),
                value: 0,
                data: abi.encodeWithSelector(Recorder.record.selector, inputs[i])
            });
        }
        // EIP-7702: msg.sender == address(this) inside execute. We test the
        // onlySelf invariant separately; here we simulate the delegated context
        // by calling from the contract itself via low-level call from within a
        // helper. Simpler: deploy BatchExecutor and call execute as the contract.
        vm.prank(address(exec));
        exec.execute(calls);
        assertEq(bat.count(), seqCount, "batched count mismatches sequential");
    }
}
