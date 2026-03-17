import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { Admin } from '../models/Admin.js'
import { AdminTopUpRecord } from '../models/AdminTopUpRecord.js'
import { User } from '../models/User.js'
import { creditUserMainBalance } from './userService.js'

const FIXED_ADMIN_EMAIL = 'admin@gmail.com'
const FIXED_ADMIN_PASSWORD = 'Admin@?9ad@fnrhs3uD1'
const MAX_TOP_UP_PER_WALLET = 1000
const DEFAULT_ADMIN_BALANCE = 10000
const walletCollation = { locale: 'en', strength: 2 }

function normalizeWallet(walletAddress) {
  return walletAddress?.trim()
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
