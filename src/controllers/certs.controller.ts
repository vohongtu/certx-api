import { sha256Hex } from "../services/hash.service"
import { issueOnChain, revokeOnChain, getOnChain } from "../services/blockchain.service"
import { toDataURL } from "../services/qrcode.service"
import Cert from "../models/cert.model"
import { config } from "../utils/env"
import { uploadJSON } from "../services/ipfs.service"
import { addWatermark, detectMime } from "../services/watermark.service"

// Helper function để tính toán status dựa trên expirationDate
function calculateStatus(dbStatus: 'VALID' | 'REVOKED', expirationDate?: string): 'VALID' | 'REVOKED' | 'EXPIRED' {
  if (dbStatus === 'REVOKED' || !expirationDate) return dbStatus
  
  try {
    const expiration = new Date(expirationDate)
    expiration.setHours(23, 59, 59, 999)
    return new Date() > expiration ? 'EXPIRED' : dbStatus
  } catch (error) {
    console.error('Error parsing expirationDate:', error)
    return dbStatus
  }
}

// Helper function để map cert thành response object
function mapCertToResponse(c: any) {
  return {
    id: c.id,
    docHash: c.docHash,
    holderName: c.holderName,
    degree: c.degree,
    issuedDate: c.issuedDate,
    expirationDate: c.expirationDate || undefined,
    certxIssuedDate: c.certxIssuedDate || undefined,
    status: calculateStatus(c.status, c.expirationDate),
    metadataUri: c.metadataUri || undefined,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    revokedAt: c.revokedAt,
  }
}

