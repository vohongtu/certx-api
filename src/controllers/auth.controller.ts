import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import Issuer, { UserRole } from "../models/issuer.model"
import { config } from "../utils/env"
import { whiteListIssuer } from "../services/blockchain.service"

export async function login(req: any, res: any) {
  const { email, password } = req.body
  const user = await Issuer.findOne({ email, enabled: true })

  if (!user) return res.status(401).json({ message: "Sai thông tin" })

  if (!user.passwordHash) return res.status(401).json({ message: "Sai thông tin" })
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return res.status(401).json({ message: "Sai thông tin" })

  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role || UserRole.USER, address: user.address, name: user.name },
    config.JWT_SECRET,
    {
      expiresIn: "1d",
    }
  )

  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role || UserRole.USER } })
}

export async function register(req: any, res: any) {
  const { email, password, name, address } = req.body
  if (!email || !password || !name)
    return res.status(400).json({ message: "Thiếu email, password hoặc họ tên" })

  const existing = await Issuer.findOne({ email })
  if (existing) return res.status(400).json({ message: "Email đã tồn tại" })

  const hash = await bcrypt.hash(password, 10)
  const user = await Issuer.create({ email, name, passwordHash: hash, address: address || undefined, role: UserRole.USER })

  // Chỉ whitelist nếu có address
  if (address) {
  await whiteListIssuer(address, true)
  }

  res.json({ id: user.id, email: user.email, name: user.name, role: user.role })
}
