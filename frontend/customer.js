// Configuration
const CONFIG = {
    GATEWAY_ADDRESS: '0x8294FeDE0452886cEb67e9845e64C9e978aeE01B',
    USDT_ADDRESS: '0x703F9d58C2c240C87D9670e22B0aAEE522DCE95f',
    CHAIN_ID: 11155111, // Sepolia Testnet
    RPC_URL: 'https://sepolia.infura.io/v3/3b5892c7c5654215bf520b0e28e3ed52'
};

const GATEWAY_ABI = [
    "function executePayment(bytes32 paymentId) external",
    "function getPaymentIntent(bytes32 paymentId) external view returns (tuple(bytes32 paymentId, address merchant, address tokenAddress, uint256 amount, uint256 expiryTimestamp, uint8 status, uint256 createdAt, address payer, uint256 paidAt))",
    "function getMerchant(address merchantAddress) external view returns (tuple(address merchantAddress, string businessName, bool isActive, uint256 registeredAt, uint256 totalPaymentsReceived))"
];

const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

let provider, signer, gateway, usdt, userAddress;
let currentPayment = null;

// Show alert
function showAlert(message, type = 'info') {
    const container = document.getElementById('alertContainer');
    container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}

// Clear alert
function clearAlert() {
    document.getElementById('alertContainer').innerHTML = '';
}

// Initialize wallet connection
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        showAlert('Please install MetaMask to make payments', 'error');
        return false;
    }

    try {
        // Check if MetaMask is locked
        const accounts = await window.ethereum.request({
            method: 'eth_accounts'
        });

        if (accounts.length === 0) {
            // Request account access
            await window.ethereum.request({
                method: 'eth_requestAccounts'
            });
        }

        // Wait for MetaMask to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        signer = provider.getSigner();
        userAddress = await signer.getAddress();

        // Check network
        const network = await provider.getNetwork();
        if (network.chainId !== CONFIG.CHAIN_ID) {
            showAlert('Please switch to Sepolia testnet in MetaMask', 'error');
            return false;
        }

        // Initialize contracts
        gateway = new ethers.Contract(CONFIG.GATEWAY_ADDRESS, GATEWAY_ABI, signer);
        usdt = new ethers.Contract(CONFIG.USDT_ADDRESS, ERC20_ABI, signer);

        // Update UI
        updateWalletStatus(true);
        return true;

    } catch (error) {
        console.error('Connection error:', error);
        if (error.code === 4001) {
            showAlert('Please approve the connection in MetaMask', 'error');
        } else if (error.code === -32002) {
            showAlert('Please open MetaMask and approve the pending request', 'error');
        } else {
            showAlert('Failed to connect. Please unlock MetaMask and try again.', 'error');
        }
        return false;
    }
}

// Update wallet status
function updateWalletStatus(connected) {
    const indicator = document.getElementById('statusIndicator');
    const addressDisplay = document.getElementById('walletAddress');
    
    if (connected) {
        indicator.classList.add('connected');
        addressDisplay.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    } else {
        indicator.classList.remove('connected');
        addressDisplay.textContent = 'Not connected';
    }
}

// Load payment intent
async function loadPayment(paymentId) {
    try {
        clearAlert();
        showAlert('Loading payment details...', 'info');

        // Initialize provider if not already done
        if (!provider) {
            provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL || 'https://rpc.sepolia.org');
        }

        // Initialize contracts for reading (without signer)
        if (!gateway) {
            gateway = new ethers.Contract(CONFIG.GATEWAY_ADDRESS, GATEWAY_ABI, provider);
        }
        if (!usdt) {
            usdt = new ethers.Contract(CONFIG.USDT_ADDRESS, ERC20_ABI, provider);
        }

        // Convert to bytes32
        const paymentIdBytes = ethers.utils.formatBytes32String(paymentId);

        // Get payment intent
        const payment = await gateway.getPaymentIntent(paymentIdBytes);
        
        // Check if payment exists
        if (payment.merchant === ethers.constants.AddressZero) {
            showAlert('Payment not found', 'error');
            return;
        }
        
        // Check status
        const statusMap = ['PENDING', 'COMPLETED', 'EXPIRED', 'REFUNDED', 'CANCELLED'];
        const status = statusMap[payment.status];
        
        if (status !== 'PENDING') {
            showAlert(`This payment is ${status} and cannot be processed`, 'warning');
            return;
        }
        
        // Check expiry
        const now = Math.floor(Date.now() / 1000);
        if (now > payment.expiryTimestamp) {
            showAlert('This payment has expired', 'error');
            return;
        }
        
        // Get merchant info
        const merchant = await gateway.getMerchant(payment.merchant);
        
        // Get token info
        const decimals = await usdt.decimals();
        const amount = ethers.utils.formatUnits(payment.amount, decimals);
        
        // Update UI
        document.getElementById('merchantName').textContent = merchant.businessName;
        document.getElementById('displayPaymentId').textContent = paymentId;
        document.getElementById('amountDisplay').textContent = `${amount} USDT`;
        
        const expiryDate = new Date(payment.expiryTimestamp * 1000);
        document.getElementById('expiryDisplay').textContent = expiryDate.toLocaleString();
        
        // Store current payment
        currentPayment = {
            paymentId: paymentIdBytes,
            amount: payment.amount,
            decimals: decimals
        };
        
        // Show payment buttons
        document.getElementById('loadPaymentBtn').style.display = 'none';
        document.getElementById('paymentIdInput').disabled = true;
        document.getElementById('stepsContainer').style.display = 'block';
        
        // Check if wallet connected
        if (!userAddress) {
            document.getElementById('connectWalletBtn').style.display = 'block';
            showAlert('Please connect your wallet to continue', 'info');
        } else {
            await checkApprovalAndShowButtons();
        }
        
    } catch (error) {
        console.error('Load payment error:', error);
        showAlert('Failed to load payment: ' + error.message, 'error');
    }
}

