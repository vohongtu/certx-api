import { sha256Hex } from "../services/hash.service"
import { issueOnChain, revokeOnChain, getOnChain } from "../services/blockchain.service"
import { toDataURL } from "../services/qrcode.service"
import Cert from "../models/cert.model"
import { config } from "../utils/env"
import { uploadJSON } from "../services/ipfs.service"
import { addWatermark, detectMime } from "../services/watermark.service"

export async function issue(req: any, res: any) {
  const file: Buffer = req.file?.buffer
  if (!file) return res.status(400).json({ message: "Thiếu file" })

  const { holderName, degree, issuedDate } = req.body
  const issuerName = req.user.name
  const originalHash = sha256Hex(file)

  try {
    // 1) Watermark (nếu bật) + xác định mime
    let targetFile = file
    let mimeType: string
    let watermarkApplied = false
    if (config.WATERMARK_ENABLED) {
      const watermarkText = `${config.WATERMARK_TEXT} • ${holderName} • ${issuedDate}`
      const result = await addWatermark(file, watermarkText, config.WATERMARK_OPACITY)
      targetFile = result.buffer
      mimeType = result.mime
      watermarkApplied = true
    } else {
      mimeType = await detectMime(file)
    }

    // 2) Tính hash từ bản ĐÃ watermark (phiên bản phát hành)
    const docHash = sha256Hex(targetFile)
    console.log('[certs.issue] hashes', { originalHash, docHash, hashChanged: originalHash !== docHash, watermarkApplied, mimeType })

    // Kiểm tra xem certificate đã tồn tại chưa
    const existingCert = await Cert.findOne({ docHash })
    if (existingCert) {
      return res.status(400).json({ message: "Certificate với file này đã được cấp phát" })
    }

    // 3) Upload metadata (bản watermark) lên IPFS
    const metadata = {
      holderName,
      degree,
      issuedDate,
      issuerName,
      docHash,
      mimeType,
      hashBeforeWatermark: originalHash,
      watermarkApplied,
      watermarkText: config.WATERMARK_TEXT,
      watermarkOpacity: config.WATERMARK_OPACITY,
      watermarkColor: config.WATERMARK_COLOR,
      watermarkRepeat: config.WATERMARK_REPEAT,
      watermarkMargin: config.WATERMARK_MARGIN,
      file: targetFile,
    }
    const metadataUri = await uploadJSON(metadata)

    // 4) Ghi on-chain
    await issueOnChain(docHash, metadataUri)

    // 5) Lưu DB
    await Cert.create({
      docHash,
      metadataUri,
      holderName,
      degree,
      issuedDate,
      issuerName,
      status: "VALID",
    })

    // 6) Trả verify link + QR
    const verifyUrl = `${config.PUBLIC_VERIFY_BASE}?hash=${docHash}`
    const qrcodeDataUrl = await toDataURL(verifyUrl)

    res.json({ hash: docHash, verifyUrl, qrcodeDataUrl })
  } catch (error: any) {
    console.error("Issue error:", error)
    
    // Xử lý lỗi từ smart contract
    if (error.reason === "exists") {
      return res.status(400).json({ message: "Certificate này đã tồn tại trên blockchain" })
    }
    
    // Xử lý các lỗi khác
    res.status(500).json({ message: "Có lỗi xảy ra khi cấp phát certificate" })
  }
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

  let onChainStatus: "VALID" | "REVOKED" | "NOT_FOUND" = "NOT_FOUND"
  let metadataURI = ""
  let source: "chain" | "db" = "chain"

  try {
    const onChain = await getOnChain(hash)
    const statusValue = Number(onChain.status)

    if (statusValue === 1) onChainStatus = "VALID"
    else if (statusValue === 2) onChainStatus = "REVOKED"

    metadataURI = onChain.metadataURI
  } catch (error) {
    console.error("Verify on-chain error:", error)
  }

  if (onChainStatus === "NOT_FOUND" || !metadataURI) {
    const cert = await Cert.findOne({ docHash: hash })
    if (cert) {
      onChainStatus = cert.status
      metadataURI = cert.metadataUri
      source = "db"
    }
  }

  res.json({ status: onChainStatus, metadataURI, source })
}

export async function qrcode(req: any, res: any) {
  const { hash } = req.query
  const verifyUrl = `${config.PUBLIC_VERIFY_BASE}?hash=${hash}`
  const dataUrl = await toDataURL(verifyUrl)
  const img = Buffer.from(dataUrl.split(",")[1], "base64")

  res.setHeader("Content-Type", "image/png")
  res.send(img)
}
