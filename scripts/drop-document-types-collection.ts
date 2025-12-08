import mongoose from 'mongoose'
import { config } from '../src/utils/env'
import { connectDB } from '../src/config/db'

async function main() {
  await connectDB(config.MONGO_URI)
  
  console.log('Dropping documenttypes collection...')
  
  try {
    const db = mongoose.connection.db
    if (db) {
      const collections = await db.listCollections({ name: 'documenttypes' }).toArray()
      if (collections.length > 0) {
        await db.collection('documenttypes').drop()
        console.log('✅ Collection "documenttypes" đã được xóa thành công')
      } else {
        console.log('ℹ️ Collection "documenttypes" không tồn tại')
      }
    }
  } catch (error: any) {
    console.error('❌ Lỗi khi xóa collection:', error.message)
  }
  
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})