// Check token approval
async function checkApprovalAndShowButtons() {
    try {
        const allowance = await usdt.allowance(userAddress, CONFIG.GATEWAY_ADDRESS);
        
        if (allowance.gte(currentPayment.amount)) {
            // Already approved
            document.getElementById('approveBtn').style.display = 'none';
            document.getElementById('payBtn').style.display = 'block';
            showAlert('Tokens approved! Click "Complete Payment" to proceed', 'success');
        } else {
            // Need approval
            document.getElementById('approveBtn').style.display = 'block';
            document.getElementById('payBtn').style.display = 'none';
            showAlert('Please approve tokens first', 'info');
        }
    } catch (error) {
        console.error('Check approval error:', error);
    }
}

// Approve tokens
async function approveTokens() {
    try {
        clearAlert();
        showAlert('Requesting token approval...', 'info');
        
        const tx = await usdt.approve(CONFIG.GATEWAY_ADDRESS, currentPayment.amount);
        showAlert('Approval submitted. Waiting for confirmation...', 'info');
        
        await tx.wait();
        showAlert('Tokens approved successfully!', 'success');
        
        // Update buttons
        document.getElementById('approveBtn').style.display = 'none';
        document.getElementById('payBtn').style.display = 'block';
        
    } catch (error) {
        console.error('Approval error:', error);
        showAlert('Approval failed: ' + error.message, 'error');
    }
}

// Execute payment
async function executePayment() {
    try {
        clearAlert();
        showAlert('Processing payment...', 'info');
        
        // Check balance
        const balance = await usdt.balanceOf(userAddress);
        if (balance.lt(currentPayment.amount)) {
            showAlert('Insufficient USDT balance', 'error');
            return;
        }
        
        const tx = await gateway.executePayment(currentPayment.paymentId);
        showAlert('Payment submitted. Waiting for confirmation...', 'info');
        
        const receipt = await tx.wait();
        
        const txLink = `${CONFIG.EXPLORER_URL}/tx/${receipt.transactionHash}`;
        showAlert(
            `Payment completed successfully! <br><a href="${txLink}" target="_blank" class="tx-link">View transaction</a>`,
            'success'
        );
        
        // Hide buttons
        document.getElementById('payBtn').style.display = 'none';
        
    } catch (error) {
        console.error('Payment error:', error);
        let errorMessage = 'Payment failed: ';
        
        if (error.message.includes('PaymentAlreadyExpired')) {
            errorMessage += 'Payment has expired';
        } else if (error.message.includes('InsufficientPayment')) {
            errorMessage += 'Insufficient balance';
        } else {
            errorMessage += error.message;
        }
        
        showAlert(errorMessage, 'error');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loadPaymentBtn').addEventListener('click', () => {
        const paymentId = document.getElementById('paymentIdInput').value.trim();
        if (paymentId) {
            loadPayment(paymentId);
        } else {
            showAlert('Please enter a payment ID', 'error');
        }
    });
    
    document.getElementById('connectWalletBtn').addEventListener('click', async () => {
        const connected = await connectWallet();
        if (connected && currentPayment) {
            document.getElementById('connectWalletBtn').style.display = 'none';
            await checkApprovalAndShowButtons();
        }
    });
    
    document.getElementById('approveBtn').addEventListener('click', approveTokens);
    document.getElementById('payBtn').addEventListener('click', executePayment);
    
    // Listen for account changes
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => {
            window.location.reload();
        });
        
        window.ethereum.on('chainChanged', () => {
            window.location.reload();
        });
    }
    
    // Auto-connect if already connected
    if (window.ethereum) {
        window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
            if (accounts.length > 0) {
                connectWallet();
            }
        });
    }
});
