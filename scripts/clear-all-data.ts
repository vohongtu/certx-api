import mongoose from 'mongoose'
import { config } from '../src/utils/env'
import { connectDB } from '../src/config/db'
import Cert from '../src/models/cert.model'
import CredentialType from '../src/models/credential-type.model'
import CredentialValidityOption from '../src/models/credential-validity-option.model'
import Issuer from '../src/models/issuer.model'

async function main() {
  await connectDB(config.MONGO_URI)
  
  console.log('🗑️  Bắt đầu xóa tất cả dữ liệu cũ trong CertX...\n')
  
  try {
    // Xóa tất cả certificates
    console.log('📄 Đang xóa certificates...')
    const certCount = await Cert.countDocuments()
    await Cert.deleteMany({})
    console.log(`✅ Đã xóa ${certCount} certificates`)
    
    // Xóa tất cả credential validity options
    console.log('⏱️  Đang xóa credential validity options...')
    const validityCount = await CredentialValidityOption.countDocuments()
    await CredentialValidityOption.deleteMany({})
    console.log(`✅ Đã xóa ${validityCount} credential validity options`)
    
    // Xóa tất cả credential types
    console.log('📋 Đang xóa credential types...')
    const typeCount = await CredentialType.countDocuments()
    await CredentialType.deleteMany({})
    console.log(`✅ Đã xóa ${typeCount} credential types`)
    
    // Xóa tất cả issuers (users)
    console.log('👤 Đang xóa issuers (users)...')
    const issuerCount = await Issuer.countDocuments()
    await Issuer.deleteMany({})
    console.log(`✅ Đã xóa ${issuerCount} issuers`)
    
    console.log('\n✨ Hoàn thành! Tất cả dữ liệu đã được xóa.')
    console.log('\n💡 Lưu ý: Bạn có thể chạy lại các script seed để tạo dữ liệu mẫu:')
    console.log('   - npm run seed (tạo issuer mẫu)')
    console.log('   - npm run seed:credential-types (tạo credential types)')
    console.log('   - npm run seed:credential-validity-options (tạo validity options)')
    console.log('   - npm run create-super-admin (tạo super admin)')
    
  } catch (error: any) {
    console.error('❌ Lỗi khi xóa dữ liệu:', error.message)
    process.exit(1)
  }
  
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Error:', err)
  process.exit(1)
})

