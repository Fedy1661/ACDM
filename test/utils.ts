import { network } from "hardhat";
import { ContractTransaction } from "ethers";

export async function increaseTime(seconds: number) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

export async function getTransactionFee(tx: ContractTransaction) {
  const { effectiveGasPrice, cumulativeGasUsed } = await tx.wait();
  return effectiveGasPrice.mul(cumulativeGasUsed);
}