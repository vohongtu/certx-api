import AuditLog, { AuditAction, AuditStatus } from '../models/audit-log.model'

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
    // Chỉ log ra console
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

