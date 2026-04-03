import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { Admin } from '../models/Admin.js'
import { AdminTopUpRecord } from '../models/AdminTopUpRecord.js'
import { PodPurchase } from '../models/PodPurchase.js'
import { TopUpRecord } from '../models/TopUpRecord.js'
import { User } from '../models/User.js'
import { getEffectiveCycleIndex } from './podService.js'
import { creditUserMainBalance } from './userService.js'

const FIXED_ADMIN_EMAIL = 'admin@gmail.com'
const FIXED_ADMIN_PASSWORD = 'Admin@?9ad@fnrhs3uD1'
const MAX_TOP_UP_PER_WALLET = 1000
const DEFAULT_ADMIN_BALANCE = 10000
const walletCollation = { locale: 'en', strength: 2 }
const POD_LAUNCH_AT = new Date('2026-03-28T11:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

function normalizeWallet(walletAddress) {
  return walletAddress?.trim()
}



function getClaimReadyAt(value) {
  const purchasedAt = new Date(value)
  if (Number.isNaN(purchasedAt.getTime())) {
    return null
  }

  return new Date(purchasedAt.getTime() + 7 * DAY_MS)
}

function getClaimUnlockCycleIndex(cycleIndex) {
  const numericCycleIndex = Number(cycleIndex)
  if (!Number.isFinite(numericCycleIndex)) {
    return null
  }

  return numericCycleIndex + 7
}

function mapPodPurchaseForAdmin(purchase, currentCycleIndex) {
  const unlockCycleIndex = getClaimUnlockCycleIndex(purchase.cycleIndex)
  const claimReadyAt = getClaimReadyAt(purchase.purchasedAt)
  const rewardPercentage = 10
  const rewardAmountUsd = Number((Number(purchase.amountUsd || 0) * 1.1).toFixed(2))

  return {
    id: String(purchase._id),
    walletAddress: purchase.walletAddress,
    cycleKey: purchase.cycleKey,
    cycleIndex: purchase.cycleIndex,
    blockNumber: purchase.blockNumber,
    epochNumber: purchase.epochNumber,
    dayNumber: purchase.dayNumber,
    amountUsd: purchase.amountUsd,
    podCount: purchase.podCount,
    balanceSource: purchase.balanceSource,
    mainAmountUsd: purchase.mainAmountUsd ?? 0,
    referralAmountUsd: purchase.referralAmountUsd ?? 0,
    rewardPercentage,
    rewardAmountUsd,
    unlockCycleIndex,
    claimReadyAt,
    isClaimEnabled: unlockCycleIndex ? currentCycleIndex >= unlockCycleIndex : false,
    purchasedAt: purchase.purchasedAt,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
  }
}

export async function ensureAdminAccount() {
  return Admin.findOneAndUpdate(
    { email: FIXED_ADMIN_EMAIL },
    {
      $set: {
        email: FIXED_ADMIN_EMAIL,
        password: FIXED_ADMIN_PASSWORD,
      },
      $setOnInsert: {
        balance: DEFAULT_ADMIN_BALANCE,
      },
    },
    {
      upsert: true,
      new: true,
    },
  )
}

export async function authenticateAdmin(email, password) {
  const admin = await Admin.findOne({ email: email?.trim().toLowerCase() })

  if (!admin || admin.password !== password?.trim()) {
    throw new Error('Invalid admin email or password.')
  }

  const token = jwt.sign(
    {
      adminId: admin._id.toString(),
      email: admin.email,
    },
    env.adminJwtSecret,
    {
      expiresIn: '7d',
    },
  )

  return {
    token,
    admin,
  }
}

export async function getAdminUserOverview(walletAddress) {
  const normalizedWallet = normalizeWallet(walletAddress)

  if (!normalizedWallet) {
    throw new Error('walletAddress is required.')
  }

  const user = await User.findOne({ walletAddress: normalizedWallet }).collation(walletCollation)
  const topUpRecords = await AdminTopUpRecord.find({ walletAddress: normalizedWallet }).collation(walletCollation)
  const totalAdminTopUpSent = topUpRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0)

  return {
    walletAddress: normalizedWallet,
    userExists: Boolean(user),
    mainBalance: user?.mainBalance ?? 0,
    totalAdminTopUpSent,
  }
}

