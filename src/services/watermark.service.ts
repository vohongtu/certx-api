import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib'
import sharp from 'sharp'
import { fileTypeFromBuffer } from 'file-type'
import { config } from '../utils/env'

const defaultText = config.WATERMARK_TEXT || 'Issued by CertX'
const defaultOpacity = config.WATERMARK_OPACITY ?? 0.2
const defaultColor = config.WATERMARK_COLOR || '#bfbfbf'
const repeatCount = config.WATERMARK_REPEAT || 3
const marginRatio = (config as typeof config & { WATERMARK_MARGIN?: number }).WATERMARK_MARGIN ?? 0.12

function parseHexColor(hex: string) {
  if (!hex) return { r: 47, g: 47, b: 47 }
  const normalized = hex.replace(/[^0-9a-fA-F]/g, '')
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16)
    const g = parseInt(normalized[1] + normalized[1], 16)
    const b = parseInt(normalized[2] + normalized[2], 16)
    return { r, g, b }
  }
  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16)
    const g = parseInt(normalized.slice(2, 4), 16)
    const b = parseInt(normalized.slice(4, 6), 16)
    return { r, g, b }
  }
  return { r: 47, g: 47, b: 47 }
}

const parsedColor = parseHexColor(defaultColor)
const pdfColor = rgb(parsedColor.r / 255, parsedColor.g / 255, parsedColor.b / 255)
const svgColor = `rgb(${parsedColor.r},${parsedColor.g},${parsedColor.b})`

function getPositions(count: number, margin: number): number[] {
  const safeMargin = Math.min(0.45, Math.max(0, margin))
  const available = Math.max(0, 1 - safeMargin * 2)
  if (count <= 1) {
    return [safeMargin + available / 2]
  }
  if (available === 0) {
    return Array.from({ length: count }, () => 0.5)
  }
  return Array.from({ length: count }, (_, idx) => safeMargin + (available * idx) / (count - 1))
}

export interface WatermarkResult {
  buffer: Buffer
  mime: string
}

export async function addWatermark(buf: Buffer, text = defaultText, opacity = defaultOpacity): Promise<WatermarkResult> {
  const ft = await fileTypeFromBuffer(buf)
  const detectedMime = ft?.mime || ''

  console.log(`[watermark] input mime=${detectedMime || (isPDF(buf) ? 'application/pdf' : 'unknown')} size=${buf.length}`)

  if (detectedMime === 'application/pdf' || isPDF(buf)) {
    const watermarked = await watermarkPDF(buf, text, opacity)
    console.log(`[watermark] applied pdf watermark size=${watermarked.length}`)
    return { buffer: watermarked, mime: 'application/pdf' }
  }
  if (detectedMime.startsWith('image/')) {
    const watermarked = await watermarkImage(buf, text, opacity)
    console.log(`[watermark] applied image watermark size=${watermarked.length}`)
    return { buffer: watermarked, mime: detectedMime }
  }

  console.warn(`[watermark] unsupported mime type. Skip watermark.`)
  return { buffer: buf, mime: detectedMime || 'application/octet-stream' }
}

export async function detectMime(buf: Buffer): Promise<string> {
  const ft = await fileTypeFromBuffer(buf)
  if (ft?.mime) return ft.mime
  if (isPDF(buf)) return 'application/pdf'
  return 'application/octet-stream'
}

function isPDF(buf: Buffer): boolean {
  // PDF bắt đầu bằng %PDF
  return buf.slice(0, 4).toString() === '%PDF'
}

async function watermarkPDF(pdfBytes: Buffer, text: string, opacity: number): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const pages = pdfDoc.getPages()

  const repeatPositions = getPositions(repeatCount, marginRatio)

  for (const p of pages) {
    const { width, height } = p.getSize()

    let fontSize = Math.min(width, height) * 0.06 // tỉ lệ theo trang
    const maxTextWidth = width * 0.8
    let textWidth = font.widthOfTextAtSize(text, fontSize)
    if (textWidth > maxTextWidth) {
      const scale = maxTextWidth / textWidth
      fontSize = Math.max(16, fontSize * scale)
      textWidth = font.widthOfTextAtSize(text, fontSize)
    }

    const x = (width - textWidth) / 2

    repeatPositions.forEach((ratio) => {
      const y = height * ratio
      p.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: pdfColor,
        opacity,
        rotate: degrees(-30),
      })
    })
  }

  const out = await pdfDoc.save()
  return Buffer.from(out)
}

async function watermarkImage(imgBytes: Buffer, text: string, opacity: number): Promise<Buffer> {
  // Tạo overlay SVG để compositing (sắc nét, dễ scale)
  const meta = await sharp(imgBytes).metadata()
  const w = meta.width ?? 1200
  const h = meta.height ?? 800
  let fontSize = Math.round(Math.min(w, h) * 0.05)
  const maxFontSizeByWidth = (w * 0.65) / Math.max(1, text.length) * 2.2
  fontSize = Math.max(18, Math.min(fontSize, maxFontSizeByWidth))

  const repeatPositions = getPositions(repeatCount, marginRatio)
  const textElements = repeatPositions
    .map((ratio) => {
      const y = ratio * h
      return `    <text x="50%" y="${ratio * 100}%" text-anchor="middle"\n      font-family="Helvetica, Arial, sans-serif"\n      font-size="${fontSize}" fill="url(#g)"\n      transform="rotate(-30 ${w / 2} ${y})"\n      style="letter-spacing:2px;">\n      ${escapeXml(text)}\n    </text>`
    })
    .join('\n')

  const svg = `
  <svg width="${w}" height="${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="${svgColor}" stop-opacity="${opacity}"/>
        <stop offset="1" stop-color="${svgColor}" stop-opacity="${opacity}"/>
      </linearGradient>
    </defs>
${textElements}
  </svg>`

  const overlay = Buffer.from(svg)
  const out = await sharp(imgBytes)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .toBuffer()
  return out
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'}[c]!))
}
