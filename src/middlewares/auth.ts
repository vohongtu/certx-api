import jwt from 'jsonwebtoken'
import { config } from '../utils/env'
import { UserRole } from '../models/issuer.model'

export function requireAuth(req: any, res: any, next: any) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  
  if (!token) return res.status(401).json({ message: 'Unauthorized' })
  
  try { 
    req.user = jwt.verify(token, config.JWT_SECRET)
    next() 
  } catch { 
    return res.status(401).json({ message: 'Invalid token' }) 
  }
}

export function requireAdmin(req: any, res: any, next: any) {
  requireAuth(req, res, () => {
    const role = req.user?.role
    if (role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ message: 'Chỉ admin mới có quyền thực hiện thao tác này' })
    }
    next()
  })
}

export function requireSuperAdmin(req: any, res: any, next: any) {
  requireAuth(req, res, () => {
    const role = req.user?.role
    if (role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ message: 'Chỉ super admin mới có quyền thực hiện thao tác này' })
    }
    next()
  })
}
