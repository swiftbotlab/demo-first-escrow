// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DemoFirstEscrow
/// @notice Demo-first Escrow — A minimal USDC escrow for software jobs where the client pays only after seeing a working demo.
/// @dev Native USDC on Arc (18 decimals, msg.value). No owner, no fees, no upgradeability. Auditable by design.
/// Arc note: transaction fee configuration (e.g., maxFeePerGas floor of 20 gwei) is enforced off-chain, not in contract code.
/// @author Swift Bot Labs
contract DemoFirstEscrow {
    enum Status {
        None,
        Funded,
        Delivered,
        Released,
        Refunded
    }

    struct Escrow {
        address client;
        address builder;
        uint128 amount;
        uint64 deliverBy;
        uint64 reviewPeriod;
        uint64 deliveredAt;
        Status status;
        string title;
        string deliveryURI;
        bytes32 deliveryHash;
    }

    error ZeroValue();
    error AmountTooLarge();
    error ZeroAddress();
    error SelfEscrow();
    error InvalidDeadline();
    error InvalidReviewPeriod();
    error TitleTooLong();
    error TitleEmpty();
    error URIEmpty();
    error URITooLong();
    error NoteTooLong();
    error WrongStatus(Status expected, Status actual);
    error NotClient();
    error NotBuilder();
    error DeadlineNotPassed();
    error StillInReviewWindow();
    error ReviewWindowExpired();
    error DeadlinePassed();
    error PayoutFailed();
    error NotFundedOrDelivered();
    error Reentrancy();
    error NothingToWithdraw();

    event EscrowCreated(
        uint256 indexed id,
        address indexed client,
        address indexed builder,
        uint128 amount,
        uint64 deliverBy,
        uint64 reviewPeriod,
        string title
    );
    event Delivered(
        uint256 indexed id,
        address indexed client,
        address indexed builder,
        string deliveryURI,
        bytes32 deliveryHash
    );
    event ChangesRequested(
        uint256 indexed id,
        address indexed client,
        address indexed builder,
        uint64 newDeliverBy,
        string note
    );
    event Released(uint256 indexed id, address indexed client, address indexed builder, uint128 amount);
    event Refunded(uint256 indexed id, address indexed client, address indexed builder, uint128 amount);
    event Withdrawn(address indexed recipient, uint256 amount);

    uint256 public escrowCount;
    uint256 public totalLocked;
    uint256 public totalReleased;
    uint256 public totalRefunded;

    mapping(address => uint256) public pendingWithdrawals;
    mapping(uint256 => Escrow) private _escrows;
    mapping(address => uint256[]) private _escrowsOf;

    bool private _locked;

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    /// @notice Create and fund a new escrow for a builder.
    /// @param builder The builder address that will receive payment on successful completion.
    /// @param deliverBy The delivery deadline as a unix timestamp.
    /// @param reviewPeriod The client review window in seconds (between 60 and 30 days).
    /// @param title A short title describing the job.
    /// @return id The newly created escrow id.
    function createEscrow(
        address builder,
        uint64 deliverBy,
        uint64 reviewPeriod,
        string calldata title
    ) external payable returns (uint256 id) {
        if (msg.value == 0) revert ZeroValue();
        if (msg.value > type(uint128).max) revert AmountTooLarge();
        if (builder == address(0)) revert ZeroAddress();
        if (builder == msg.sender) revert SelfEscrow();
        if (deliverBy <= block.timestamp) revert InvalidDeadline();
        if (reviewPeriod < 60 || reviewPeriod > 30 days) revert InvalidReviewPeriod();

        uint256 titleLen = bytes(title).length;
        if (titleLen == 0) revert TitleEmpty();
        if (titleLen > 120) revert TitleTooLong();

        id = ++escrowCount;

        _escrows[id] = Escrow({
            client: msg.sender,
            builder: builder,
            amount: uint128(msg.value),
            deliverBy: deliverBy,
            reviewPeriod: reviewPeriod,
            deliveredAt: 0,
            status: Status.Funded,
            title: title,
            deliveryURI: "",
            deliveryHash: bytes32(0)
        });

        _escrowsOf[msg.sender].push(id);
        _escrowsOf[builder].push(id);

        totalLocked += msg.value;

        emit EscrowCreated(id, msg.sender, builder, uint128(msg.value), deliverBy, reviewPeriod, title);
    }

    /// @notice Submit delivery details for a funded escrow before its delivery deadline.
    /// @param id The escrow id.
    /// @param deliveryURI URI pointing to the delivered demo/build.
    /// @param deliveryHash Hash of delivery artifacts.
    function deliver(uint256 id, string calldata deliveryURI, bytes32 deliveryHash) external nonReentrant {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.builder) revert NotBuilder();
        if (escrow.status != Status.Funded) revert WrongStatus(Status.Funded, escrow.status);
        if (block.timestamp > escrow.deliverBy) revert DeadlinePassed();

        uint256 uriLen = bytes(deliveryURI).length;
        if (uriLen == 0) revert URIEmpty();
        if (uriLen > 300) revert URITooLong();

        escrow.status = Status.Delivered;
        escrow.deliveredAt = uint64(block.timestamp);
        escrow.deliveryURI = deliveryURI;
        escrow.deliveryHash = deliveryHash;

        emit Delivered(id, escrow.client, escrow.builder, deliveryURI, deliveryHash);
    }

    /// @notice Request changes for a delivered escrow during the review window.
    /// @param id The escrow id.
    /// @param note Optional change request note (max 300 bytes).
    function requestChanges(uint256 id, string calldata note) external nonReentrant {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.client) revert NotClient();
        if (escrow.status != Status.Delivered) revert WrongStatus(Status.Delivered, escrow.status);
        if (block.timestamp > escrow.deliveredAt + escrow.reviewPeriod) revert ReviewWindowExpired();
        if (bytes(note).length > 300) revert NoteTooLong();

        escrow.status = Status.Funded;
        escrow.deliveredAt = 0;
        escrow.deliveryURI = "";
        escrow.deliveryHash = bytes32(0);

        uint64 newDeliverBy = uint64(block.timestamp + escrow.reviewPeriod);
        if (newDeliverBy > escrow.deliverBy) {
            escrow.deliverBy = newDeliverBy;
        }

        emit ChangesRequested(id, escrow.client, escrow.builder, escrow.deliverBy, note);
    }

    /// @notice Release escrow funds to the builder.
    /// @dev Intentionally accepts Status.Funded as well as Status.Delivered — a client may release before delivery as an early-trust payment. This is by design per the original specification.
    /// @param id The escrow id.
    function release(uint256 id) external nonReentrant {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.client) revert NotClient();
        if (escrow.status != Status.Funded && escrow.status != Status.Delivered) revert NotFundedOrDelivered();

        uint128 amt = escrow.amount;
        escrow.status = Status.Released;
        totalLocked -= amt;
        totalReleased += amt;

        pendingWithdrawals[escrow.builder] += amt;

        emit Released(id, escrow.client, escrow.builder, amt);
    }

    /// @notice Refund escrow funds to the client if the delivery deadline has passed while still funded.
    /// @param id The escrow id.
    function refund(uint256 id) external nonReentrant {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.client) revert NotClient();
        if (escrow.status != Status.Funded) revert WrongStatus(Status.Funded, escrow.status);
        if (block.timestamp <= escrow.deliverBy) revert DeadlineNotPassed();

        uint128 amt = escrow.amount;
        escrow.status = Status.Refunded;
        totalLocked -= amt;
        totalRefunded += amt;

        pendingWithdrawals[escrow.client] += amt;

        emit Refunded(id, escrow.client, escrow.builder, amt);
    }

    /// @notice Claim payout to builder after review window expiry if client is silent.
    /// @param id The escrow id.
    function claim(uint256 id) external nonReentrant {
        Escrow storage escrow = _escrows[id];

        if (escrow.status != Status.Delivered) revert WrongStatus(Status.Delivered, escrow.status);
        if (block.timestamp <= escrow.deliveredAt + escrow.reviewPeriod) revert StillInReviewWindow();

        uint128 amt = escrow.amount;
        escrow.status = Status.Released;
        totalLocked -= amt;
        totalReleased += amt;

        pendingWithdrawals[escrow.builder] += amt;

        emit Released(id, escrow.client, escrow.builder, amt);
    }

    /// @notice Cancel an active escrow and refund the client.
    /// @param id The escrow id.
    function cancel(uint256 id) external nonReentrant {
        Escrow storage escrow = _escrows[id];

        if (msg.sender != escrow.builder) revert NotBuilder();
        if (escrow.status != Status.Funded && escrow.status != Status.Delivered) revert NotFundedOrDelivered();

        uint128 amt = escrow.amount;
        escrow.status = Status.Refunded;
        totalLocked -= amt;
        totalRefunded += amt;

        pendingWithdrawals[escrow.client] += amt;

        emit Refunded(id, escrow.client, escrow.builder, amt);
    }

    /// @notice Withdraw accumulated payouts for msg.sender. Callable by anyone with a pending balance.
    function withdraw() external nonReentrant {
        uint256 amt = pendingWithdrawals[msg.sender];
        if (amt == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0;

        (bool ok, ) = msg.sender.call{value: amt}("");
        if (!ok) revert PayoutFailed();

        emit Withdrawn(msg.sender, amt);
    }

    /// @notice Get full escrow details by id.
    /// @param id The escrow id.
    /// @return escrow The escrow struct.
    function getEscrow(uint256 id) external view returns (Escrow memory escrow) {
        escrow = _escrows[id];
    }

    /// @notice Get all escrow ids associated with an address.
    /// @param who The address to query.
    /// @return ids Array of escrow ids.
    function escrowsOf(address who) external view returns (uint256[] memory ids) {
        ids = _escrowsOf[who];
    }

    /// @notice Check whether an escrow can be refunded by client due to missed deadline.
    /// @param id The escrow id.
    /// @return True if status is Funded and deliverBy has passed.
    function canRefund(uint256 id) external view returns (bool) {
        Escrow storage escrow = _escrows[id];
        return escrow.status == Status.Funded && block.timestamp > escrow.deliverBy;
    }

    /// @notice Check whether an escrow can be claimed by anyone on builder's behalf.
    /// @param id The escrow id.
    /// @return True if status is Delivered and review window has expired.
    function canClaim(uint256 id) external view returns (bool) {
        Escrow storage escrow = _escrows[id];
        return escrow.status == Status.Delivered && block.timestamp > escrow.deliveredAt + escrow.reviewPeriod;
    }
}
