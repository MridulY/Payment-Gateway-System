// Configuration
const CONFIG = {
    GATEWAY_ADDRESS: '0x8294FeDE0452886cEb67e9845e64C9e978aeE01B',
    USDT_ADDRESS: '0x703F9d58C2c240C87D9670e22B0aAEE522DCE95f',
    CHAIN_ID: 11155111, // Sepolia Testnet
    RPC_URL: 'https://sepolia.infura.io/v3/3b5892c7c5654215bf520b0e28e3ed52'
};

// Contract ABIs (minimal)
const GATEWAY_ABI = [
    "function registerMerchant(string calldata businessName) external",
    "function createPaymentIntent(bytes32 paymentId, address tokenAddress, uint256 amount, uint256 expiryTimestamp) external",
    "function getMerchant(address merchantAddress) external view returns (tuple(address merchantAddress, string businessName, bool isActive, uint256 registeredAt, uint256 totalPaymentsReceived))",
    "function getMerchantPayments(address merchantAddress) external view returns (bytes32[])",
    "function getPaymentIntent(bytes32 paymentId) external view returns (tuple(bytes32 paymentId, address merchant, address tokenAddress, uint256 amount, uint256 expiryTimestamp, uint8 status, uint256 createdAt, address payer, uint256 paidAt))",
    "event MerchantRegistered(address indexed merchant, string businessName, uint256 timestamp)",
    "event PaymentIntentCreated(bytes32 indexed paymentId, address indexed merchant, address tokenAddress, uint256 amount, uint256 expiryTimestamp)"
];

const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function balanceOf(address) view returns (uint256)"
];

// Global state
let provider, signer, gateway, usdt, userAddress;

// Initialize
async function init() {
    if (typeof window.ethereum === 'undefined') {
        showAlert('registerAlert', 'Please install MetaMask to use this dApp', 'error');
        return;
    }

    try {
        // Check if MetaMask is locked
        const accounts = await window.ethereum.request({
            method: 'eth_accounts'
        });

        if (accounts.length === 0) {
            // Request account access if not connected
            await window.ethereum.request({
                method: 'eth_requestAccounts'
            });
        }

        // Wait a moment for MetaMask to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        signer = provider.getSigner();
        userAddress = await signer.getAddress();

        // Check network
        const network = await provider.getNetwork();
        if (network.chainId !== CONFIG.CHAIN_ID) {
            showAlert('registerAlert', 'Please switch to Sepolia testnet in MetaMask', 'error');
            return;
        }

        // Initialize contracts
        gateway = new ethers.Contract(CONFIG.GATEWAY_ADDRESS, GATEWAY_ABI, signer);
        usdt = new ethers.Contract(CONFIG.USDT_ADDRESS, ERC20_ABI, provider);

        // Update UI
        updateWalletStatus(true);
        document.getElementById('merchantSection').classList.remove('hidden');

        // Load merchant data
        await loadMerchantData();
        await loadPayments();

    } catch (error) {
        console.error('Initialization error:', error);
        if (error.code === 4001) {
            showAlert('registerAlert', 'Please approve the connection in MetaMask', 'error');
        } else if (error.code === -32002) {
            showAlert('registerAlert', 'Please open MetaMask and approve the pending connection request', 'error');
        } else {
            showAlert('registerAlert', 'Failed to connect. Please unlock MetaMask and refresh the page.', 'error');
        }
    }
}

// Update wallet status
function updateWalletStatus(connected) {
    const indicator = document.getElementById('statusIndicator');
    const walletInfo = document.getElementById('walletInfo');
    
    if (connected) {
        indicator.classList.add('connected');
        walletInfo.innerHTML = `
            <div>
                <strong>Connected:</strong> ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}
            </div>
        `;
    } else {
        indicator.classList.remove('connected');
        walletInfo.innerHTML = '<button id="connectWallet" class="btn btn-primary">Connect MetaMask</button>';
    }
}

// Show alert
function showAlert(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    element.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => {
        element.innerHTML = '';
    }, 5000);
}

// Register merchant
async function registerMerchant(businessName) {
    try {
        showAlert('registerAlert', 'Submitting transaction...', 'info');
        
        const tx = await gateway.registerMerchant(businessName);
        showAlert('registerAlert', 'Transaction submitted. Waiting for confirmation...', 'info');
        
        await tx.wait();
        showAlert('registerAlert', 'Successfully registered as merchant!', 'success');
        
        // Reload merchant data
        await loadMerchantData();
        
    } catch (error) {
        console.error('Registration error:', error);
        showAlert('registerAlert', 'Registration failed: ' + error.message, 'error');
    }
}