export async function topUpUserFromAdmin(admin, walletAddress, amount) {
  const normalizedWallet = normalizeWallet(walletAddress)
  const numericAmount = Number(amount)

  if (!normalizedWallet) {
    throw new Error('walletAddress is required.')
  }

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('Enter a valid top up amount.')
  }

  const user = await User.findOne({ walletAddress: normalizedWallet }).collation(walletCollation)
  if (!user) {
    throw new Error('User wallet address was not found.')
  }

  const topUpRecords = await AdminTopUpRecord.find({ walletAddress: normalizedWallet }).collation(walletCollation)
  const totalAdminTopUpSent = topUpRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0)

  if (totalAdminTopUpSent + numericAmount > MAX_TOP_UP_PER_WALLET) {
    throw new Error(`Top up limit exceeded. Admin can send max $${MAX_TOP_UP_PER_WALLET} per wallet.`)
  }

  if ((admin.balance ?? 0) < numericAmount) {
    throw new Error('Admin balance is insufficient for this top up.')
  }

  const updatedAdmin = await Admin.findByIdAndUpdate(
    admin._id,
    {
      $inc: {
        balance: -numericAmount,
      },
    },
    {
      new: true,
    },
  )

  try {
    const updatedUser = await creditUserMainBalance(normalizedWallet, numericAmount)
    await AdminTopUpRecord.create({
      adminEmail: admin.email,
      walletAddress: normalizedWallet,
      amount: numericAmount,
    })

    return {
      adminBalance: updatedAdmin.balance ?? 0,
      walletAddress: normalizedWallet,
      mainBalance: updatedUser.mainBalance ?? 0,
      totalAdminTopUpSent: totalAdminTopUpSent + numericAmount,
      limitPerWallet: MAX_TOP_UP_PER_WALLET,
    }
  } catch (error) {
    await Admin.findByIdAndUpdate(admin._id, {
      $inc: {
        balance: numericAmount,
      },
    })
    throw error
  }
}

export async function getAdminDashboardSummary() {
  const [summary] = await User.aggregate([
    {
      $match: {
        isRegistered: true,
      },
    },
    {
      $group: {
        _id: null,
        totalMainBalance: {
          $sum: {
            $ifNull: ['$mainBalance', 0],
          },
        },
        totalReferralBalance: {
          $sum: {
            $ifNull: ['$referralBalance', 0],
          },
        },
        totalRegistrations: { $sum: 1 },
        paidRegistrations: {
          $sum: {
            $cond: [{ $eq: ['$registrationPaymentDone', true] }, 1, 0],
          },
        },
        unpaidRegistrations: {
          $sum: {
            $cond: [{ $eq: ['$registrationPaymentDone', false] }, 1, 0],
          },
        },
      },
    },
  ])

  return {
    totalMainBalance: summary?.totalMainBalance ?? 0,
    totalReferralBalance: summary?.totalReferralBalance ?? 0,
    totalRegistrations: summary?.totalRegistrations ?? 0,
    paidRegistrations: summary?.paidRegistrations ?? 0,
    unpaidRegistrations: summary?.unpaidRegistrations ?? 0,
  }
}

