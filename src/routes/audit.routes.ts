import { Router } from 'express'
import { requireSuperAdmin } from '../middlewares/auth'
import { listAuditLogs, getAuditStats } from '../controllers/audit.controller'

const r = Router()

// Tất cả routes đều yêu cầu SUPER_ADMIN
r.get('/logs', requireSuperAdmin, listAuditLogs)
r.get('/stats', requireSuperAdmin, getAuditStats)

export default r

