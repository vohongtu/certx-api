import { Router } from 'express'
import { requireAdmin } from '../middlewares/auth.js'
import { 
  listValidityOptions, 
  getValidityOptionById,
  createValidityOption,
  updateValidityOption,
  deleteValidityOption
} from '../controllers/credential-validity-options.controller.js'

const r = Router()

// Public routes (for user selection)
r.get('/credential-validity-options', listValidityOptions)
r.get('/credential-validity-options/:id', getValidityOptionById)

// Admin routes
r.post('/credential-validity-options', requireAdmin, createValidityOption)
r.put('/credential-validity-options/:id', requireAdmin, updateValidityOption)
r.delete('/credential-validity-options/:id', requireAdmin, deleteValidityOption)

export default r

