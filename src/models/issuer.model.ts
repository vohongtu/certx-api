import { Schema, model } from "mongoose"

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN'
}

const IssuerSchema = new Schema(
  {
    email: { type: String, unique: true, index: true },
    passwordHash: String,
    name: String,
    address: String,
    enabled: { type: Boolean, default: true },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.USER },
  },
  { timestamps: true }
)

export default model("Issuer", IssuerSchema)
