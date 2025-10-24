import { Schema, model } from "mongoose"

const IssuerSchema = new Schema(
  {
    email: { type: String, unique: true, index: true },
    passwordHash: String,
    name: String,
    address: String,
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
)

export default model("Issuer", IssuerSchema)
