import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()

// Ensure the PORT value from .env is honored even if the environment already defines PORT.
// This helps keep the backend port aligned with the frontend config during local development.
try {
  const envPath = path.resolve(process.cwd(), '.env')
  const envFile = fs.readFileSync(envPath, 'utf8')
  const match = envFile.match(/^\s*PORT\s*=\s*(\d+)\s*$/m)
  if (match && match[1]) {
    process.env.PORT = match[1]
  }
} catch {
  // ignore if .env is missing or unreadable
}

const requiredVars = ['MONGODB_URI', 'BASE_RPC_URL', 'ADMIN_WALLET_ADDRESS']

for (const key of requiredVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}

export const env = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  frontendUrls: (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  baseRpcUrl: process.env.BASE_RPC_URL,
  adminWalletAddress: process.env.ADMIN_WALLET_ADDRESS.trim(),
  adminPrivateKey: process.env.ADMIN_PRIVATE_KEY || '',
  adminPrivateKeyEncrypted: process.env.ADMIN_PRIVATE_KEY_ENCRYPTED || '',
  privateKeyEncryptionSecret: process.env.PRIVATE_KEY_ENCRYPTION_SECRET || '',
  withdrawPrivateKey: process.env.WITHDRAW_PRIVATE_KEY || '',
  withdrawPrivateKeyEncrypted: process.env.WITHDRAW_PRIVATE_KEY_ENCRYPTED || '',
  withdrawPrivateKeyEncryptionSecret: process.env.WITHDRAW_PRIVATE_KEY_ENCRYPTION_SECRET || '',
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || 'change_me_admin_jwt_secret',
  withdrawFeeWalletAddress: process.env.WITHDRAW_FEE_WALLET_ADDRESS?.trim() || '0x0d7fdf1BC130Ca2E17e91D76D7DA447D148cabeb',
  usdcContractAddress: process.env.USDC_CONTRACT_ADDRESS?.toLowerCase() || '',
  usdcDecimals: Number(process.env.USDC_DECIMALS || 6),
  registrationAmount: process.env.REGISTRATION_AMOUNT || '50',
  gasPrefundAmount: process.env.GAS_PREFUND_AMOUNT || '0.0013',
  gasPrefundCooldownMs: Number(process.env.GAS_PREFUND_COOLDOWN_MS || 10 * 60 * 1000),
  moonPayPublishableKey: process.env.MOONPAY_PUBLISHABLE_KEY || '',
  moonPaySecretKey: process.env.MOONPAY_SECRET_KEY || '',
  moonPayEnvironment: process.env.MOONPAY_ENVIRONMENT || 'sandbox',
  moonPayWebhookSecret: process.env.MOONPAY_WEBHOOK_SECRET || '',
  sendGridApiKey: process.env.SENDGRID_API_KEY || '',
  sendGridFromEmail: process.env.SENDGRID_FROM_EMAIL || '',
}