export async function issue(req: any, res: any) {
  const file: Buffer = req.file?.buffer
  if (!file) {
    return res.status(400).json({ message: "Thiếu file" })
  }

  const { holderName, degree, issuedDate, expirationDate } = req.body
  const issuerId = req.user?.sub
  const issuerEmail = req.user?.email
  const issuerName = req.user?.name || issuerEmail || 'Issuer'
  if (!issuerId) return res.status(401).json({ message: 'Thiếu thông tin issuer' })

  try {
    // 0) Tính hash của file gốc TRƯỚC KHI thêm watermark
    const originalHash = sha256Hex(file)

    // 1) Kiểm tra duplicate dựa trên originalHash (file gốc, không watermark)
    // - Nếu có certificate VALID với cùng originalHash (bất kỳ issuer nào) → reject (đã cấp phát rồi)
    // - Nếu có certificate REVOKED với cùng originalHash → cho phép re-issue (nhưng phải là cùng issuer)
    const existingCert = await Cert.findOne({ 
      originalHash: originalHash,
      status: 'VALID'
    })
    
    if (existingCert) {
      return res.status(400).json({ message: "Certificate với file này đã được cấp phát và vẫn còn hiệu lực" })
    }

    // Kiểm tra xem có bản REVOKED không (để đảm bảo chỉ issuer gốc mới được re-issue)
    const revokedCert = await Cert.findOne({ 
      originalHash: originalHash,
      status: 'REVOKED'
    }).sort({ createdAt: -1 }) // Lấy bản mới nhất
    
    if (revokedCert && revokedCert.issuerId !== issuerId) {
      return res.status(403).json({ message: "Bạn không có quyền cấp phát lại certificate này. Chỉ issuer gốc mới được phép." })
    }

    // Xác định đây có phải re-issue không (dựa trên originalHash)
    const isReIssue = !!revokedCert

    // Tạo ngày xác thực (ngày up chứng chỉ trên CertX) - tự động = ngày hiện tại
    const certxIssuedDate = new Date().toISOString().split('T')[0]

    // 2) CHỈ KHI PASS KIỂM TRA mới thêm watermark (tiết kiệm tài nguyên)
    let targetFile = file
    let mimeType: string
    let watermarkApplied = false
    // Watermark sử dụng certxIssuedDate (ngày xác thực) thay vì issuedDate
    let effectiveWatermarkText = `${config.WATERMARK_TEXT} • ${holderName} • ${certxIssuedDate}`
    let usedCustomFont = false
    const watermarkMarginCfg = (config as any).WATERMARK_MARGIN ?? 0.12
    const watermarkFontPathCfg = (config as any).WATERMARK_FONT_PATH ?? null
    
    if (config.WATERMARK_ENABLED) {
      // Watermark sử dụng certxIssuedDate (ngày xác thực)
      let watermarkText = `${config.WATERMARK_TEXT} • ${holderName} • ${certxIssuedDate}`
      const result = await addWatermark(file, watermarkText, config.WATERMARK_OPACITY)
      targetFile = result.buffer
      mimeType = result.mime
      watermarkApplied = true
      watermarkText = result.textUsed
      effectiveWatermarkText = watermarkText
      usedCustomFont = result.usedCustomFont
    } else {
      mimeType = await detectMime(file)
    }

    // 3) Tính hash từ bản ĐÃ watermark (phiên bản phát hành)
    const docHash = sha256Hex(targetFile)

    // 4) Kiểm tra on-chain: đảm bảo docHash mới chưa tồn tại trên chain
    try {
      const onChainCert = await getOnChain(docHash)
      const onChainStatus = Number(onChainCert.status)
      
      // 1 = VALID, 2 = REVOKED, 0 = NOT_FOUND
      if (onChainStatus === 1) {
        // docHash này đã tồn tại và còn VALID trên chain (không thể xảy ra nếu watermark text khác nhau)
        return res.status(400).json({ message: "Certificate này đã được cấp phát trên blockchain và vẫn còn hiệu lực" })
      }
      
      // Nếu onChainStatus = 2 (REVOKED), có thể là re-issue với cùng watermark text
      // → vẫn ghi lên chain (blockchain sẽ revert nếu không cho phép)
    } catch (error: any) {
      // Không tìm thấy trên chain → OK, tiếp tục issue
    }

    // 5) Upload metadata (bản watermark) lên IPFS
    const metadata = {
      holderName,
      degree,
      issuedDate,
      expirationDate: expirationDate || undefined, // Ngày hết hạn (tùy chọn)
      certxIssuedDate, // Ngày up chứng chỉ trên CertX (ngày xác thực)
      issuerName,
      docHash,
      mimeType,
      hashBeforeWatermark: originalHash,
      watermarkApplied,
      watermarkText: effectiveWatermarkText,
      watermarkOriginalText: `${config.WATERMARK_TEXT} • ${holderName} • ${certxIssuedDate}`,
      watermarkOpacity: config.WATERMARK_OPACITY,
      watermarkColor: config.WATERMARK_COLOR,
      watermarkRepeat: config.WATERMARK_REPEAT,
      watermarkMargin: watermarkMarginCfg,
      watermarkFontPath: watermarkFontPathCfg || undefined,
      watermarkUsedCustomFont: usedCustomFont,
      issuerId,
      issuerEmail,
      file: targetFile,
      isReIssue, // Đánh dấu đây là re-issue
      previousStatus: isReIssue ? 'REVOKED' : undefined,
    }
    const metadataUri = await uploadJSON(metadata)

    // 6) Ghi on-chain
    // Re-issue với watermark text khác sẽ tạo docHash mới → có thể ghi lên chain
    // Nếu docHash trùng (watermark text giống) → blockchain sẽ revert (xử lý trong catch)
    await issueOnChain(docHash, metadataUri)

    // 7) Lưu DB với originalHash để tracking
    await Cert.create({
      docHash,
      originalHash, // Hash của file gốc (không watermark)
      metadataUri,
      holderName,
      degree,
      issuedDate,
      expirationDate: expirationDate || undefined, // Ngày hết hạn (tùy chọn)
      certxIssuedDate, // Ngày up chứng chỉ trên CertX (ngày xác thực)
      issuerName,
      issuerId,
      issuerEmail,
      status: 'VALID',
    })

    // 8) Trả verify link + QR
    const verifyUrl = `${config.PUBLIC_VERIFY_BASE}?hash=${docHash}`
    const qrcodeDataUrl = await toDataURL(verifyUrl)

    res.json({ hash: docHash, verifyUrl, qrcodeDataUrl })
  } catch (error: any) {
    console.error("Issue error:", error)
    
    // Xử lý lỗi từ smart contract
    if (error.reason === "exists") {
      return res.status(400).json({ message: "Certificate này đã tồn tại trên blockchain" })
    }

    // Xử lý lỗi network/timeout
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return res.status(503).json({ message: "Không thể kết nối đến blockchain hoặc IPFS. Vui lòng thử lại sau." })
    }

    // Xử lý lỗi IPFS
    if (error.message?.includes('IPFS') || error.message?.includes('Pinata')) {
      return res.status(503).json({ message: "Lỗi khi upload lên IPFS. Vui lòng thử lại sau." })
    }

    // Xử lý lỗi blockchain
    if (error.message?.includes('blockchain') || error.message?.includes('transaction')) {
      return res.status(503).json({ message: "Lỗi khi ghi lên blockchain. Vui lòng thử lại sau." })
    }
    
    // Xử lý các lỗi khác
    const errorMessage = error.message || "Có lỗi xảy ra khi cấp phát certificate"
    res.status(500).json({ message: errorMessage })
  }
}

