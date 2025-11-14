import { Schema, model } from 'mongoose'

export enum CertStatus {
  PENDING = 'PENDING', // Chờ duyệt (user upload)
  APPROVED = 'APPROVED', // Đã duyệt và cấp phát (admin approve)
  REJECTED = 'REJECTED', // Bị từ chối (admin reject)
  VALID = 'VALID', // Đã cấp phát và còn hiệu lực
  REVOKED = 'REVOKED', // Đã thu hồi
}

const CertSchema = new Schema({
  docHash: { type: String, index: true }, // Hash của file sau watermark (để ghi on-chain)
  originalHash: { type: String, index: true }, // Hash của file gốc (để kiểm tra duplicate)
  metadataUri: String, // URI của metadata trên IPFS (chỉ có sau khi admin approve)
  holderName: String,
  degree: String, // Giữ lại để backward compatible
  credentialTypeId: String, // ID của loại văn bằng (từ CredentialType collection)
  validityOptionId: String, // ID của tùy chọn thời hạn (từ CredentialValidityOption collection)
  issuedDate: String, // Ngày cấp (người dùng chọn)
  expirationDate: String, // Ngày hết hạn của chứng chỉ (tùy chọn)
  certxIssuedDate: String, // Ngày up chứng chỉ trên CertX (tự động = ngày hiện tại khi issue, dùng cho watermark)
  issuerName: String,
  issuerId: { type: String, index: true },
  issuerEmail: String,
  status: { type: String, enum: Object.values(CertStatus), default: CertStatus.PENDING },
  revokedAt: Date,
  rejectionReason: String, // Lý do từ chối (nếu bị reject)
  allowReupload: { type: Boolean, default: false }, // Cho phép user reup sau khi bị reject
  // Metadata tạm thời (chỉ lưu trong MongoDB, chưa upload IPFS)
  pendingMetadata: {
    file: Buffer, // File đã watermark (lưu dưới dạng Buffer trong MongoDB)
    mimeType: String,
    hashBeforeWatermark: String,
    watermarkApplied: Boolean,
    watermarkText: String,
    watermarkOriginalText: String,
    watermarkOpacity: Number,
    watermarkColor: String,
    watermarkRepeat: Number,
    watermarkMargin: Number,
    watermarkFontPath: String,
    watermarkUsedCustomFont: Boolean,
    reuploadNote: String, // Ghi chú khi reup (nếu có)
    reuploadedFrom: String, // ID của cert gốc (nếu là reup)
  },
  approvedBy: String, // ID của admin đã approve
  rejectedBy: String, // ID của admin đã reject
  approvedAt: Date, // Ngày approve
  rejectedAt: Date, // Ngày reject
}, { timestamps: true })

export default model('Cert', CertSchema)
