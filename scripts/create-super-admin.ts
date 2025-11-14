import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import Issuer, { UserRole } from '../src/models/issuer.model'
import { config } from '../src/utils/env'
import { connectDB } from '../src/config/db'

async function main() {
  await connectDB(config.MONGO_URI)

  const email = 'supperadmin@certx.com'
  const password = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!'
  const name = 'Võ Hồng Tú'
  const address = '0xceb8a5e869b8cf7a64bb3a7909f27e4f84f2eb69'
  const role = UserRole.SUPER_ADMIN

  const hash = await bcrypt.hash(password, 10)
  const existing = await Issuer.findOne({ email })

  if (existing) {
    existing.passwordHash = hash
    existing.name = name
    existing.address = address
    existing.role = role
    existing.enabled = true
    await existing.save()
    console.log(`✅ Super Admin updated: ${email}`)
  } else {
    await Issuer.create({ 
      email, 
      passwordHash: hash, 
      name, 
      address,
      role,
      enabled: true
    })
    console.log(`✅ Super Admin created: ${email}`)
  }

  console.log('\n📋 Login credentials:')
  console.log(`  Email:    ${email}`)
  console.log(`  Password: ${password}`)
  console.log(`  Role:     ${role}`)
  console.log(`  Address:  ${address}`)
  console.log('\n✨ Super Admin account is ready!')

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Error creating super admin:', err)
  process.exit(1)
})

