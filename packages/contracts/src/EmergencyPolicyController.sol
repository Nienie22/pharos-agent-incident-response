// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAgentRegistryLike {
    function setPaused(address agent) external;
    function removeExecutor(address agent, address executor) external;
    function rotateKeyMetadata(bytes32 keyId, bytes32 metadataHash) external;
}

function _bytes32ToAddress(bytes32 b) pure returns (address) {
    return address(uint160(uint256(b)));
}

/// @title EmergencyPolicyController
/// @notice Collects multisig-style threshold approvals for response plans and
///         routes execution through an allowlisted selector set.
contract EmergencyPolicyController is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    address public agentRegistry;
    address public incidentRegistry;

    enum ActionKind {
        PAUSE_AGENT,
        REVOKE_APPROVAL,
        REMOVE_EXECUTOR,
        ROTATE_KEY_METADATA,
        SNAPSHOT
    }

    struct Plan {
        bytes32 incidentId;
        uint64  expiresAt;
        uint16  requiredApprovals;
        uint16  approvalCount;
        address target;
        ActionKind kind;
        bool executed;
    }

    // planHash => Plan
    mapping(bytes32 => Plan) public plans;
    // planHash => approver => approved
    mapping(bytes32 => mapping(address => bool)) public approvals;
    // planHash => action index => executed (replay protection)
    mapping(bytes32 => bool) public actionExecuted;

    event PlanProposed(
        bytes32 indexed planHash,
        bytes32 indexed incidentId,
        address indexed target,
        ActionKind kind,
        uint16 requiredApprovals,
        uint64 expiresAt
    );

    event PlanApproved(bytes32 indexed planHash, address indexed approver, uint16 newCount);
    event PlanExecuted(bytes32 indexed planHash, address indexed executor);
    event PlanRejected(bytes32 indexed planHash, address indexed approver, string reason);

    error UnknownAction();
    error PlanExpired();
    error PlanNotFound();
    error AlreadyApproved();
    error ThresholdNotMet();
    error AlreadyExecuted();
    error WrongTarget();
    error NotExecutor();
    error BadAgent();

    constructor(address admin, address agentReg, address incidentReg) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        agentRegistry = agentReg;
        incidentRegistry = incidentReg;
    }

    function proposePlan(
        bytes32 planHash,
        bytes32 incidentId,
        address target,
        ActionKind kind,
        uint16 requiredApprovals,
        uint64 expiresAt
    ) external whenNotPaused {
        require(target != address(0), "zero target");
        require(requiredApprovals <= 10, "too many");
        require(expiresAt > block.timestamp, "expiry in past");
        plans[planHash] = Plan({
            incidentId: incidentId,
            expiresAt: expiresAt,
            requiredApprovals: requiredApprovals,
            approvalCount: 0,
            target: target,
            kind: kind,
            executed: false
        });
        emit PlanProposed(planHash, incidentId, target, kind, requiredApprovals, expiresAt);
    }

    function approve(bytes32 planHash) external onlyRole(APPROVER_ROLE) {
        Plan storage p = plans[planHash];
        if (p.incidentId == bytes32(0)) revert PlanNotFound();
        if (block.timestamp > p.expiresAt) revert PlanExpired();
        if (approvals[planHash][msg.sender]) revert AlreadyApproved();
        approvals[planHash][msg.sender] = true;
        unchecked { p.approvalCount += 1; }
        emit PlanApproved(planHash, msg.sender, p.approvalCount);
    }

    function reject(bytes32 planHash, string calldata reason) external onlyRole(APPROVER_ROLE) {
        emit PlanRejected(planHash, msg.sender, reason);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function execute(bytes32 planHash, bytes32 agentOrZero, bytes32 keyId, bytes32 metadataHash)
        external
        onlyRole(EXECUTOR_ROLE)
        whenNotPaused
        nonReentrant
        returns (bytes4 selector)
    {
        Plan storage p = plans[planHash];
        if (p.incidentId == bytes32(0)) revert PlanNotFound();
        if (block.timestamp > p.expiresAt) revert PlanExpired();
        if (p.executed) revert AlreadyExecuted();
        if (p.approvalCount < p.requiredApprovals) revert ThresholdNotMet();

        // Allowlisted routing.
        if (p.kind == ActionKind.PAUSE_AGENT) {
            if (agentRegistry == address(0)) revert BadAgent();
            address agentAddr = _bytes32ToAddress(agentOrZero);
            if (agentAddr == address(0)) revert BadAgent();
            selector = IAgentRegistryLike(agentRegistry).setPaused.selector;
            IAgentRegistryLike(agentRegistry).setPaused(agentAddr);
        } else if (p.kind == ActionKind.REMOVE_EXECUTOR) {
            if (agentRegistry == address(0)) revert BadAgent();
            address agentAddr = _bytes32ToAddress(agentOrZero);
            address execAddr = p.target;
            IAgentRegistryLike(agentRegistry).removeExecutor(agentAddr, execAddr);
            selector = IAgentRegistryLike(agentRegistry).removeExecutor.selector;
        } else if (p.kind == ActionKind.ROTATE_KEY_METADATA) {
            if (agentRegistry == address(0)) revert BadAgent();
            IAgentRegistryLike(agentRegistry).rotateKeyMetadata(keyId, metadataHash);
            selector = IAgentRegistryLike(agentRegistry).rotateKeyMetadata.selector;
        } else {
            revert UnknownAction();
        }

        p.executed = true;
        actionExecuted[planHash] = true;
        emit PlanExecuted(planHash, msg.sender);
    }
}