export async function getAdminRecordSections({ section = '', walletAddress = '' } = {}) {
  const normalizedWallet = normalizeWallet(walletAddress)
  const requestedSection = (section || '').trim().toLowerCase()
  const currentCycleIndex = await getEffectiveCycleIndex()

  const includeTopUps = !requestedSection || requestedSection === 'topup'
  const includeAdminTopUps = !requestedSection || requestedSection === 'admin-topup'
  const includePodPurchases = !requestedSection || requestedSection === 'pod-purchase'
  const includePaidRegistrations = !requestedSection || requestedSection === 'paid-registration'
  const includeUnpaidRegistrations = !requestedSection || requestedSection === 'unpaid-registration'

  const [
    topUpTotals,
    adminTopUpTotals,
    podPurchaseTotals,
    topUpRecords,
    adminTopUpRecords,
    podPurchases,
    paidRegistrations,
    unpaidRegistrations,
  ] = await Promise.all([
    includeTopUps
      ? TopUpRecord.aggregate([
          {
            $group: {
              _id: null,
              totalAmount: { $sum: { $ifNull: ['$amount', 0] } },
              totalCount: { $sum: 1 },
            },
          },
        ])
      : Promise.resolve([]),
    includeAdminTopUps
      ? AdminTopUpRecord.aggregate([
          {
            $group: {
              _id: null,
              totalAmount: { $sum: { $ifNull: ['$amount', 0] } },
              totalCount: { $sum: 1 },
            },
          },
        ])
      : Promise.resolve([]),
    includePodPurchases
      ? PodPurchase.aggregate([
          {
            $group: {
              _id: null,
              totalAmountUsd: { $sum: { $ifNull: ['$amountUsd', 0] } },
              totalPodCount: { $sum: { $ifNull: ['$podCount', 0] } },
              totalCount: { $sum: 1 },
            },
          },
        ])
      : Promise.resolve([]),
    includeTopUps
      ? TopUpRecord.find(normalizedWallet ? { walletAddress: normalizedWallet } : {})
          .collation(walletCollation)
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve([]),
    includeAdminTopUps
      ? AdminTopUpRecord.find(normalizedWallet ? { walletAddress: normalizedWallet } : {})
          .collation(walletCollation)
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve([]),
    includePodPurchases
      ? PodPurchase.find(normalizedWallet ? { walletAddress: normalizedWallet } : {})
          .collation(walletCollation)
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve([]),
    includePaidRegistrations
      ? User.find({ registrationPaymentDone: true, isRegistered: true, ...(normalizedWallet ? { walletAddress: normalizedWallet } : {}) })
          .collation(walletCollation)
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve([]),
    includeUnpaidRegistrations
      ? User.find({ registrationPaymentDone: false, isRegistered: true, ...(normalizedWallet ? { walletAddress: normalizedWallet } : {}) })
          .collation(walletCollation)
          .sort({ createdAt: -1 })
          .lean()
      : Promise.resolve([]),
  ])

  return {
    topUpRecords: includeTopUps
      ? {
          totalAmount: topUpTotals[0]?.totalAmount ?? 0,
          totalCount: topUpTotals[0]?.totalCount ?? 0,
          records: topUpRecords.map((record) => ({
            id: String(record._id),
            walletAddress: record.walletAddress,
            source: record.source,
            amount: record.amount,
            currency: record.currency,
            referenceId: record.referenceId,
            meta: record.meta ?? {},
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          })),
        }
      : null,
    adminTopUpRecords: includeAdminTopUps
      ? {
          totalAmount: adminTopUpTotals[0]?.totalAmount ?? 0,
          totalCount: adminTopUpTotals[0]?.totalCount ?? 0,
          records: adminTopUpRecords.map((record) => ({
            id: String(record._id),
            adminEmail: record.adminEmail,
            walletAddress: record.walletAddress,
            amount: record.amount,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
          })),
        }
      : null,
    podPurchases: includePodPurchases
      ? {
          totalAmountUsd: podPurchaseTotals[0]?.totalAmountUsd ?? 0,
          totalPodCount: podPurchaseTotals[0]?.totalPodCount ?? 0,
          totalCount: podPurchaseTotals[0]?.totalCount ?? 0,
          records: podPurchases.map((purchase) => mapPodPurchaseForAdmin(purchase, currentCycleIndex)),
        }
      : null,
    paidRegistrations: includePaidRegistrations
      ? {
          totalCount: paidRegistrations.length,
          records: paidRegistrations.map((user) => ({
            id: String(user._id),
            username: user.username || user.name || 'Anonymous',
            walletAddress: user.walletAddress,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          })),
        }
      : null,
    unpaidRegistrations: includeUnpaidRegistrations
      ? {
          totalCount: unpaidRegistrations.length,
          records: unpaidRegistrations.map((user) => ({
            id: String(user._id),
            username: user.username || user.name || 'Anonymous',
            walletAddress: user.walletAddress,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          })),
        }
      : null,
  }
}
