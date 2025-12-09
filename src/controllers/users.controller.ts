import bcrypt from "bcryptjs"
import Issuer, { UserRole } from "../models/issuer.model.js"
import { whiteListIssuer } from "../services/blockchain.service.js"
import { createVietnameseSearchRegex } from "../utils/vietnamese-utils.js"
import { logAudit, getClientIp, getUserAgent } from "../services/audit.service.js"
import { AuditAction, AuditStatus } from "../models/audit-log.model.js"

export async function listUsers(req: any, res: any) {
  const currentUserRole = req.user?.role
  const page = Math.max(parseInt(req.query.page ?? '1', 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(req.query.limit ?? '10', 10) || 10, 1), 50)
  const q = (req.query.q ?? '').toString().trim()
  const role = (req.query.role ?? '').toString().toUpperCase()

  const filter: any = {}
  
  // Super admin có thể xem tất cả, admin chỉ xem USER
  if (currentUserRole === UserRole.ADMIN) {
    filter.role = UserRole.USER
  }

  if (role && Object.values(UserRole).includes(role as UserRole)) {
    if (currentUserRole === UserRole.ADMIN && role !== UserRole.USER) {
      return res.status(403).json({ message: 'Admin chỉ có thể xem user' })
    }
    filter.role = role
  }

  if (q) {
    const searchQuery = q.trim()
    // Tạo regex pattern hỗ trợ search cả có dấu và không dấu cho name
    const vietnameseRegex = createVietnameseSearchRegex(searchQuery)
    // Regex thông thường cho case-insensitive (cho email và address)
    const normalRegex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    
    // Tìm kiếm theo name (cả có dấu và không dấu), email, hoặc address
    filter.$or = [
      { name: vietnameseRegex }, // Name với hỗ trợ không dấu
      { name: normalRegex }, // Fallback cho trường hợp đặc biệt
      { email: normalRegex }, // Email không cần hỗ trợ không dấu
      { address: normalRegex }, // Address không cần hỗ trợ không dấu
    ]
  }

  const total = await Issuer.countDocuments(filter)
  const totalPages = Math.max(Math.ceil(total / limit), 1)
  const currentPage = Math.min(page, totalPages)

  const users = await Issuer.find(filter)
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .skip((currentPage - 1) * limit)
    .limit(limit)

  res.json({
    items: users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      address: u.address,
      role: u.role,
      enabled: u.enabled,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })),
    pagination: {
      page: currentPage,
      limit,
      total,
      totalPages,
    },
  })
}

