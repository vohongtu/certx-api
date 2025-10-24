import { ethers } from "ethers"
import { config } from "../utils/env"
import smartContractDefinition from "../abi/CertificateRegistry.json"

const provider = new ethers.JsonRpcProvider(config.CHAIN_RPC_URL)
const signer = new ethers.Wallet(config.PRIVATE_KEY, provider)
const contract = new ethers.Contract(config.CONTRACT_ADDRESS, smartContractDefinition.abi, signer)

export const whiteListIssuer = async (address: string, isAllow: boolean) =>
  await contract.setIssuer(address, isAllow)
export const issueOnChain = async (hash: string, uri: string) => await contract.issue(hash, uri)
export const revokeOnChain = async (hash: string) => await contract.revoke(hash)
export const getOnChain = async (hash: string) => await contract.get(hash) // returns struct
