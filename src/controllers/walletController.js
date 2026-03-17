import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { UserOtp } from '../models/UserOtp.js'
import { WithdrawRequest } from '../models/WithdrawRequest.js'
import { generateOtpCode, hashOtpCode, verifyOtpCode } from '../utils/authCrypto.js'
import { TopUpRecord } from '../models/TopUpRecord.js'
import { computeWithdrawalSplit, normalizeCryptoTopUp, payoutReferralWithdrawal, prefundUserGas } from '../services/paymentService.js'
import { sendOtpEmail } from '../services/mailService.js'
import {
  consumeRegistrationBalance,
  creditUserMainBalanceWithOptions,
  ensureAdminUser,
  requireExistingUser,
  markGasPrefundSent,
} from '../services/userService.js'

function normalizeWallet(value) {
  return value?.toLowerCase().trim()
}

function createOtpExpiryDate() {
  return new Date(Date.now() + 10 * 60 * 1000)
}

const activeWithdrawProcessors = new Set()

async function processWithdrawRequestById(withdrawRequestId) {
  const key = String(withdrawRequestId)

  if (activeWithdrawProcessors.has(key)) {
    return
  }

  activeWithdrawProcessors.add(key)

  try {
    const withdrawRequest = await WithdrawRequest.findById(withdrawRequestId)
    if (!withdrawRequest || withdrawRequest.status !== 'pending') {
      return
    }

    const payout = await payoutReferralWithdrawal({
      toWalletAddress: withdrawRequest.walletAddress,
      amount: withdrawRequest.amount,
    })

    withdrawRequest.userTxHash = payout.userTxHash
    withdrawRequest.feeTxHash = payout.feeTxHash

    if (payout.success) {
      withdrawRequest.status = 'confirmed'
    }

    await withdrawRequest.save()
  } catch {
    // keep request pending for later retries / manual review
  } finally {
    activeWithdrawProcessors.delete(key)
  }
}

export async function resumePendingWithdrawals() {
  const pendingRequests = await WithdrawRequest.find({ status: 'pending' }).sort({ createdAt: 1 })
  for (const request of pendingRequests) {
    void processWithdrawRequestById(request._id)
  }
}

export async function prefundGas(req, res, next) {
  try {
    await ensureAdminUser()

    const walletAddress = req.body.walletAddress?.trim()

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress is required.',
      })
    }

    const user = await requireExistingUser(walletAddress)

    if (!user.isRegistered) {
      return res.status(400).json({
        success: false,
        message: 'User must sign up before requesting gas prefund.',
      })
    }

    if (normalizeWallet(walletAddress) === normalizeWallet(env.adminWalletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Admin wallet does not require gas prefund.',
      })
    }

    if ((user.adminGasSendCount ?? 0) > (user.userCryptoTransferCount ?? 0)) {
      return res.json({
        success: true,
        data: {
          skipped: true,
          amount: '0',
          reason: 'Admin gas was already sent for the next crypto transfer.',
        },
      })
    }

    const tx = await prefundUserGas(walletAddress)
    await markGasPrefundSent(walletAddress)

    res.json({
      success: true,
      data: tx,
    })
  } catch (error) {
    next(error)
  }
}

