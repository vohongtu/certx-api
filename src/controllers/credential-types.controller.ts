import CredentialType from '../models/credential-type.model.js'
import CredentialValidityOption from '../models/credential-validity-option.model.js'
import { createVietnameseSearchRegex } from '../utils/vietnamese-utils.js'
import { logAudit, getClientIp, getUserAgent } from '../services/audit.service.js'
import { AuditAction, AuditStatus } from '../models/audit-log.model.js'
import Issuer from '../models/issuer.model.js'

// Lấy danh sách tất cả credential types
export async function listCredentialTypes(req: any, res: any) {
  try {
    const { q, page, limit } = req.query // Query string để search, pagination
    const filter: any = {}
    
    if (q && q.trim()) {
      const searchQuery = q.trim()
      // Tạo regex pattern hỗ trợ search cả có dấu và không dấu
      const vietnameseRegex = createVietnameseSearchRegex(searchQuery)
      // Regex thông thường cho case-insensitive
      const normalRegex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      
      // Tìm kiếm theo name (cả có dấu và không dấu) hoặc id
      filter.$or = [
        { name: vietnameseRegex },
        { name: normalRegex }, // Fallback cho trường hợp đặc biệt
        { id: { $regex: searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
      ]
    }
    
    // Pagination
    const pageNum = parseInt(page) || 1
    const limitNum = parseInt(limit) || 10
    const skip = (pageNum - 1) * limitNum
    
    // Get total count
    const total = await CredentialType.countDocuments(filter)
    
    // Get paginated results
    const credentialTypes = await CredentialType.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limitNum)
    
    const totalPages = Math.ceil(total / limitNum)
    
    res.json({
      items: credentialTypes,
      total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    })
  } catch (error: any) {
    console.error('Error listing credential types:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi lấy danh sách loại văn bằng' })
  }
}

// Lấy một credential type theo ID
export async function getCredentialTypeById(req: any, res: any) {
  try {
    const { id } = req.params
    const credentialType = await CredentialType.findOne({ id })
    
    if (!credentialType) {
      return res.status(404).json({ message: 'Không tìm thấy loại văn bằng' })
    }
    
    res.json(credentialType)
  } catch (error: any) {
    console.error('Error getting credential type:', error)
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi lấy thông tin loại văn bằng' })
  }
}

