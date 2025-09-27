import { Schema, model } from 'mongoose'

const CertSchema = new Schema({
  docHash: { type: String, index: true },
  metadataUri: String,
  holderName: String,
  degree: String,
  issuedDate: String,
  issuerName: String,
  status: { type: String, enum: ['VALID','REVOKED'], default: 'VALID' }
}, { timestamps: true })

export default model('Cert', CertSchema)
