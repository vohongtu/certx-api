import dotenv from "dotenv"
dotenv.config()

const rawWatermarkEnabled = (process.env.WATERMARK_ENABLED ?? 'false').trim().toLowerCase()
const rawWatermarkText = (process.env.WATERMARK_TEXT ?? 'Issued by CertX • Do not alter').trim()
const rawWatermarkOpacity = (process.env.WATERMARK_OPACITY ?? '0.35').trim()
const rawWatermarkColor = (process.env.WATERMARK_COLOR ?? '#555353FF').trim()
const rawWatermarkRepeat = (process.env.WATERMARK_REPEAT ?? '2').trim()

export const config = {
  PORT: Number(process.env.PORT || 8080),
  MONGO_URI: process.env.MONGO_URI!,
  JWT_SECRET: process.env.JWT_SECRET!,
  CHAIN_RPC_URL: process.env.CHAIN_RPC_URL!,
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS!,
  CONTRACT_CHAIN_ID: Number(process.env.CONTRACT_CHAIN_ID!),
  PRIVATE_KEY: process.env.PRIVATE_KEY!,
  IPFS_TOKEN: process.env.IPFS_TOKEN || "",
  IPFS_GATEWAY: process.env.IPFS_GATEWAY || "",
  PUBLIC_CLIENT: process.env.PUBLIC_CLIENT || "",
  PUBLIC_VERIFY_BASE: process.env.PUBLIC_VERIFY_BASE || "",
  WATERMARK_ENABLED: rawWatermarkEnabled === 'true',
  WATERMARK_TEXT: rawWatermarkText,
  WATERMARK_OPACITY: Number(rawWatermarkOpacity || '0.35'),
  WATERMARK_COLOR: rawWatermarkColor || '#2f2f2f',
  WATERMARK_REPEAT: Math.max(1, Math.min(6, Number(rawWatermarkRepeat || '2'))),
}

// Validate required fields (exclude optional watermark fields)
const requiredFields = ['MONGO_URI', 'JWT_SECRET', 'CHAIN_RPC_URL', 'CONTRACT_ADDRESS', 'CONTRACT_CHAIN_ID', 'PRIVATE_KEY']
requiredFields.forEach((key) => {
  const value = config[key as keyof typeof config]
  if (value === undefined || value === null || value === "") throw new Error(`Missing ENV: ${key}`)
})
