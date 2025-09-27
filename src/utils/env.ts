export const config = {
  PORT: Number(process.env.PORT || 8080),
  MONGO_URI: process.env.MONGO_URI!,
  JWT_SECRET: process.env.JWT_SECRET!,
  CHAIN_RPC_URL: process.env.CHAIN_RPC_URL!,
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS!,
  CONTRACT_CHAIN_ID: Number(process.env.CONTRACT_CHAIN_ID!),
  PRIVATE_KEY: process.env.PRIVATE_KEY!,
  IPFS_TOKEN: process.env.IPFS_TOKEN || '',
  PUBLIC_VERIFY_BASE: process.env.PUBLIC_VERIFY_BASE || 'http://localhost:5173/verify'
}

Object.entries(config).forEach(([k,v]) => { 
  if (v===undefined || v===null || v==='') throw new Error(`Missing ENV: ${k}`) 
})
