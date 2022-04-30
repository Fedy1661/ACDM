import { ethers, network } from "hardhat";
import chai, { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ACDMPlatform, ACDMPlatform__factory, Token } from "../typechain";
import { BigNumber } from "ethers";

chai.use(require("chai-bignumber")());

async function increaseTime(time: number) {
  await network.provider.send("evm_increaseTime", [time]);
  await network.provider.send("evm_mine");
}

describe("ACDMPlatform Contract", function () {
  let platform: ACDMPlatform;
  let token: Token;
  let totalSumForAllTokens: BigNumber;
  let amountTokensForSale: BigNumber;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addr3: SignerWithAddress;
  let addr4: SignerWithAddress;
  let clean: string;

  const roundTime = 60 * 60 * 24 * 3;

  before(async () => {
    [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy("ACADEM Coin", "ACDM", 6, "0");
    const Platform: ACDMPlatform__factory = await ethers.getContractFactory(
      "ACDMPlatform"
    );
    platform = await Platform.deploy(token.address, roundTime);

    const totalTradingSum = await platform.totalTradingSum()
    const ethPerTokens = await platform.ethPerTokens();
    amountTokensForSale = totalTradingSum.div(ethPerTokens)
    totalSumForAllTokens = amountTokensForSale.mul(
      await platform.ethPerTokens()
    );

    await token.transferOwnership(platform.address);

    clean = await network.provider.send("evm_snapshot");
  });
  afterEach(async () => {
    await network.provider.send("evm_revert", [clean]);
    clean = await network.provider.send("evm_snapshot");
  });

  describe("AmountTokensForSale", () => {
    it("the initial value should be 100000", async () => {
      await platform.startSaleRound()
      await expect(await platform.amountTokensForSale()).to.be.eq(100000)
    });
    it("amount of tokens for sale should be decreased", async () => {
      await platform.startSaleRound()
      await platform.buyACDM({value: totalSumForAllTokens})
      await platform.startTradeRound()

      await increaseTime(roundTime);

      await expect(await platform.amountTokensForSale()).to.be.eq(0)
    });
  });
  describe("EthPerTokens", () => {
    it("should increase after each round", async () => {
      await platform.startSaleRound()
      await platform.buyACDM({value: totalSumForAllTokens})
      await platform.startTradeRound()

      await increaseTime(roundTime);

      await platform.startSaleRound();

      const ethPerTokens = await platform.ethPerTokens();
      await expect(ethPerTokens).to.be.eq(14300000000000)
    });
    it("the initial value should be 0.00001 ETH", async () => {
      await platform.startSaleRound()
      const ethPerTokens = await platform.ethPerTokens();
      await expect(ethPerTokens).to.be.eq(ethers.utils.parseEther('0.00001'))
    });
  });
  it("should revert if after sales round start sales round", async () => {
    await platform.startSaleRound()
    await increaseTime(roundTime);
    const tx = platform.startSaleRound();
    const reason = "Sales round is already active"
    await expect(tx).to.be.revertedWith(reason)
  });
  it("should revert if after trade round start trade round", async () => {
    await platform.startSaleRound()
    await increaseTime(roundTime);
    await platform.startTradeRound()
    await increaseTime(roundTime)
    const tx = platform.startTradeRound();
    const reason = "Trade round is already active"
    await expect(tx).to.be.revertedWith(reason)
  });
  describe("register", () => {
    it("should revert if user has already registered", async () => {
      await platform.connect(addr2).register(addr1.address);
      const tx = platform.connect(addr2).register(addr1.address);
      const reason = "You are already registered";
      await expect(tx).to.be.revertedWith(reason);
    });
  });
  describe("buyACDM", () => {
    it("should return excess ETH to buyer", async () => {
      const value = totalSumForAllTokens.mul(2);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      const platformBalance = await platform.provider.getBalance(
        platform.address
      );
      expect(platformBalance).to.be.eq(totalSumForAllTokens);
    });
    it("sales round should be completed if all tokens are sold", async () => {
      await platform.startSaleRound();
      await platform.buyACDM({ value: totalSumForAllTokens });
      const tx = platform.startTradeRound();
      await expect(tx).not.to.be.reverted;
    });
    it("first referral level should receive percent", async () => {
      const value = totalSumForAllTokens.div(2);
      const rewardFirstReferralLevel =
        await platform.rewardFirstReferralLevel();
      const reward = value.mul(rewardFirstReferralLevel).div(1000);

      await platform.connect(addr2).register(addr1.address);

      await platform.startSaleRound();

      const beforeBalance = await addr1.getBalance();
      await platform.connect(addr2).buyACDM({ value });

      const afterBalance = await addr1.getBalance();
      expect(afterBalance).to.be.eq(beforeBalance.add(reward));
    });
    it("second referral level should receive percent", async () => {
      const value = totalSumForAllTokens;
      const rewardSecondReferralLevel =
        await platform.rewardSecondReferralLevel();
      const reward = value.mul(rewardSecondReferralLevel).div(1000);

      // addr1
      // 1 level: addr2
      // 2 level: addr3
      await platform.connect(addr2).register(addr1.address);
      await platform.connect(addr3).register(addr2.address);

      await platform.startSaleRound();

      const beforeBalance = await addr1.getBalance();
      await platform.connect(addr3).buyACDM({ value });
      const afterBalance = await addr1.getBalance();

      expect(afterBalance).to.be.eq(beforeBalance.add(reward));
    });
    it("should revert if value equals 0", async () => {
      const tx = platform.buyACDM();
      const reason = "Value should be positive";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if sales round is not active", async () => {
      const tx = platform.buyACDM({ value: 1 });
      const reason = "Sales round is not active";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("buyer should receive tokens", async () => {
      const value = totalSumForAllTokens;
      await platform.startSaleRound();
      await platform.buyACDM({ value });

      const balance = await token.balanceOf(owner.address);
      expect(balance).to.be.equal(amountTokensForSale);
    });
    it("platform should get 100% if buyer has no referrals", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      const platformBalance = await platform.provider.getBalance(
        platform.address
      );
      expect(platformBalance).to.be.eq(totalSumForAllTokens);
    });
    it("platform should get 95% if buyer is at first referral level", async () => {
      const value = totalSumForAllTokens;
      const percent = 95;

      await platform.register(addr1.address)

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      const platformBalance = await platform.provider.getBalance(
        platform.address
      );
      expect(platformBalance).to.be.eq(totalSumForAllTokens.mul(percent).div(100));
    });
    it("platform should get 92% if buyer is at second referral level", async () => {
      const value = totalSumForAllTokens;
      const percent = 92;

      await platform.connect(addr1).register(addr2.address)
      await platform.register(addr1.address)

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      const platformBalance = await platform.provider.getBalance(
        platform.address
      );
      expect(platformBalance).to.be.eq(totalSumForAllTokens.mul(percent).div(100));
    });
  });
  it("should revert if start trade round at first", async () => {
    const tx = platform.startTradeRound();
    const reason = "Sales round never started";
    await expect(tx).to.be.revertedWith(reason);
  });
  it("should revert if sales round is not over", async () => {
    await platform.startSaleRound();
    const tx = platform.startTradeRound();
    const reason = "Sales round is active";
    await expect(tx).to.be.revertedWith(reason);
  });
  it("should revert if sales round is already active", async () => {
    await platform.startSaleRound();
    const tx = platform.startSaleRound();
    const reason = "Sales round is already active";
    await expect(tx).to.be.revertedWith(reason);
  });
  it("should revert if trade round is not over", async () => {
    await platform.startSaleRound();

    await increaseTime(roundTime);

    await platform.startTradeRound();
    const tx = platform.startSaleRound();
    const reason = "Trade round is active";
    await expect(tx).to.be.revertedWith(reason);
  });
  describe("startTradeRound", () => {
    it("trade round should be completed after 3 days", async () => {
      await platform.startSaleRound();

      await increaseTime(roundTime);

      await platform.startTradeRound();
      await increaseTime(roundTime);

      const tx = platform.startSaleRound();
      await expect(tx).not.to.be.reverted;
    });
  });
  describe("startSaleRound", () => {
    it("should call by any user", async () => {
      const tx = platform.connect(addr1).startSaleRound();
      await expect(tx).not.to.be.reverted;
    });
    it("should increase ethPerTokens", async () => {
      const beforeEthPerTokens = await platform.ethPerTokens();
      await platform.startSaleRound();
      await increaseTime(roundTime);
      await platform.startTradeRound();
      await increaseTime(roundTime);
      const afterEthPerTokens = await platform.ethPerTokens();

      expect(afterEthPerTokens).to.be.gt(beforeEthPerTokens);
    });
  });
  it("should debit tokens from the seller", async () => {
    const value = totalSumForAllTokens;
    await platform.startSaleRound();
    await platform.buyACDM({ value });
    await platform.startTradeRound();

    await token.approve(platform.address, amountTokensForSale);

    await platform.addOrder(amountTokensForSale, 1);
    const balance = await token.balanceOf(owner.address);
    expect(balance).to.be.eq(0);
  });
  it("buyer must receive tokens", async () => {
    const value = totalSumForAllTokens;
    await platform.startSaleRound();
    await platform.buyACDM({ value });
    await platform.startTradeRound();

    await token.approve(platform.address, amountTokensForSale);

    await platform.addOrder(amountTokensForSale, 1);
    await platform
      .connect(addr1)
      .redeemOrder(1, { value: amountTokensForSale });
    const balance = await token.balanceOf(addr1.address);
    expect(balance).to.be.eq(amountTokensForSale);
  });
  describe("addOrder", () => {
    it("should revert if trade round is not active", async () => {
      const value = totalSumForAllTokens.div(2);

      await platform.register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await token.approve(platform.address, amountTokensForSale);

      const tx = platform.addOrder(amountTokensForSale, 1);
      const reason = "Trade round is not active"
      await expect(tx).to.be.revertedWith(reason)
    });
    it("should revert if amount is not positive", async () => {
      const value = totalSumForAllTokens;

      await platform.register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound()

      await token.approve(platform.address, amountTokensForSale);

      const tx = platform.addOrder(0, 1);
      const reason = "Amount should be positive"
      await expect(tx).to.be.revertedWith(reason)
    });
    it("should revert if price is not positive", async () => {
      const value = totalSumForAllTokens;

      await platform.register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound()

      await token.approve(platform.address, amountTokensForSale);

      const tx = platform.addOrder(amountTokensForSale, 0);
      const reason = "Price should be positive"
      await expect(tx).to.be.revertedWith(reason)
    });
    it("should revert if not enough tokens", async () => {
      const value = totalSumForAllTokens;

      await platform.register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound()

      await token.approve(platform.address, amountTokensForSale);

      const tx = platform.addOrder(amountTokensForSale.mul(2), 1);
      const reason = "Not enough tokens"
      await expect(tx).to.be.revertedWith(reason)
    });
  });
  describe("redeemOrder", () => {
    it("should transfer percent to first referral level", async () => {
      const value = totalSumForAllTokens;
      const percent = await platform.rewardReferralsRedeemOrder()
      const reward = amountTokensForSale.mul(percent).div(1000);

      await platform.register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await token.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      const beforeBalance = await addr2.getBalance();
      await platform
        .connect(addr1)
        .redeemOrder(1, { value: amountTokensForSale });
      const afterBalance = await addr2.getBalance();

      await expect(afterBalance).to.be.eq(beforeBalance.add(reward));
    });
    it("should transfer percent to second referral level", async () => {
      const value = totalSumForAllTokens;
      const percent = await platform.rewardReferralsRedeemOrder()
      const reward = amountTokensForSale.mul(percent).div(1000);

      await platform.connect(addr2).register(addr1.address);
      await platform.register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await token.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      const beforeBalance = await addr1.getBalance();
      await platform
        .connect(addr3)
        .redeemOrder(1, { value: amountTokensForSale });
      const afterBalance = await addr1.getBalance();

      await expect(afterBalance).to.be.eq(beforeBalance.add(reward));
    });
    it("should return excess value", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await token.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      const beforeBalance = await addr1.getBalance();
      const tx = await platform
        .connect(addr1)
        .redeemOrder(1, { value: amountTokensForSale.mul(2) });
      const { effectiveGasPrice, cumulativeGasUsed } = await tx.wait();
      const transactionFee = effectiveGasPrice.mul(cumulativeGasUsed);
      const afterBalance = await addr1.getBalance();

      await expect(
        beforeBalance.sub(transactionFee).sub(afterBalance)
      ).to.be.eq(amountTokensForSale);
    });
    it("should revert if order does not exist", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await token.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      const tx = platform.redeemOrder(2, { value: amountTokensForSale });
      const reason = "Empty order";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if trade round is not active", async () => {
      const tx = platform.redeemOrder(2, {value: amountTokensForSale});
      const reason = "Trade round is not active";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if value is not positive", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await token.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      const tx = platform.redeemOrder(2);
      const reason = "Value should be positive";
      await expect(tx).to.be.revertedWith(reason);
    });
  });
  describe("removeOrder", () => {
    it("should revert if trade round is not active", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await token.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);

      await increaseTime(roundTime);

      const tx = platform.removeOrder(1);
      const reason = "Trade round is not active";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if caller is not an seller", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await token.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);

      const tx = platform.connect(addr1).removeOrder(1);
      const reason = "You are not an owner";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should delete order", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await token.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      await platform.removeOrder(1);

      const tx = platform.redeemOrder(1, { value: 1 });
      const reason = "Empty order";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should return tokens", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await token.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      await platform.removeOrder(1);

      const balance = await token.balanceOf(owner.address);
      expect(balance).to.be.eq(amountTokensForSale);
    });
  });
});