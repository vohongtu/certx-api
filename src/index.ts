import { config } from "./utils/env.js"
import { connectDB } from "./config/db.js"
import { app } from "./app.js"

async function main() {
  await connectDB(config.MONGO_URI)
  app.listen(config.PORT, () => console.log(`certx-api on :${config.PORT}`))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
