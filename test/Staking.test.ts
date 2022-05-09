import { ethers, network } from "hardhat";
import chai, { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  DAO,
  DAO__factory,
  Staking,
  Staking__factory,
  Token,
  Token__factory,
} from "../typechain";
import { increaseTime } from "./utils";
import { StakingInterface } from "../typechain/Staking";

chai.use(require("chai-bignumber")());

describe("Staking Contract", function() {
  let staking: Staking;
  let iStaking: StakingInterface;
  let dao: DAO;
  let stakingToken: Token;
  let rewardToken: Token;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let clean: string;

  const initValue = 100;
  const freezeTime = 60 * 60 * 24 * 30;
  const keepStakeToGetRewards = 60 * 60 * 24 * 7;
  const percent = 1;

  const debatingPeriodDuration = 60 * 60 * 24 * 3;
  const minimumQuorum = 5000;

  before(async () => {
    const Staking = <Staking__factory>await ethers.getContractFactory("Staking");
    const Token = <Token__factory>await ethers.getContractFactory("Token");
    const DAO = <DAO__factory>await ethers.getContractFactory("DAO")

    iStaking = <StakingInterface>Staking.interface;


    stakingToken = await Token.deploy("TEST", "TST", 18, ethers.utils.parseEther('100'));
    rewardToken = await Token.deploy("TEST", "TST", 18, ethers.utils.parseEther('100'));

    await stakingToken.deployed();
    await rewardToken.deployed();

    staking = await Staking.deploy(
      stakingToken.address, rewardToken.address, percent
    );
    [owner, addr1] = await ethers.getSigners();
    await staking.deployed();

    dao = await DAO.deploy(owner.address, staking.address, minimumQuorum, debatingPeriodDuration);

    await staking.transferOwnership(dao.address);

    clean = await network.provider.send("evm_snapshot");
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [clean]);
    clean = await network.provider.send("evm_snapshot");
  });

  describe("constructor", () => {
    it("stakingToken should be valid", async () => {
      expect(await staking.stakingToken()).to.be.equal(stakingToken.address)
    });
    it("rewardToken should be valid", async () => {
      expect(await staking.rewardToken()).to.be.equal(rewardToken.address)
    });
    it("freezeTime should be equal 0", async () => {
      expect(await staking.freezeTime()).to.be.equal(0);
    });
    it("percent should be valid", async () => {
      expect(await staking.percent()).to.be.equal(percent);
    });
  });

  describe("stake", () => {
    it("should return error without approve", async () => {
      await stakingToken.transfer(addr1.address, initValue);
      await rewardToken.transfer(staking.address, initValue);
      const tx = staking.connect(addr1).stake(initValue);
      const reason = 'You can\'t transfer so tokens from this user';
      await expect(tx).to.be.revertedWith(reason);
    });
    it("should increase staking", async () => {
      const customValue = initValue * 2;
      await stakingToken.transfer(addr1.address, customValue);
      await rewardToken.transfer(staking.address, initValue);
      await stakingToken.connect(addr1).approve(staking.address, customValue);

      await staking.connect(addr1).stake(initValue);
      await staking.connect(addr1).stake(initValue);

      await increaseTime(freezeTime);

      await staking.connect(addr1).unstake();
      const balance = await stakingToken.balanceOf(addr1.address);
      expect(balance).to.be.equal(customValue);
    });
    it("should increase reward after every week", async () => {
      await stakingToken.transfer(addr1.address, initValue);
      await rewardToken.transfer(staking.address, initValue);
      await stakingToken.connect(addr1).approve(staking.address, initValue);
      await staking.connect(addr1).stake(initValue);

      await increaseTime(keepStakeToGetRewards)

      await staking.connect(addr1).claim();
      const reward = initValue * percent / 100;
      const balance = await rewardToken.balanceOf(addr1.address);
      expect(balance).to.be.equal(reward);
    });
    it("should emit event Stake", async () => {
      const customValue = initValue * 2;
      await stakingToken.transfer(addr1.address, customValue);
      await rewardToken.transfer(staking.address, initValue);
      await stakingToken.connect(addr1).approve(staking.address, customValue);

      const tx = staking.connect(addr1).stake(initValue);

      await expect(tx).to.be.emit(staking, 'Stake');
    });
  });

  describe("unstake", () => {
    it("should return an error when nothing to unstake", async () => {
      const tx = staking.connect(addr1).unstake();
      const reason = 'Value should be positive'
      await expect(tx).to.be.revertedWith(reason)
    });
    it("should return an error to unknown user", async () => {
      const tx = staking.connect(addr1).unstake()
      const reason = 'Value should be positive'
      await expect(tx).to.be.revertedWith(reason)
    });
    it("should throw error if less than freezeTime have passed after staking", async () => {
      const newFreezeTime = freezeTime + 1;
      const callData = iStaking.encodeFunctionData("setFreezeTime", [
        newFreezeTime,
      ]);

      await stakingToken.approve(staking.address, minimumQuorum);
      await staking.stake(minimumQuorum);

      await dao.addProposal(callData, staking.address, "Change freezeTime");
      await dao.vote(1, true);

      await increaseTime(debatingPeriodDuration);

      await dao.finishProposal(1);

      await stakingToken.transfer(addr1.address, initValue);
      await rewardToken.transfer(staking.address, initValue);
      await stakingToken.connect(addr1).approve(staking.address, initValue);
      await staking.connect(addr1).stake(initValue);

      const tx = staking.connect(addr1).unstake();
      const reason = 'Freezing time has not passed'
      await expect(tx).to.be.revertedWith(reason)
    });
    it("should reset amount", async () => {
      await stakingToken.transfer(addr1.address, initValue);
      await rewardToken.transfer(staking.address, initValue);
      await stakingToken.connect(addr1).approve(staking.address, initValue);
      await staking.connect(addr1).stake(initValue);

      await network.provider.send("evm_increaseTime", [freezeTime]);
      await network.provider.send("evm_mine");

      await staking.connect(addr1).unstake();

      await network.provider.send("evm_increaseTime", [freezeTime]);
      await network.provider.send("evm_mine");

      const tx = staking.connect(addr1).unstake();
      const reason = "Value should be positive"
      await expect(tx).to.be.revertedWith(reason)

    });
    it("should be transfer to the correct user", async () => {
      await stakingToken.transfer(addr1.address, initValue);
      await rewardToken.transfer(staking.address, initValue);
      await stakingToken.connect(addr1).approve(staking.address, initValue);
      await staking.connect(addr1).stake(initValue);

      await network.provider.send("evm_increaseTime", [freezeTime]);
      await network.provider.send("evm_mine");

      await staking.connect(addr1).unstake();

      const balance = await stakingToken.balanceOf(addr1.address)
      expect(balance).to.be.equal(initValue)
    });
    it("should save rewards after unstake", async () => {
      await stakingToken.transfer(addr1.address, initValue);
      await rewardToken.transfer(staking.address, initValue);
      await stakingToken.connect(addr1).approve(staking.address, initValue);
      await staking.connect(addr1).stake(initValue);

      await increaseTime(freezeTime)

      await staking.connect(addr1).unstake();

      await staking.connect(addr1).claim();
      const reward = initValue * percent / 100 * Math.floor(freezeTime / keepStakeToGetRewards);
      const balance = await rewardToken.balanceOf(addr1.address);
      expect(balance).to.be.equal(reward);
    });
    it("should emit event Unstake", async () => {
      const customValue = initValue * 2;
      await stakingToken.transfer(addr1.address, customValue);
      await rewardToken.transfer(staking.address, initValue);
      await stakingToken.connect(addr1).approve(staking.address, customValue);

      await staking.connect(addr1).stake(initValue);

      await network.provider.send("evm_increaseTime", [freezeTime]);
      await network.provider.send("evm_mine");

      const tx = staking.connect(addr1).unstake();
      await expect(tx).to.be.emit(staking, 'Unstake');

    });
  });

  describe("Setters", () => {
    describe("setFreezeTime", () => {
      it("should throw error if the user is not an owner", async () => {
        const tx = staking.connect(addr1).setFreezeTime(freezeTime)
        const reason = 'Only owner'
        await expect(tx).to.be.revertedWith(reason)
      });
      it("should change value", async () => {
        const newFreezeTime = freezeTime + 1;
        const callData = iStaking.encodeFunctionData("setFreezeTime", [newFreezeTime])

        await stakingToken.approve(staking.address, minimumQuorum)
        await staking.stake(minimumQuorum);

        await dao.addProposal(callData, staking.address, "Change freezeTime")
        await dao.vote(1, true)

        await increaseTime(debatingPeriodDuration)

        await dao.finishProposal(1)

        const currentFreezeTime = await staking.freezeTime();
        expect(currentFreezeTime).to.be.equal(newFreezeTime)
      });
    });
    describe("setPercent", () => {
      it("should throw error if the user is not an owner", async () => {
        const tx = staking.connect(addr1).setPercent(percent)
        const reason = 'Only owner'
        await expect(tx).to.be.revertedWith(reason)
      });
      it("should throw error if the percent greater than 100", async () => {
        const newPercent = 101;
        const callData = iStaking.encodeFunctionData("setPercent", [newPercent])

        await stakingToken.approve(staking.address, minimumQuorum)
        await staking.stake(minimumQuorum);

        await dao.addProposal(callData, staking.address, "Change percent")
        await dao.vote(1, true)

        await increaseTime(debatingPeriodDuration)

        await dao.finishProposal(1)

        const currentPercent = await staking.percent();
        expect(currentPercent).to.be.equal(percent)
      });
      it("should change value", async () => {

        const newPercent = percent * 2;
        const callData = iStaking.encodeFunctionData("setPercent", [newPercent])

        await stakingToken.approve(staking.address, minimumQuorum)
        await staking.stake(minimumQuorum);

        await dao.addProposal(callData, staking.address, "Change percent")
        await dao.vote(1, true)

        await increaseTime(debatingPeriodDuration)

        await dao.finishProposal(1)

        const currentPercent = await staking.percent();
        expect(currentPercent).to.be.equal(newPercent)
      });
    });
  });

  describe("transferOwnership", () => {
    it("should change owner", async () => {
      const newOwner = addr1.address;
      const callData = iStaking.encodeFunctionData("transferOwnership", [newOwner])

      await stakingToken.approve(staking.address, minimumQuorum)
      await staking.stake(minimumQuorum);

      await dao.addProposal(callData, staking.address, "Change owner")
      await dao.vote(1, true)

      await increaseTime(debatingPeriodDuration)

      await dao.finishProposal(1)

      const currentOwner = await staking.owner();
      expect(currentOwner).to.be.equal(newOwner)
    });
  })

  it("should earn rewards for every week", async () => {
    await stakingToken.transfer(addr1.address, initValue);
    await rewardToken.transfer(staking.address, initValue);
    await stakingToken.connect(addr1).approve(staking.address, initValue);
    await staking.connect(addr1).stake(initValue);

    await network.provider.send("evm_increaseTime", [60 * 60 * 24 * 7]);
    await network.provider.send("evm_mine");

    await staking.connect(addr1).claim();
    const reward = initValue * percent / 100;
    const balance = await rewardToken.balanceOf(addr1.address);
    expect(balance).to.be.equal(reward);
  });

  it("should save previous rewards after stake", async () => {
    await stakingToken.transfer(addr1.address, initValue * 2);
    await rewardToken.transfer(staking.address, initValue);
    await stakingToken.connect(addr1).approve(staking.address, initValue * 2);
    await staking.connect(addr1).stake(initValue);

    await increaseTime(keepStakeToGetRewards);

    await staking.connect(addr1).stake(initValue);

    await staking.connect(addr1).claim();
    const reward = initValue * percent / 100;
    const balance = await rewardToken.balanceOf(addr1.address);
    expect(balance).to.be.equal(reward);
  });

  it("should save time after claim", async () => {
    await stakingToken.transfer(addr1.address, initValue);
    await rewardToken.transfer(staking.address, initValue);
    await stakingToken.connect(addr1).approve(staking.address, initValue);
    await staking.connect(addr1).stake(initValue);

    await increaseTime(keepStakeToGetRewards)

    await staking.connect(addr1).claim();

    await increaseTime(keepStakeToGetRewards)

    await staking.connect(addr1).claim();
    const reward = (initValue * percent / 100) * 2;
    const balance = await rewardToken.balanceOf(addr1.address);
    expect(balance).to.be.equal(reward);
  });

  it("should emit event Claim", async () => {
    const customValue = initValue * 2;
    await stakingToken.transfer(addr1.address, customValue);
    await rewardToken.transfer(staking.address, initValue);
    await stakingToken.connect(addr1).approve(staking.address, customValue);

    await staking.connect(addr1).stake(initValue);

   await increaseTime(keepStakeToGetRewards)

    const tx = staking.connect(addr1).claim();
    await expect(tx).to.be.emit(staking, 'Claim');
  });


});