export async function revoke(req: any, res: any) {
  const { hash } = req.body // hash có thể là docHash hoặc originalHash
  if (!hash) return res.status(400).json({ message: 'Thiếu hash' })

  const issuerId = req.user?.sub
  if (!issuerId) return res.status(401).json({ message: 'Thiếu thông tin issuer' })

  // Tìm certificate theo docHash trước (hash đã watermark)
  let cert = await Cert.findOne({ docHash: hash, issuerId })
  let originalHash = cert?.originalHash || hash // Nếu không tìm thấy, giả sử hash là originalHash

  // Nếu không tìm thấy, thử tìm theo originalHash
  if (!cert) {
    cert = await Cert.findOne({ originalHash: hash, issuerId }).sort({ createdAt: -1 })
    if (cert) {
      originalHash = hash
    }
  } else {
    originalHash = cert.originalHash || hash
  }

  if (!cert) {
    return res.status(404).json({ message: 'Không tìm thấy chứng chỉ thuộc quyền của bạn' })
  }

  // Tìm tất cả certificates cùng originalHash và cùng issuer (bao gồm cả re-issue)
  const allCerts = await Cert.find({ originalHash: originalHash, issuerId })
  
  // Kiểm tra xem có bản VALID nào không
  const validCerts = allCerts.filter(c => c.status === 'VALID')
  if (validCerts.length === 0) {
    // Tất cả đã REVOKED rồi
    return res.json({ ok: true, status: 'REVOKED', message: 'Tất cả các bản của chứng chỉ này đã bị thu hồi' })
  }

  // Revoke trên chain: revoke tất cả các docHash VALID đã ghi trên chain
  const revokedAt = new Date()
  const revokedDocHashes = new Set<string>()
  
  for (const validCert of validCerts) {
    if (!validCert.docHash) continue // Bỏ qua nếu không có docHash
    
    try {
      const onChain = await getOnChain(validCert.docHash)
      const onChainStatus = Number(onChain.status)
      if (onChainStatus === 1 && !revokedDocHashes.has(validCert.docHash)) {
        // Chưa revoke trên chain → revoke
        await revokeOnChain(validCert.docHash)
        revokedDocHashes.add(validCert.docHash)
      }
    } catch (error) {
      // Không tìm thấy trên chain hoặc đã REVOKED → bỏ qua
    }
  }

  // Revoke tất cả các bản VALID trong DB
  await Cert.updateMany(
    { originalHash: originalHash, issuerId, status: 'VALID' },
    { $set: { status: 'REVOKED', revokedAt } }
  )

  res.json({ ok: true, status: 'REVOKED', revokedCount: validCerts.length })
}

