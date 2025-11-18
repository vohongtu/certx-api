import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import Issuer, { UserRole } from "../models/issuer.model"
import { config } from "../utils/env"
import { whiteListIssuer } from "../services/blockchain.service"
import { logAudit, getClientIp, getUserAgent } from "../services/audit.service"
import { AuditAction, AuditStatus } from "../models/audit-log.model"

export async function login(req: any, res: any) {
  const { email, password } = req.body
  
  try {
    const user = await Issuer.findOne({ email, enabled: true })

    if (!user || !user.passwordHash) {
      // Ghi log thất bại
      await logAudit({
        userId: 'unknown',
        userEmail: email || 'unknown',
        userRole: 'USER',
        action: AuditAction.LOGIN,
        status: AuditStatus.FAILURE,
        errorMessage: 'Sai thông tin đăng nhập',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(401).json({ message: "Sai thông tin" })
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      // Ghi log thất bại
      await logAudit({
        userId: user.id,
        userEmail: user.email,
        userRole: (user.role || UserRole.USER) as 'USER' | 'ADMIN' | 'SUPER_ADMIN',
        action: AuditAction.LOGIN,
        status: AuditStatus.FAILURE,
        errorMessage: 'Sai mật khẩu',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(401).json({ message: "Sai thông tin" })
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role || UserRole.USER, address: user.address, name: user.name },
      config.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    )

    // Ghi log thành công
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: (user.role || UserRole.USER) as 'USER' | 'ADMIN' | 'SUPER_ADMIN',
      action: AuditAction.LOGIN,
      status: AuditStatus.SUCCESS,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role || UserRole.USER } })
  } catch (error: any) {
    // Ghi log thất bại
    await logAudit({
      userId: 'unknown',
      userEmail: email || 'unknown',
      userRole: 'USER',
      action: AuditAction.LOGIN,
      status: AuditStatus.FAILURE,
      errorMessage: error.message || 'Lỗi khi đăng nhập',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    res.status(500).json({ message: "Có lỗi xảy ra khi đăng nhập" })
  }
}

export async function register(req: any, res: any) {
  const { email, password, name, address } = req.body
  
  try {
    if (!email || !password || !name) {
      // Ghi log thất bại
      await logAudit({
        userId: 'unknown',
        userEmail: email || 'unknown',
        userRole: 'USER',
        action: AuditAction.REGISTER,
        status: AuditStatus.FAILURE,
        errorMessage: 'Thiếu email, password hoặc họ tên',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(400).json({ message: "Thiếu email, password hoặc họ tên" })
    }

    const existing = await Issuer.findOne({ email })
    if (existing) {
      // Ghi log thất bại
      await logAudit({
        userId: 'unknown',
        userEmail: email,
        userRole: 'USER',
        action: AuditAction.REGISTER,
        status: AuditStatus.FAILURE,
        errorMessage: 'Email đã tồn tại',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(400).json({ message: "Email đã tồn tại" })
    }

    const hash = await bcrypt.hash(password, 10)
    const user = await Issuer.create({ email, name, passwordHash: hash, address: address || undefined, role: UserRole.USER })

    // Chỉ whitelist nếu có address
    if (address) {
      await whiteListIssuer(address, true)
    }

    // Ghi log thành công
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      userRole: 'USER',
      action: AuditAction.REGISTER,
      status: AuditStatus.SUCCESS,
      details: {
        name: user.name,
        address: user.address || undefined,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    res.json({ id: user.id, email: user.email, name: user.name, role: user.role })
  } catch (error: any) {
    // Ghi log thất bại
    await logAudit({
      userId: 'unknown',
      userEmail: email || 'unknown',
      userRole: 'USER',
      action: AuditAction.REGISTER,
      status: AuditStatus.FAILURE,
      errorMessage: error.message || 'Lỗi khi đăng ký',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    res.status(500).json({ message: "Có lỗi xảy ra khi đăng ký" })
  }
}
