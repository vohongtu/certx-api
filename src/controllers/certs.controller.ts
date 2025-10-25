import { sha256Hex } from "../services/hash.service"
import { issueOnChain, revokeOnChain, getOnChain } from "../services/blockchain.service"
import { toDataURL } from "../services/qrcode.service"
import Cert from "../models/cert.model"
import { config } from "../utils/env"
import { uploadJSON } from "../services/ipfs.service"

export async function issue(req: any, res: any) {
  const file: Buffer = req.file?.buffer
  if (!file) return res.status(400).json({ message: "Thiếu file" })

  const { holderName, degree, issuedDate } = req.body
  const docHash = sha256Hex(file)
  const issuerName = req.user.name

  const metadata = { holderName, degree, issuedDate, issuerName, docHash, file }
  const metadataUri = await uploadJSON(metadata)

  await issueOnChain(docHash, metadataUri)
  await Cert.create({
    docHash,
    metadataUri,
    holderName,
    degree,
    issuedDate,
    issuerName,
    status: "VALID",
  })

  const verifyUrl = `${config.PUBLIC_VERIFY_BASE}?hash=${docHash}`
  const qrcodeDataUrl = await toDataURL(verifyUrl)

  res.json({ hash: docHash, verifyUrl, qrcodeDataUrl })
}

export async function revoke(req: any, res: any) {
  const { hash } = req.body
  if (!hash) return res.status(400).json({ message: "Thiếu hash" })

  await revokeOnChain(hash)
  await Cert.updateOne({ docHash: hash }, { $set: { status: "REVOKED" } })

  res.json({ ok: true })
}

export async function verify(req: any, res: any) {
  const { hash } = req.query
  if (!hash) return res.status(400).json({ message: "Thiếu hash" })

  try {
    const onChain = await getOnChain(hash)
    const status =
      Number(onChain.status) === 1
        ? "VALID"
        : Number(onChain.status) === 2
        ? "REVOKED"
        : "NOT_FOUND"

    const metadataURI: string = onChain.metadataURI

    res.json({ status, metadataURI })
  } catch {
    res.json({ status: "NOT_FOUND" })
  }
}

export async function qrcode(req: any, res: any) {
  const { hash } = req.query
  const verifyUrl = `${config.PUBLIC_VERIFY_BASE}?hash=${hash}`
  const dataUrl = await toDataURL(verifyUrl)
  const img = Buffer.from(dataUrl.split(",")[1], "base64")

  res.setHeader("Content-Type", "image/png")
  res.send(img)
}