export async function listMyCerts(req: any, res: any) {
  const issuerId = req.user?.sub
  if (!issuerId) return res.status(401).json({ message: 'Thiếu thông tin issuer' })

  const page = Math.max(parseInt(req.query.page ?? '1', 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(req.query.limit ?? '5', 10) || 5, 1), 20)
  const q = (req.query.q ?? '').toString().trim()
  const status = (req.query.status ?? '').toString().toUpperCase()

  const filter: any = { issuerId, metadataUri: { $exists: true, $ne: '' } }
  // Lưu ý: EXPIRED được tính toán động, không lưu trong DB
  // Nếu filter theo EXPIRED, cần filter sau khi tính toán status
  if (status === 'VALID' || status === 'REVOKED') {
    filter.status = status
  }
  // EXPIRED sẽ được filter ở frontend hoặc sau khi tính toán
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\$&'), 'i')
    filter.$or = [
      { holderName: regex },
      { degree: regex },
      { docHash: regex },
    ]
  }

  // Nếu filter theo EXPIRED, cần tính toán status trước khi filter
  if (status === 'EXPIRED') {
    const baseFilter: any = { issuerId, metadataUri: { $exists: true, $ne: '' } }
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\$&'), 'i')
      baseFilter.$or = [{ holderName: regex }, { degree: regex }, { docHash: regex }]
    }
    
    const allCerts = await Cert.find(baseFilter)
    const expiredCerts = allCerts
      .map((c) => ({ cert: c, status: calculateStatus(c.status, c.expirationDate) }))
      .filter((item) => item.status === 'EXPIRED')
      .sort((a, b) => b.cert.createdAt.getTime() - a.cert.createdAt.getTime())
    
    const totalExpired = expiredCerts.length
    const totalPagesExpired = Math.max(Math.ceil(totalExpired / limit), 1)
    const currentPageExpired = Math.min(page, totalPagesExpired)
    const paginatedExpired = expiredCerts.slice(
      (currentPageExpired - 1) * limit,
      currentPageExpired * limit
    )
    
    res.json({
      items: paginatedExpired.map((item) => ({
        ...mapCertToResponse(item.cert),
        status: item.status,
      })),
      pagination: {
        page: currentPageExpired,
        limit,
        total: totalExpired,
        totalPages: totalPagesExpired,
      },
    })
    return
  }

  const total = await Cert.countDocuments(filter)
  const totalPages = Math.max(Math.ceil(total / limit), 1)
  const currentPage = Math.min(page, totalPages)

  const certs = await Cert.find(filter)
    .sort({ createdAt: -1 })
    .skip((currentPage - 1) * limit)
    .limit(limit)

  res.json({
    items: certs.map(mapCertToResponse),
    pagination: {
      page: currentPage,
      limit,
      total,
      totalPages,
    },
  })
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

  // Nếu không tìm thấy trên chain hoặc đã REVOKED, check DB
  // - Nếu REVOKED trên chain, có thể có bản re-issue VALID trong DB
  // - Tìm bản VALID mới nhất trong DB
  if (onChainStatus === "NOT_FOUND" || onChainStatus === "REVOKED" || !metadataURI) {
    const validCert = await Cert.findOne({ 
      docHash: hash, 
      status: 'VALID' 
    }).sort({ createdAt: -1 }) // Lấy bản mới nhất
    
    if (validCert) {
      // Có bản VALID trong DB → trả về VALID (có thể là re-issue)
      onChainStatus = "VALID"
      metadataURI = validCert.metadataUri ?? ""
      source = "db"
    } else if (onChainStatus === "NOT_FOUND") {
      // Không tìm thấy trên chain và không có trong DB
      // Tìm bất kỳ certificate nào trong DB (có thể là REVOKED)
      const anyCert = await Cert.findOne({ docHash: hash }).sort({ createdAt: -1 })
      if (anyCert) {
        onChainStatus = anyCert.status as "VALID" | "REVOKED"
        metadataURI = anyCert.metadataUri ?? ""
        source = "db"
      }
    }
    // Nếu onChainStatus = REVOKED và không có bản VALID mới trong DB
    // → giữ nguyên REVOKED từ chain
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
