import crypto from 'crypto'

export const sha256Hex = (buf: Buffer) => '0x' + crypto.createHash('sha256').update(buf).digest('hex')
