import { ethers } from 'ethers'
import { config } from '../utils/env'
import abi from '../abi/CertificateRegistry.json' assert { type: 'json' }

const provider = new ethers.JsonRpcProvider(config.CHAIN_RPC_URL)
const signer = new ethers.Wallet(config.PRIVATE_KEY, provider)
const contract = new ethers.Contract(config.CONTRACT_ADDRESS, abi, signer)

export const issueOnChain = async (hash: string, uri: string) => await contract.issue(hash, uri)
export const revokeOnChain = async (hash: string) => await contract.revoke(hash)
export const getOnChain = async (hash: string) => await contract.get(hash) // returns struct
