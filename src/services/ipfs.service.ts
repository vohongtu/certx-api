import { config } from "../utils/env"
import { PinataSDK } from "pinata"

const pinata = new PinataSDK({
  pinataJwt: config.IPFS_TOKEN,
  pinataGateway: config.IPFS_GATEWAY,
})

function encodeBase64(obj: any): string {
  const jsonString = JSON.stringify(obj)
  return Buffer.from(jsonString).toString("base64")
}

export async function uploadJSON(obj: any) {
  try {
    const base64Data = encodeBase64(obj)
    const upload = await pinata.upload.public.base64(base64Data)
    return `https://${config.IPFS_GATEWAY}/ipfs/${upload.cid}`
  } catch (error) {
    console.error("IPFS upload failed:", error)
    throw error
  }
}
