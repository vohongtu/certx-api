import { sha256Hex } from "../services/hash.service"
import { issueOnChain, revokeOnChain, getOnChain } from "../services/blockchain.service"
import { toDataURL } from "../services/qrcode.service"
import Cert, { CertStatus } from "../models/cert.model"
import { config } from "../utils/env"
import { uploadJSON } from "../services/ipfs.service"
import { addWatermark, detectMime } from "../services/watermark.service"

// Helper function để tính toán status dựa trên expirationDate
function calculateStatus(dbStatus: string, expirationDate?: string): string {
  // Nếu là PENDING, APPROVED, REJECTED thì không tính EXPIRED
  if (dbStatus === CertStatus.PENDING || dbStatus === CertStatus.APPROVED || dbStatus === CertStatus.REJECTED) {
    return dbStatus
  }
  
  if (dbStatus === CertStatus.REVOKED || !expirationDate) return dbStatus
  
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
    credentialTypeId: c.credentialTypeId || undefined,
    validityOptionId: c.validityOptionId || undefined,
    status: calculateStatus(c.status, c.expirationDate),
    metadataUri: c.metadataUri || undefined,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    revokedAt: c.revokedAt,
    rejectionReason: c.rejectionReason || undefined,
    allowReupload: c.allowReupload || false,
    approvedBy: c.approvedBy || undefined,
    rejectedBy: c.rejectedBy || undefined,
    approvedAt: c.approvedAt || undefined,
    rejectedAt: c.rejectedAt || undefined,
    reuploadedFrom: c.pendingMetadata?.reuploadedFrom || undefined, // ID của cert gốc nếu là reup
    reuploadNote: c.pendingMetadata?.reuploadNote || undefined, // Ghi chú khi reup
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

  // LƯU Ý: Không filter theo metadataUri vì cert PENDING chưa có metadataUri
  // User cần thấy cả cert PENDING (chưa approve) và cert đã approve
  const filter: any = { issuerId }
  // Lưu ý: EXPIRED được tính toán động, không lưu trong DB
  // Nếu filter theo EXPIRED, cần filter sau khi tính toán status
  if (status && status !== 'ALL' && status !== 'EXPIRED') {
    if ([CertStatus.PENDING, CertStatus.APPROVED, CertStatus.REJECTED, CertStatus.VALID, CertStatus.REVOKED].includes(status as CertStatus)) {
    filter.status = status
    }
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
    // EXPIRED chỉ áp dụng cho cert đã approve (có expirationDate)
    const baseFilter: any = { issuerId, expirationDate: { $exists: true, $ne: null, $nin: [null, ''] } }
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\$&'), 'i')
      baseFilter.$or = [{ holderName: regex }, { degree: regex }, { docHash: regex }]
    }
    
    const allCerts = await Cert.find(baseFilter)
    const expiredCerts = allCerts
      .map((c) => ({ cert: c, status: calculateStatus(c.status, c.expirationDate || undefined) }))
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

// User chỉ upload file, không cấp phát
export async function uploadFile(req: any, res: any) {
  const file: Buffer = req.file?.buffer
  if (!file) {
    return res.status(400).json({ message: "Thiếu file" })
  }

  const { holderName, degree, credentialTypeId } = req.body
  const issuerId = req.user?.sub
  const issuerEmail = req.user?.email
  const issuerName = req.user?.name || issuerEmail || 'User'

  if (!holderName || !degree) {
    return res.status(400).json({ message: "Thiếu thông tin: holderName, degree" })
  }

  if (!issuerId) return res.status(401).json({ message: 'Thiếu thông tin user' })

  try {
    // Tính hash của file gốc
    const originalHash = sha256Hex(file)

    // Kiểm tra duplicate - nếu đã có file này được upload (PENDING hoặc APPROVED) thì không cho upload lại
    const existingCert = await Cert.findOne({ 
      originalHash: originalHash,
      issuerId: issuerId,
      status: { $in: [CertStatus.PENDING, CertStatus.APPROVED, CertStatus.VALID] }
    })
    
    if (existingCert) {
      return res.status(400).json({ message: "File này đã được upload. Vui lòng kiểm tra lịch sử upload." })
    }

    // Tạo ngày upload (và ngày cấp = ngày upload)
    const certxIssuedDate = new Date().toISOString().split('T')[0]
    const issuedDate = certxIssuedDate // Ngày cấp = ngày upload

    // LƯU Ý: User upload KHÔNG thêm watermark, chỉ lưu file gốc
    // Chỉ khi admin approve thì mới thêm watermark
    const mimeType = await detectMime(file)

    // Lưu file gốc (chưa watermark) - docHash sẽ được tính lại khi approve
    // Tạm thời dùng originalHash làm docHash (sẽ được cập nhật khi approve)
    const tempDocHash = originalHash

    // LƯU Ý: User upload chỉ lưu metadata và file gốc vào MongoDB, KHÔNG upload lên IPFS
    // Chỉ khi admin approve thì mới thêm watermark, upload lên IPFS và ghi lên blockchain
    // Lưu metadata và file gốc tạm thời vào MongoDB (chưa upload IPFS, chưa watermark)
    const cert = await Cert.create({
      docHash: tempDocHash, // Tạm thời dùng originalHash, sẽ được cập nhật khi approve
      originalHash,
      metadataUri: undefined, // Chưa có metadataUri vì chưa upload IPFS
      holderName,
      degree,
      credentialTypeId: credentialTypeId || undefined,
      issuedDate,
      certxIssuedDate,
      issuerName,
      issuerId,
      issuerEmail,
      status: CertStatus.PENDING,
      pendingMetadata: {
        file: file, // Lưu file gốc (chưa watermark) vào MongoDB
        mimeType,
        hashBeforeWatermark: originalHash,
        watermarkApplied: false, // Chưa có watermark
        watermarkText: undefined,
        watermarkOriginalText: undefined,
        watermarkOpacity: config.WATERMARK_OPACITY,
        watermarkColor: config.WATERMARK_COLOR,
        watermarkRepeat: config.WATERMARK_REPEAT,
        watermarkMargin: (config as any).WATERMARK_MARGIN ?? 0.12,
        watermarkFontPath: (config as any).WATERMARK_FONT_PATH || undefined,
        watermarkUsedCustomFont: false,
      },
    })

    res.json({ 
      id: cert.id,
      docHash: cert.docHash,
      status: CertStatus.PENDING,
      message: "File đã được upload thành công. Vui lòng chờ admin duyệt."
    })
  } catch (error: any) {
    console.error("Upload error:", error)
    
    if (error.message?.includes('IPFS') || error.message?.includes('Pinata')) {
      return res.status(503).json({ message: "Lỗi khi upload lên IPFS. Vui lòng thử lại sau." })
    }
    
    const errorMessage = error.message || "Có lỗi xảy ra khi upload file"
    res.status(500).json({ message: errorMessage })
  }
}

// Admin approve và cấp phát cert
export async function approveCert(req: any, res: any) {
  const { id } = req.params
  const { issuedDate, expirationDate, validityOptionId, expirationMonths, expirationYears } = req.body
  const adminId = req.user?.sub

  if (!adminId) return res.status(401).json({ message: 'Thiếu thông tin admin' })

  try {
    const cert = await Cert.findById(id)
    if (!cert) return res.status(404).json({ message: 'Không tìm thấy chứng chỉ' })

    if (cert.status !== CertStatus.PENDING) {
      return res.status(400).json({ message: 'Chứng chỉ này không ở trạng thái chờ duyệt' })
    }

    // Ngày cert được tạo ở cơ quan (issuedDate từ admin)
    const certIssuedDate = issuedDate || cert.issuedDate || new Date().toISOString().split('T')[0]

    // Tính toán expirationDate
    let finalExpirationDate: string | undefined = expirationDate

    // Nếu có validityOptionId, tính từ validity option
    if (!finalExpirationDate && validityOptionId) {
      const CredentialValidityOption = (await import('../models/credential-validity-option.model')).default
      const validityOption = await CredentialValidityOption.findOne({ id: validityOptionId })
      
      if (validityOption) {
        const baseDate = new Date(certIssuedDate)
        if (validityOption.periodMonths) {
          baseDate.setMonth(baseDate.getMonth() + validityOption.periodMonths)
          finalExpirationDate = baseDate.toISOString().split('T')[0]
        } else if (validityOption.periodDays) {
          baseDate.setDate(baseDate.getDate() + validityOption.periodDays)
          finalExpirationDate = baseDate.toISOString().split('T')[0]
        }
      }
    }

    // Nếu không có validityOptionId, tính từ expirationMonths/expirationYears
    if (!finalExpirationDate && (expirationMonths || expirationYears)) {
      const baseDate = new Date(certIssuedDate)
      if (expirationMonths) {
        baseDate.setMonth(baseDate.getMonth() + parseInt(expirationMonths))
      }
      if (expirationYears) {
        baseDate.setFullYear(baseDate.getFullYear() + parseInt(expirationYears))
      }
      finalExpirationDate = baseDate.toISOString().split('T')[0]
    }

    // LƯU Ý: Khi admin approve, mới thêm watermark và upload lên IPFS
    // Metadata được tạo từ thông tin trong MongoDB (không fetch từ IPFS vì chưa có)
    if (!cert.pendingMetadata || !cert.pendingMetadata.file) {
      return res.status(400).json({ message: 'Chứng chỉ không có file để approve' })
    }

    // Lấy file gốc từ pendingMetadata (chưa watermark)
    const originalFile = cert.pendingMetadata.file

    // Thêm watermark khi admin approve
    let watermarkedFile = originalFile
    let watermarkApplied = false
    let effectiveWatermarkText = ''
    let usedCustomFont = false
    const watermarkMarginCfg = cert.pendingMetadata.watermarkMargin ?? 0.12
    const watermarkFontPathCfg = cert.pendingMetadata.watermarkFontPath

    if (config.WATERMARK_ENABLED) {
      const watermarkText = `${config.WATERMARK_TEXT} • ${cert.holderName} • ${cert.certxIssuedDate}`
      const result = await addWatermark(originalFile, watermarkText, config.WATERMARK_OPACITY)
      watermarkedFile = result.buffer
      watermarkApplied = true
      effectiveWatermarkText = result.textUsed
      usedCustomFont = result.usedCustomFont
    }

    // Tính hash từ bản đã watermark (docHash mới)
    const docHash = sha256Hex(watermarkedFile)

    // Tạo metadata từ thông tin trong DB và pendingMetadata, với file đã watermark
    const metadata = {
      holderName: cert.holderName,
      degree: cert.degree,
      issuedDate: certIssuedDate, // Ngày cert được tạo ở cơ quan (từ admin chọn)
      certxIssuedDate: cert.certxIssuedDate,
      issuerName: cert.issuerName,
      docHash: docHash, // Hash của file đã watermark
      issuerId: cert.issuerId,
      issuerEmail: cert.issuerEmail,
      expirationDate: finalExpirationDate,
      mimeType: cert.pendingMetadata.mimeType,
      hashBeforeWatermark: cert.pendingMetadata.hashBeforeWatermark,
      watermarkApplied: watermarkApplied,
      watermarkText: effectiveWatermarkText,
      watermarkOriginalText: `${config.WATERMARK_TEXT} • ${cert.holderName} • ${cert.certxIssuedDate}`,
      watermarkOpacity: config.WATERMARK_OPACITY,
      watermarkColor: config.WATERMARK_COLOR,
      watermarkRepeat: config.WATERMARK_REPEAT,
      watermarkMargin: watermarkMarginCfg,
      watermarkFontPath: watermarkFontPathCfg || undefined,
      watermarkUsedCustomFont: usedCustomFont,
      file: watermarkedFile, // File đã watermark
      status: CertStatus.VALID,
      // Thêm thông tin reup nếu có
      ...(cert.pendingMetadata.reuploadNote && { reuploadNote: cert.pendingMetadata.reuploadNote }),
      ...(cert.pendingMetadata.reuploadedFrom && { reuploadedFrom: cert.pendingMetadata.reuploadedFrom }),
    }

    // Upload metadata lên IPFS (lần đầu tiên, vì user upload chỉ lưu vào MongoDB)
    const newMetadataUri = await uploadJSON(metadata)

    // Ghi on-chain với metadata mới
    // LƯU Ý: Chỉ khi admin approve thì mới ghi lên blockchain
    // User upload chỉ lưu vào MongoDB, không ghi blockchain
    await issueOnChain(docHash, newMetadataUri)

    // Cập nhật DB
    cert.status = CertStatus.VALID
    cert.metadataUri = newMetadataUri
    cert.docHash = docHash // Cập nhật docHash từ file đã watermark
    cert.issuedDate = certIssuedDate // Cập nhật ngày cert được tạo ở cơ quan
    cert.expirationDate = finalExpirationDate || undefined
    cert.validityOptionId = validityOptionId || undefined
    cert.pendingMetadata = undefined // Xóa pendingMetadata vì đã upload lên IPFS
    cert.approvedBy = adminId
    cert.approvedAt = new Date()
    await cert.save()

    // Tạo verify link
    const verifyUrl = `${config.PUBLIC_VERIFY_BASE}?hash=${cert.docHash}`
    const qrcodeDataUrl = await toDataURL(verifyUrl)

    res.json({ 
      ok: true, 
      hash: cert.docHash, 
      verifyUrl, 
      qrcodeDataUrl,
      expirationDate: finalExpirationDate
    })
  } catch (error: any) {
    console.error("Approve error:", error)
    
    if (error.reason === "exists") {
      return res.status(400).json({ message: "Certificate này đã tồn tại trên blockchain" })
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return res.status(503).json({ message: "Không thể kết nối đến blockchain hoặc IPFS. Vui lòng thử lại sau." })
    }

    const errorMessage = error.message || "Có lỗi xảy ra khi duyệt chứng chỉ"
    res.status(500).json({ message: errorMessage })
  }
}

// Admin reject cert với lý do và cho phép reup
export async function rejectCert(req: any, res: any) {
  const { id } = req.params
  const { rejectionReason, allowReupload } = req.body
  const adminId = req.user?.sub

  if (!adminId) return res.status(401).json({ message: 'Thiếu thông tin admin' })

  if (!rejectionReason || rejectionReason.trim() === '') {
    return res.status(400).json({ message: 'Vui lòng nhập lý do từ chối' })
  }

  try {
    const cert = await Cert.findById(id)
    if (!cert) return res.status(404).json({ message: 'Không tìm thấy chứng chỉ' })

    if (cert.status !== CertStatus.PENDING) {
      return res.status(400).json({ message: 'Chứng chỉ này không ở trạng thái chờ duyệt' })
    }

    cert.status = CertStatus.REJECTED
    cert.rejectionReason = rejectionReason.trim()
    cert.allowReupload = allowReupload === true || allowReupload === 'true'
    cert.rejectedBy = adminId
    cert.rejectedAt = new Date()
    await cert.save()

    res.json({ ok: true, message: 'Đã từ chối chứng chỉ', allowReupload: cert.allowReupload })
  } catch (error: any) {
    console.error("Reject error:", error)
    const errorMessage = error.message || "Có lỗi xảy ra khi từ chối chứng chỉ"
    res.status(500).json({ message: errorMessage })
  }
}

// Admin xem danh sách certs chờ duyệt
export async function listPendingCerts(req: any, res: any) {
  const page = Math.max(parseInt(req.query.page ?? '1', 10) || 1, 1)
  const limit = Math.min(Math.max(parseInt(req.query.limit ?? '10', 10) || 10, 1), 50)
  const q = (req.query.q ?? '').toString().trim()
  const status = (req.query.status ?? '').toString().toUpperCase()

  // Nếu filter theo EXPIRED, cần tính toán status trước khi filter
  if (status === 'EXPIRED') {
    // EXPIRED chỉ áp dụng cho cert đã approve (có expirationDate)
    const baseFilter: any = { expirationDate: { $exists: true, $ne: null, $nin: [null, ''] } }
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      baseFilter.$or = [
        { holderName: regex },
        { degree: regex },
        { docHash: regex },
        { issuerEmail: regex },
      ]
    }
    
    const allCerts = await Cert.find(baseFilter)
    const expiredCerts = allCerts
      .map((c) => ({ cert: c, status: calculateStatus(c.status, c.expirationDate || undefined) }))
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

  const filter: any = {}
  
  // Admin có thể xem PENDING, APPROVED, REJECTED, VALID, REVOKED
  // Lưu ý: APPROVED là status tạm thời, sau khi approve thì status = VALID
  // Nếu filter theo APPROVED, tìm các cert đã được approve (có approvedAt)
  if (status && status !== 'ALL') {
    if (status === 'APPROVED') {
      // Filter theo approvedAt thay vì status (vì sau khi approve, status = VALID)
      filter.approvedAt = { $exists: true, $ne: null }
    } else if ([CertStatus.PENDING, CertStatus.REJECTED, CertStatus.VALID, CertStatus.REVOKED].includes(status as CertStatus)) {
      filter.status = status
    }
  }
  // Nếu không có status hoặc status là 'ALL', không set filter.status (xem tất cả)

  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [
      { holderName: regex },
      { degree: regex },
      { docHash: regex },
      { issuerEmail: regex },
    ]
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

// Admin/SuperAdmin chỉnh sửa thời gian tồn tại của cert
export async function updateExpirationDate(req: any, res: any) {
  const { id } = req.params
  const { issuedDate, expirationDate, validityOptionId, expirationMonths, expirationYears } = req.body
  const adminId = req.user?.sub

  if (!adminId) return res.status(401).json({ message: 'Thiếu thông tin admin' })

  try {
    const cert = await Cert.findById(id)
    if (!cert) return res.status(404).json({ message: 'Không tìm thấy chứng chỉ' })

    if (cert.status !== CertStatus.VALID) {
      return res.status(400).json({ message: 'Chỉ có thể chỉnh sửa thời gian tồn tại của chứng chỉ đã được cấp phát' })
    }

    // Cập nhật issuedDate nếu có
    const finalIssuedDate = issuedDate || cert.issuedDate

    let finalExpirationDate: string | undefined = expirationDate

    // Nếu có validityOptionId, tính từ validity option
    if (!finalExpirationDate && validityOptionId) {
      const CredentialValidityOption = (await import('../models/credential-validity-option.model')).default
      const validityOption = await CredentialValidityOption.findOne({ id: validityOptionId })
      
      if (validityOption && finalIssuedDate) {
        const baseDate = new Date(finalIssuedDate)
        if (validityOption.periodMonths) {
          baseDate.setMonth(baseDate.getMonth() + validityOption.periodMonths)
          finalExpirationDate = baseDate.toISOString().split('T')[0]
        } else if (validityOption.periodDays) {
          baseDate.setDate(baseDate.getDate() + validityOption.periodDays)
          finalExpirationDate = baseDate.toISOString().split('T')[0]
        }
      }
    }

    // Nếu không có validityOptionId, tính từ expirationMonths/expirationYears
    if (!finalExpirationDate && (expirationMonths || expirationYears)) {
      if (!finalIssuedDate) {
        return res.status(400).json({ message: 'Chứng chỉ không có ngày cấp' })
      }
      const baseDate = new Date(finalIssuedDate)
      if (expirationMonths) {
        baseDate.setMonth(baseDate.getMonth() + parseInt(expirationMonths))
      }
      if (expirationYears) {
        baseDate.setFullYear(baseDate.getFullYear() + parseInt(expirationYears))
      }
      finalExpirationDate = baseDate.toISOString().split('T')[0]
    }

    if (!finalExpirationDate) {
      return res.status(400).json({ message: 'Thiếu thông tin ngày hết hạn' })
    }

    let metadata: any = {}
    try {
      const metadataUrl = cert.metadataUri
      if (metadataUrl) {
        const response = await fetch(metadataUrl)
        if (response.ok) {
          metadata = await response.json()
        }
      }
    } catch (error) {
      console.error('Error fetching metadata from IPFS:', error)
      metadata = {
        holderName: cert.holderName,
        degree: cert.degree,
        issuedDate: cert.issuedDate,
        certxIssuedDate: cert.certxIssuedDate,
        issuerName: cert.issuerName,
        docHash: cert.docHash,
        issuerId: cert.issuerId,
        issuerEmail: cert.issuerEmail,
        expirationDate: cert.expirationDate,
      }
    }

    // Cập nhật metadata với issuedDate và expirationDate mới
    if (issuedDate) {
      metadata.issuedDate = finalIssuedDate
    }
    metadata.expirationDate = finalExpirationDate
    const newMetadataUri = await uploadJSON(metadata)

    // Cập nhật cert
    if (issuedDate) {
      cert.issuedDate = finalIssuedDate
    }
    cert.expirationDate = finalExpirationDate
    if (validityOptionId) {
      cert.validityOptionId = validityOptionId
    }
    cert.metadataUri = newMetadataUri
    await cert.save()

    res.json({ 
      ok: true, 
      message: 'Đã cập nhật thời gian tồn tại',
      issuedDate: finalIssuedDate,
      expirationDate: finalExpirationDate
    })
  } catch (error: any) {
    console.error("Update expiration date error:", error)
    const errorMessage = error.message || "Có lỗi xảy ra khi cập nhật thời gian tồn tại"
    res.status(500).json({ message: errorMessage })
  }
}

// User reup cert đã bị reject (nếu allowReupload = true)
export async function reuploadCert(req: any, res: any) {
  const { id } = req.params
  const { note, useOriginalFile, holderName, degree, credentialTypeId } = req.body
  const file: Buffer = req.file?.buffer
  const userId = req.user?.sub

  if (!userId) return res.status(401).json({ message: 'Thiếu thông tin user' })
  if (!note || !note.trim()) return res.status(400).json({ message: "Vui lòng nhập ghi chú trước khi reup" })

  try {
    const originalCert = await Cert.findById(id)
    if (!originalCert) return res.status(404).json({ message: 'Không tìm thấy chứng chỉ' })
    if (originalCert.issuerId !== userId) return res.status(403).json({ message: 'Bạn không có quyền reup chứng chỉ này' })
    if (originalCert.status !== CertStatus.REJECTED) return res.status(400).json({ message: 'Chỉ có thể reup chứng chỉ đã bị từ chối' })
    if (!originalCert.allowReupload) return res.status(403).json({ message: 'Chứng chỉ này không được phép reup. Vui lòng liên hệ admin.' })

    const { holderName, degree } = req.body
    if (!holderName || !degree) return res.status(400).json({ message: "Thiếu thông tin: holderName, degree" })

    let targetFile: Buffer
    let originalHash: string

    // Nếu chọn dùng file cũ, lấy từ pendingMetadata trong MongoDB
    if (useOriginalFile === 'true' || useOriginalFile === true) {
      if (!originalCert.pendingMetadata || !originalCert.pendingMetadata.file) {
        return res.status(400).json({ message: "Không thể lấy file cũ. Vui lòng upload file mới." })
      }
      // Lấy file từ pendingMetadata trong MongoDB
      targetFile = originalCert.pendingMetadata.file
      originalHash = originalCert.pendingMetadata.hashBeforeWatermark || originalCert.originalHash || ''
      if (!originalHash) {
        return res.status(400).json({ message: "Không thể lấy hash của file cũ. Vui lòng upload file mới." })
      }
    } else {
      // Upload file mới
      if (!file) return res.status(400).json({ message: "Thiếu file" })
      targetFile = file
      originalHash = sha256Hex(file)
    }
    const existingCert = await Cert.findOne({ 
      originalHash: originalHash,
      issuerId: userId,
      status: { $in: [CertStatus.PENDING, CertStatus.APPROVED, CertStatus.VALID] }
    })
    if (existingCert) return res.status(400).json({ message: "File này đã được upload. Vui lòng kiểm tra lịch sử upload." })

    // Tạo ngày upload (và ngày cấp = ngày upload)
    const certxIssuedDate = new Date().toISOString().split('T')[0]
    const issuedDate = certxIssuedDate // Ngày cấp = ngày upload

    // LƯU Ý: User reup KHÔNG thêm watermark, chỉ lưu file gốc
    // Chỉ khi admin approve thì mới thêm watermark
    const mimeType = await detectMime(targetFile)
    const issuerEmail = req.user?.email
    const issuerName = req.user?.name || issuerEmail || 'User'

    // Lưu file gốc (chưa watermark) - docHash sẽ được tính lại khi approve
    // Tạm thời dùng originalHash làm docHash (sẽ được cập nhật khi approve)
    const tempDocHash = originalHash

    // LƯU Ý: User reup chỉ lưu metadata và file gốc vào MongoDB, KHÔNG upload lên IPFS
    // Chỉ khi admin approve thì mới thêm watermark, upload lên IPFS và ghi lên blockchain
    // Lưu metadata và file gốc tạm thời vào MongoDB (chưa upload IPFS, chưa watermark)
    const cert = await Cert.create({
      docHash: tempDocHash, // Tạm thời dùng originalHash, sẽ được cập nhật khi approve
      originalHash,
      metadataUri: undefined, // Chưa có metadataUri vì chưa upload IPFS
      holderName,
      degree,
      credentialTypeId: credentialTypeId || undefined, // Lưu credentialTypeId
      issuedDate,
      certxIssuedDate,
      issuerName,
      issuerId: userId,
      issuerEmail,
      status: CertStatus.PENDING,
      pendingMetadata: {
        file: targetFile, // Lưu file gốc (chưa watermark) vào MongoDB
        mimeType,
        hashBeforeWatermark: originalHash,
        watermarkApplied: false, // Chưa có watermark
        watermarkText: undefined,
        watermarkOriginalText: undefined,
        watermarkOpacity: config.WATERMARK_OPACITY,
        watermarkColor: config.WATERMARK_COLOR,
        watermarkRepeat: config.WATERMARK_REPEAT,
        watermarkMargin: (config as any).WATERMARK_MARGIN ?? 0.12,
        watermarkFontPath: (config as any).WATERMARK_FONT_PATH || undefined,
        watermarkUsedCustomFont: false,
        reuploadNote: note.trim(),
        reuploadedFrom: originalCert.id,
      },
    })

    // Sau khi reup thành công, tắt allowReupload của cert REJECTED gốc
    // để không cho phép reup lại nữa (vì đã có cert PENDING mới)
    originalCert.allowReupload = false
    await originalCert.save()

    res.json({ 
      id: cert.id, docHash: cert.docHash, status: CertStatus.PENDING,
      message: "File đã được reup thành công. Vui lòng chờ admin duyệt."
    })
  } catch (error: any) {
    console.error("Reupload error:", error)
    res.status(500).json({ message: error.message || "Có lỗi xảy ra khi reup file" })
  }
}

// Admin xem trước file (từ pendingMetadata hoặc IPFS)
export async function previewCertFile(req: any, res: any) {
  const { id } = req.params

  try {
    const cert = await Cert.findById(id)
    if (!cert) return res.status(404).json({ message: 'Không tìm thấy chứng chỉ' })

    let fileBuffer: Buffer | null = null
    let mimeType: string = 'application/pdf'

    // Nếu có pendingMetadata (chưa approve), lấy file từ MongoDB
    if (cert.pendingMetadata && cert.pendingMetadata.file) {
      fileBuffer = cert.pendingMetadata.file
      mimeType = cert.pendingMetadata.mimeType || 'application/pdf'
    } 
    // Nếu đã approve, lấy từ IPFS
    else if (cert.metadataUri) {
      try {
        const response = await fetch(cert.metadataUri)
        if (response.ok) {
          const metadata = await response.json()
          const filePayload = metadata.file
          
          if (filePayload) {
            // Convert file từ metadata về Buffer
            if (filePayload.type === 'Buffer' && Array.isArray(filePayload.data)) {
              fileBuffer = Buffer.from(filePayload.data)
            } else if (Array.isArray(filePayload)) {
              fileBuffer = Buffer.from(filePayload)
            } else if (typeof filePayload === 'string') {
              // Nếu là base64 string
              fileBuffer = Buffer.from(filePayload, 'base64')
            }
            mimeType = metadata.mimeType || 'application/pdf'
          }
        }
      } catch (error) {
        console.error('Error fetching file from IPFS:', error)
      }
    }

    if (!fileBuffer) {
      return res.status(404).json({ message: 'Không tìm thấy file để xem trước' })
    }

    // Trả về file với Content-Type phù hợp
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition', `inline; filename="cert-${cert.id}.${mimeType === 'application/pdf' ? 'pdf' : 'jpg'}"`)
    res.send(fileBuffer)
  } catch (error: any) {
    console.error("Preview error:", error)
    res.status(500).json({ message: error.message || "Có lỗi xảy ra khi xem trước file" })
  }
}

// Admin revoke cert
export async function revokeCertByAdmin(req: any, res: any) {
  const { id } = req.params
  const adminId = req.user?.sub

  if (!adminId) return res.status(401).json({ message: 'Thiếu thông tin admin' })

  try {
    const cert = await Cert.findById(id)
    if (!cert) return res.status(404).json({ message: 'Không tìm thấy chứng chỉ' })
    if (cert.status !== CertStatus.VALID) return res.status(400).json({ message: 'Chỉ có thể thu hồi chứng chỉ đã được cấp phát và còn hiệu lực' })
    if (!cert.docHash) return res.status(400).json({ message: 'Chứng chỉ không có docHash' })

    await revokeOnChain(cert.docHash)
    cert.status = CertStatus.REVOKED
    cert.revokedAt = new Date()
    await cert.save()

    res.json({ ok: true, message: 'Đã thu hồi chứng chỉ' })
  } catch (error: any) {
    console.error("Revoke cert error:", error)
    res.status(500).json({ message: error.message || "Có lỗi xảy ra khi thu hồi chứng chỉ" })
  }
}
