import dotenv from "dotenv"
dotenv.config()

const rawWatermarkEnabled = (process.env.WATERMARK_ENABLED ?? 'false').trim().toLowerCase()
const rawWatermarkText = (process.env.WATERMARK_TEXT ?? 'Issued by CertX • Do not alter').trim()
const rawWatermarkOpacity = (process.env.WATERMARK_OPACITY ?? '0.35').trim()
const rawWatermarkColor = (process.env.WATERMARK_COLOR ?? '#2f2f2f').trim()
const rawWatermarkRepeat = (process.env.WATERMARK_REPEAT ?? '3').trim()
const rawWatermarkMargin = (process.env.WATERMARK_MARGIN ?? '0.12').trim()

console.log('[config] WATERMARK_ENABLED raw:', rawWatermarkEnabled, '=>', rawWatermarkEnabled === 'true')
console.log('[config] WATERMARK_REPEAT raw:', rawWatermarkRepeat)
console.log('[config] WATERMARK_MARGIN raw:', rawWatermarkMargin)

type AppConfig = {
  PORT: number
  MONGO_URI: string
  JWT_SECRET: string
  CHAIN_RPC_URL: string
  CONTRACT_ADDRESS: string
  CONTRACT_CHAIN_ID: number
  PRIVATE_KEY: string
  IPFS_TOKEN: string
  IPFS_GATEWAY: string
  PUBLIC_VERIFY_BASE: string
  WATERMARK_ENABLED: boolean
  WATERMARK_TEXT: string
  WATERMARK_OPACITY: number
  WATERMARK_COLOR: string
  WATERMARK_REPEAT: number
  WATERMARK_MARGIN: number
}

const cfg: AppConfig = {
  PORT: Number(process.env.PORT || 8080),
  MONGO_URI: process.env.MONGO_URI!,
  JWT_SECRET: process.env.JWT_SECRET!,
  CHAIN_RPC_URL: process.env.CHAIN_RPC_URL!,
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS!,
  CONTRACT_CHAIN_ID: Number(process.env.CONTRACT_CHAIN_ID!),
  PRIVATE_KEY: process.env.PRIVATE_KEY!,
  IPFS_TOKEN: process.env.IPFS_TOKEN || "",
  IPFS_GATEWAY: process.env.IPFS_GATEWAY || "",
  PUBLIC_VERIFY_BASE: process.env.PUBLIC_VERIFY_BASE || "http://localhost:5173/verify",
  WATERMARK_ENABLED: rawWatermarkEnabled === 'true',
  WATERMARK_TEXT: rawWatermarkText,
  WATERMARK_OPACITY: Number(rawWatermarkOpacity || '0.35'),
  WATERMARK_COLOR: rawWatermarkColor || '#2f2f2f',
  WATERMARK_REPEAT: Math.max(1, Math.min(6, Number(rawWatermarkRepeat || '3'))),
  WATERMARK_MARGIN: Math.min(0.45, Math.max(0, Number(rawWatermarkMargin || '0.12'))),
}

export const config = cfg

// Validate required fields (exclude optional watermark fields)
const requiredFields: Array<keyof AppConfig> = ['MONGO_URI', 'JWT_SECRET', 'CHAIN_RPC_URL', 'CONTRACT_ADDRESS', 'CONTRACT_CHAIN_ID', 'PRIVATE_KEY']
requiredFields.forEach((key) => {
  const value = config[key]
  if (value === undefined || value === null || value === "") throw new Error(`Missing ENV: ${key}`)
})
