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
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || [`${config.PUBLIC_CLIENT}`].includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400, // 24 hours
  // Quan trọng: Cho phép tất cả Content-Type (bao gồm multipart/form-data)
  preflightContinue: false,
  optionsSuccessStatus: 204,
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.get('/health', (_, res) => res.json({ ok: true }))
app.use('/auth', authRoutes)
app.use('/', certRoutes) // /certs/*, /verify, /qrcode
app.use('/', credentialTypesRoutes) // /credential-types/*
app.use('/', credentialValidityOptionsRoutes) // /credential-validity-options/*
app.use('/audit', auditRoutes) // /audit/* (chỉ SUPER_ADMIN)

// error fallback
app.use((err: any, _req: any, res: any, _next: any) => {
  const code = err.status || 500
  res.status(code).json({ message: err.message || 'Server error' })
})
