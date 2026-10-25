// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title CollateralLedger
/// @notice Shared encumbrance ledger: records collateral reservations, tracks free quantity per asset
///         and makes over-pledging impossible. Allocation plans are computed off-chain and committed
///         atomically; every rule below is enforced identically for every participant.
contract CollateralLedger is AccessControl, Pausable {
    bytes32 public constant CUSTODIAN_ROLE = keccak256("CUSTODIAN_ROLE"); // source of truth for quantities
    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE"); // collateral desks
    bytes32 public constant RULES_ROLE = keccak256("RULES_ROLE");         // maintains eligibility schedules

    struct Asset {
        bytes32 assetClass;
        uint128 total;     // whole units held at the custodian
        uint128 reserved;  // units currently pledged
        uint64 version;    // bumps on every change; protects against stale plans
        bool exists;
    }

    struct Line {
        bytes32 assetId;
        bytes32 obligationId;
        uint128 qty;
    }

    struct Allocation {
        address allocator;
        bytes32 planHash;   // keccak256 of inputs + plan, computed off-chain, for audit
        uint64 committedAt;
        bool active;
    }

    mapping(bytes32 => Asset) private _assets;
    bytes32[] private _assetIds;
    mapping(bytes32 => mapping(bytes32 => bool)) public eligible;          // obligation => assetClass => allowed
    mapping(bytes32 => Allocation) public allocations;                     // allocationId => header
    mapping(bytes32 => Line[]) private _lines;                             // allocationId => lines
    mapping(bytes32 => mapping(bytes32 => uint128)) public pledgedTo;      // obligation => asset => units

    // ----- errors (names are what the dashboard shows) -----
    error LengthMismatch();
    error EmptyBatch();
    error ZeroQuantity(uint256 line);
    error AssetExists(bytes32 assetId);
    error UnknownAsset(bytes32 assetId);
    error DuplicateAllocation(bytes32 allocationId);
    error UnknownAllocation(bytes32 allocationId);
    error AllocationNotActive(bytes32 allocationId);
    error Ineligible(bytes32 assetId, bytes32 obligationId);
    error StalePlan(bytes32 assetId, uint64 expected, uint64 actual);
    error InsufficientQuantity(bytes32 assetId, uint256 requested, uint256 available);
    error TotalBelowReserved(bytes32 assetId, uint256 newTotal, uint256 reserved);
    error NotAllocationOwner(bytes32 allocationId);

    // ----- events (form the on-chain audit log) -----
    event AssetRegistered(bytes32 indexed assetId, bytes32 assetClass, uint256 total);
    event TotalUpdated(bytes32 indexed assetId, uint256 oldTotal, uint256 newTotal, uint64 version);
    event EligibilitySet(bytes32 indexed obligationId, bytes32 indexed assetClass, bool allowed);
    event Reserved(bytes32 indexed allocationId, bytes32 indexed assetId, bytes32 indexed obligationId, uint256 qty, uint256 availableAfter);
    event AllocationCommitted(bytes32 indexed allocationId, bytes32 planHash, uint256 lineCount, address indexed allocator);
    event Released(bytes32 indexed allocationId, bytes32 indexed assetId, bytes32 indexed obligationId, uint256 qty, uint256 availableAfter);
    event AllocationReleased(bytes32 indexed allocationId, address indexed by);
    event Substituted(bytes32 indexed allocationId, uint256 line, bytes32 oldAssetId, bytes32 newAssetId, uint256 newQty);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CUSTODIAN_ROLE, admin);
        _grantRole(RULES_ROLE, admin);
    }

    // ===================== setup =====================

    function registerAsset(bytes32 assetId, bytes32 assetClass, uint128 total) external onlyRole(CUSTODIAN_ROLE) {
        if (_assets[assetId].exists) revert AssetExists(assetId);
        _assets[assetId] = Asset(assetClass, total, 0, 1, true);
        _assetIds.push(assetId);
        emit AssetRegistered(assetId, assetClass, total);
    }

    function setTotal(bytes32 assetId, uint128 newTotal) external onlyRole(CUSTODIAN_ROLE) {
        Asset storage a = _existing(assetId);
        if (newTotal < a.reserved) revert TotalBelowReserved(assetId, newTotal, a.reserved);
        uint256 old = a.total;
        a.total = newTotal;
        a.version++;
        emit TotalUpdated(assetId, old, newTotal, a.version);
    }

    function setEligibility(bytes32 obligationId, bytes32[] calldata classes, bool allowed) external onlyRole(RULES_ROLE) {
        for (uint256 i; i < classes.length; ++i) {
            eligible[obligationId][classes[i]] = allowed;
            emit EligibilitySet(obligationId, classes[i], allowed);
        }
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ===================== core =====================

    /// @notice Commit a whole allocation plan. All lines succeed or the entire call reverts.
    function reserveBatch(
        bytes32 allocationId,
        bytes32[] calldata assetIds,
        bytes32[] calldata obligationIds,
        uint128[] calldata qtys,
        uint64[] calldata expectedVersions,
        bytes32 planHash
    ) external onlyRole(ALLOCATOR_ROLE) whenNotPaused {
        uint256 n = assetIds.length;
        if (n == 0) revert EmptyBatch();
        if (obligationIds.length != n || qtys.length != n || expectedVersions.length != n) revert LengthMismatch();
        if (allocations[allocationId].committedAt != 0) revert DuplicateAllocation(allocationId);

        // Phase 1: validate against the state the plan was computed on (no mutation yet)
        for (uint256 i; i < n; ++i) {
            if (qtys[i] == 0) revert ZeroQuantity(i);
            Asset storage a = _existing(assetIds[i]);
            if (!eligible[obligationIds[i]][a.assetClass]) revert Ineligible(assetIds[i], obligationIds[i]);
            if (a.version != expectedVersions[i]) revert StalePlan(assetIds[i], expectedVersions[i], a.version);
        }
        // Phase 2: apply; cumulative check handles the same asset appearing on several lines
        for (uint256 i; i < n; ++i) {
            _reserveLine(allocationId, assetIds[i], obligationIds[i], qtys[i]);
        }
        allocations[allocationId] = Allocation(msg.sender, planHash, uint64(block.timestamp), true);
        emit AllocationCommitted(allocationId, planHash, n, msg.sender);
    }

    /// @notice Release every line of an allocation (obligation settled or plan withdrawn).
    function release(bytes32 allocationId) external whenNotPaused {
        Allocation storage al = allocations[allocationId];
        if (al.committedAt == 0) revert UnknownAllocation(allocationId);
        if (!al.active) revert AllocationNotActive(allocationId);
        if (al.allocator != msg.sender && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotAllocationOwner(allocationId);
        al.active = false;
        Line[] storage ls = _lines[allocationId];
        for (uint256 i; i < ls.length; ++i) {
            Asset storage a = _assets[ls[i].assetId];
            a.reserved -= ls[i].qty;
            a.version++;
            pledgedTo[ls[i].obligationId][ls[i].assetId] -= ls[i].qty;
            emit Released(allocationId, ls[i].assetId, ls[i].obligationId, ls[i].qty, a.total - a.reserved);
        }
        emit AllocationReleased(allocationId, msg.sender);
    }

    /// @notice Atomically swap the asset on one line (collateral substitution). Old units are freed
    ///         only if the new units can be reserved; otherwise nothing changes.
    function substitute(bytes32 allocationId, uint256 lineIdx, bytes32 newAssetId, uint128 newQty, uint64 expectedVersion)
        external whenNotPaused
    {
        Allocation storage al = allocations[allocationId];
        if (al.committedAt == 0) revert UnknownAllocation(allocationId);
        if (!al.active) revert AllocationNotActive(allocationId);
        if (al.allocator != msg.sender) revert NotAllocationOwner(allocationId);
        if (newQty == 0) revert ZeroQuantity(lineIdx);
        Line storage l = _lines[allocationId][lineIdx];
        Asset storage na = _existing(newAssetId);
        if (!eligible[l.obligationId][na.assetClass]) revert Ineligible(newAssetId, l.obligationId);
        if (na.version != expectedVersion) revert StalePlan(newAssetId, expectedVersion, na.version);

        Asset storage oa = _assets[l.assetId];
        oa.reserved -= l.qty;                     // free old units first (same asset may be re-used)
        oa.version++;
        pledgedTo[l.obligationId][l.assetId] -= l.qty;
        uint256 free = na.total - na.reserved;
        if (newQty > free) revert InsufficientQuantity(newAssetId, newQty, free);
        na.reserved += newQty;
        na.version++;
        pledgedTo[l.obligationId][newAssetId] += newQty;
        emit Substituted(allocationId, lineIdx, l.assetId, newAssetId, newQty);
        l.assetId = newAssetId;
        l.qty = newQty;
    }

    function _reserveLine(bytes32 allocationId, bytes32 assetId, bytes32 obligationId, uint128 qty) private {
        Asset storage a = _assets[assetId];
        uint256 free = a.total - a.reserved;
        if (qty > free) revert InsufficientQuantity(assetId, qty, free);
        a.reserved += qty;
        a.version++;
        pledgedTo[obligationId][assetId] += qty;
        _lines[allocationId].push(Line(assetId, obligationId, qty));
        emit Reserved(allocationId, assetId, obligationId, qty, a.total - a.reserved);
    }

    // ===================== views =====================

    function getAsset(bytes32 assetId) external view returns (Asset memory) { return _existing(assetId); }
    function available(bytes32 assetId) external view returns (uint256) { Asset storage a = _existing(assetId); return a.total - a.reserved; }
    function listAssets() external view returns (bytes32[] memory) { return _assetIds; }
    function getLines(bytes32 allocationId) external view returns (Line[] memory) { return _lines[allocationId]; }

    function _existing(bytes32 assetId) private view returns (Asset storage a) {
        a = _assets[assetId];
        if (!a.exists) revert UnknownAsset(assetId);
    }
}
