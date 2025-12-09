import express from 'express'
import cors from 'cors'
import { config } from "./utils/env.js"
import authRoutes from './routes/auth.routes.js'
import certRoutes from './routes/certs.routes.js'
import credentialTypesRoutes from './routes/credential-types.routes.js'
import credentialValidityOptionsRoutes from './routes/credential-validity-options.routes.js'
import auditRoutes from './routes/audit.routes.js'

export const app = express()

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true)
      return
    }
    
    const allowedOrigins = [config.PUBLIC_CLIENT].filter(Boolean)
    const isProduction = process.env.NODE_ENV === 'production'
    if (!isProduction) {
      allowedOrigins.push(
        'http://localhost:5173',
        'http://127.0.0.1:5173'
      )
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204,
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.get('/health', (_, res) => res.json({ ok: true }))
app.use('/auth', authRoutes)
app.use('/', certRoutes)
app.use('/', credentialTypesRoutes)
app.use('/', credentialValidityOptionsRoutes)
app.use('/audit', auditRoutes)
app.use((err: any, _req: any, res: any, _next: any) => {
  const code = err.status || 500
  res.status(code).json({ message: err.message || 'Server error' })
})
