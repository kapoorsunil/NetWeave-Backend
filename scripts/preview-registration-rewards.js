import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import { User } from '../src/models/User.js'

const walletCollation = { locale: 'en', strength: 2 }

function normalizeWallet(walletAddress) {
  return walletAddress?.toLowerCase().trim()
}

function toCurrencyUnits(value) {
  return Math.round(Number(value || 0) * 100)
}

function fromCurrencyUnits(value) {
  return Number((Number(value || 0) / 100).toFixed(2))
}

function getLevelRewardPercent(level) {
  if (level === 1) {
    return 3
  }

  if (level === 2) {
    return 2
  }

  if (level === 3) {
    return 1
  }

  if (level >= 4 && level <= 10) {
    return 0.5
  }

  if (level >= 11 && level <= 20) {
    return 0.2
  }

  return 0
}

async function buildRewardPath(user) {
  const directReferrer = user.referredBy || null
  const levels = []
  const visited = new Set([normalizeWallet(user.walletAddress)])
  let currentParentWallet = user.treeParent

  while (currentParentWallet) {
    const normalizedParentWallet = normalizeWallet(currentParentWallet)

    if (
      normalizedParentWallet &&
      normalizedParentWallet !== normalizeWallet(directReferrer) &&
      !visited.has(normalizedParentWallet)
    ) {
      const parentUser = await User.findOne({ walletAddress: currentParentWallet }).collation(walletCollation)
      if (parentUser) {
        levels.push(parentUser)
        visited.add(normalizedParentWallet)
      }
    }

    const parentUser = await User.findOne({ walletAddress: currentParentWallet }).collation(walletCollation)
    if (!parentUser || normalizeWallet(parentUser.walletAddress) === normalizeWallet(directReferrer)) {
      break
    }

    currentParentWallet = parentUser.treeParent || null
  }

  return {
    directReferrer: directReferrer
      ? await User.findOne({ walletAddress: directReferrer }).collation(walletCollation)
      : null,
    levels: levels.reverse().slice(0, 20),
  }
}

const walletAddress = process.argv[2]?.trim()
const amountArg = process.argv[3]
const registrationAmount = Number(amountArg || env.registrationAmount || 50)

if (!walletAddress) {
  console.error('Usage: node scripts/preview-registration-rewards.js <walletAddress> [amount]')
  process.exit(1)
}

await mongoose.connect(env.mongoUri)

try {
  const user = await User.findOne({ walletAddress }).collation(walletCollation)

  if (!user) {
    throw new Error('User wallet not found.')
  }

  const rewardPath = await buildRewardPath(user)
  const baseAmountUnits = toCurrencyUnits(registrationAmount)
  const lines = []

  if (rewardPath.directReferrer) {
    const amount = fromCurrencyUnits(Math.round((baseAmountUnits * 20) / 100))
    lines.push({
      slot: 'direct',
      percent: '20%',
      amount,
      walletAddress: rewardPath.directReferrer.walletAddress,
      username: rewardPath.directReferrer.username || '',
      name: rewardPath.directReferrer.name || '',
    })
  }

  rewardPath.levels.forEach((entry, index) => {
    const level = index + 1
    const percent = getLevelRewardPercent(level)
    const amount = fromCurrencyUnits(Math.round((baseAmountUnits * percent) / 100))

    lines.push({
      slot: `L${level}`,
      percent: `${percent}%`,
      amount,
      walletAddress: entry.walletAddress,
      username: entry.username || '',
      name: entry.name || '',
    })
  })

  console.log(
    JSON.stringify(
      {
        walletAddress: user.walletAddress,
        username: user.username || '',
        name: user.name || '',
        registrationAmount,
        rewardDistribution: lines,
      },
      null,
      2,
    ),
  )
} finally {
  await mongoose.disconnect()
}
