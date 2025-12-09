import { Router } from 'express'
import { requireAdmin } from '../middlewares/auth.js'
import { 
  listCredentialTypes, 
  getCredentialTypeById,
  createCredentialType,
  updateCredentialType,
  deleteCredentialType
} from '../controllers/credential-types.controller.js'

const r = Router()

// Public routes (for user selection)
r.get('/credential-types', listCredentialTypes)
r.get('/credential-types/:id', getCredentialTypeById)

// Admin routes
r.post('/credential-types', requireAdmin, createCredentialType)
r.put('/credential-types/:id', requireAdmin, updateCredentialType)
r.delete('/credential-types/:id', requireAdmin, deleteCredentialType)

export default r

