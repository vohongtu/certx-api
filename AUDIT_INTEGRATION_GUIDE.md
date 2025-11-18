# Hướng Dẫn Tích Hợp Audit Logging

## Tổng Quan

Hệ thống audit log đã được tạo để theo dõi tất cả hành động của admin, super admin và user. Để ghi log, bạn cần sử dụng `audit.service.ts`.

## Cách Sử Dụng

### 1. Import Audit Service

```typescript
import { logAudit, getClientIp, getUserAgent } from '../services/audit.service'
import { AuditAction, AuditStatus } from '../models/audit-log.model'
```

### 2. Ghi Log Trong Controller

#### Ví dụ: Ghi log khi approve certificate

```typescript
export async function approveCert(req: any, res: any) {
  const adminId = req.user?.sub
  const adminEmail = req.user?.email
  const adminRole = req.user?.role
  
  try {
    // ... logic approve ...
    
    // Ghi log thành công
    await logAudit({
      userId: adminId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.CERT_APPROVE,
      status: AuditStatus.SUCCESS,
      resourceType: 'cert',
      resourceId: cert.id,
      details: {
        holderName: cert.holderName,
        docHash: docHash,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    
    res.json({ ok: true })
  } catch (error: any) {
    // Ghi log thất bại
    await logAudit({
      userId: adminId,
      userEmail: adminEmail,
      userRole: adminRole,
      action: AuditAction.CERT_APPROVE,
      status: AuditStatus.FAILURE,
      resourceType: 'cert',
      resourceId: cert.id,
      errorMessage: error.message,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    
    res.status(500).json({ message: error.message })
  }
}
```

### 3. Các Action Types Có Sẵn

```typescript
// Authentication
AuditAction.LOGIN
AuditAction.LOGOUT
AuditAction.REGISTER

// Certificate Actions
AuditAction.CERT_UPLOAD
AuditAction.CERT_APPROVE
AuditAction.CERT_REJECT
AuditAction.CERT_REVOKE
AuditAction.CERT_ISSUE
AuditAction.CERT_REUPLOAD
AuditAction.CERT_UPDATE_EXPIRATION

// User Management
AuditAction.USER_CREATE
AuditAction.USER_UPDATE
AuditAction.USER_DELETE
AuditAction.USER_ENABLE
AuditAction.USER_DISABLE

// Credential Management
AuditAction.CREDENTIAL_TYPE_CREATE
AuditAction.CREDENTIAL_TYPE_UPDATE
AuditAction.CREDENTIAL_TYPE_DELETE
AuditAction.CREDENTIAL_VALIDITY_CREATE
AuditAction.CREDENTIAL_VALIDITY_UPDATE
AuditAction.CREDENTIAL_VALIDITY_DELETE

// System
AuditAction.SYSTEM_CONFIG_UPDATE
```

## Lưu Ý

- `logAudit()` không throw error để không ảnh hưởng đến flow chính
- Nên ghi log cả SUCCESS và FAILURE
- `details` có thể chứa bất kỳ thông tin nào (JSON object)
- `ipAddress` và `userAgent` được lấy tự động từ request

