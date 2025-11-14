import { Schema, model } from 'mongoose'

const CredentialValidityOptionSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true }, // Ví dụ: "opt_passport_60"
  credentialTypeId: { type: String, required: true, index: true }, // ID của CredentialType
  periodMonths: { type: Number, default: null }, // Thời hạn theo tháng (ưu tiên)
  periodDays: { type: Number, default: null }, // Thời hạn theo ngày (nếu có mốc ngắn)
  note: { type: String, default: null }, // Ghi chú/quy định/điều kiện
}, { timestamps: true })

export default model('CredentialValidityOption', CredentialValidityOptionSchema)

