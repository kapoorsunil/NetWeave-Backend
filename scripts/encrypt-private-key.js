import { encryptPrivateKey } from '../src/utils/privateKeyCrypto.js'

const privateKey = process.argv[2]?.trim() || process.env.PRIVATE_KEY_TO_ENCRYPT?.trim() || ''
const secret = process.argv[3]?.trim() || process.env.PRIVATE_KEY_ENCRYPTION_SECRET?.trim() || ''

if (!privateKey) {
  console.error('Usage: node scripts/encrypt-private-key.js <0xPrivateKey> <encryptionSecret>')
  process.exit(1)
}

if (!secret) {
  console.error('Encryption secret is required as the second argument or PRIVATE_KEY_ENCRYPTION_SECRET env var.')
  process.exit(1)
}

try {
  const encryptedValue = encryptPrivateKey(privateKey, secret)

  console.log('Encrypted private key generated successfully.')
  console.log('')
  console.log(`ADMIN_PRIVATE_KEY_ENCRYPTED=${encryptedValue}`)
  console.log('')
  console.log('Store that value in your .env file and keep PRIVATE_KEY_ENCRYPTION_SECRET separate.')
} catch (error) {
  console.error(error.message || 'Failed to encrypt private key.')
  process.exit(1)
}
