// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract PaymentGateway is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // Structs
    struct Merchant {
        address merchantAddress;
        string businessName;
        bool isActive;
        uint256 registeredAt;
        uint256 totalPaymentsReceived;
    }

    struct PaymentIntent {
        bytes32 paymentId;
        address merchant;
        address tokenAddress;
        uint256 amount;
        uint256 expiryTimestamp;
        PaymentStatus status;
        uint256 createdAt;
        address payer;
        uint256 paidAt;
    }

    enum PaymentStatus {
        Pending,
        Completed,
        Expired,
        Refunded,
        Cancelled
    }

    // State variables
    mapping(address => Merchant) public merchants;
    mapping(bytes32 => PaymentIntent) public paymentIntents;
    mapping(address => bytes32[]) public merchantPayments;
    mapping(address => bool) public supportedTokens;
    
    address[] public merchantList;
    uint256 public constant MIN_CONFIRMATIONS = 1;
    uint256 public platformFeePercentage = 25; // 0.25% (25/10000)
    uint256 public constant FEE_DENOMINATOR = 10000;
    address public feeCollector;

    // Events
    event MerchantRegistered(address indexed merchant, string businessName, uint256 timestamp);
    event MerchantDeactivated(address indexed merchant, uint256 timestamp);
    event MerchantReactivated(address indexed merchant, uint256 timestamp);
    event PaymentIntentCreated(
        bytes32 indexed paymentId,
        address indexed merchant,
        address tokenAddress,
        uint256 amount,
        uint256 expiryTimestamp
    );
    event PaymentCompleted(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed merchant,
        uint256 amount,
        uint256 platformFee,
        uint256 timestamp
    );
    event PaymentRefunded(
        bytes32 indexed paymentId,
        address indexed merchant,
        address indexed payer,
        uint256 amount,
        uint256 timestamp
    );
    event PaymentExpired(bytes32 indexed paymentId, uint256 timestamp);
    event PaymentCancelled(bytes32 indexed paymentId, address indexed merchant, uint256 timestamp);
    event TokenSupportUpdated(address indexed token, bool supported);
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeCollectorUpdated(address indexed oldCollector, address indexed newCollector);

    // Errors
    error MerchantAlreadyRegistered();
    error MerchantNotRegistered();
    error MerchantNotActive();
    error PaymentIntentAlreadyExists();
    error PaymentIntentNotFound();
    error InvalidPaymentAmount();
    error InvalidExpiryTime();
    error PaymentAlreadyExpired();
    error PaymentAlreadyProcessed();
    error TokenNotSupported();
    error InvalidTokenAddress();
    error InsufficientPayment();
    error PaymentNotRefundable();
    error UnauthorizedAccess();
    error InvalidFeePercentage();
    error InvalidAddress();

    constructor(address _feeCollector) Ownable(msg.sender) {
        if (_feeCollector == address(0)) revert InvalidAddress();
        feeCollector = _feeCollector;
    }

    // Modifiers
    modifier onlyActiveMerchant() {
        if (!merchants[msg.sender].isActive) revert MerchantNotActive();
        _;
    }

    modifier onlyMerchant(bytes32 paymentId) {
        if (paymentIntents[paymentId].merchant != msg.sender) revert UnauthorizedAccess();
        _;
    }

    function registerMerchant(string calldata businessName) external {
        if (merchants[msg.sender].merchantAddress != address(0)) revert MerchantAlreadyRegistered();
        
        merchants[msg.sender] = Merchant({
            merchantAddress: msg.sender,
            businessName: businessName,
            isActive: true,
            registeredAt: block.timestamp,
            totalPaymentsReceived: 0
        });

        merchantList.push(msg.sender);
        emit MerchantRegistered(msg.sender, businessName, block.timestamp);
    }

    function deactivateMerchant() external {
        if (merchants[msg.sender].merchantAddress == address(0)) revert MerchantNotRegistered();
        
        merchants[msg.sender].isActive = false;
        emit MerchantDeactivated(msg.sender, block.timestamp);
    }

    function reactivateMerchant() external {
        if (merchants[msg.sender].merchantAddress == address(0)) revert MerchantNotRegistered();
        
        merchants[msg.sender].isActive = true;
        emit MerchantReactivated(msg.sender, block.timestamp);
    }

    function createPaymentIntent(
        bytes32 paymentId,
        address tokenAddress,
        uint256 amount,
        uint256 expiryTimestamp
    ) external onlyActiveMerchant whenNotPaused {
        if (paymentIntents[paymentId].merchant != address(0)) revert PaymentIntentAlreadyExists();
        if (amount == 0) revert InvalidPaymentAmount();
        if (expiryTimestamp <= block.timestamp) revert InvalidExpiryTime();
        if (!supportedTokens[tokenAddress]) revert TokenNotSupported();
        if (tokenAddress == address(0)) revert InvalidTokenAddress();

        paymentIntents[paymentId] = PaymentIntent({
            paymentId: paymentId,
            merchant: msg.sender,
            tokenAddress: tokenAddress,
            amount: amount,
            expiryTimestamp: expiryTimestamp,
            status: PaymentStatus.Pending,
            createdAt: block.timestamp,
            payer: address(0),
            paidAt: 0
        });

        merchantPayments[msg.sender].push(paymentId);

        emit PaymentIntentCreated(
            paymentId,
            msg.sender,
            tokenAddress,
            amount,
            expiryTimestamp
        );
    }

    function executePayment(bytes32 paymentId) external nonReentrant whenNotPaused {
        PaymentIntent storage intent = paymentIntents[paymentId];
        
        if (intent.merchant == address(0)) revert PaymentIntentNotFound();
        if (intent.status != PaymentStatus.Pending) revert PaymentAlreadyProcessed();
        if (block.timestamp > intent.expiryTimestamp) {
            intent.status = PaymentStatus.Expired;
            emit PaymentExpired(paymentId, block.timestamp);
            revert PaymentAlreadyExpired();
        }
        if (!merchants[intent.merchant].isActive) revert MerchantNotActive();

        IERC20 token = IERC20(intent.tokenAddress);
        uint256 payerBalance = token.balanceOf(msg.sender);
        
        if (payerBalance < intent.amount) revert InsufficientPayment();

        // Calculate platform fee
        uint256 platformFee = (intent.amount * platformFeePercentage) / FEE_DENOMINATOR;
        uint256 merchantAmount = intent.amount - platformFee;

        // Transfer tokens from payer to merchant and fee collector
        token.safeTransferFrom(msg.sender, intent.merchant, merchantAmount);
        if (platformFee > 0) {
            token.safeTransferFrom(msg.sender, feeCollector, platformFee);
        }

        // Update payment intent
        intent.status = PaymentStatus.Completed;
        intent.payer = msg.sender;
        intent.paidAt = block.timestamp;

        // Update merchant stats
        merchants[intent.merchant].totalPaymentsReceived += intent.amount;

        emit PaymentCompleted(
            paymentId,
            msg.sender,
            intent.merchant,
            intent.amount,
            platformFee,
            block.timestamp
        );
    }

    function refundPayment(bytes32 paymentId) 
        external 
        nonReentrant 
        onlyMerchant(paymentId) 
        whenNotPaused 
    {
        PaymentIntent storage intent = paymentIntents[paymentId];
        
        if (intent.status != PaymentStatus.Completed) revert PaymentNotRefundable();
        
        // Calculate refund amounts (excluding platform fee)
        uint256 platformFee = (intent.amount * platformFeePercentage) / FEE_DENOMINATOR;
        uint256 refundAmount = intent.amount - platformFee;

        IERC20 token = IERC20(intent.tokenAddress);
        
        // Transfer refund from merchant back to payer
        token.safeTransferFrom(msg.sender, intent.payer, refundAmount);

        intent.status = PaymentStatus.Refunded;

        emit PaymentRefunded(
            paymentId,
            msg.sender,
            intent.payer,
            refundAmount,
            block.timestamp
        );
    }

    function cancelPaymentIntent(bytes32 paymentId) 
        external 
        onlyMerchant(paymentId) 
    {
        PaymentIntent storage intent = paymentIntents[paymentId];
        
        if (intent.status != PaymentStatus.Pending) revert PaymentAlreadyProcessed();
        
        intent.status = PaymentStatus.Cancelled;
        
        emit PaymentCancelled(paymentId, msg.sender, block.timestamp);
    }

    function markPaymentExpired(bytes32 paymentId) external {
        PaymentIntent storage intent = paymentIntents[paymentId];
        
        if (intent.merchant == address(0)) revert PaymentIntentNotFound();
        if (intent.status != PaymentStatus.Pending) revert PaymentAlreadyProcessed();
        if (block.timestamp <= intent.expiryTimestamp) revert InvalidExpiryTime();
        
        intent.status = PaymentStatus.Expired;
        
        emit PaymentExpired(paymentId, block.timestamp);
    }

    // Admin functions

    function setTokenSupport(address tokenAddress, bool supported) external onlyOwner {
        if (tokenAddress == address(0)) revert InvalidTokenAddress();
        supportedTokens[tokenAddress] = supported;
        emit TokenSupportUpdated(tokenAddress, supported);
    }

    function setPlatformFee(uint256 newFeePercentage) external onlyOwner {
        if (newFeePercentage > 1000) revert InvalidFeePercentage(); // Max 10%
        uint256 oldFee = platformFeePercentage;
        platformFeePercentage = newFeePercentage;
        emit PlatformFeeUpdated(oldFee, newFeePercentage);
    }

    function setFeeCollector(address newFeeCollector) external onlyOwner {
        if (newFeeCollector == address(0)) revert InvalidAddress();
        address oldCollector = feeCollector;
        feeCollector = newFeeCollector;
        emit FeeCollectorUpdated(oldCollector, newFeeCollector);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // View functions

    function getMerchant(address merchantAddress) external view returns (Merchant memory) {
        return merchants[merchantAddress];
    }

    function getPaymentIntent(bytes32 paymentId) external view returns (PaymentIntent memory) {
        return paymentIntents[paymentId];
    }

    function getMerchantPayments(address merchantAddress) external view returns (bytes32[] memory) {
        return merchantPayments[merchantAddress];
    }

    function getTotalMerchants() external view returns (uint256) {
        return merchantList.length;
    }

    function isTokenSupported(address tokenAddress) external view returns (bool) {
        return supportedTokens[tokenAddress];
    }

    function getMerchantByIndex(uint256 index) external view returns (address) {
        require(index < merchantList.length, "Index out of bounds");
        return merchantList[index];
    }
}
