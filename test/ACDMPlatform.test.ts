import { ethers, network } from "hardhat";
import chai, { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import {
  ACDMPlatform,
  ACDMPlatform__factory,
  DAO,
  DAO__factory,
  Staking,
  Staking__factory,
  Token,
  Token__factory,
} from "../typechain";
import { BigNumber } from "ethers";
import { StakingInterface } from "../typechain/Staking";
import {
  daysToSeconds,
  getBlockTimestamp,
  getTransactionFee,
  increaseTime,
} from "./utils";
import { ACDMPlatformInterface } from "../typechain/ACDMPlatform";

chai.use(require("chai-bignumber")());

describe("ACDMPlatform Contract", function () {
  let platform: ACDMPlatform;
  let iPlatform: ACDMPlatformInterface;

  let dao: DAO;

  let ACDMToken: Token;
  let XXXToken: Token;
  let LPToken: Token;

  let staking: Staking;
  let iStaking: StakingInterface;

  let totalSumForAllTokens: BigNumber;
  let amountTokensForSale: BigNumber;
  let initialEthPerToken: BigNumber;

  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addr3: SignerWithAddress;
  let addr4: SignerWithAddress;
  let clean: string;

  const roundTime = daysToSeconds(3);
  const debatingPeriodDuration = daysToSeconds(3);
  const freezeTime = daysToSeconds(30);
  const minimumQuorum = 100;

  before(async () => {
    [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
    const Token = <Token__factory>await ethers.getContractFactory("Token");
    const Staking = <Staking__factory>(
      await ethers.getContractFactory("Staking")
    );
    const DAO = <DAO__factory>await ethers.getContractFactory("DAO");
    const Platform = <ACDMPlatform__factory>(
      await ethers.getContractFactory("ACDMPlatform")
    );

    iStaking = <StakingInterface>Staking.interface;
    iPlatform = <ACDMPlatformInterface>Platform.interface;

    ACDMToken = await Token.deploy("ACADEM Coin", "ACDM", 6, 0);
    XXXToken = await Token.deploy(
      "XXX Coin",
      "XXX",
      18,
      ethers.utils.parseEther("100")
    );
    LPToken = await Token.deploy(
      "Uniswap V2",
      "UNI-V2",
      18,
      ethers.utils.parseEther("100")
    );
    staking = await Staking.deploy(
      LPToken.address,
      XXXToken.address,
      3
    );
    dao = await DAO.deploy(
      owner.address,
      staking.address,
      minimumQuorum,
      debatingPeriodDuration
    );
    platform = await Platform.deploy(ACDMToken.address, roundTime, dao.address);

    await staking.transferOwnership(dao.address);

    const totalTradingSum = await platform.totalTradingSum();
    initialEthPerToken = await platform.ethPerToken();
    amountTokensForSale = totalTradingSum.div(initialEthPerToken);
    totalSumForAllTokens = amountTokensForSale.mul(initialEthPerToken);

    await ACDMToken.transferOwnership(platform.address);

    clean = await network.provider.send("evm_snapshot");
  });
  afterEach(async () => {
    await network.provider.send("evm_revert", [clean]);
    clean = await network.provider.send("evm_snapshot");
  });

  describe("AmountTokensForSale", () => {
    it("the initial value should be 100000", async () => {
      await platform.startSaleRound();
      await expect(await platform.amountTokensForSale()).to.be.eq(100000);
    });
    it("should be decreased", async () => {
      const value = totalSumForAllTokens;
      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await increaseTime(roundTime);

      await expect(await platform.amountTokensForSale()).to.be.eq(0);
    });
    it("should depend on the total amount of trades", async () => {
      let value = totalSumForAllTokens;
      await platform.startSaleRound();
      await platform.buyACDM({ value });

      const ethPerToken = initialEthPerToken
        .mul(103)
        .div(100)
        .add(4000000000000);
      value = amountTokensForSale.mul(ethPerToken).mul(2);

      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, value);
      await platform.connect(addr1).redeemOrder(1, { value });

      await increaseTime(roundTime);

      await platform.startSaleRound();

      await expect(await platform.amountTokensForSale()).to.be.eq(
        amountTokensForSale.mul(2)
      );
    });
  });
  describe("ethPerToken", () => {
    it("should increase after each round", async () => {
      await platform.startSaleRound();
      await platform.buyACDM({ value: totalSumForAllTokens });
      await platform.startTradeRound();

      await increaseTime(roundTime);

      await platform.startSaleRound();

      const ethPerToken = await platform.ethPerToken();
      await expect(ethPerToken).to.be.eq(14300000000000);
    });
    it("the initial value should be 0.00001 ETH", async () => {
      await platform.startSaleRound();
      const ethPerToken = await platform.ethPerToken();
      await expect(ethPerToken).to.be.eq(ethers.utils.parseEther("0.00001"));
    });
    it("should be 0.0000143 ETH at the second round", async () => {
      const price = ethers.utils.parseEther("0.0000143");

      const round = 2;

      for (let i = 0; i < round - 1; i++) {
        await platform.startSaleRound();
        await increaseTime(roundTime);
        await platform.startTradeRound();
        await increaseTime(roundTime);
      }

      await platform.startSaleRound();

      const ethPerToken = await platform.ethPerToken();
      await expect(ethPerToken).to.be.eq(price);
    });
    it("should be 0.0000187 ETH at the third round", async () => {
      const price = ethers.utils.parseEther("0.0000187");

      const round = 3;

      for (let i = 0; i < round - 1; i++) {
        await platform.startSaleRound();
        await increaseTime(roundTime);
        await platform.startTradeRound();
        await increaseTime(roundTime);
      }

      await platform.startSaleRound();

      const ethPerToken = await platform.ethPerToken();
      await expect(ethPerToken).to.be.eq(price);
    });
    it("should be 0.0000233 ETH at the fourth round", async () => {
      const price = ethers.utils.parseEther("0.0000233");

      const round = 4;

      for (let i = 0; i < round - 1; i++) {
        await platform.startSaleRound();
        await increaseTime(roundTime);
        await platform.startTradeRound();
        await increaseTime(roundTime);
      }

      await platform.startSaleRound();

      const ethPerToken = await platform.ethPerToken();
      await expect(ethPerToken).to.be.eq(price);
    });
    it("should be 0.0000280 ETH at the fifth round", async () => {
      const price = ethers.utils.parseEther("0.0000280");

      const round = 5;

      for (let i = 0; i < round - 1; i++) {
        await platform.startSaleRound();
        await increaseTime(roundTime);
        await platform.startTradeRound();
        await increaseTime(roundTime);
      }

      await platform.startSaleRound();

      const ethPerToken = await platform.ethPerToken();
      await expect(ethPerToken).to.be.eq(price);
    });
    it("should be 0.0000328 ETH at the sixth round", async () => {
      const price = ethers.utils.parseEther("0.0000328");

      const round = 6;

      for (let i = 0; i < round - 1; i++) {
        await platform.startSaleRound();
        await increaseTime(roundTime);
        await platform.startTradeRound();
        await increaseTime(roundTime);
      }

      await platform.startSaleRound();

      const ethPerToken = await platform.ethPerToken();
      await expect(ethPerToken).to.be.eq(price);
    });
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
    it("should buy ACDMTokens buy on a fixed price from platform for ETH", async () => {
      await platform.startSaleRound();

      const amount = 5;
      const ETH = 0.00001 * amount;
      const value = ethers.utils.parseEther(ETH.toString());
      await platform.buyACDM({ value });

      const tokenBalance = await ACDMToken.balanceOf(owner.address);
      expect(tokenBalance).to.be.eq(amount);
    });
    it("should return excess ETH to buyer", async () => {
      const value = totalSumForAllTokens.mul(2);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      const platformBalance = await platform.provider.getBalance(
        platform.address
      );
      expect(platformBalance).to.be.eq(totalSumForAllTokens);
    });
    it("should get back excess value", async () => {
      const excessValue = 1;
      const value = initialEthPerToken.add(excessValue);
      await platform.startSaleRound();

      const beforeBalance = await owner.getBalance();

      const tx = await platform.buyACDM({ value });
      const transactionFee = await getTransactionFee(tx);

      const afterBalance = await owner.getBalance();

      expect(beforeBalance.sub(transactionFee).sub(afterBalance)).to.be.eq(
        value.sub(excessValue)
      );
    });
    it("sales round should be completed if all tokens are sold", async () => {
      await platform.startSaleRound();
      await platform.buyACDM({ value: totalSumForAllTokens });
      const tx = platform.startTradeRound();
      await expect(tx).not.to.be.reverted;
    });
    it("first referral level should receive percent", async () => {
      const value = totalSumForAllTokens.div(2);
      const [rewardFirstReferralLevel] =
        await platform.getReferralRewardBuyACDM();
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
      const [_, rewardSecondReferralLevel] =
        await platform.getReferralRewardBuyACDM();
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

      const balance = await ACDMToken.balanceOf(owner.address);
      expect(balance).to.be.equal(amountTokensForSale);
    });
    it("should revert if msg.value lower than price per token", async () => {
      await platform.startSaleRound();

      const tx = platform.buyACDM({ value: 1 });
      const reason = "Not enough ETH";
      await expect(tx).to.be.revertedWith(reason);
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

      await platform.register(addr1.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      const platformBalance = await platform.provider.getBalance(
        platform.address
      );
      expect(platformBalance).to.be.eq(
        totalSumForAllTokens.mul(percent).div(100)
      );
    });
    it("platform should get 92% if buyer is at second referral level", async () => {
      const value = totalSumForAllTokens;
      const percent = 92;

      await platform.connect(addr1).register(addr2.address);
      await platform.register(addr1.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      const platformBalance = await platform.provider.getBalance(
        platform.address
      );
      expect(platformBalance).to.be.eq(
        totalSumForAllTokens.mul(percent).div(100)
      );
    });
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
    it("should revert if after trade round start trade round", async () => {
      await platform.startSaleRound();

      await increaseTime(roundTime);

      await platform.startTradeRound();

      await increaseTime(roundTime);

      const tx = platform.startTradeRound();
      const reason = "Trade round is already active";
      await expect(tx).to.be.revertedWith(reason);
    });
  });
  describe("startSaleRound", () => {
    it("should call by any user", async () => {
      const tx = platform.connect(addr1).startSaleRound();
      await expect(tx).not.to.be.reverted;
    });
    it("should increase ethPerToken", async () => {
      const beforeethPerToken = await platform.ethPerToken();
      await platform.startSaleRound();
      await increaseTime(roundTime);
      await platform.startTradeRound();
      await increaseTime(roundTime);
      const afterethPerToken = await platform.ethPerToken();

      expect(afterethPerToken).to.be.gt(beforeethPerToken);
    });
    it("should revert if trade round is not over", async () => {
      await platform.startSaleRound();

      await increaseTime(roundTime);

      await platform.startTradeRound();
      const tx = platform.startSaleRound();
      const reason = "Trade round is active";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if sales round is already active", async () => {
      await platform.startSaleRound();
      const tx = platform.startSaleRound();
      const reason = "Sales round is already active";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if after sales round start sales round", async () => {
      await platform.startSaleRound();

      await increaseTime(roundTime);

      const tx = platform.startSaleRound();
      const reason = "Sales round is already active";
      await expect(tx).to.be.revertedWith(reason);
    });
  });
  describe("addOrder", () => {
    it("should create several orders", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale.div(2), 1);
      const tx = platform.addOrder(amountTokensForSale.div(2), 1);
      await expect(tx).not.to.be.reverted;
    });
    it("should revert if trade round is not active", async () => {
      const value = totalSumForAllTokens.div(2);

      await platform.register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await ACDMToken.approve(platform.address, amountTokensForSale);

      const tx = platform.addOrder(amountTokensForSale, 1);
      const reason = "Trade round is not active";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should debit tokens from the seller", async () => {
      const value = totalSumForAllTokens;
      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      const balance = await ACDMToken.balanceOf(owner.address);
      expect(balance).to.be.eq(0);
    });
    it("should revert if amount is not positive", async () => {
      const value = totalSumForAllTokens;

      await platform.register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

      const tx = platform.addOrder(0, 1);
      const reason = "Amount should be positive";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if price is not positive", async () => {
      const value = totalSumForAllTokens;

      await platform.register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

      const tx = platform.addOrder(amountTokensForSale, 0);
      const reason = "Price should be positive";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if not enough tokens", async () => {
      const value = totalSumForAllTokens;

      await platform.register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

      const tx = platform.addOrder(amountTokensForSale.mul(2), 1);
      const reason = "You can't transfer so tokens from this user";
      await expect(tx).to.be.revertedWith(reason);
    });
  });
  describe("redeemOrder", () => {
    it("should buy ACDMTokens from each other for ETH", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, 1);

      const halfAmountTokensForSale = amountTokensForSale.div(2);
      await platform
        .connect(addr1)
        .redeemOrder(1, { value: halfAmountTokensForSale });
      await platform
        .connect(addr2)
        .redeemOrder(1, { value: halfAmountTokensForSale });

      await ACDMToken.connect(addr1).approve(
        platform.address,
        halfAmountTokensForSale
      );
      await ACDMToken.connect(addr2).approve(
        platform.address,
        halfAmountTokensForSale
      );
      await platform.connect(addr1).addOrder(halfAmountTokensForSale, 10);
      await platform.connect(addr2).addOrder(halfAmountTokensForSale, 100);
      await platform.redeemOrder(2, { value: value.mul(10) });
      await platform.redeemOrder(3, { value: value.mul(100) });

      const tokenBalance = await ACDMToken.balanceOf(owner.address);
      expect(tokenBalance).to.be.eq(amountTokensForSale);
    });
    it("should buy a part of the order", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, 1);

      await platform
        .connect(addr1)
        .redeemOrder(1, { value: amountTokensForSale.div(2) });
      await platform
        .connect(addr1)
        .redeemOrder(1, { value: amountTokensForSale.div(2) });

      const tokenBalance = await ACDMToken.balanceOf(addr1.address);
      expect(tokenBalance).to.be.eq(amountTokensForSale);
    });
    it("should return excess ETH to buyer", async () => {
      let value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, 1);

      value = amountTokensForSale;
      const excessValue = value.mul(2);
      const beforeBalance = await addr1.getBalance();

      const tx = await platform
        .connect(addr1)
        .redeemOrder(1, { value: excessValue });
      const transactionFee = await getTransactionFee(tx);

      const afterBalance = await addr1.getBalance();

      expect(beforeBalance.sub(transactionFee).sub(afterBalance)).to.be.eq(
        value
      );
    });
    it("should get back excess value", async () => {
      const pricePerToken = 10;
      let value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, pricePerToken);

      value = BigNumber.from(pricePerToken);
      const excessValue = value.add(1);
      const beforeBalance = await addr1.getBalance();

      const tx = await platform
        .connect(addr1)
        .redeemOrder(1, { value: excessValue });
      const transactionFee = await getTransactionFee(tx);

      const afterBalance = await addr1.getBalance();

      expect(beforeBalance.sub(transactionFee).sub(afterBalance)).to.be.eq(
        value
      );
    });
    it("buyer should receive tokens", async () => {
      const value = totalSumForAllTokens;
      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      await platform
        .connect(addr1)
        .redeemOrder(1, { value: amountTokensForSale });
      const balance = await ACDMToken.balanceOf(addr1.address);
      expect(balance).to.be.eq(amountTokensForSale);
    });
    it("should transfer percent to first referral level", async () => {
      const value = totalSumForAllTokens;
      const percent = await platform.rewardReferralsRedeemOrder();
      const reward = amountTokensForSale.mul(percent).div(1000);

      await platform.connect(addr1).register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

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
      const percent = await platform.rewardReferralsRedeemOrder();
      const reward = amountTokensForSale.mul(percent).div(1000);

      await platform.connect(addr2).register(addr1.address);
      await platform.connect(addr3).register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

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

      await ACDMToken.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      const beforeBalance = await addr1.getBalance();
      const tx = await platform
        .connect(addr1)
        .redeemOrder(1, { value: amountTokensForSale.mul(2) });
      const transactionFee = await getTransactionFee(tx);
      const afterBalance = await addr1.getBalance();

      await expect(
        beforeBalance.sub(transactionFee).sub(afterBalance)
      ).to.be.eq(amountTokensForSale);
    });
    it("should revert if msg.value lower than order price", async () => {
      const value = totalSumForAllTokens;
      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, totalSumForAllTokens);

      const tx = platform.redeemOrder(1, { value: 1 });
      const reason = "Not enough ETH";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if order does not exist", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      const tx = platform.redeemOrder(2, { value: amountTokensForSale });
      const reason = "Empty order";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if trade round is not active", async () => {
      const tx = platform.redeemOrder(2, { value: amountTokensForSale });
      const reason = "Trade round is not active";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if value is not positive", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      const tx = platform.redeemOrder(2);
      const reason = "Value should be positive";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("seller should get 95% if buyer has no referrals", async () => {
      const value = totalSumForAllTokens;
      const reward = amountTokensForSale.mul(95).div(100);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, 1);

      const beforeBalance = await owner.getBalance();
      await platform
        .connect(addr1)
        .redeemOrder(1, { value: amountTokensForSale });
      const afterBalance = await owner.getBalance();

      expect(afterBalance.sub(beforeBalance)).to.be.eq(reward);
    });
    it("seller should get 95% if buyer is at first referral level", async () => {
      const seller = owner;
      const buyer = addr1;

      const value = totalSumForAllTokens;
      const percent = 95;

      await platform.connect(buyer).register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, 1);

      const beforeBalance = await seller.getBalance();
      await platform
        .connect(buyer)
        .redeemOrder(1, { value: amountTokensForSale });
      const afterBalance = await seller.getBalance();

      const reward = amountTokensForSale.mul(percent).div(100);

      expect(afterBalance.sub(beforeBalance)).to.be.eq(reward);
    });
    it("seller should get 95% if buyer is at second referral level", async () => {
      const seller = owner;
      const buyer = addr1;

      const value = totalSumForAllTokens;
      const percent = 95;

      await platform.connect(addr2).register(addr3.address);
      await platform.connect(buyer).register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, 1);

      const beforeBalance = await seller.getBalance();
      await platform
        .connect(buyer)
        .redeemOrder(1, { value: amountTokensForSale });
      const afterBalance = await seller.getBalance();

      const reward = amountTokensForSale.mul(percent).div(100);

      expect(afterBalance.sub(beforeBalance)).to.be.eq(reward);
    });
    it("platform should get 5% if buyer has no referrals", async () => {
      const value = totalSumForAllTokens;
      const reward = amountTokensForSale.mul(5).div(100);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, 1);

      const beforeBalance = await platform.provider.getBalance(
        platform.address
      );
      await platform
        .connect(addr1)
        .redeemOrder(1, { value: amountTokensForSale });
      const afterBalance = await platform.provider.getBalance(platform.address);

      expect(afterBalance.sub(beforeBalance)).to.be.eq(reward);
    });
    it("platform should get 2.5% if buyer is at first referral level", async () => {
      const value = totalSumForAllTokens;
      const reward = amountTokensForSale.mul(25).div(1000);

      await platform.connect(addr1).register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, 1);

      const beforeBalance = await platform.provider.getBalance(
        platform.address
      );
      await platform
        .connect(addr1)
        .redeemOrder(1, { value: amountTokensForSale });
      const afterBalance = await platform.provider.getBalance(platform.address);

      expect(afterBalance.sub(beforeBalance)).to.be.eq(reward);
    });
    it("platform should get nothing if buyer is at second referral level", async () => {
      const value = totalSumForAllTokens;

      await platform.connect(addr2).register(addr3.address);
      await platform.connect(addr1).register(addr2.address);

      await platform.startSaleRound();
      await platform.buyACDM({ value });

      await platform.startTradeRound();
      await ACDMToken.approve(platform.address, amountTokensForSale);
      await platform.addOrder(amountTokensForSale, 1);

      const beforeBalance = await platform.provider.getBalance(
        platform.address
      );
      await platform
        .connect(addr1)
        .redeemOrder(1, { value: amountTokensForSale });
      const afterBalance = await platform.provider.getBalance(platform.address);

      expect(afterBalance).to.be.eq(beforeBalance);
    });
  });
  describe("removeOrder", () => {
    it("should revert if trade round is not active", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

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

      await ACDMToken.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);

      const tx = platform.connect(addr1).removeOrder(1);
      const reason = "You are not an owner";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should revert if order amount equals 0", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      await platform.redeemOrder(1, { value: amountTokensForSale });

      const tx = platform.removeOrder(1);
      const reason = "Order is empty";
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should delete order", async () => {
      const value = totalSumForAllTokens;

      await platform.startSaleRound();
      await platform.buyACDM({ value });
      await platform.startTradeRound();

      await ACDMToken.approve(platform.address, amountTokensForSale);

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

      await ACDMToken.approve(platform.address, amountTokensForSale);

      await platform.addOrder(amountTokensForSale, 1);
      await platform.removeOrder(1);

      const balance = await ACDMToken.balanceOf(owner.address);
      expect(balance).to.be.eq(amountTokensForSale);
    });
  });
  describe("setReferralRewardBuyACDM", () => {
    it("should set new percents", async () => {
      const newFirstLevel = 100;
      const newSecondLevel = 100;
      const callData = iPlatform.encodeFunctionData(
        "setReferralRewardBuyACDM",
        [newFirstLevel, newSecondLevel]
      );

      await LPToken.approve(staking.address, minimumQuorum);
      await staking.stake(minimumQuorum);

      await dao.addProposal(callData, platform.address, "Change Referral Reward BuyACDM percents");
      await dao.vote(1, true);

      await increaseTime(debatingPeriodDuration);

      await dao.finishProposal(1);

      const [first, second] = await platform.getReferralRewardBuyACDM();
      expect(first).to.be.equal(newFirstLevel);
      expect(second).to.be.equal(newSecondLevel);
    });
    it("should revert if first level percent plus second level percent greater than 100%", async () => {
      const [oldFirst, oldSecond] = await platform.getReferralRewardBuyACDM()
      const [newFirstLevel, newSecondLevel] = [500, 501];
      const callData = iPlatform.encodeFunctionData(
        "setReferralRewardBuyACDM",
        [newFirstLevel, newSecondLevel]
      );

      await LPToken.approve(staking.address, minimumQuorum);
      await staking.stake(minimumQuorum);

      await dao.addProposal(callData, platform.address, "Change Referral Reward BuyACDM percents");
      await dao.vote(1, true);

      await increaseTime(debatingPeriodDuration);

      await dao.finishProposal(1);

      const [first, second] = await platform.getReferralRewardBuyACDM()
      expect(first).to.be.eq(oldFirst)
      expect(second).to.be.eq(oldSecond)
    });
  });
  describe("setReferralRewardRedeemOrder", () => {
    it("should set new percent", async () => {
      const newPercent = 50;
      const callData = iPlatform.encodeFunctionData(
        "setReferralRewardRedeemOrder",
        [newPercent]
      );

      await LPToken.approve(staking.address, minimumQuorum);
      await staking.stake(minimumQuorum);

      await dao.addProposal(callData, platform.address, "Change Referral Reward RedeemOrder percents");
      await dao.vote(1, true);

      await increaseTime(debatingPeriodDuration);

      await dao.finishProposal(1);

      const percent = await platform.rewardReferralsRedeemOrder();
      await expect(percent).to.be.equal(newPercent);
    });
    it("should revert if percent greater than 50", async () => {
      const oldPercent = await platform.rewardReferralsRedeemOrder()
      const newPercent = 501;
      const callData = iPlatform.encodeFunctionData(
        "setReferralRewardRedeemOrder",
        [newPercent]
      );

      await LPToken.approve(staking.address, minimumQuorum);
      await staking.stake(minimumQuorum);

      await dao.addProposal(callData, platform.address, "Change Referral Reward RedeemOrder percents");
      await dao.vote(1, true);

      await increaseTime(debatingPeriodDuration);

      await dao.finishProposal(1);

      const currentPercent = await platform.rewardReferralsRedeemOrder()
      expect(currentPercent).to.be.eq(oldPercent);
    });
  });
  describe("setRoundTime", () => {
    it("should set new round time by DAO", async () => {
      const newRoundTime = roundTime * 2;
      const callData = iPlatform.encodeFunctionData("setRoundTime", [
        newRoundTime,
      ]);

      await LPToken.approve(staking.address, minimumQuorum);
      await staking.stake(minimumQuorum);

      await dao.addProposal(callData, platform.address, "Change Round Time");
      await dao.vote(1, true);

      await increaseTime(debatingPeriodDuration);

      await dao.finishProposal(1);

      const currentRoundTime = await platform.roundTime();
      expect(currentRoundTime).to.be.eq(newRoundTime);
    });
    it("should revert if set new round by user", async () => {
      const tx = platform.connect(addr1).setRoundTime(1);
      const reason = "Only DAO";
      await expect(tx).to.be.revertedWith(reason);
    });
  });
  describe("Events", () => {
    describe("NewOrder", () => {
      it("should be correct", async () => {
        const eventName = "NewOrder"

        const seller = owner;
        const pricePerToken = 1;
        const value = totalSumForAllTokens;

        await platform.startSaleRound();
        await platform.buyACDM({ value });

        await platform.startTradeRound();

        await ACDMToken.approve(platform.address, amountTokensForSale);

        const tx = platform.addOrder(amountTokensForSale, pricePerToken);
        await expect(tx)
          .to.be.emit(platform, eventName)
          .withArgs(1, seller.address, amountTokensForSale, pricePerToken);
      });
    });
    describe("RedeemOrder", () => {
      it("should be correct", async () => {
        const eventName = "RedeemOrder";

        const buyer = addr1;
        const seller = owner;
        const value = totalSumForAllTokens;
        const amount = amountTokensForSale;

        await platform.startSaleRound();
        await platform.buyACDM({ value });

        await platform.startTradeRound();
        await ACDMToken.approve(platform.address, amount);
        await platform.addOrder(amount, 1);

        const tx = platform.connect(buyer).redeemOrder(1, { value: amount });
        await expect(tx)
          .to.be.emit(platform, eventName)
          .withArgs(buyer.address, seller.address, amount);
      });
    });
    describe("RemoveOrder", () => {
      it("should be correct", async () => {
        const eventName = "RemoveOrder"

        const seller = owner;
        const value = totalSumForAllTokens;
        const amount = amountTokensForSale;

        await platform.startSaleRound();
        await platform.buyACDM({ value });

        await platform.startTradeRound();
        await ACDMToken.approve(platform.address, amount);
        await platform.addOrder(amount, 1);

        const tx = platform.removeOrder(1);
        await expect(tx)
          .to.be.emit(platform, eventName)
          .withArgs(seller.address, 1);
      });
    });
    describe("Register", () => {
      it("should be correct", async () => {
        const eventName = "Register"

        const referrer = owner;
        const referral = addr1;

        const tx = platform.connect(referral).register(referrer.address);
        await expect(tx)
          .to.be.emit(platform, eventName)
          .withArgs(referral.address, referrer.address);
      });
    });
    describe("StartSaleRound", () => {
      it("should be correct", async () => {
        const eventName = "StartSaleRound"

        const tx = await platform.startSaleRound();
        const timestamp = await getBlockTimestamp(tx);

        expect(tx)
          .to.be.emit(platform, eventName)
          .withArgs(
            amountTokensForSale,
            initialEthPerToken,
            timestamp + roundTime
          );
      });
    });
    describe("StartTradeRound", () => {
      it("should be correct", async () => {
        const eventName = "StartTradeRound"

        await platform.startSaleRound();

        await increaseTime(roundTime);

        const tx = await platform.startTradeRound();
        const timestamp = await getBlockTimestamp(tx);

        expect(tx)
          .to.be.emit(platform, eventName)
          .withArgs(timestamp + roundTime);
      });
    });
    describe("BuyACDM", () => {
      it("should be correct", async () => {
        const buyer = owner
        const eventName = "BuyACDM"

        await platform.startSaleRound();

        const tx = await platform.buyACDM({value: totalSumForAllTokens})
        await expect(tx)
          .to.be.emit(platform, eventName)
          .withArgs(buyer.address, amountTokensForSale);
      });
    });
    // FIXME: Find event
    // describe("ChangeRoundTime", () => {
    //   it("should be correct", async () => {
    //     const eventName = "ChangeRoundTime"
    //     const newRoundTime = roundTime * 2;
    //
    //     const tx = platform.setRoundTime(newRoundTime);
    //     await expect(tx)
    //       .to.be.emit(platform, eventName)
    //       .withArgs(newRoundTime);
    //   });
    // });
    // describe("ChangeReferralRewardBuyACDM", () => {
    //   it("should be correct", async () => {
    //     const eventName = "ChangeReferralRewardBuyACDM"
    //
    //     const firstLevel = 40;
    //     const secondLevel = 40;
    //
    //     const tx = platform.setReferralRewardBuyACDM(firstLevel, secondLevel);
    //     await expect(tx)
    //       .to.be.emit(platform, eventName)
    //       .withArgs(firstLevel, secondLevel);
    //   });
    // });
    // describe("ChangeReferralRewardRedeemOrder", () => {
    //   it("should be correct", async () => {
    //     const eventName = "ChangeReferralRewardRedeemOrder"
    //     const percent = 400;
    //
    //     const tx = await platform.setReferralRewardRedeemOrder(percent);
    //     await expect(tx)
    //       .to.be.emit(platform, eventName)
    //       .withArgs(percent);
    //   });
    // });
  });

  it("should get reward after 1 week", async () => {
    const value = 100;
    const percent = await staking.percent();
    const reward = BigNumber.from(100).mul(percent).div(100);

    await XXXToken.transfer(staking.address, 1000000);
    await LPToken.transfer(addr1.address, value);
    await LPToken.connect(addr1).approve(staking.address, value);
    await staking.connect(addr1).stake(100);

    await increaseTime(daysToSeconds(7));

    await staking.connect(addr1).claim();
    const balance = await XXXToken.balanceOf(addr1.address);
    expect(balance).to.be.eq(reward);
  });
  it("can withdraw staked tokens after 30 days", async () => {
    const value = 100;

    await XXXToken.transfer(staking.address, 1000000);
    await LPToken.transfer(addr1.address, value);
    await LPToken.connect(addr1).approve(staking.address, value);
    await staking.connect(addr1).stake(value);

    await increaseTime(freezeTime);

    await staking.connect(addr1).unstake();
    const balance = await LPToken.balanceOf(addr1.address);
    expect(balance).to.be.eq(value);
  });
  it("should revert if withdraw tokens earlier than 30 days", async () => {
    const newFreezeTime = freezeTime + 1;
    const callData = iStaking.encodeFunctionData("setFreezeTime", [
      newFreezeTime,
    ]);

    await LPToken.approve(staking.address, minimumQuorum);
    await staking.stake(minimumQuorum);

    await dao.addProposal(callData, staking.address, "Change freezeTime");
    await dao.vote(1, true);

    await increaseTime(debatingPeriodDuration);

    await dao.finishProposal(1);

    const value = 100;

    await XXXToken.transfer(staking.address, 1000000);
    await LPToken.transfer(addr1.address, value);
    await LPToken.connect(addr1).approve(staking.address, value);
    await staking.connect(addr1).stake(value);

    await increaseTime(freezeTime / 2);

    const tx = staking.connect(addr1).unstake();
    const reason = "Freezing time has not passed";
    await expect(tx).to.be.revertedWith(reason);
  });
  it("may withdraw reward after receiving", async () => {
    const value = 100;
    const percent = await staking.percent();
    const reward = BigNumber.from(100).mul(percent).div(100);

    await XXXToken.transfer(staking.address, 1000000);
    await LPToken.transfer(addr1.address, value);
    await LPToken.connect(addr1).approve(staking.address, value);
    await staking.connect(addr1).stake(value);

    await increaseTime(daysToSeconds(7));

    await staking.connect(addr1).claim();
    const balance = await XXXToken.balanceOf(addr1.address);
    expect(balance).to.be.eq(reward);
  });

  it("should revert if unstake tokens after vote", async () => {
    const value = 100;

    await XXXToken.transfer(staking.address, 1000000);
    await LPToken.transfer(addr1.address, value);
    await LPToken.connect(addr1).approve(staking.address, value);
    await staking.connect(addr1).stake(value);

    await increaseTime(freezeTime);

    const callData = iStaking.encodeFunctionData("setPercent", [5]);
    await dao.addProposal(callData, staking.address, "Change percent");
    await dao.connect(addr1).vote(1, true);
    const tx = staking.connect(addr1).unstake();
    const reason = "You are in active voting";
    await expect(tx).to.be.revertedWith(reason);
  });
  it("should return tokens after vote", async () => {
    const value = 100;

    await XXXToken.transfer(staking.address, 1000000);
    await LPToken.transfer(addr1.address, value);
    await LPToken.connect(addr1).approve(staking.address, value);
    await staking.connect(addr1).stake(value);

    await increaseTime(freezeTime);

    const callData = iStaking.encodeFunctionData("setPercent", [5]);
    await dao.addProposal(callData, staking.address, "Change percent");
    await dao.connect(addr1).vote(1, true);

    await increaseTime(debatingPeriodDuration);

    await staking.connect(addr1).unstake();
    const balance = await LPToken.balanceOf(addr1.address);
    expect(balance).to.be.eq(value);
  });
  it("should set freeze time by DAO", async () => {
    const value = minimumQuorum;
    const percent = 55;

    await XXXToken.transfer(staking.address, 1000000);
    await LPToken.transfer(addr1.address, value);
    await LPToken.connect(addr1).approve(staking.address, value);
    await staking.connect(addr1).stake(value);

    await increaseTime(freezeTime);

    const callData = iStaking.encodeFunctionData("setPercent", [percent]);
    await dao.addProposal(callData, staking.address, "Change percent");
    await dao.connect(addr1).vote(1, true);
    await increaseTime(debatingPeriodDuration);
    await dao.finishProposal(1);

    const newPercent = await staking.percent();
    expect(newPercent).to.be.eq(percent);
  });
  it("should revert if set freeze time by user", async () => {
    const tx = staking.setPercent(50);
    const reason = "Only owner";
    await expect(tx).to.be.revertedWith(reason);
  });
});