// Create payment intent
async function createPayment(paymentId, amount, expiryMinutes) {
    try {
        showAlert('paymentAlert', 'Creating payment intent...', 'info');
        
        // Convert payment ID to bytes32
        const paymentIdBytes = ethers.utils.formatBytes32String(paymentId);
        
        // Get token decimals
        const decimals = await usdt.decimals();
        const amountInTokens = ethers.utils.parseUnits(amount.toString(), decimals);
        
        // Calculate expiry timestamp
        const expiryTimestamp = Math.floor(Date.now() / 1000) + (expiryMinutes * 60);
        
        const tx = await gateway.createPaymentIntent(
            paymentIdBytes,
            CONFIG.USDT_ADDRESS,
            amountInTokens,
            expiryTimestamp
        );
        
        showAlert('paymentAlert', 'Transaction submitted. Waiting for confirmation...', 'info');
        await tx.wait();
        
        showAlert('paymentAlert', 'Payment intent created successfully!', 'success');

        // Show payment link
        const paymentLinkSection = document.getElementById('paymentLinkSection');
        const paymentLinkUrl = document.getElementById('paymentLinkUrl');
        const customerPageUrl = `${window.location.origin}/customer.html?paymentId=${paymentId}`;
        paymentLinkUrl.textContent = customerPageUrl;
        paymentLinkSection.style.display = 'block';

        // Reload payments
        await loadPayments();

        // Reset form
        document.getElementById('createPaymentForm').reset();
        
    } catch (error) {
        console.error('Payment creation error:', error);
        showAlert('paymentAlert', 'Failed to create payment: ' + error.message, 'error');
    }
}

// Load merchant data
async function loadMerchantData() {
    try {
        const merchant = await gateway.getMerchant(userAddress);
        
        document.getElementById('totalPayments').textContent = '0';
        document.getElementById('totalVolume').textContent = ethers.utils.formatUnits(merchant.totalPaymentsReceived || 0, 6);
        document.getElementById('activeStatus').textContent = merchant.isActive ? '✓ Active' : '✗ Inactive';
        
    } catch (error) {
        console.error('Error loading merchant data:', error);
    }
}

// Load payments
async function loadPayments() {
    const paymentsList = document.getElementById('paymentsList');
    
    try {
        const paymentIds = await gateway.getMerchantPayments(userAddress);
        
        if (paymentIds.length === 0) {
            paymentsList.innerHTML = '<p style="text-align: center; color: #666;">No payments yet</p>';
            return;
        }
        
        let paymentsHtml = '';
        
        for (const paymentId of paymentIds) {
            try {
                const payment = await gateway.getPaymentIntent(paymentId);
                
                const statusMap = ['PENDING', 'COMPLETED', 'EXPIRED', 'REFUNDED', 'CANCELLED'];
                const status = statusMap[payment.status] || 'UNKNOWN';
                
                const amount = ethers.utils.formatUnits(payment.amount, 6);
                const paymentIdStr = ethers.utils.parseBytes32String(paymentId);
                
                paymentsHtml += `
                    <div class="payment-item">
                        <div class="payment-id">ID: ${paymentIdStr}</div>
                        <div class="payment-amount">${amount} USDT</div>
                        <span class="payment-status status-${status.toLowerCase()}">${status}</span>
                    </div>
                `;
            } catch (error) {
                console.error('Error loading payment:', error);
            }
        }
        
        paymentsList.innerHTML = paymentsHtml || '<p style="text-align: center; color: #666;">No payments found</p>';
        
    } catch (error) {
        console.error('Error loading payments:', error);
        paymentsList.innerHTML = '<p style="text-align: center; color: red;">Error loading payments</p>';
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Connect wallet button
    document.addEventListener('click', (e) => {
        if (e.target.id === 'connectWallet') {
            init();
        }
    });
    
    // Register form
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const businessName = document.getElementById('businessName').value;
        await registerMerchant(businessName);
    });
    
    // Create payment form
    document.getElementById('createPaymentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const paymentId = document.getElementById('paymentId').value;
        const amount = document.getElementById('amount').value;
        const expiry = document.getElementById('expiry').value;
        await createPayment(paymentId, amount, expiry);
    });
    
    // Refresh payments button
    document.getElementById('refreshPayments').addEventListener('click', loadPayments);

    // Copy link button
    document.getElementById('copyLinkBtn').addEventListener('click', () => {
        const linkText = document.getElementById('paymentLinkUrl').textContent;
        navigator.clipboard.writeText(linkText).then(() => {
            const btn = document.getElementById('copyLinkBtn');
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    });
    
    // Listen for account changes
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                updateWalletStatus(false);
                document.getElementById('merchantSection').classList.add('hidden');
            } else {
                window.location.reload();
            }
        });
        
        window.ethereum.on('chainChanged', () => {
            window.location.reload();
        });
    }
});
