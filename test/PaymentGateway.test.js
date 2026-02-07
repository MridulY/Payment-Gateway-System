import { expect } from "chai";
import hre from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

const { ethers } = hre;

describe("PaymentGateway", function () {
  // Fixture for deployment
  async function deployPaymentGatewayFixture() {
    const [owner, feeCollector, merchant1, merchant2, customer1, customer2] = 
      await ethers.getSigners();

    // Deploy Mock USDT
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDT.deploy();

    // Deploy PaymentGateway
    const PaymentGateway = await ethers.getContractFactory("PaymentGateway");
    const gateway = await PaymentGateway.deploy(feeCollector.address);

    // Enable USDT as supported token
    await gateway.setTokenSupport(usdt.target, true);

    // Mint tokens to customers
    await usdt.faucet(customer1.address, ethers.parseUnits("10000", 6));
    await usdt.faucet(customer2.address, ethers.parseUnits("10000", 6));

    return { gateway, usdt, owner, feeCollector, merchant1, merchant2, customer1, customer2 };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { gateway, owner } = await loadFixture(deployPaymentGatewayFixture);
      expect(await gateway.owner()).to.equal(owner.address);
    });

    it("Should set the right fee collector", async function () {
      const { gateway, feeCollector } = await loadFixture(deployPaymentGatewayFixture);
      expect(await gateway.feeCollector()).to.equal(feeCollector.address);
    });

    it("Should have correct default platform fee", async function () {
      const { gateway } = await loadFixture(deployPaymentGatewayFixture);
      expect(await gateway.platformFeePercentage()).to.equal(25);
    });

    it("Should support USDT token", async function () {
      const { gateway, usdt } = await loadFixture(deployPaymentGatewayFixture);
      expect(await gateway.isTokenSupported(usdt.target)).to.be.true;
    });
  });

  describe("Merchant Registration", function () {
    it("Should allow merchant registration", async function () {
      const { gateway, merchant1 } = await loadFixture(deployPaymentGatewayFixture);

      const tx = await gateway.connect(merchant1).registerMerchant("Test Shop");
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(gateway, "MerchantRegistered")
        .withArgs(merchant1.address, "Test Shop", block.timestamp);

      const merchant = await gateway.getMerchant(merchant1.address);
      expect(merchant.businessName).to.equal("Test Shop");
      expect(merchant.isActive).to.be.true;
      expect(merchant.merchantAddress).to.equal(merchant1.address);
    });

    it("Should not allow duplicate registration", async function () {
      const { gateway, merchant1 } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      await expect(
        gateway.connect(merchant1).registerMerchant("Another Shop")
      ).to.be.revertedWithCustomError(gateway, "MerchantAlreadyRegistered");
    });

    it("Should allow merchant deactivation", async function () {
      const { gateway, merchant1 } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      await gateway.connect(merchant1).deactivateMerchant();

      const merchant = await gateway.getMerchant(merchant1.address);
      expect(merchant.isActive).to.be.false;
    });

    it("Should allow merchant reactivation", async function () {
      const { gateway, merchant1 } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      await gateway.connect(merchant1).deactivateMerchant();
      await gateway.connect(merchant1).reactivateMerchant();

      const merchant = await gateway.getMerchant(merchant1.address);
      expect(merchant.isActive).to.be.true;
    });

    it("Should track total merchants", async function () {
      const { gateway, merchant1, merchant2 } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Shop 1");
      await gateway.connect(merchant2).registerMerchant("Shop 2");

      expect(await gateway.getTotalMerchants()).to.equal(2);
    });
  });

  describe("Payment Intent Creation", function () {
    it("Should create payment intent successfully", async function () {
      const { gateway, usdt, merchant1 } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await expect(
        gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry)
      ).to.emit(gateway, "PaymentIntentCreated")
        .withArgs(paymentId, merchant1.address, usdt.target, amount, expiry);

      const intent = await gateway.getPaymentIntent(paymentId);
      expect(intent.merchant).to.equal(merchant1.address);
      expect(intent.amount).to.equal(amount);
      expect(intent.status).to.equal(0); // Pending
    });

    it("Should not allow inactive merchants to create payment intents", async function () {
      const { gateway, usdt, merchant1 } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      await gateway.connect(merchant1).deactivateMerchant();
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await expect(
        gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry)
      ).to.be.revertedWithCustomError(gateway, "MerchantNotActive");
    });

    it("Should not allow duplicate payment IDs", async function () {
      const { gateway, usdt, merchant1 } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);
      
      await expect(
        gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry)
      ).to.be.revertedWithCustomError(gateway, "PaymentIntentAlreadyExists");
    });

    it("Should not allow zero amount", async function () {
      const { gateway, usdt, merchant1 } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const expiry = (await time.latest()) + 3600;

      await expect(
        gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, 0, expiry)
      ).to.be.revertedWithCustomError(gateway, "InvalidPaymentAmount");
    });

    it("Should not allow expired timestamp", async function () {
      const { gateway, usdt, merchant1 } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) - 3600;

      await expect(
        gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry)
      ).to.be.revertedWithCustomError(gateway, "InvalidExpiryTime");
    });

    it("Should not allow unsupported tokens", async function () {
      const { gateway, merchant1 } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;
      const fakeToken = ethers.Wallet.createRandom().address;

      await expect(
        gateway.connect(merchant1).createPaymentIntent(paymentId, fakeToken, amount, expiry)
      ).to.be.revertedWithCustomError(gateway, "TokenNotSupported");
    });
  });

  describe("Payment Execution", function () {
    it("Should execute payment successfully", async function () {
      const { gateway, usdt, merchant1, customer1, feeCollector } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);
      
      // Approve tokens
      await usdt.connect(customer1).approve(gateway.target, amount);

      const merchantBalanceBefore = await usdt.balanceOf(merchant1.address);
      const feeCollectorBalanceBefore = await usdt.balanceOf(feeCollector.address);

      await expect(
        gateway.connect(customer1).executePayment(paymentId)
      ).to.emit(gateway, "PaymentCompleted");

      const intent = await gateway.getPaymentIntent(paymentId);
      expect(intent.status).to.equal(1); // Completed
      expect(intent.payer).to.equal(customer1.address);

      // Check balances
      const platformFee = (amount * 25n) / 10000n;
      const merchantAmount = amount - platformFee;

      expect(await usdt.balanceOf(merchant1.address)).to.equal(
        merchantBalanceBefore + merchantAmount
      );
      expect(await usdt.balanceOf(feeCollector.address)).to.equal(
        feeCollectorBalanceBefore + platformFee
      );
    });

    it("Should not allow payment without approval", async function () {
      const { gateway, usdt, merchant1, customer1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);

      await expect(
        gateway.connect(customer1).executePayment(paymentId)
      ).to.be.reverted;
    });

    it("Should not allow duplicate payment", async function () {
      const { gateway, usdt, merchant1, customer1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);
      await usdt.connect(customer1).approve(gateway.target, amount * 2n);
      await gateway.connect(customer1).executePayment(paymentId);

      await expect(
        gateway.connect(customer1).executePayment(paymentId)
      ).to.be.revertedWithCustomError(gateway, "PaymentAlreadyProcessed");
    });

    it("Should not allow payment after expiry", async function () {
      const { gateway, usdt, merchant1, customer1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);
      await usdt.connect(customer1).approve(gateway.target, amount);

      // Fast forward time
      await time.increase(3601);

      await expect(
        gateway.connect(customer1).executePayment(paymentId)
      ).to.be.revertedWithCustomError(gateway, "PaymentAlreadyExpired");
    });

    it("Should not allow payment to inactive merchant", async function () {
      const { gateway, usdt, merchant1, customer1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);
      await gateway.connect(merchant1).deactivateMerchant();
      await usdt.connect(customer1).approve(gateway.target, amount);

      await expect(
        gateway.connect(customer1).executePayment(paymentId)
      ).to.be.revertedWithCustomError(gateway, "MerchantNotActive");
    });

    it("Should update merchant statistics", async function () {
      const { gateway, usdt, merchant1, customer1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);
      await usdt.connect(customer1).approve(gateway.target, amount);
      await gateway.connect(customer1).executePayment(paymentId);

      const merchant = await gateway.getMerchant(merchant1.address);
      expect(merchant.totalPaymentsReceived).to.equal(amount);
    });
  });

  describe("Refunds", function () {
    it("Should allow merchant to refund payment", async function () {
      const { gateway, usdt, merchant1, customer1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);
      await usdt.connect(customer1).approve(gateway.target, amount);
      await gateway.connect(customer1).executePayment(paymentId);

      // Merchant approves refund
      const platformFee = (amount * 25n) / 10000n;
      const refundAmount = amount - platformFee;
      await usdt.connect(merchant1).approve(gateway.target, refundAmount);

      const customerBalanceBefore = await usdt.balanceOf(customer1.address);

      await expect(
        gateway.connect(merchant1).refundPayment(paymentId)
      ).to.emit(gateway, "PaymentRefunded");

      const intent = await gateway.getPaymentIntent(paymentId);
      expect(intent.status).to.equal(3); // Refunded

      expect(await usdt.balanceOf(customer1.address)).to.equal(
        customerBalanceBefore + refundAmount
      );
    });

    it("Should not allow non-merchant to refund", async function () {
      const { gateway, usdt, merchant1, customer1, customer2 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);
      await usdt.connect(customer1).approve(gateway.target, amount);
      await gateway.connect(customer1).executePayment(paymentId);

      await expect(
        gateway.connect(customer2).refundPayment(paymentId)
      ).to.be.revertedWithCustomError(gateway, "UnauthorizedAccess");
    });

    it("Should not allow refund of pending payment", async function () {
      const { gateway, usdt, merchant1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);

      await expect(
        gateway.connect(merchant1).refundPayment(paymentId)
      ).to.be.revertedWithCustomError(gateway, "PaymentNotRefundable");
    });
  });

  describe("Payment Intent Cancellation", function () {
    it("Should allow merchant to cancel pending payment", async function () {
      const { gateway, usdt, merchant1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);

      await expect(
        gateway.connect(merchant1).cancelPaymentIntent(paymentId)
      ).to.emit(gateway, "PaymentCancelled");

      const intent = await gateway.getPaymentIntent(paymentId);
      expect(intent.status).to.equal(4); // Cancelled
    });

    it("Should not allow cancellation of completed payment", async function () {
      const { gateway, usdt, merchant1, customer1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);
      await usdt.connect(customer1).approve(gateway.target, amount);
      await gateway.connect(customer1).executePayment(paymentId);

      await expect(
        gateway.connect(merchant1).cancelPaymentIntent(paymentId)
      ).to.be.revertedWithCustomError(gateway, "PaymentAlreadyProcessed");
    });
  });

  describe("Payment Expiry", function () {
    it("Should allow marking payment as expired", async function () {
      const { gateway, usdt, merchant1, customer1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);

      await time.increase(3601);

      await expect(
        gateway.connect(customer1).markPaymentExpired(paymentId)
      ).to.emit(gateway, "PaymentExpired");

      const intent = await gateway.getPaymentIntent(paymentId);
      expect(intent.status).to.equal(2); // Expired
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to add token support", async function () {
      const { gateway, owner } = await loadFixture(deployPaymentGatewayFixture);
      
      const newToken = ethers.Wallet.createRandom().address;
      
      await expect(
        gateway.connect(owner).setTokenSupport(newToken, true)
      ).to.emit(gateway, "TokenSupportUpdated")
        .withArgs(newToken, true);

      expect(await gateway.isTokenSupported(newToken)).to.be.true;
    });

    it("Should allow owner to update platform fee", async function () {
      const { gateway, owner } = await loadFixture(deployPaymentGatewayFixture);
      
      await expect(
        gateway.connect(owner).setPlatformFee(50)
      ).to.emit(gateway, "PlatformFeeUpdated")
        .withArgs(25, 50);

      expect(await gateway.platformFeePercentage()).to.equal(50);
    });

    it("Should not allow fee greater than 10%", async function () {
      const { gateway, owner } = await loadFixture(deployPaymentGatewayFixture);
      
      await expect(
        gateway.connect(owner).setPlatformFee(1001)
      ).to.be.revertedWithCustomError(gateway, "InvalidFeePercentage");
    });

    it("Should allow owner to update fee collector", async function () {
      const { gateway, owner, merchant1 } = await loadFixture(deployPaymentGatewayFixture);
      
      await expect(
        gateway.connect(owner).setFeeCollector(merchant1.address)
      ).to.emit(gateway, "FeeCollectorUpdated");

      expect(await gateway.feeCollector()).to.equal(merchant1.address);
    });

    it("Should allow owner to pause contract", async function () {
      const { gateway, owner } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(owner).pause();
      expect(await gateway.paused()).to.be.true;
    });

    it("Should not allow operations when paused", async function () {
      const { gateway, usdt, merchant1, owner } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      await gateway.connect(owner).pause();
      
      const paymentId = ethers.id("payment-001");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await expect(
        gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry)
      ).to.be.revertedWithCustomError(gateway, "EnforcedPause");
    });

    it("Should allow owner to unpause contract", async function () {
      const { gateway, owner } = await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(owner).pause();
      await gateway.connect(owner).unpause();
      expect(await gateway.paused()).to.be.false;
    });

    it("Should not allow non-owner to call admin functions", async function () {
      const { gateway, merchant1 } = await loadFixture(deployPaymentGatewayFixture);
      
      const newToken = ethers.Wallet.createRandom().address;
      
      await expect(
        gateway.connect(merchant1).setTokenSupport(newToken, true)
      ).to.be.revertedWithCustomError(gateway, "OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    it("Should return correct merchant payments", async function () {
      const { gateway, usdt, merchant1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const paymentId1 = ethers.id("payment-001");
      const paymentId2 = ethers.id("payment-002");
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      await gateway.connect(merchant1).createPaymentIntent(paymentId1, usdt.target, amount, expiry);
      await gateway.connect(merchant1).createPaymentIntent(paymentId2, usdt.target, amount, expiry);

      const payments = await gateway.getMerchantPayments(merchant1.address);
      expect(payments.length).to.equal(2);
      expect(payments[0]).to.equal(paymentId1);
      expect(payments[1]).to.equal(paymentId2);
    });

    it("Should return merchant by index", async function () {
      const { gateway, merchant1, merchant2 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Shop 1");
      await gateway.connect(merchant2).registerMerchant("Shop 2");

      expect(await gateway.getMerchantByIndex(0)).to.equal(merchant1.address);
      expect(await gateway.getMerchantByIndex(1)).to.equal(merchant2.address);
    });
  });

  describe("Gas Optimization Tests", function () {
    it("Should efficiently handle multiple payments", async function () {
      const { gateway, usdt, merchant1, customer1 } = 
        await loadFixture(deployPaymentGatewayFixture);
      
      await gateway.connect(merchant1).registerMerchant("Test Shop");
      
      const amount = ethers.parseUnits("100", 6);
      const expiry = (await time.latest()) + 3600;

      // Create and execute 5 payments
      for (let i = 0; i < 5; i++) {
        const paymentId = ethers.id(`payment-${i}`);
        await gateway.connect(merchant1).createPaymentIntent(paymentId, usdt.target, amount, expiry);
        await usdt.connect(customer1).approve(gateway.target, amount);
        await gateway.connect(customer1).executePayment(paymentId);
      }

      const merchant = await gateway.getMerchant(merchant1.address);
      expect(merchant.totalPaymentsReceived).to.equal(amount * 5n);
    });
  });
});
