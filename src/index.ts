import { config } from './utils/env'
import { connectDB } from './config/db'
import { app } from './app'

async function main() {
  await connectDB(config.MONGO_URI)
  app.listen(config.PORT, () => console.log(`certx-api on :${config.PORT}`))
}

main().catch(err => { 
  console.error(err)
  process.exit(1) 
})
