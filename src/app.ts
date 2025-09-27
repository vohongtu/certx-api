import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.routes'
import certRoutes from './routes/certs.routes'

export const app = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/health', (_, res) => res.json({ ok: true }))
app.use('/auth', authRoutes)
app.use('/', certRoutes) // /certs/*, /verify, /qrcode

// error fallback
app.use((err: any, _req: any, res: any, _next: any) => {
  const code = err.status || 500
  res.status(code).json({ message: err.message || 'Server error' })
})
