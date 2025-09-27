import jwt from 'jsonwebtoken'
import { config } from '../utils/env'

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
