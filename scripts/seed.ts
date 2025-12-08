import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import Issuer from '../src/models/issuer.model'
import { config } from '../src/utils/env'
import { connectDB } from '../src/config/db'

async function main() {
  await connectDB(config.MONGO_URI)

  const email = process.env.SEED_ISSUER_EMAIL || 'issuer@certx.local'
  const password = process.env.SEED_ISSUER_PASSWORD || 'Certx123!'
  const name = process.env.SEED_ISSUER_NAME || 'Seed Issuer'
  const address = process.env.SEED_ISSUER_ADDRESS || '0xSeedIssuerAddress000000000000000000000000'

  const hash = await bcrypt.hash(password, 10)
  const existing = await Issuer.findOne({ email })

  if (existing) {
    existing.passwordHash = hash
    existing.name = name
    existing.address = address
    existing.enabled = true
    await existing.save()
    console.log(`Issuer updated: ${email}`)
  } else {
    await Issuer.create({ email, passwordHash: hash, name, address })
    console.log(`Issuer created: ${email}`)
  }

  console.log('Login credentials:')
  console.log(`  email:    ${email}`)
  console.log(`  password: ${password}`)

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed error:', err)
  process.exit(1)
})
