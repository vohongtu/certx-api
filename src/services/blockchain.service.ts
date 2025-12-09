import { ethers } from "ethers"
import { config } from "../utils/env.js"
import smartContractDefinition from "../abi/CertificateRegistry.json" with { type: 'json' }

const provider = new ethers.JsonRpcProvider(config.CHAIN_RPC_URL)
const signer = new ethers.Wallet(config.PRIVATE_KEY, provider)
const contract = new ethers.Contract(config.CONTRACT_ADDRESS, smartContractDefinition.abi, signer)

export const whiteListIssuer = async (address: string, isAllow: boolean) => {
  const tx = await contract.setIssuer(address, isAllow)
  return await tx.wait()
}

export const issueOnChain = async (hash: string, uri: string) => {
  const tx = await contract.issue(hash, uri)
  return await tx.wait()
}

export const revokeOnChain = async (hash: string) => {
  const tx = await contract.revoke(hash)
  return await tx.wait()
}

export const getOnChain = async (hash: string) => await contract.get(hash) // returns struct
