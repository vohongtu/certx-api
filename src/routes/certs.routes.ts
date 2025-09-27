import { Router } from 'express'
import { requireAuth } from '../middlewares/auth'
import { upload } from '../middlewares/upload'
import { issue, revoke, verify, qrcode } from '../controllers/certs.controller'

const r = Router()
r.post('/certs/issue', requireAuth, upload.single('file'), issue)
r.post('/certs/revoke', requireAuth, revoke)
r.get('/verify', verify)
r.get('/qrcode', qrcode)
export default r
