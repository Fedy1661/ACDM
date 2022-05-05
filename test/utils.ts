import { ethers, network } from "hardhat";
import { BigNumber, ContractTransaction } from "ethers";

export async function increaseTime(seconds: number) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

export async function getTransactionFee(tx: ContractTransaction): Promise<BigNumber> {
  const { effectiveGasPrice, cumulativeGasUsed } = await tx.wait();
  return effectiveGasPrice.mul(cumulativeGasUsed);
}

export async function getBlockTimestamp(tx: ContractTransaction): Promise<number> {
  const { blockNumber } = await tx.wait();
  const block = await ethers.provider.getBlock(blockNumber);
  return block.timestamp;
}