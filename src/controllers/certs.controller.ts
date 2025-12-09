import { sha256Hex } from "../services/hash.service.js"
import { issueOnChain, revokeOnChain, getOnChain } from "../services/blockchain.service.js"
import { toDataURL } from "../services/qrcode.service.js"
import Cert, { CertStatus } from "../models/cert.model.js"
import { config } from "../utils/env.js"
import { uploadJSON } from "../services/ipfs.service.js"
import { addWatermark, detectMime } from "../services/watermark.service.js"

// Helper function để kiểm tra file có phải PDF hợp lệ không
function isPDF(buf: Buffer): boolean {
  if (!buf || buf.length < 4) return false
  return buf.slice(0, 4).toString() === '%PDF'
}

// Helper function để detect mimeType từ first bytes (fallback khi file-type không detect được)
function detectMimeFromBytes(buf: Buffer): string | null {
  if (!buf || buf.length < 4) return null
  
  const firstBytes = buf.slice(0, 20).toString('utf8', 0, Math.min(20, buf.length))
  const firstBytesHex = buf.slice(0, 8).toString('hex').toLowerCase()
  
  // PDF
  if (buf.slice(0, 4).toString() === '%PDF') return 'application/pdf'
  
  // SVG/XML
  if (firstBytes.trim().startsWith('<svg') || firstBytesHex.startsWith('3c737667')) {
    return 'image/svg+xml'
  }
  if (firstBytes.trim().startsWith('<?xml')) return 'application/xml'
  
  // Image formats
  if (firstBytesHex.startsWith('89504e47')) return 'image/png'
  if (firstBytesHex.startsWith('ffd8ff')) return 'image/jpeg'
  if (firstBytesHex.startsWith('474946')) return 'image/gif'
  if (firstBytesHex.startsWith('52494646') && buf.length > 12 && buf.slice(8, 12).toString() === 'WEBP') {
    return 'image/webp'
  }
  
  return null
}

// Helper function để convert file data thành Buffer (xử lý nhiều format)
function convertToBuffer(fileData: any): Buffer {
  if (Buffer.isBuffer(fileData)) return fileData
  if (fileData instanceof Uint8Array) return Buffer.from(fileData)
  if (Array.isArray(fileData)) return Buffer.from(fileData)
  if (typeof fileData === 'string') return Buffer.from(fileData, 'base64')
  
  const data = fileData as any
  // MongoDB Binary type
  if (typeof data.buffer === 'function') return Buffer.from(data.buffer())
  if (typeof data.value === 'function') return Buffer.from(data.value())
  if (Buffer.isBuffer(data.buffer)) return data.buffer
  if (Buffer.isBuffer(data.value)) return data.value
  
  // Serialized Buffer
  if (data.type === 'Buffer' && Array.isArray(data.data)) return Buffer.from(data.data)
  if (Array.isArray(data.data)) return Buffer.from(data.data)
  if (data.data) {
    if (Buffer.isBuffer(data.data)) return data.data
    if (Array.isArray(data.data)) return Buffer.from(data.data)
    if (data.data instanceof Uint8Array) return Buffer.from(data.data)
    return Buffer.from(data.data)
  }
  
  // Tìm trong các property khác
  const keys = ['data', 'buffer', 'value', 'content', 'bytes']
  for (const key of keys) {
    if (data[key]) {
      if (Buffer.isBuffer(data[key])) return data[key]
      if (Array.isArray(data[key])) return Buffer.from(data[key])
      if (data[key] instanceof Uint8Array) return Buffer.from(data[key])
    }
  }
  
  throw new Error(`Không thể convert file data thành Buffer. Type: ${typeof fileData}`)
}

