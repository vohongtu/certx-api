import AuditLog, { AuditAction, AuditStatus } from '../models/audit-log.model.js'
import Issuer from '../models/issuer.model.js'

interface AuditLogData {
  userId: string
  userEmail: string
  userRole: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  action: AuditAction
  status: AuditStatus
  resourceType?: string
  resourceId?: string
  details?: any
  ipAddress?: string
  userAgent?: string
  errorMessage?: string
}

/**
 * Ghi audit log vào database
 */
export async function logAudit(data: AuditLogData): Promise<void> {
  try {
    await AuditLog.create({
      userId: data.userId,
      userEmail: data.userEmail,
      userRole: data.userRole,
      action: data.action,
      status: data.status,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      details: data.details || {},
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      errorMessage: data.errorMessage,
    })
  } catch (error) {
    // Không throw error để không ảnh hưởng đến flow chính
    console.error('Failed to create audit log:', error)
  }
}

/**
 * Helper để lấy IP address từ request
 */
export function getClientIp(req: any): string {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'unknown'
  )
}

/**
 * Helper để lấy user agent từ request
 */
export function getUserAgent(req: any): string {
  return req.headers['user-agent'] || 'unknown'
}

/**
 * Helper để lấy thông tin user cho audit log
 */
export async function getUserInfoForAudit(userId: string, userRole?: string): Promise<{ email: string; role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' }> {
  try {
    const issuer = await Issuer.findById(userId)
    if (issuer && issuer.email) {
      return {
        email: issuer.email,
        role: (issuer.role || userRole || 'USER') as 'USER' | 'ADMIN' | 'SUPER_ADMIN'
      }
    }
  } catch (error) {
    // Fallback nếu không tìm thấy user
  }
  
  // Fallback: dùng role từ token nếu có
  return {
    email: 'unknown',
    role: (userRole || 'USER') as 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  }
}

