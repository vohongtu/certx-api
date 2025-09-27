import { Router } from 'express'
import { login } from '../controllers/auth.controller'

const r = Router()
r.post('/login', login)
export default r
