import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const SALT_LENGTH = 16
const PREFIX = 'encpk:v1'

function assertPrivateKeyFormat(privateKey) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey || '')) {
    throw new Error('Private key must be a 0x-prefixed 32-byte hex string.')
  }
}

function deriveKey(secret, salt) {
  if (!secret) {
    throw new Error('PRIVATE_KEY_ENCRYPTION_SECRET is required.')
  }

  return crypto.scryptSync(secret, salt, KEY_LENGTH)
}

export function encryptPrivateKey(privateKey, secret) {
  assertPrivateKeyFormat(privateKey)

  const salt = crypto.randomBytes(SALT_LENGTH)
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = deriveKey(secret, salt)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    PREFIX,
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

export function decryptPrivateKey(payload, secret) {
  if (!payload) {
    throw new Error('Encrypted private key payload is required.')
  }

  const parts = payload.split(':')
  const prefix = parts.slice(0, 2).join(':')
  const [saltB64, ivB64, authTagB64, cipherB64] = parts.slice(2)

  if (prefix !== PREFIX || !saltB64 || !ivB64 || !authTagB64 || !cipherB64) {
    throw new Error('Invalid encrypted private key payload format.')
  }

  const salt = Buffer.from(saltB64, 'base64')
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const encrypted = Buffer.from(cipherB64, 'base64')
  const key = deriveKey(secret, salt)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  assertPrivateKeyFormat(decrypted)
  return decrypted
}

export function resolvePrivateKey({ plainPrivateKey = '', encryptedPrivateKey = '', encryptionSecret = '' }) {
  if (encryptedPrivateKey) {
    return decryptPrivateKey(encryptedPrivateKey, encryptionSecret)
  }

  if (plainPrivateKey) {
    assertPrivateKeyFormat(plainPrivateKey)
    return plainPrivateKey
  }

  return ''
}
