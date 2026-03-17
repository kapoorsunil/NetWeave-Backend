import crypto from 'crypto'

const PASSWORD_PREFIX = 'scrypt:v1'
const OTP_PREFIX = 'sha256:v1'

function toBase64(value) {
  return Buffer.from(value).toString('base64')
}

function fromBase64(value) {
  return Buffer.from(value, 'base64').toString('utf8')
}

export function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export function hashOtpCode(code) {
  const digest = crypto.createHash('sha256').update(code).digest('base64')
  return `${OTP_PREFIX}:${digest}`
}

export function verifyOtpCode(code, storedHash) {
  if (!storedHash?.startsWith(`${OTP_PREFIX}:`)) {
    return false
  }

  const parts = storedHash.split(':')
  const prefix = parts.slice(0, 2).join(':')
  const digest = parts.slice(2).join(':')

  if (prefix !== OTP_PREFIX || !digest) {
    return false
  }

  const incomingDigest = crypto.createHash('sha256').update(code).digest('base64')
  const digestBuffer = Buffer.from(digest)
  const incomingBuffer = Buffer.from(incomingDigest)

  if (digestBuffer.length !== incomingBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(digestBuffer, incomingBuffer)
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(password, salt, 64)
  return `${PASSWORD_PREFIX}:${salt.toString('base64')}:${derived.toString('base64')}`
}

export function verifyPassword(password, storedHash) {
  if (!storedHash?.startsWith(`${PASSWORD_PREFIX}:`)) {
    return false
  }

  const parts = storedHash.split(':')
  const prefix = parts.slice(0, 2).join(':')
  const saltB64 = parts[2]
  const hashB64 = parts.slice(3).join(':')

  if (prefix !== PASSWORD_PREFIX || !saltB64 || !hashB64) {
    return false
  }

  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  const actual = crypto.scryptSync(password, salt, expected.length)

  if (expected.length !== actual.length) {
    return false
  }

  return crypto.timingSafeEqual(expected, actual)
}

export function encodeOtpPayload(payload) {
  return toBase64(JSON.stringify(payload))
}

export function decodeOtpPayload(value) {
  if (!value) {
    return null
  }

  return JSON.parse(fromBase64(value))
}
