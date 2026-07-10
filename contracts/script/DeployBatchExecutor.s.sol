// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {BatchExecutor} from "../src/BatchExecutor.sol";

/// @notice Deploys the hardened production BatchExecutor used by the
///         dollarsSpend single-tx path (Track C, WRI). Reads the deploy key
///         from the env var BATCH_EXECUTOR_DEPLOYER_PK to keep it distinct
///         from any spike key, then prints the deployed address. The address
///         must be written to src/web3/networkConfig.ts -> BATCH_EXECUTOR_ADDRESS_CELO
///         in a follow-up wallet PR.
///
/// Usage (Celo mainnet):
///   cd contracts
///   export BATCH_EXECUTOR_DEPLOYER_PK=0x...
///   forge script script/DeployBatchExecutor.s.sol \
///     --rpc-url celo \
///     --broadcast \
///     --verify --etherscan-api-key "$CELOSCAN_API_KEY"
///
/// The contract is `BatchExecutor` from contracts/src/BatchExecutor.sol — the
/// hardened version with the `onlySelf` modifier and ReentrancyGuard. Any
/// future deploy must come from THIS script, not from contracts-spike/.
contract DeployBatchExecutor is Script {
    function run() external returns (address deployed) {
        uint256 pk = vm.envUint("BATCH_EXECUTOR_DEPLOYER_PK");
        address deployer = vm.addr(pk);
        console2.log("Deployer:", deployer);
        console2.log("Deployer balance (wei):", deployer.balance);

        vm.startBroadcast(pk);
        BatchExecutor exec = new BatchExecutor();
        vm.stopBroadcast();

        deployed = address(exec);
        console2.log("BatchExecutor deployed at:", deployed);
        console2.log("Chain id:", block.chainid);
    }
}
