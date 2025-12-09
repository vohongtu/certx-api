import { Router } from 'express'
import { requireAuth, requireAdmin, requireSuperAdmin } from '../middlewares/auth.js'
import { upload } from '../middlewares/upload.js'
import { issue, revoke, verify, qrcode, listMyCerts, uploadFile, approveCert, rejectCert, listPendingCerts, updateExpirationDate, reuploadCert, revokeCertByAdmin, previewCertFile, transferCertificate } from '../controllers/certs.controller.js'
import { listUsers, createUser, updateUser, deleteUser } from '../controllers/users.controller.js'
import multer from 'multer'

const r = Router()

// Middleware xử lý lỗi multer (file quá lớn, không đúng định dạng, etc.)
const handleUploadError = (err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File quá lớn. Kích thước tối đa là 5MB.' })
    }
    return res.status(400).json({ message: `Lỗi upload file: ${err.message}` })
  }
  if (err) {
    return res.status(400).json({ message: err.message || 'Lỗi khi upload file' })
  }
  next()
}

// OPTIONS handler cho CORS preflight
r.options('/certs/issue', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
  res.header('Access-Control-Max-Age', '86400')
  res.sendStatus(204)
})

r.options('/certs/upload', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
  res.header('Access-Control-Max-Age', '86400')
  res.sendStatus(204)
})

r.options('/certs/:id/reupload', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
  res.header('Access-Control-Max-Age', '86400')
  res.sendStatus(204)
})

// Public routes
r.get('/verify', verify)
r.get('/qrcode', qrcode)

// User routes (requireAuth)
r.post('/certs/upload', requireAuth, upload.single('file'), handleUploadError, uploadFile) // User upload file
r.post('/certs/:id/reupload', requireAuth, upload.single('file'), handleUploadError, reuploadCert) // User reup cert đã bị reject
r.get('/certs', requireAuth, listMyCerts) // User xem lịch sử upload của mình
r.post('/certs/revoke', requireAuth, revoke) // User có thể revoke cert của mình (nếu đã được approve)

// Admin routes (requireAdmin)
r.get('/certs/pending', requireAdmin, listPendingCerts) // Admin xem danh sách certs chờ duyệt
r.get('/certs/:id/preview', requireAuth, previewCertFile) // User/Admin xem trước file (user chỉ xem được file của mình)
r.post('/certs/:id/approve', requireAdmin, approveCert) // Admin approve cert
r.post('/certs/:id/reject', requireAdmin, rejectCert) // Admin reject cert
r.put('/certs/:id/expiration', requireAdmin, updateExpirationDate) // Admin chỉnh sửa thời gian tồn tại
r.post('/certs/:id/revoke', requireAdmin, revokeCertByAdmin) // Admin revoke cert
r.post('/certs/:id/transfer', requireSuperAdmin, transferCertificate) // Super admin chuyển người nhận chứng chỉ
r.get('/users', requireAdmin, listUsers) // Admin xem danh sách users
r.post('/users', requireAdmin, createUser) // Admin tạo user
r.put('/users/:id', requireAdmin, updateUser) // Admin sửa user
r.delete('/users/:id', requireAdmin, deleteUser) // Super admin xóa admin (middleware sẽ check)

// Legacy route (giữ lại cho tương thích)
r.post('/certs/issue', requireAuth, upload.single('file'), handleUploadError, issue)

export default r
