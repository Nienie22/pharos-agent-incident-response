// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IncidentRegistry} from "../src/IncidentRegistry.sol";

contract IncidentRegistryTest is Test {
    IncidentRegistry reg;
    address admin = address(0xA1);
    address reporter = address(0xB1);
    address executor = address(0xC1);

    function setUp() public {
        reg = new IncidentRegistry(admin);
        vm.startPrank(admin);
        reg.grantRole(reg.REPORTER_ROLE(), reporter);
        reg.grantRole(reg.EXECUTOR_ROLE(), executor);
        vm.stopPrank();
    }

    function test_RegisterIncident() public {
        bytes32 incidentId = keccak256("i1");
        bytes32 planHash = keccak256("p1");
        vm.prank(reporter);
        reg.registerIncident(incidentId, planHash);
        (bytes32 iId, bytes32 pHash,, ,) = reg.incidents(incidentId);
        assertEq(iId, incidentId);
        assertEq(pHash, planHash);
    }

    function test_RejectsDuplicateIncident() public {
        bytes32 incidentId = keccak256("i1");
        bytes32 planHash = keccak256("p1");
        vm.startPrank(reporter);
        reg.registerIncident(incidentId, planHash);
        vm.expectRevert(bytes("duplicate incident"));
        reg.registerIncident(incidentId, planHash);
        vm.stopPrank();
    }

    function test_RequiresReporterRole() public {
        bytes32 incidentId = keccak256("i1");
        bytes32 planHash = keccak256("p1");
        vm.expectRevert();
        reg.registerIncident(incidentId, planHash);
    }

    function test_MarkExecutedAndClose() public {
        bytes32 planHash = keccak256("p1");
        vm.prank(executor);
        reg.markExecuted(planHash);
        assertTrue(reg.executed(planHash));

        // Closing a plan that has not been marked executed must revert.
        bytes32 notExecuted = keccak256("never");
        bytes32 closureHash = keccak256("closure");
        vm.prank(executor);
        vm.expectRevert(bytes("not executed"));
        reg.close(notExecuted, closureHash);

        // Closing a plan that has been executed succeeds.
        vm.prank(executor);
        reg.close(planHash, closureHash);
        (, , , uint64 bn) = reg.closures(planHash);
        assertEq(bn, block.number);
    }

    function test_RejectsReplay() public {
        bytes32 planHash = keccak256("p1");
        vm.startPrank(executor);
        reg.markExecuted(planHash);
        vm.expectRevert(bytes("already executed"));
        reg.markExecuted(planHash);
        vm.stopPrank();
    }

    function test_PauseBlocksRegister() public {
        vm.prank(admin);
        reg.pause();
        vm.expectRevert();
        vm.prank(reporter);
        reg.registerIncident(keccak256("i1"), keccak256("p1"));
    }
}



