import { Schema, model } from 'mongoose'

export enum AuditAction {
  // Authentication
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  REGISTER = 'REGISTER',
  
  // Certificate Actions
  CERT_UPLOAD = 'CERT_UPLOAD',
  CERT_APPROVE = 'CERT_APPROVE',
  CERT_REJECT = 'CERT_REJECT',
  CERT_REVOKE = 'CERT_REVOKE',
  CERT_ISSUE = 'CERT_ISSUE',
  CERT_REUPLOAD = 'CERT_REUPLOAD',
  CERT_UPDATE_EXPIRATION = 'CERT_UPDATE_EXPIRATION',
  CERT_TRANSFER = 'CERT_TRANSFER',
  
  // User Management
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',
  USER_ENABLE = 'USER_ENABLE',
  USER_DISABLE = 'USER_DISABLE',
  
  // Credential Management
  CREDENTIAL_TYPE_CREATE = 'CREDENTIAL_TYPE_CREATE',
  CREDENTIAL_TYPE_UPDATE = 'CREDENTIAL_TYPE_UPDATE',
  CREDENTIAL_TYPE_DELETE = 'CREDENTIAL_TYPE_DELETE',
  CREDENTIAL_VALIDITY_CREATE = 'CREDENTIAL_VALIDITY_CREATE',
  CREDENTIAL_VALIDITY_UPDATE = 'CREDENTIAL_VALIDITY_UPDATE',
  CREDENTIAL_VALIDITY_DELETE = 'CREDENTIAL_VALIDITY_DELETE',
  
  // System
  SYSTEM_CONFIG_UPDATE = 'SYSTEM_CONFIG_UPDATE',
}

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

const AuditLogSchema = new Schema({
  userId: { type: String, index: true }, // ID của user thực hiện hành động
  userEmail: String, // Email của user (để dễ tra cứu)
  userRole: { type: String, enum: ['USER', 'ADMIN', 'SUPER_ADMIN'], index: true }, // Role của user
  action: { type: String, enum: Object.values(AuditAction), required: true, index: true }, // Loại hành động
  status: { type: String, enum: Object.values(AuditStatus), required: true, index: true }, // Trạng thái (SUCCESS/FAILURE)
  resourceType: String, // Loại resource (cert, user, credential_type, etc.)
  resourceId: String, // ID của resource bị tác động
  details: Schema.Types.Mixed, // Chi tiết hành động (JSON object)
  ipAddress: String, // IP address của user
  userAgent: String, // User agent của browser
  errorMessage: String, // Thông báo lỗi (nếu status = FAILURE)
}, { timestamps: true })

// Indexes để tối ưu query
AuditLogSchema.index({ createdAt: -1 }) // Sort theo thời gian mới nhất
AuditLogSchema.index({ userId: 1, createdAt: -1 }) // Query theo user
AuditLogSchema.index({ action: 1, createdAt: -1 }) // Query theo action
AuditLogSchema.index({ status: 1, createdAt: -1 }) // Query theo status
AuditLogSchema.index({ userRole: 1, createdAt: -1 }) // Query theo role

export default model('AuditLog', AuditLogSchema)

