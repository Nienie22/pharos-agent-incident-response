// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IncidentRegistry} from "../src/IncidentRegistry.sol";
import {EmergencyPolicyController} from "../src/EmergencyPolicyController.sol";

/// @notice Minimal mock agent registry used by the deployment script. The
///         real Pharos agent registry is deployed separately by the agent
///         product. For acceptance we only need the surface that the
///         controller calls.
contract MockAgentRegistry {
    mapping(address => bool) public pausedAgents;
    mapping(address => mapping(address => bool)) public removedExecutors;
    mapping(bytes32 => bytes32) public keyMetadata;

    function setPaused(address agent) external { pausedAgents[agent] = true; }
    function removeExecutor(address agent, address executor) external { removedExecutors[agent][executor] = true; }
    function rotateKeyMetadata(bytes32 keyId, bytes32 metadataHash) external { keyMetadata[keyId] = metadataHash; }
}

contract DeployScript is Script {
    function run() external returns (address registry, address controller, address agentReg) {
        // The deployer/accounts come from the standard Foundry env vars
        // (PRIVATE_KEY from .env, *ADDRESS from broadcast). We use the
        // test mnemonic defaults so the same script works against Anvil
        // and against Pharos Atlantic.
        uint256 deployerKey = vm.envOr("PHAROS_DEPLOYER_PRIVATE_KEY", uint256(keccak256("pharos-local-anvil-deployer")));
        address deployer = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);
        agentReg = address(new MockAgentRegistry());
        registry = address(new IncidentRegistry(deployer));
        controller = address(new EmergencyPolicyController(deployer, agentReg, registry));
        vm.stopBroadcast();
        console2.log("IncidentRegistry:", registry);
        console2.log("EmergencyPolicyController:", controller);
        console2.log("MockAgentRegistry:", agentReg);
        console2.log("Deployer:", deployer);
    }
}
