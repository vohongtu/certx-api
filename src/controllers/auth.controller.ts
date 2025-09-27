import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Issuer from '../models/issuer.model'
import { config } from '../utils/env'

export async function login(req: any, res: any) {
  const { email, password } = req.body
  const u = await Issuer.findOne({ email, enabled: true })
  
  if (!u) return res.status(401).json({ message: 'Sai thông tin' })
  
  const ok = await bcrypt.compare(password, u.passwordHash)
  if (!ok) return res.status(401).json({ message: 'Sai thông tin' })
  
  const token = jwt.sign(
    { sub: u.id, email: u.email, role: 'issuer' }, 
    config.JWT_SECRET, 
    { expiresIn: '1d' }
  )
  
  res.json({ token })
}
