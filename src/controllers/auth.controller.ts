import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import Issuer from "../models/issuer.model"
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
    { sub: user.id, email: user.email, role: "issuer", address: user.address },
    config.JWT_SECRET,
    {
      expiresIn: "1d",
    }
  )

  res.json({ token })
}

export async function register(req: any, res: any) {
  const { email, password, address } = req.body
  if (!email || !password || !address)
    return res.status(400).json({ message: "Thiếu email hoặc password hoặc address" })

  const existing = await Issuer.findOne({ email })
  if (existing) return res.status(400).json({ message: "Email đã tồn tại" })

  const hash = await bcrypt.hash(password, 10)
  const user = await Issuer.create({ email, passwordHash: hash, address })

  await whiteListIssuer(address, true)

  res.json({ id: user.id, email: user.email, address: user.address })
}
