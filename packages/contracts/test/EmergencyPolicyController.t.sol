// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EmergencyPolicyController} from "../src/EmergencyPolicyController.sol";

contract MockAgentRegistry {
    mapping(address => bool) public pausedAgents;
    mapping(address => mapping(address => bool)) public removedExecutors;
    mapping(bytes32 => bytes32) public keyMetadata;

    function setPaused(address agent) external { pausedAgents[agent] = true; }
    function removeExecutor(address agent, address executor) external { removedExecutors[agent][executor] = true; }
    function rotateKeyMetadata(bytes32 keyId, bytes32 metadataHash) external { keyMetadata[keyId] = metadataHash; }
}

contract EmergencyPolicyControllerTest is Test {
    EmergencyPolicyController ctl;
    MockAgentRegistry agents;
    address admin = address(0xA1);
    address approver1 = address(0xB1);
    address approver2 = address(0xB2);
    address executor = address(0xC1);
    address agent = address(0xD1);

    function setUp() public {
        agents = new MockAgentRegistry();
        ctl = new EmergencyPolicyController(admin, address(agents), address(0xE1));
        vm.startPrank(admin);
        ctl.grantRole(ctl.APPROVER_ROLE(), approver1);
        ctl.grantRole(ctl.APPROVER_ROLE(), approver2);
        ctl.grantRole(ctl.EXECUTOR_ROLE(), executor);
        vm.stopPrank();
    }

    function test_ProposeApproveExecutePause() public {
        bytes32 planHash = keccak256("p1");
        bytes32 incidentId = keccak256("i1");
        uint64 future = uint64(block.timestamp + 1 hours);
        ctl.proposePlan(planHash, incidentId, agent, EmergencyPolicyController.ActionKind.PAUSE_AGENT, 1, future);

        vm.prank(approver1);
        ctl.approve(planHash);

        vm.prank(executor); ctl.execute(planHash, bytes32(uint256(uint160(agent))), bytes32(0), bytes32(0));
        assertTrue(agents.pausedAgents(agent));
        assertTrue(ctl.actionExecuted(planHash));
    }

    function test_RejectsExpiredPlan() public {
        bytes32 planHash = keccak256("p1");
        bytes32 incidentId = keccak256("i1");
        uint64 future = uint64(block.timestamp + 1);
        ctl.proposePlan(planHash, incidentId, agent, EmergencyPolicyController.ActionKind.PAUSE_AGENT, 1, future);

        vm.warp(block.timestamp + 2);

        vm.expectRevert();
        vm.prank(executor); ctl.execute(planHash, bytes32(uint256(uint160(agent))), bytes32(0), bytes32(0));
    }

    function test_RejectsThresholdNotMet() public {
        bytes32 planHash = keccak256("p1");
        bytes32 incidentId = keccak256("i1");
        uint64 future = uint64(block.timestamp + 1 hours);
        ctl.proposePlan(planHash, incidentId, agent, EmergencyPolicyController.ActionKind.PAUSE_AGENT, 2, future);

        vm.prank(approver1);
        ctl.approve(planHash);

        vm.expectRevert();
        vm.prank(executor); ctl.execute(planHash, bytes32(uint256(uint160(agent))), bytes32(0), bytes32(0));
    }

    function test_RejectsReplay() public {
        bytes32 planHash = keccak256("p1");
        bytes32 incidentId = keccak256("i1");
        uint64 future = uint64(block.timestamp + 1 hours);
        ctl.proposePlan(planHash, incidentId, agent, EmergencyPolicyController.ActionKind.PAUSE_AGENT, 1, future);

        vm.prank(approver1);
        ctl.approve(planHash);

        vm.prank(executor); ctl.execute(planHash, bytes32(uint256(uint160(agent))), bytes32(0), bytes32(0));
        vm.expectRevert();
        vm.prank(executor); ctl.execute(planHash, bytes32(uint256(uint160(agent))), bytes32(0), bytes32(0));
    }

    function test_DuplicateApprovalFails() public {
        bytes32 planHash = keccak256("p1");
        bytes32 incidentId = keccak256("i1");
        uint64 future = uint64(block.timestamp + 1 hours);
        ctl.proposePlan(planHash, incidentId, agent, EmergencyPolicyController.ActionKind.PAUSE_AGENT, 1, future);

        vm.startPrank(approver1);
        ctl.approve(planHash);
        vm.expectRevert();
        ctl.approve(planHash);
        vm.stopPrank();
    }

    function test_RemoveExecutorRouting() public {
        bytes32 planHash = keccak256("p1");
        bytes32 incidentId = keccak256("i1");
        address execAddr = address(0xBEEF);
        uint64 future = uint64(block.timestamp + 1 hours);
        ctl.proposePlan(planHash, incidentId, execAddr, EmergencyPolicyController.ActionKind.REMOVE_EXECUTOR, 1, future);
        vm.prank(approver1);
        ctl.approve(planHash);
        vm.prank(executor); ctl.execute(planHash, bytes32(uint256(uint160(agent))), bytes32(0), bytes32(0));
        assertTrue(agents.removedExecutors(agent, execAddr));
    }

    function test_RotateKeyMetadataRouting() public {
        bytes32 planHash = keccak256("p1");
        bytes32 incidentId = keccak256("i1");
        uint64 future = uint64(block.timestamp + 1 hours);
        ctl.proposePlan(planHash, incidentId, agent, EmergencyPolicyController.ActionKind.ROTATE_KEY_METADATA, 1, future);
        vm.prank(approver1);
        ctl.approve(planHash);
        bytes32 keyId = keccak256("key1");
        bytes32 meta = keccak256("meta1");
        vm.prank(executor); ctl.execute(planHash, bytes32(0), keyId, meta);
        assertEq(agents.keyMetadata(keyId), meta);
    }

    function test_PauseBlocksProposal() public {
        vm.prank(admin);
        ctl.pause();
        vm.expectRevert();
        ctl.proposePlan(keccak256("p2"), keccak256("i2"), agent, EmergencyPolicyController.ActionKind.PAUSE_AGENT, 1, uint64(block.timestamp + 1));
        vm.prank(admin);
        ctl.unpause();
        ctl.proposePlan(keccak256("p2"), keccak256("i2"), agent, EmergencyPolicyController.ActionKind.PAUSE_AGENT, 1, uint64(block.timestamp + 1));
    }
}


