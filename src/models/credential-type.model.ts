import { Schema, model } from 'mongoose'

const CredentialTypeSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true }, // Ví dụ: "vn_cccd_chip"
  name: { type: String, required: true }, // Ví dụ: "Căn cước công dân (gắn chip)"
  isPermanent: { type: Boolean, required: true, default: false }, // Văn bằng vĩnh viễn hay có thời hạn
}, { timestamps: true })

export default model('CredentialType', CredentialTypeSchema)

