// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title IncidentRegistry
/// @notice Anchors incident fingerprints, plan hashes, execution receipts, and
///         evidence snapshots for the Pharos Agent Incident Response system.
/// @dev    Storage layout is append-only. Hashes are stored alongside the
///         block number and the reporter so the receipt is independently
///         verifiable.
contract IncidentRegistry is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    struct IncidentRecord {
        bytes32 incidentId;
        bytes32 planHash;
        address reporter;
        uint64  createdAt;
        uint64  blockNumber;
    }

    struct ClosureReceipt {
        bytes32 planHash;
        bytes32 closureHash;
        address executor;
        uint64  blockNumber;
    }

    // incidentId => IncidentRecord
    mapping(bytes32 => IncidentRecord) public incidents;
    // planHash => executed flag
    mapping(bytes32 => bool) public executed;
    // planHash => ClosureReceipt
    mapping(bytes32 => ClosureReceipt) public closures;

    event IncidentRegistered(
        bytes32 indexed incidentId,
        bytes32 indexed planHash,
        address indexed reporter,
        uint64 blockNumber
    );

    event IncidentExecuted(
        bytes32 indexed planHash,
        address indexed executor,
        uint64 blockNumber
    );

    event IncidentClosed(
        bytes32 indexed planHash,
        bytes32 indexed closureHash,
        address indexed executor,
        uint64 blockNumber
    );

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function registerIncident(bytes32 incidentId, bytes32 planHash)
        external
        onlyRole(REPORTER_ROLE)
        whenNotPaused
        nonReentrant
    {
        require(incidents[incidentId].createdAt == 0, "duplicate incident");
        incidents[incidentId] = IncidentRecord({
            incidentId: incidentId,
            planHash: planHash,
            reporter: msg.sender,
            createdAt: uint64(block.timestamp),
            blockNumber: uint64(block.number)
        });
        emit IncidentRegistered(incidentId, planHash, msg.sender, uint64(block.number));
    }

    function snapshotSubject(address subject, bytes32 evidenceHash)
        external
        onlyRole(REPORTER_ROLE)
        whenNotPaused
    {
        // Anchors the evidence hash against the subject address. We use the
        // subject as the indexed topic so an off-chain indexer can search
        // by wallet.
        emit IncidentRegistered(evidenceHash, bytes20(subject), msg.sender, uint64(block.number));
    }

    function markExecuted(bytes32 planHash)
        external
        onlyRole(EXECUTOR_ROLE)
    {
        require(!executed[planHash], "already executed");
        executed[planHash] = true;
        emit IncidentExecuted(planHash, msg.sender, uint64(block.number));
    }

    function close(bytes32 planHash, bytes32 closureHash)
        external
        onlyRole(EXECUTOR_ROLE)
    {
        require(executed[planHash], "not executed");
        require(closures[planHash].blockNumber == 0, "already closed");
        closures[planHash] = ClosureReceipt({
            planHash: planHash,
            closureHash: closureHash,
            executor: msg.sender,
            blockNumber: uint64(block.number)
        });
        emit IncidentClosed(planHash, closureHash, msg.sender, uint64(block.number));
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