export async function createUser(req: any, res: any) {
  const { email, password, name, address, role: requestedRole } = req.body
  const currentUserRole = req.user?.role
  const currentUserId = req.user?.sub
  const currentUserEmail = req.user?.email

  // Lấy thông tin user hiện tại để ghi audit log
  let adminEmail = currentUserEmail || 'unknown'
  let adminRole: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = currentUserRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : currentUserRole === 'ADMIN' ? 'ADMIN' : 'USER'
  
  try {
    const issuer = await Issuer.findById(currentUserId)
    if (issuer) {
      adminEmail = issuer.email
      adminRole = issuer.role as 'USER' | 'ADMIN' | 'SUPER_ADMIN'
    }
  } catch (err) {
    // Nếu không lấy được, dùng giá trị mặc định
  }

  try {
  if (!email || !password || !name) {
      // Ghi log thất bại
      await logAudit({
        userId: currentUserId,
        userEmail: adminEmail,
        userRole: adminRole,
        action: AuditAction.USER_CREATE,
        status: AuditStatus.FAILURE,
        errorMessage: 'Thiếu email, password hoặc name',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
    return res.status(400).json({ message: "Thiếu email, password hoặc name" })
  }

  // Admin chỉ có thể tạo USER
  if (currentUserRole === UserRole.ADMIN && requestedRole && requestedRole !== UserRole.USER) {
      // Ghi log thất bại
      await logAudit({
        userId: currentUserId,
        userEmail: adminEmail,
        userRole: adminRole,
        action: AuditAction.USER_CREATE,
        status: AuditStatus.FAILURE,
        errorMessage: 'Admin chỉ có thể tạo user',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
    return res.status(403).json({ message: "Admin chỉ có thể tạo user" })
  }

  // Super admin có thể tạo SUPER_ADMIN, ADMIN hoặc USER
  let role = UserRole.USER
  if (currentUserRole === UserRole.SUPER_ADMIN && requestedRole) {
    if (requestedRole === UserRole.SUPER_ADMIN) {
      role = UserRole.SUPER_ADMIN
    } else if (requestedRole === UserRole.ADMIN) {
      role = UserRole.ADMIN
    } else {
      role = UserRole.USER
    }
  }

  // Nếu tạo ADMIN hoặc SUPER_ADMIN thì bắt buộc phải có address
  if ((role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) && !address) {
      // Ghi log thất bại
      await logAudit({
        userId: currentUserId,
        userEmail: adminEmail,
        userRole: adminRole,
        action: AuditAction.USER_CREATE,
        status: AuditStatus.FAILURE,
        errorMessage: `Tạo tài khoản ${role === UserRole.SUPER_ADMIN ? 'super admin' : 'admin'} cần có địa chỉ ETH`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
    return res.status(400).json({ message: `Tạo tài khoản ${role === UserRole.SUPER_ADMIN ? 'super admin' : 'admin'} cần có địa chỉ ETH` })
  }

  // Nếu tạo USER thì không cần address
  const finalAddress = role === UserRole.USER ? '' : (address || '')

  const existing = await Issuer.findOne({ email })
    if (existing) {
      // Ghi log thất bại
      await logAudit({
        userId: currentUserId,
        userEmail: adminEmail,
        userRole: adminRole,
        action: AuditAction.USER_CREATE,
        status: AuditStatus.FAILURE,
        errorMessage: 'Email đã tồn tại',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(400).json({ message: "Email đã tồn tại" })
    }

  const hash = await bcrypt.hash(password, 10)
  const user = await Issuer.create({ 
    email, 
    name, 
    passwordHash: hash, 
    address: finalAddress, 
    role 
  })

  // Whitelist address nếu có và là ADMIN hoặc SUPER_ADMIN
  if (finalAddress && (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN)) {
    await whiteListIssuer(finalAddress, true)
  }

    // Ghi log thành công
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.USER_CREATE,
      status: AuditStatus.SUCCESS,
      resourceType: 'user',
      resourceId: user.id,
      details: {
        createdUserEmail: user.email,
        createdUserName: user.name,
        createdUserRole: user.role,
        createdUserAddress: user.address || undefined,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

  res.json({ 
    id: user.id, 
    email: user.email, 
    name: user.name, 
    address: user.address, 
    role: user.role,
    enabled: user.enabled
  })
  } catch (error: any) {
    // Ghi log thất bại
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.USER_CREATE,
      status: AuditStatus.FAILURE,
      errorMessage: error.message || 'Lỗi khi tạo user',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    res.status(500).json({ message: "Có lỗi xảy ra khi tạo user" })
  }
}

export async function updateUser(req: any, res: any) {
  const { id } = req.params
  const { name, email, address, enabled, role: requestedRole, password } = req.body
  const currentUserRole = req.user?.role
  const currentUserId = req.user?.sub
  const currentUserEmail = req.user?.email

  // Lấy thông tin user hiện tại để ghi audit log
  let adminEmail = currentUserEmail || 'unknown'
  let adminRole: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = currentUserRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : currentUserRole === 'ADMIN' ? 'ADMIN' : 'USER'
  
  try {
    const issuer = await Issuer.findById(currentUserId)
    if (issuer) {
      adminEmail = issuer.email
      adminRole = issuer.role as 'USER' | 'ADMIN' | 'SUPER_ADMIN'
    }
  } catch (err) {
    // Nếu không lấy được, dùng giá trị mặc định
  }

  try {
  const user = await Issuer.findById(id)
    if (!user) {
      // Ghi log thất bại
      await logAudit({
        userId: currentUserId,
        userEmail: adminEmail,
        userRole: adminRole,
        action: AuditAction.USER_UPDATE,
        status: AuditStatus.FAILURE,
        resourceType: 'user',
        resourceId: id,
        errorMessage: 'Không tìm thấy user',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(404).json({ message: "Không tìm thấy user" })
    }

  // Admin không thể sửa admin hoặc super admin
  if (currentUserRole === UserRole.ADMIN) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
        // Ghi log thất bại
        await logAudit({
          userId: currentUserId,
          userEmail: adminEmail,
          userRole: adminRole,
          action: AuditAction.USER_UPDATE,
          status: AuditStatus.FAILURE,
          resourceType: 'user',
          resourceId: id,
          errorMessage: 'Admin không thể sửa admin hoặc super admin',
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
        })
      return res.status(403).json({ message: "Admin không thể sửa admin hoặc super admin" })
    }
    // Admin không thể thay đổi role
    if (requestedRole && requestedRole !== user.role) {
        // Ghi log thất bại
        await logAudit({
          userId: currentUserId,
          userEmail: adminEmail,
          userRole: adminRole,
          action: AuditAction.USER_UPDATE,
          status: AuditStatus.FAILURE,
          resourceType: 'user',
          resourceId: id,
          errorMessage: 'Admin không thể thay đổi role',
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
        })
      return res.status(403).json({ message: "Admin không thể thay đổi role" })
    }
  }

  // Super admin có thể sửa admin (nhưng không thể sửa super admin khác)
  if (currentUserRole === UserRole.SUPER_ADMIN) {
    if (user.role === UserRole.SUPER_ADMIN && user.id !== currentUserId) {
        // Ghi log thất bại
        await logAudit({
          userId: currentUserId,
          userEmail: adminEmail,
          userRole: adminRole,
          action: AuditAction.USER_UPDATE,
          status: AuditStatus.FAILURE,
          resourceType: 'user',
          resourceId: id,
          errorMessage: 'Không thể sửa super admin khác',
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
        })
      return res.status(403).json({ message: "Không thể sửa super admin khác" })
    }
    // Super admin có thể thay đổi role (bao gồm cả SUPER_ADMIN)
    if (requestedRole) {
      user.role = requestedRole as UserRole
      // Nếu thay đổi thành ADMIN hoặc SUPER_ADMIN mà không có address thì yêu cầu
      if ((requestedRole === UserRole.ADMIN || requestedRole === UserRole.SUPER_ADMIN) && !address) {
          // Ghi log thất bại
          await logAudit({
            userId: currentUserId,
            userEmail: adminEmail,
            userRole: adminRole,
            action: AuditAction.USER_UPDATE,
            status: AuditStatus.FAILURE,
            resourceType: 'user',
            resourceId: id,
            errorMessage: `Thay đổi role thành ${requestedRole === UserRole.SUPER_ADMIN ? 'super admin' : 'admin'} cần có địa chỉ ETH`,
            ipAddress: getClientIp(req),
            userAgent: getUserAgent(req),
          })
        return res.status(400).json({ message: `Thay đổi role thành ${requestedRole === UserRole.SUPER_ADMIN ? 'super admin' : 'admin'} cần có địa chỉ ETH` })
      }
    }
  }

    const oldRole = user.role
    const oldEmail = user.email
    const oldEnabled = user.enabled

  if (name) user.name = name
  if (email && email !== user.email) {
    const existing = await Issuer.findOne({ email })
      if (existing) {
        // Ghi log thất bại
        await logAudit({
          userId: currentUserId,
          userEmail: adminEmail,
          userRole: adminRole,
          action: AuditAction.USER_UPDATE,
          status: AuditStatus.FAILURE,
          resourceType: 'user',
          resourceId: id,
          errorMessage: 'Email đã tồn tại',
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
        })
        return res.status(400).json({ message: "Email đã tồn tại" })
      }
    user.email = email
  }
  if (address !== undefined) user.address = address
  if (enabled !== undefined) user.enabled = enabled
  if (password) {
    user.passwordHash = await bcrypt.hash(password, 10)
  }

  await user.save()

    // Ghi log thành công
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.USER_UPDATE,
      status: AuditStatus.SUCCESS,
      resourceType: 'user',
      resourceId: id,
      details: {
        updatedUserEmail: user.email,
        updatedUserName: user.name,
        oldRole,
        newRole: user.role,
        roleChanged: oldRole !== user.role,
        oldEmail,
        emailChanged: oldEmail !== user.email,
        oldEnabled,
        newEnabled: user.enabled,
        enabledChanged: oldEnabled !== user.enabled,
        passwordChanged: !!password,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

  res.json({ 
    id: user.id, 
    email: user.email, 
    name: user.name, 
    address: user.address, 
    role: user.role,
    enabled: user.enabled
  })
  } catch (error: any) {
    // Ghi log thất bại
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.USER_UPDATE,
      status: AuditStatus.FAILURE,
      resourceType: 'user',
      resourceId: id,
      errorMessage: error.message || 'Lỗi khi cập nhật user',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    res.status(500).json({ message: "Có lỗi xảy ra khi cập nhật user" })
  }
}

export async function deleteUser(req: any, res: any) {
  const { id } = req.params
  const currentUserRole = req.user?.role
  const currentUserId = req.user?.sub
  const currentUserEmail = req.user?.email

  // Lấy thông tin user hiện tại để ghi audit log
  let adminEmail = currentUserEmail || 'unknown'
  let adminRole: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = currentUserRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : currentUserRole === 'ADMIN' ? 'ADMIN' : 'USER'
  
  try {
    const issuer = await Issuer.findById(currentUserId)
    if (issuer) {
      adminEmail = issuer.email
      adminRole = issuer.role as 'USER' | 'ADMIN' | 'SUPER_ADMIN'
    }
  } catch (err) {
    // Nếu không lấy được, dùng giá trị mặc định
  }

  try {
  const user = await Issuer.findById(id)
    if (!user) {
      // Ghi log thất bại
      await logAudit({
        userId: currentUserId,
        userEmail: adminEmail,
        userRole: adminRole,
        action: AuditAction.USER_DELETE,
        status: AuditStatus.FAILURE,
        resourceType: 'user',
        resourceId: id,
        errorMessage: 'Không tìm thấy user',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(404).json({ message: "Không tìm thấy user" })
    }

  // Không thể xóa chính mình
  if (user.id === currentUserId) {
      // Ghi log thất bại
      await logAudit({
        userId: currentUserId,
        userEmail: adminEmail,
        userRole: adminRole,
        action: AuditAction.USER_DELETE,
        status: AuditStatus.FAILURE,
        resourceType: 'user',
        resourceId: id,
        errorMessage: 'Không thể xóa chính mình',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
    return res.status(400).json({ message: "Không thể xóa chính mình" })
  }

  // Admin không thể xóa admin hoặc super admin
  if (currentUserRole === UserRole.ADMIN) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
        // Ghi log thất bại
        await logAudit({
          userId: currentUserId,
          userEmail: adminEmail,
          userRole: adminRole,
          action: AuditAction.USER_DELETE,
          status: AuditStatus.FAILURE,
          resourceType: 'user',
          resourceId: id,
          errorMessage: 'Admin không thể xóa admin hoặc super admin',
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
        })
      return res.status(403).json({ message: "Admin không thể xóa admin hoặc super admin" })
    }
  }

  // Super admin chỉ có thể xóa admin, không thể xóa super admin khác
  if (currentUserRole === UserRole.SUPER_ADMIN) {
    if (user.role === UserRole.SUPER_ADMIN) {
        // Ghi log thất bại
        await logAudit({
          userId: currentUserId,
          userEmail: adminEmail,
          userRole: adminRole,
          action: AuditAction.USER_DELETE,
          status: AuditStatus.FAILURE,
          resourceType: 'user',
          resourceId: id,
          errorMessage: 'Không thể xóa super admin',
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
        })
      return res.status(403).json({ message: "Không thể xóa super admin" })
    }
  }

    const deletedUserEmail = user.email
    const deletedUserRole = user.role
    const deletedUserName = user.name

  await Issuer.findByIdAndDelete(id)

    // Ghi log thành công
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.USER_DELETE,
      status: AuditStatus.SUCCESS,
      resourceType: 'user',
      resourceId: id,
      details: {
        deletedUserEmail,
        deletedUserName,
        deletedUserRole,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

  res.json({ ok: true, message: "Đã xóa user" })
  } catch (error: any) {
    // Ghi log thất bại
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.USER_DELETE,
      status: AuditStatus.FAILURE,
      resourceType: 'user',
      resourceId: id,
      errorMessage: error.message || 'Lỗi khi xóa user',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    res.status(500).json({ message: "Có lỗi xảy ra khi xóa user" })
  }
}