// Tạo credential type mới (Admin only)
export async function createCredentialType(req: any, res: any) {
    const { id, name, isPermanent } = req.body
  const currentUserId = req.user?.sub
  const currentUserRole = req.user?.role

  // Lấy thông tin user cho audit log
  let adminEmail = req.user?.email || 'unknown'
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

  // Validate input
    if (!id || !name || typeof isPermanent !== 'boolean') {
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.CREDENTIAL_TYPE_CREATE,
      status: AuditStatus.FAILURE,
      errorMessage: 'Thiếu thông tin: id, name, isPermanent',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
      return res.status(400).json({ message: 'Thiếu thông tin: id, name, isPermanent' })
    }
    
  try {
    // Kiểm tra id đã tồn tại chưa
    const existing = await CredentialType.findOne({ id })
    if (existing) {
      await logAudit({
        userId: currentUserId,
        userEmail: adminEmail,
        userRole: adminRole,
        action: AuditAction.CREDENTIAL_TYPE_CREATE,
        status: AuditStatus.FAILURE,
        resourceType: 'credential_type',
        resourceId: id,
        errorMessage: 'ID đã tồn tại',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(400).json({ message: 'ID đã tồn tại' })
    }
    
    const credentialType = await CredentialType.create({
      id,
      name,
      isPermanent
    })

    // Ghi log thành công
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.CREDENTIAL_TYPE_CREATE,
      status: AuditStatus.SUCCESS,
      resourceType: 'credential_type',
      resourceId: id,
      details: {
        credentialTypeId: id,
        credentialTypeName: name,
        isPermanent,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    
    res.status(201).json(credentialType)
  } catch (error: any) {
    console.error('Error creating credential type:', error)
    
    // Ghi log thất bại
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.CREDENTIAL_TYPE_CREATE,
      status: AuditStatus.FAILURE,
      resourceType: 'credential_type',
      resourceId: id,
      errorMessage: error.message || 'Có lỗi xảy ra khi tạo loại văn bằng',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    if (error.code === 11000) {
      return res.status(400).json({ message: 'ID đã tồn tại' })
    }
    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi tạo loại văn bằng' })
  }
}

// Cập nhật credential type (Admin only)
export async function updateCredentialType(req: any, res: any) {
    const { id } = req.params
    const { name, isPermanent } = req.body
  const currentUserId = req.user?.sub
  const currentUserRole = req.user?.role

  // Lấy thông tin user cho audit log
  let adminEmail = req.user?.email || 'unknown'
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
    const credentialType = await CredentialType.findOne({ id })
    if (!credentialType) {
      await logAudit({
        userId: currentUserId,
        userEmail: adminEmail,
        userRole: adminRole,
        action: AuditAction.CREDENTIAL_TYPE_UPDATE,
        status: AuditStatus.FAILURE,
        resourceType: 'credential_type',
        resourceId: id,
        errorMessage: 'Không tìm thấy loại văn bằng',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(404).json({ message: 'Không tìm thấy loại văn bằng' })
    }

    const oldName = credentialType.name
    const oldIsPermanent = credentialType.isPermanent
    
    if (name !== undefined) credentialType.name = name
    if (isPermanent !== undefined) credentialType.isPermanent = isPermanent
    
    await credentialType.save()

    // Ghi log thành công
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.CREDENTIAL_TYPE_UPDATE,
      status: AuditStatus.SUCCESS,
      resourceType: 'credential_type',
      resourceId: id,
      details: {
        credentialTypeId: id,
        oldName,
        newName: credentialType.name,
        nameChanged: oldName !== credentialType.name,
        oldIsPermanent,
        newIsPermanent: credentialType.isPermanent,
        isPermanentChanged: oldIsPermanent !== credentialType.isPermanent,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    
    res.json(credentialType)
  } catch (error: any) {
    console.error('Error updating credential type:', error)

    // Ghi log thất bại
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.CREDENTIAL_TYPE_UPDATE,
      status: AuditStatus.FAILURE,
      resourceType: 'credential_type',
      resourceId: id,
      errorMessage: error.message || 'Có lỗi xảy ra khi cập nhật loại văn bằng',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi cập nhật loại văn bằng' })
  }
}

// Xóa credential type (Admin only)
export async function deleteCredentialType(req: any, res: any) {
  const { id } = req.params
  const currentUserId = req.user?.sub
  const currentUserRole = req.user?.role

  // Lấy thông tin user cho audit log
  let adminEmail = req.user?.email || 'unknown'
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
    const credentialType = await CredentialType.findOne({ id })
    if (!credentialType) {
      await logAudit({
        userId: currentUserId,
        userEmail: adminEmail,
        userRole: adminRole,
        action: AuditAction.CREDENTIAL_TYPE_DELETE,
        status: AuditStatus.FAILURE,
        resourceType: 'credential_type',
        resourceId: id,
        errorMessage: 'Không tìm thấy loại văn bằng',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(404).json({ message: 'Không tìm thấy loại văn bằng' })
    }
    
    // Kiểm tra xem có validity options nào đang sử dụng credential type này không
    const validityOptionsCount = await CredentialValidityOption.countDocuments({ credentialTypeId: id })
    if (validityOptionsCount > 0) {
      await logAudit({
        userId: currentUserId,
        userEmail: adminEmail,
        userRole: adminRole,
        action: AuditAction.CREDENTIAL_TYPE_DELETE,
        status: AuditStatus.FAILURE,
        resourceType: 'credential_type',
        resourceId: id,
        errorMessage: `Không thể xóa vì đang có ${validityOptionsCount} tùy chọn thời hạn đang sử dụng`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(400).json({ 
        message: `Không thể xóa loại văn bằng này vì đang có ${validityOptionsCount} tùy chọn thời hạn đang sử dụng. Vui lòng xóa các tùy chọn thời hạn trước.` 
      })
    }

    const deletedType = {
      id: credentialType.id,
      name: credentialType.name,
      isPermanent: credentialType.isPermanent,
    }
    
    await CredentialType.deleteOne({ id })

    // Ghi log thành công
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.CREDENTIAL_TYPE_DELETE,
      status: AuditStatus.SUCCESS,
      resourceType: 'credential_type',
      resourceId: id,
      details: {
        deletedCredentialTypeId: id,
        deletedCredentialTypeName: credentialType.name,
        isPermanent: credentialType.isPermanent,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    
    res.json({ message: 'Đã xóa loại văn bằng thành công' })
  } catch (error: any) {
    console.error('Error deleting credential type:', error)

    // Ghi log thất bại
    await logAudit({
      userId: currentUserId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.CREDENTIAL_TYPE_DELETE,
      status: AuditStatus.FAILURE,
      resourceType: 'credential_type',
      resourceId: id,
      errorMessage: error.message || 'Có lỗi xảy ra khi xóa loại văn bằng',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    res.status(500).json({ message: error.message || 'Có lỗi xảy ra khi xóa loại văn bằng' })
  }
}