// Helper function để detect và validate mimeType
async function detectAndValidateMimeType(
  fileBuffer: Buffer,
  storedMimeType?: string,
  source: 'pendingMetadata' | 'ipfs' = 'pendingMetadata'
): Promise<string> {
  let detectedMime: string | null = null
  
  // Thử detect bằng file-type library
  try {
    detectedMime = await detectMime(fileBuffer)
  } catch (error) {
    // Fallback to bytes detection
  }
  
  // Fallback: detect từ bytes nếu file-type không detect được
  if (!detectedMime || detectedMime === 'application/octet-stream') {
    const bytesDetected = detectMimeFromBytes(fileBuffer)
    if (bytesDetected) {
      detectedMime = bytesDetected
    }
  }
  
  // Sử dụng mimeType đã detect hoặc fallback về stored
  const finalMimeType = (detectedMime && detectedMime !== 'application/octet-stream') 
    ? detectedMime 
    : (storedMimeType || 'application/pdf')
  
  return finalMimeType
}
import { logAudit, getClientIp, getUserAgent, getUserInfoForAudit } from "../services/audit.service.js"
import { AuditAction, AuditStatus } from "../models/audit-log.model.js"
import Issuer from "../models/issuer.model.js"

// Helper function để tính toán status dựa trên expirationDate
function calculateStatus(dbStatus: string, expirationDate?: string): string {
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

  const { holderName, degree, issuedDate, expirationDate, userId } = req.body
  const issuerId = req.user?.sub
  const issuerEmail = req.user?.email
  const issuerName = req.user?.name || issuerEmail || 'Issuer'
  const issuerRole = req.user?.role
  if (!issuerId) return res.status(401).json({ message: 'Thiếu thông tin issuer' })

  // Lấy thông tin issuer để ghi audit log
  const { email: userEmail, role: userRole } = await getUserInfoForAudit(issuerId, issuerRole)

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
      
      // → vẫn ghi lên chain (blockchain sẽ revert nếu không cho phép)
    } catch (error: any) {
      // Không tìm thấy trên chain → OK, tiếp tục issue
    }

    // 5) Upload metadata (bản watermark) lên IPFS
    // Convert Buffer thành base64 string để lưu vào JSON metadata
    const fileBase64 = targetFile.toString('base64')
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
      file: fileBase64, // File đã watermark (base64 string)
      isReIssue, // Đánh dấu đây là re-issue
      previousStatus: isReIssue ? 'REVOKED' : undefined,
    }
    const metadataUri = await uploadJSON(metadata)

    // 6) Ghi on-chain
    // Re-issue với watermark text khác sẽ tạo docHash mới → có thể ghi lên chain
    await issueOnChain(docHash, metadataUri)

    // 7) Lưu DB với originalHash để tracking
    const cert = await Cert.create({
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
      userId: userId || undefined, // User ID nếu được chỉ định (optional)
      status: 'VALID',
    })

    // 8) Trả verify link + QR
    const verifyUrl = `${config.PUBLIC_VERIFY_BASE}?hash=${docHash}`
    const qrcodeDataUrl = await toDataURL(verifyUrl)

    await logAudit({
      userId: issuerId,
      userEmail,
      userRole,
      action: AuditAction.CERT_ISSUE,
      status: AuditStatus.SUCCESS,
      resourceType: 'cert',
      resourceId: cert.id,
      details: {
        holderName,
        degree,
        docHash,
        issuedDate,
        expirationDate: expirationDate || undefined,
        isReIssue,
        userId: userId || undefined,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    res.json({ hash: docHash, verifyUrl, qrcodeDataUrl })
  } catch (error: any) {
    console.error("Issue error:", error)
    
    await logAudit({
      userId: issuerId,
      userEmail,
      userRole,
      action: AuditAction.CERT_ISSUE,
      status: AuditStatus.FAILURE,
      errorMessage: error.message || "Có lỗi xảy ra khi cấp phát certificate",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    
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
  // User cần thấy cả cert họ tự upload (issuerId) VÀ cert admin cấp phát cho họ (userId)
  const filter: any = {
    $or: [
      { issuerId }, // Chứng chỉ user tự upload
      { userId: issuerId } // Chứng chỉ admin cấp phát cho user này
    ]
  }
  if (status && status !== 'ALL' && status !== 'EXPIRED') {
    if ([CertStatus.PENDING, CertStatus.APPROVED, CertStatus.REJECTED, CertStatus.VALID, CertStatus.REVOKED].includes(status as CertStatus)) {
    filter.status = status
    }
  }
  // EXPIRED sẽ được filter ở frontend hoặc sau khi tính toán
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\$&'), 'i')
    // Kết hợp search với điều kiện issuerId/userId
    filter.$and = [
      {
        $or: [
          { issuerId },
          { userId: issuerId }
        ]
      },
      {
        $or: [
      { holderName: regex },
      { degree: regex },
      { docHash: regex },
    ]
      }
    ]
    // Xóa filter.$or ban đầu vì đã chuyển vào $and
    delete filter.$or
  }

  if (status === 'EXPIRED') {
    // EXPIRED chỉ áp dụng cho cert đã approve (có expirationDate)
    // Bao gồm cả cert user tự upload và cert admin cấp phát cho user
    const baseFilter: any = {
      $and: [
        {
          $or: [
            { issuerId },
            { userId: issuerId }
          ]
        },
        {
          expirationDate: { $exists: true, $ne: null, $nin: [null, ''] }
        }
      ]
    }
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\$&'), 'i')
      baseFilter.$and.push({
        $or: [
          { holderName: regex },
          { degree: regex },
          { docHash: regex }
        ]
      })
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

  let finalStatus: "VALID" | "REVOKED" | "NOT_FOUND" = "NOT_FOUND"
  let metadataURI = ""
  let source: "chain" | "db" = "chain"

  // Ưu tiên check DB trước để lấy status mới nhất (bao gồm cả REVOKED)
  // DB là source of truth vì được update ngay lập tức khi revoke
  const dbCert = await Cert.findOne({ docHash: hash }).sort({ createdAt: -1 })
  
  if (dbCert) {
    // Có trong DB → dùng status từ DB (ưu tiên)
    finalStatus = dbCert.status === 'VALID' ? 'VALID' : dbCert.status === 'REVOKED' ? 'REVOKED' : 'NOT_FOUND'
    metadataURI = dbCert.metadataUri ?? ""
    source = "db"
    
    if (finalStatus === 'VALID') {
  try {
    const onChain = await getOnChain(hash)
        const onChainStatusValue = Number(onChain.status)

        // Giữ nguyên VALID từ DB
        if (onChainStatusValue === 2) {
          // Blockchain đã REVOKED, nhưng DB vẫn VALID → có thể là re-issue
          // Giữ nguyên VALID từ DB
        }
        
        if (!metadataURI && onChain.metadataURI) {
    metadataURI = onChain.metadataURI
          source = "chain"
        }
  } catch (error) {
        // Blockchain error → dùng DB
    console.error("Verify on-chain error:", error)
  }
    }
  } else {
    // Không có trong DB → check blockchain
    try {
      const onChain = await getOnChain(hash)
      const statusValue = Number(onChain.status)

      if (statusValue === 1) finalStatus = "VALID"
      else if (statusValue === 2) finalStatus = "REVOKED"

      metadataURI = onChain.metadataURI
      source = "chain"
    } catch (error) {
      console.error("Verify on-chain error:", error)
      // Không tìm thấy cả DB và blockchain
      finalStatus = "NOT_FOUND"
    }
  }

  res.json({ status: finalStatus, metadataURI, source })
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
  const issuerRole = req.user?.role

  if (!holderName || !degree) {
    return res.status(400).json({ message: "Thiếu thông tin: holderName, degree" })
  }

  if (!issuerId) return res.status(401).json({ message: 'Thiếu thông tin user' })

  // Lấy thông tin user để ghi audit log
  const { email: userEmail, role: userRole } = await getUserInfoForAudit(issuerId, issuerRole)

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
    const mimeType = await detectMime(file)

    // Lưu file gốc (chưa watermark) - docHash sẽ được tính lại khi approve
    // Tạm thời dùng originalHash làm docHash (sẽ được cập nhật khi approve)
    const tempDocHash = originalHash

    // LƯU Ý: User upload chỉ lưu metadata và file gốc vào MongoDB, KHÔNG upload lên IPFS
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

    await logAudit({
      userId: issuerId,
      userEmail,
      userRole,
      action: AuditAction.CERT_UPLOAD,
      status: AuditStatus.SUCCESS,
      resourceType: 'cert',
      resourceId: cert.id,
      details: {
        holderName,
        degree,
        credentialTypeId: credentialTypeId || undefined,
        originalHash: cert.originalHash,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    res.json({ 
      id: cert.id,
      docHash: cert.docHash,
      status: CertStatus.PENDING,
      message: "File đã được upload thành công. Vui lòng chờ admin duyệt."
    })
  } catch (error: any) {
    console.error("Upload error:", error)
    
    await logAudit({
      userId: issuerId,
      userEmail,
      userRole,
      action: AuditAction.CERT_UPLOAD,
      status: AuditStatus.FAILURE,
      errorMessage: error.message || "Có lỗi xảy ra khi upload file",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    
    if (error.message?.includes('IPFS') || error.message?.includes('Pinata')) {
      return res.status(503).json({ message: "Lỗi khi upload lên IPFS. Vui lòng thử lại sau." })
    }
    
    const errorMessage = error.message || "Có lỗi xảy ra khi upload file"
    res.status(500).json({ message: errorMessage })
  }
}

// Helper function để lấy thông tin user cho audit log
// Admin approve và cấp phát cert
export async function approveCert(req: any, res: any) {
  const { id } = req.params
  const { issuedDate, expirationDate, validityOptionId, expirationMonths, expirationYears } = req.body
  const adminId = req.user?.sub
  const adminRole = req.user?.role

  if (!adminId) return res.status(401).json({ message: 'Thiếu thông tin admin' })

  // Lấy thông tin admin để ghi audit log
  const { email: adminEmail, role: userRole } = await getUserInfoForAudit(adminId, adminRole)

  try {
    const cert = await Cert.findById(id)
    if (!cert) {
      await logAudit({
        userId: adminId,
        userEmail: adminEmail,
        userRole,
        action: AuditAction.CERT_APPROVE,
        status: AuditStatus.FAILURE,
        resourceType: 'cert',
        resourceId: id,
        errorMessage: 'Không tìm thấy chứng chỉ',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(404).json({ message: 'Không tìm thấy chứng chỉ' })
    }

    if (cert.status !== CertStatus.PENDING) {
      await logAudit({
        userId: adminId,
        userEmail: adminEmail,
        userRole,
        action: AuditAction.CERT_APPROVE,
        status: AuditStatus.FAILURE,
        resourceType: 'cert',
        resourceId: id,
        errorMessage: 'Chứng chỉ này không ở trạng thái chờ duyệt',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(400).json({ message: 'Chứng chỉ này không ở trạng thái chờ duyệt' })
    }

    // Ngày cert được tạo ở cơ quan (issuedDate từ admin)
    const certIssuedDate = issuedDate || cert.issuedDate || new Date().toISOString().split('T')[0]

    // Tính toán expirationDate
    let finalExpirationDate: string | undefined = expirationDate

    if (!finalExpirationDate && validityOptionId) {
      const CredentialValidityOption = (await import('../models/credential-validity-option.model.js')).default
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
    // Convert Buffer thành base64 string để lưu vào JSON metadata
    const fileBase64 = watermarkedFile.toString('base64')
    const metadata = {
      holderName: cert.holderName,
      degree: cert.degree,
      issuedDate: certIssuedDate, // Ngày cert được tạo ở cơ quan (từ admin chọn)
      certxIssuedDate: cert.certxIssuedDate,
      issuerName: cert.issuerName,
      docHash: docHash, // Hash của file đã watermark
      issuerId: cert.issuerId,
      issuerEmail: cert.issuerEmail,
      approvedBy: adminId, // ID của admin đã approve (người duyệt)
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
      file: fileBase64, // File đã watermark (base64 string)
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

    await logAudit({
      userId: adminId,
      userEmail: adminEmail,
      userRole,
      action: AuditAction.CERT_APPROVE,
      status: AuditStatus.SUCCESS,
      resourceType: 'cert',
      resourceId: id,
      details: {
        holderName: cert.holderName,
        degree: cert.degree,
        docHash: cert.docHash,
        issuedDate: certIssuedDate,
        expirationDate: finalExpirationDate,
        approvedAt: cert.approvedAt,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    res.json({ 
      ok: true, 
      hash: cert.docHash, 
      verifyUrl, 
      qrcodeDataUrl,
      expirationDate: finalExpirationDate
    })
  } catch (error: any) {
    console.error("Approve error:", error)
    
    await logAudit({
      userId: adminId,
      userEmail: adminEmail,
      userRole,
      action: AuditAction.CERT_APPROVE,
      status: AuditStatus.FAILURE,
      resourceType: 'cert',
      resourceId: id,
      errorMessage: error.message || "Có lỗi xảy ra khi duyệt chứng chỉ",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    
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
  const adminRole = req.user?.role

  if (!adminId) return res.status(401).json({ message: 'Thiếu thông tin admin' })

  // Lấy thông tin admin để ghi audit log
  const { email: adminEmail, role: userRole } = await getUserInfoForAudit(adminId, adminRole)

  if (!rejectionReason || rejectionReason.trim() === '') {
    await logAudit({
      userId: adminId,
      userEmail: adminEmail,
      userRole,
      action: AuditAction.CERT_REJECT,
      status: AuditStatus.FAILURE,
      resourceType: 'cert',
      resourceId: id,
      errorMessage: 'Vui lòng nhập lý do từ chối',
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    return res.status(400).json({ message: 'Vui lòng nhập lý do từ chối' })
  }

  try {
    const cert = await Cert.findById(id)
    if (!cert) {
      await logAudit({
        userId: adminId,
        userEmail: adminEmail,
        userRole,
        action: AuditAction.CERT_REJECT,
        status: AuditStatus.FAILURE,
        resourceType: 'cert',
        resourceId: id,
        errorMessage: 'Không tìm thấy chứng chỉ',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(404).json({ message: 'Không tìm thấy chứng chỉ' })
    }

    if (cert.status !== CertStatus.PENDING) {
      await logAudit({
        userId: adminId,
        userEmail: adminEmail,
        userRole,
        action: AuditAction.CERT_REJECT,
        status: AuditStatus.FAILURE,
        resourceType: 'cert',
        resourceId: id,
        errorMessage: 'Chứng chỉ này không ở trạng thái chờ duyệt',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(400).json({ message: 'Chứng chỉ này không ở trạng thái chờ duyệt' })
    }

    cert.status = CertStatus.REJECTED
    cert.rejectionReason = rejectionReason.trim()
    cert.allowReupload = allowReupload === true || allowReupload === 'true'
    cert.rejectedBy = adminId
    cert.rejectedAt = new Date()
    await cert.save()

    await logAudit({
      userId: adminId,
      userEmail: adminEmail,
      userRole,
      action: AuditAction.CERT_REJECT,
      status: AuditStatus.SUCCESS,
      resourceType: 'cert',
      resourceId: id,
      details: {
        holderName: cert.holderName,
        degree: cert.degree,
        rejectionReason: cert.rejectionReason,
        allowReupload: cert.allowReupload,
        rejectedAt: cert.rejectedAt,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    res.json({ ok: true, message: 'Đã từ chối chứng chỉ', allowReupload: cert.allowReupload })
  } catch (error: any) {
    console.error("Reject error:", error)
    
    await logAudit({
      userId: adminId,
      userEmail: adminEmail,
      userRole,
      action: AuditAction.CERT_REJECT,
      status: AuditStatus.FAILURE,
      resourceType: 'cert',
      resourceId: id,
      errorMessage: error.message || "Có lỗi xảy ra khi từ chối chứng chỉ",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    
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
  if (status && status !== 'ALL') {
    if (status === 'APPROVED') {
      // Filter theo approvedAt thay vì status (vì sau khi approve, status = VALID)
      filter.approvedAt = { $exists: true, $ne: null }
    } else if ([CertStatus.PENDING, CertStatus.REJECTED, CertStatus.VALID, CertStatus.REVOKED].includes(status as CertStatus)) {
      filter.status = status
    }
  }

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

    if (!finalExpirationDate && validityOptionId) {
      const CredentialValidityOption = (await import('../models/credential-validity-option.model.js')).default
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
  const userRole = req.user?.role

  if (!userId) return res.status(401).json({ message: 'Thiếu thông tin user' })
  if (!note || !note.trim()) return res.status(400).json({ message: "Vui lòng nhập ghi chú trước khi reup" })

  // Lấy thông tin user để ghi audit log
  const { email: userEmail, role: userRoleForAudit } = await getUserInfoForAudit(userId, userRole)

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
    const mimeType = await detectMime(targetFile)
    const issuerEmail = req.user?.email
    const issuerName = req.user?.name || issuerEmail || 'User'

    // Lưu file gốc (chưa watermark) - docHash sẽ được tính lại khi approve
    // Tạm thời dùng originalHash làm docHash (sẽ được cập nhật khi approve)
    const tempDocHash = originalHash

    // LƯU Ý: User reup chỉ lưu metadata và file gốc vào MongoDB, KHÔNG upload lên IPFS
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

    await logAudit({
      userId,
      userEmail,
      userRole: userRoleForAudit,
      action: AuditAction.CERT_REUPLOAD,
      status: AuditStatus.SUCCESS,
      resourceType: 'cert',
      resourceId: cert.id,
      details: {
        holderName,
        degree,
        credentialTypeId: credentialTypeId || undefined,
        originalHash: cert.originalHash,
        reuploadedFrom: originalCert.id,
        reuploadNote: note.trim(),
        useOriginalFile: useOriginalFile === 'true' || useOriginalFile === true,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    res.json({ 
      id: cert.id, docHash: cert.docHash, status: CertStatus.PENDING,
      message: "File đã được reup thành công. Vui lòng chờ admin duyệt."
    })
  } catch (error: any) {
    console.error("Reupload error:", error)
    
    await logAudit({
      userId,
      userEmail,
      userRole: userRoleForAudit,
      action: AuditAction.CERT_REUPLOAD,
      status: AuditStatus.FAILURE,
      resourceType: 'cert',
      resourceId: id,
      errorMessage: error.message || "Có lỗi xảy ra khi reup file",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    
    res.status(500).json({ message: error.message || "Có lỗi xảy ra khi reup file" })
  }
}

// User/Admin xem trước file (từ pendingMetadata hoặc IPFS)
export async function previewCertFile(req: any, res: any) {
  const { id } = req.params
  const userId = req.user?.sub
  const userRole = req.user?.role
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'

  if (!userId) return res.status(401).json({ message: 'Thiếu thông tin user' })

  try {
    // Query document không dùng lean() để đảm bảo có đầy đủ Binary type
    const cert = await Cert.findById(id)
    if (!cert) return res.status(404).json({ message: 'Không tìm thấy chứng chỉ' })

    // Kiểm tra quyền: user chỉ có thể xem file của chính họ, admin có thể xem tất cả
    if (!isAdmin && cert.issuerId !== userId) {
      return res.status(403).json({ message: 'Bạn không có quyền xem file này' })
    }

    let fileBuffer: Buffer | null = null
    let mimeType: string = 'application/pdf'

    if (cert.pendingMetadata && cert.pendingMetadata.file) {
      try {
        // Lấy file data từ Mongoose document
        let fileData: any = cert.pendingMetadata.file
        const doc = cert as any
        
        if (!fileData || (!Buffer.isBuffer(fileData) && typeof fileData !== 'object')) {
          fileData = doc.get?.('pendingMetadata.file') || doc.toObject?.()?.pendingMetadata?.file || doc._doc?.pendingMetadata?.file
        }
        
        if (!fileData) throw new Error('Không thể lấy file data từ document')
        
        fileBuffer = convertToBuffer(fileData)
        if (!fileBuffer || fileBuffer.length === 0) throw new Error('File buffer rỗng sau khi convert')
        
        mimeType = await detectAndValidateMimeType(fileBuffer, cert.pendingMetadata.mimeType ?? undefined, 'pendingMetadata')
      } catch (error: any) {
        throw new Error(`Không thể đọc file từ pendingMetadata: ${error.message}`)
      }
    } 
    else if (cert.metadataUri) {
      try {
        const response = await fetch(cert.metadataUri)
        if (!response.ok) throw new Error(`IPFS fetch failed: ${response.status}`)
        
        const metadata = await response.json()
        if (!metadata.file) throw new Error('Không tìm thấy file trong metadata')
        
        fileBuffer = convertToBuffer(metadata.file)
        if (!fileBuffer || fileBuffer.length === 0) throw new Error('File buffer rỗng sau khi convert từ IPFS')
        
        mimeType = await detectAndValidateMimeType(fileBuffer, metadata.mimeType, 'ipfs')
      } catch (error: any) {
        throw new Error(`Không thể lấy file từ IPFS: ${error.message}`)
      }
    }

    if (!fileBuffer) {
      return res.status(404).json({ message: 'Không tìm thấy file để xem trước' })
    }

    // Validate file buffer trước khi trả về
    if (fileBuffer.length === 0) {
      return res.status(500).json({ message: 'File buffer rỗng' })
    }

    // Trả về file với Content-Type phù hợp
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition', `inline; filename="cert-${cert.id}.${mimeType === 'application/pdf' ? 'pdf' : mimeType.startsWith('image/') ? 'jpg' : 'bin'}"`)
    res.setHeader('Content-Length', fileBuffer.length.toString())
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
  const adminRole = req.user?.role

  if (!adminId) return res.status(401).json({ message: 'Thiếu thông tin admin' })

  // Lấy thông tin admin để ghi audit log
  const { email: adminEmail, role: userRole } = await getUserInfoForAudit(adminId, adminRole)

  try {
    const cert = await Cert.findById(id)
    if (!cert) {
      await logAudit({
        userId: adminId,
        userEmail: adminEmail,
        userRole,
        action: AuditAction.CERT_REVOKE,
        status: AuditStatus.FAILURE,
        resourceType: 'cert',
        resourceId: id,
        errorMessage: 'Không tìm thấy chứng chỉ',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(404).json({ message: 'Không tìm thấy chứng chỉ' })
    }
    
    if (cert.status !== CertStatus.VALID) {
      await logAudit({
        userId: adminId,
        userEmail: adminEmail,
        userRole,
        action: AuditAction.CERT_REVOKE,
        status: AuditStatus.FAILURE,
        resourceType: 'cert',
        resourceId: id,
        errorMessage: 'Chỉ có thể thu hồi chứng chỉ đã được cấp phát và còn hiệu lực',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(400).json({ message: 'Chỉ có thể thu hồi chứng chỉ đã được cấp phát và còn hiệu lực' })
    }
    
    if (!cert.docHash) {
      await logAudit({
        userId: adminId,
        userEmail: adminEmail,
        userRole,
        action: AuditAction.CERT_REVOKE,
        status: AuditStatus.FAILURE,
        resourceType: 'cert',
        resourceId: id,
        errorMessage: 'Chứng chỉ không có docHash',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(400).json({ message: 'Chứng chỉ không có docHash' })
    }

    await revokeOnChain(cert.docHash)
    cert.status = CertStatus.REVOKED
    cert.revokedAt = new Date()
    await cert.save()

    await logAudit({
      userId: adminId,
      userEmail: adminEmail,
      userRole,
      action: AuditAction.CERT_REVOKE,
      status: AuditStatus.SUCCESS,
      resourceType: 'cert',
      resourceId: id,
      details: {
        holderName: cert.holderName,
        degree: cert.degree,
        docHash: cert.docHash,
        revokedAt: cert.revokedAt,
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    res.json({ ok: true, message: 'Đã thu hồi chứng chỉ' })
  } catch (error: any) {
    console.error("Revoke cert error:", error)
    
    await logAudit({
      userId: adminId,
      userEmail: adminEmail,
      userRole,
      action: AuditAction.CERT_REVOKE,
      status: AuditStatus.FAILURE,
      resourceType: 'cert',
      resourceId: id,
      errorMessage: error.message || "Có lỗi xảy ra khi thu hồi chứng chỉ",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    
    res.status(500).json({ message: error.message || "Có lỗi xảy ra khi thu hồi chứng chỉ" })
  }
}

// Super admin chuyển người nhận chứng chỉ
export async function transferCertificate(req: any, res: any) {
  const { id } = req.params
  const { newUserId, note, holderName } = req.body
  const adminId = req.user?.sub
  const adminRole = req.user?.role

  if (!adminId) return res.status(401).json({ message: 'Thiếu thông tin admin' })
  if (adminRole !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Chỉ super admin mới có quyền chuyển người nhận chứng chỉ' })
  }

  if (!newUserId) {
    return res.status(400).json({ message: 'Thiếu thông tin người nhận mới' })
  }

  if (!note || !note.trim()) {
    return res.status(400).json({ message: 'Vui lòng nhập ghi chú khi chuyển chứng chỉ' })
  }

  const { email: adminEmail, role: userRole } = await getUserInfoForAudit(adminId, adminRole)

  try {
    const cert = await Cert.findById(id)
    if (!cert) {
      await logAudit({
        userId: adminId,
        userEmail: adminEmail,
        userRole,
        action: AuditAction.CERT_TRANSFER,
        status: AuditStatus.FAILURE,
        resourceType: 'cert',
        resourceId: id,
        errorMessage: 'Không tìm thấy chứng chỉ',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(404).json({ message: 'Không tìm thấy chứng chỉ' })
    }

    if (cert.status !== CertStatus.VALID && cert.status !== CertStatus.APPROVED) {
      await logAudit({
        userId: adminId,
        userEmail: adminEmail,
        userRole,
        action: AuditAction.CERT_TRANSFER,
        status: AuditStatus.FAILURE,
        resourceType: 'cert',
        resourceId: id,
        errorMessage: 'Chỉ có thể chuyển chứng chỉ đã được cấp phát',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(400).json({ message: 'Chỉ có thể chuyển chứng chỉ đã được cấp phát' })
    }

    // Kiểm tra user mới có tồn tại không
    const newUser = await Issuer.findById(newUserId)
    if (!newUser) {
      await logAudit({
        userId: adminId,
        userEmail: adminEmail,
        userRole,
        action: AuditAction.CERT_TRANSFER,
        status: AuditStatus.FAILURE,
        resourceType: 'cert',
        resourceId: id,
        errorMessage: 'Không tìm thấy người nhận mới',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
      return res.status(404).json({ message: 'Không tìm thấy người nhận mới' })
    }

    // Lấy thông tin user cũ
    const oldUserId = cert.userId
    const oldUser = oldUserId ? await Issuer.findById(oldUserId) : null

    // Cập nhật userId và holderName (tên người nhận mới)
    cert.userId = newUserId
    if (holderName && holderName.trim()) {
      cert.holderName = holderName.trim()
    } else {
      cert.holderName = newUser.name || newUser.email || cert.holderName || 'Unknown'
    }

    // Lưu lịch sử chuyển đổi vào details (có thể mở rộng sau)
    if (!cert.details) {
      cert.details = {}
    }
    if (!cert.details.transferHistory) {
      cert.details.transferHistory = []
    }
    cert.details.transferHistory.push({
      fromUserId: oldUserId || null,
      fromUserEmail: oldUser?.email || null,
      toUserId: newUserId,
      toUserEmail: newUser.email,
      transferredBy: adminId,
      transferredByEmail: adminEmail,
      note: note.trim(),
      transferredAt: new Date(),
    })

    await cert.save()

    // Ghi audit log thành công
    await logAudit({
      userId: adminId,
      userEmail: adminEmail,
      userRole,
      action: AuditAction.CERT_TRANSFER,
      status: AuditStatus.SUCCESS,
      resourceType: 'cert',
      resourceId: id,
      details: {
        holderName: cert.holderName,
        degree: cert.degree,
        docHash: cert.docHash,
        oldUserId: oldUserId || null,
        oldUserEmail: oldUser?.email || null,
        newUserId: newUserId,
        newUserEmail: newUser.email,
        note: note.trim(),
      },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    res.json({ 
      ok: true, 
      message: 'Đã chuyển chứng chỉ thành công',
      cert: mapCertToResponse(cert)
    })
  } catch (error: any) {
    console.error("Transfer cert error:", error)
    await logAudit({
      userId: adminId,
      userEmail: adminEmail,
      userRole,
      action: AuditAction.CERT_TRANSFER,
      status: AuditStatus.FAILURE,
      resourceType: 'cert',
      resourceId: id,
      errorMessage: error.message || "Có lỗi xảy ra khi chuyển chứng chỉ",
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    res.status(500).json({ message: error.message || "Có lỗi xảy ra khi chuyển chứng chỉ" })
  }
}