export async function confirmCryptoTopUp(req, res, next) {
  try {
    await ensureAdminUser()

    const walletAddress = req.body.walletAddress?.trim()
    const txHash = req.body.txHash?.trim()
    const amount = req.body.amount

    if (!walletAddress || !amount) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress and amount are required.',
      })
    }

    await requireExistingUser(walletAddress)

    if (txHash) {
      const existingRecord = await TopUpRecord.findOne({ referenceId: txHash })
      if (existingRecord) {
        return res.status(409).json({
          success: false,
          message: 'This crypto top up transaction was already processed.',
        })
      }
    }

    const normalizedTopUp = normalizeCryptoTopUp({ txHash, amount })
    const referenceId = normalizedTopUp.txHash || `crypto-${walletAddress}-${Date.now()}`
    const existingFallbackRecord = await TopUpRecord.findOne({ referenceId })
    if (existingFallbackRecord) {
      return res.status(409).json({
        success: false,
        message: 'This crypto top up transaction was already processed.',
      })
    }

    const updatedUser = await creditUserMainBalanceWithOptions(walletAddress, normalizedTopUp.amount, {
      countCryptoTransfer: true,
    })

    await TopUpRecord.create({
      walletAddress,
      source: 'crypto',
      amount: normalizedTopUp.amount,
      currency: normalizedTopUp.currency,
      referenceId,
      meta: {
        txHash,
        trustedByClient: true,
      },
    })

    res.json({
      success: true,
      data: {
        txHash,
        creditedAmount: normalizedTopUp.amount,
        mainBalance: updatedUser.mainBalance ?? 0,
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function completeRegistrationPayment(req, res, next) {
  try {
    await ensureAdminUser()

    const walletAddress = req.body.walletAddress?.trim()

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress is required.',
      })
    }

    const user = await consumeRegistrationBalance(walletAddress)

    res.json({
      success: true,
      data: {
        walletAddress: user.walletAddress,
        mainBalance: user.mainBalance ?? 0,
        registrationPaymentDone: user.registrationPaymentDone ?? false,
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function sendWithdrawOtp(req, res, next) {
  try {
    const walletAddress = req.body.walletAddress?.trim()

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress is required.',
      })
    }

    const user = await requireExistingUser(walletAddress)

    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: 'User does not have a registered email for withdrawal OTP.',
      })
    }

    const otpCode = generateOtpCode()

    await UserOtp.deleteMany({
      walletAddress,
      purpose: 'withdraw',
      consumedAt: null,
    })

    await UserOtp.create({
      walletAddress,
      email: user.email,
      purpose: 'withdraw',
      codeHash: hashOtpCode(otpCode),
      expiresAt: createOtpExpiryDate(),
    })

    await sendOtpEmail({
      to: user.email,
      purpose: 'withdraw',
      otpCode,
    })

    res.json({
      success: true,
      data: {
        walletAddress,
        email: user.email,
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function verifyWithdrawOtp(req, res, next) {
  try {
    const walletAddress = req.body.walletAddress?.trim()
    const otp = req.body.otp?.trim()

    if (!walletAddress || !otp) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress and otp are required.',
      })
    }

    const otpEntry = await UserOtp.findOne({
      walletAddress,
      purpose: 'withdraw',
      consumedAt: null,
    }).sort({ createdAt: -1 })

    if (!otpEntry || otpEntry.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Withdraw OTP expired or not found.',
      })
    }

    if (!verifyOtpCode(otp, otpEntry.codeHash)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP.',
      })
    }

    otpEntry.verifiedAt = new Date()
    await otpEntry.save()

    res.json({
      success: true,
      data: {
        verificationToken: String(otpEntry._id),
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function requestWithdraw(req, res, next) {
  try {
    const walletAddress = req.body.walletAddress?.trim()
    const amount = Number(req.body.amount)
    const verificationToken = req.body.verificationToken?.trim() || ''

    if (!walletAddress || !Number.isFinite(amount)) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress and amount are required.',
      })
    }

    if (amount < 10) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is $10.',
      })
    }

    const user = await requireExistingUser(walletAddress)

    if ((user.referralBalance ?? 0) < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient referral balance for withdrawal.',
      })
    }

    if (!walletAddress || !normalizeWallet(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'A valid wallet address is required.',
      })
    }

    if (verificationToken) {
      const otpEntry = await UserOtp.findOne({
        _id: verificationToken,
        walletAddress,
        purpose: 'withdraw',
        consumedAt: null,
      })

      if (!otpEntry || !otpEntry.verifiedAt) {
        return res.status(400).json({
          success: false,
          message: 'Withdraw OTP verification is required.',
        })
      }

      otpEntry.consumedAt = new Date()
      await otpEntry.save()
    }

    const roundedAmount = Number(amount.toFixed(2))
    const split = computeWithdrawalSplit(roundedAmount)

    const updatedUser = await User.findOneAndUpdate(
      {
        walletAddress,
        referralBalance: { $gte: roundedAmount },
      },
      {
        $inc: {
          referralBalance: -roundedAmount,
        },
      },
      {
        new: true,
        collation: { locale: 'en', strength: 2 },
      },
    ).collation({ locale: 'en', strength: 2 })

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient referral balance for withdrawal.',
      })
    }

    const withdrawRequest = await WithdrawRequest.create({
      walletAddress,
      amount: roundedAmount,
      userAmount: split.userAmount,
      feeAmount: split.feeAmount,
      platformFeeAmount: split.platformFeeAmount,
      status: 'pending',
      otpVerified: Boolean(verificationToken),
    })

    void processWithdrawRequestById(withdrawRequest._id)

    return res.json({
      success: true,
      data: {
        status: 'pending',
        referralBalance: updatedUser.referralBalance ?? 0,
        requestId: String(withdrawRequest._id),
      },
    })
  } catch (error) {
    next(error)
  }
}
