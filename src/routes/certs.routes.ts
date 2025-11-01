import { Router } from 'express'
import { requireAuth } from '../middlewares/auth'
import { upload } from '../middlewares/upload'
import { issue, revoke, verify, qrcode, listMyCerts } from '../controllers/certs.controller'
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

r.post('/certs/issue', requireAuth, upload.single('file'), handleUploadError, issue)
r.post('/certs/revoke', requireAuth, revoke)
r.get('/certs', requireAuth, listMyCerts)
r.get('/verify', verify)
r.get('/qrcode', qrcode)
export default r
