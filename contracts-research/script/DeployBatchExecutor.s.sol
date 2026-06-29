// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {BatchExecutor} from "../src/BatchExecutor.sol";

contract DeployBatchExecutor is Script {
    function run() external {
        uint256 pk = vm.envUint("SPIKE_WALLET_PK");
        vm.startBroadcast(pk);
        BatchExecutor exec = new BatchExecutor();
        console2.log("BatchExecutor deployed at:", address(exec));
        vm.stopBroadcast();
    }
}
