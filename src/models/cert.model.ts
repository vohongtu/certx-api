import { Schema, model } from 'mongoose'

const CertSchema = new Schema({
  docHash: { type: String, index: true }, // Hash của file sau watermark (để ghi on-chain)
  originalHash: { type: String, index: true }, // Hash của file gốc (để kiểm tra duplicate)
  metadataUri: String,
  holderName: String,
  degree: String,
  issuedDate: String, // Ngày cấp (người dùng chọn)
  expirationDate: String, // Ngày hết hạn của chứng chỉ (tùy chọn)
  certxIssuedDate: String, // Ngày up chứng chỉ trên CertX (tự động = ngày hiện tại khi issue, dùng cho watermark)
  issuerName: String,
  issuerId: { type: String, index: true },
  issuerEmail: String,
  status: { type: String, enum: ['VALID','REVOKED'], default: 'VALID' },
  revokedAt: Date
}, { timestamps: true })

export default model('Cert', CertSchema)
