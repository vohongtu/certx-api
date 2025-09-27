import QRCode from 'qrcode'

export async function toDataURL(text: string) {
  return await QRCode.toDataURL(text, { margin: 1, width: 200 })
}
