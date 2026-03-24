import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { hashPassword, verifyPassword } from '../utils/authCrypto.js'
import {
  buildBinaryTreeResponse,
  ensureAdminUser,
  findRegisteredUser,
  getLatestWithdrawRequest,
  getUserByWallet,
  registerUserWithReferral,
} from '../services/userService.js'

function normalizeWallet(value) {
  return value?.toLowerCase().trim()
}


function isValidSignupEmail(value) {
  const normalizedEmail = value?.trim().toLowerCase()

  if (!normalizedEmail) {
    return false
  }

  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(normalizedEmail)
}

export async function getStatus(req, res, next) {
  try {
    await ensureAdminUser()

    const walletAddress = req.query.wallet?.trim()
    const referralAddress = req.query.referral?.trim()

    const referralUser = referralAddress
      ? await findRegisteredUser(referralAddress)
      : null

    if (!walletAddress) {
      return res.json({
        success: true,
        data: {
          walletAddress: null,
          isRegistered: false,
          registrationPaymentDone: false,
          isAdmin: false,
          name: '',
          username: '',
          email: '',
          country: '',
          mainBalance: 0,
          referralBalance: 0,
          hasPassword: false,
          latestWithdrawStatus: null,
          referral: {
            walletAddress: referralAddress || null,
            isValid: Boolean(referralUser),
          },
        },
      })
    }

    const user = await getUserByWallet(walletAddress)
    const latestWithdraw = user ? await getLatestWithdrawRequest(walletAddress) : null

    res.json({
      success: true,
      data: {
        walletAddress: user?.walletAddress || walletAddress,
        isRegistered: Boolean(user?.isRegistered),
        registrationPaymentDone: user?.registrationPaymentDone ?? false,
        isAdmin: normalizeWallet(walletAddress) === normalizeWallet(env.adminWalletAddress),
        name: user?.name || '',
        username: user?.username || '',
        email: user?.email || '',
        country: user?.country || '',
        mainBalance: user?.mainBalance ?? 0,
        referralBalance: user?.referralBalance ?? 0,
        hasPassword: Boolean(user?.passwordHash),
        latestWithdrawStatus: latestWithdraw?.status || null,
        canRegister:
          normalizeWallet(walletAddress) === normalizeWallet(env.adminWalletAddress) ||
          (Boolean(referralUser) && normalizeWallet(walletAddress) !== normalizeWallet(referralAddress) && !user?.isRegistered),
        referredBy: user?.referredBy || null,
        referralLink: `${env.frontendUrl}/?referral=${user?.walletAddress || walletAddress}`,
        referral: {
          walletAddress: referralUser?.walletAddress || referralAddress || null,
          isValid: Boolean(referralUser),
        },
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function checkUsernameAvailability(req, res, next) {
  try {
    const username = req.query.username?.trim()

    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'username is required.',
      })
    }

    const normalizedUsername = username.toLowerCase()
    const exists = await User.exists({ username: normalizedUsername })

    res.json({
      success: true,
      data: {
        available: !Boolean(exists),
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function checkEmailAvailability(req, res, next) {
  try {
    const email = req.query.email?.trim().toLowerCase()

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'email is required.',
      })
    }

    const exists = await User.exists({ email })

    res.json({
      success: true,
      data: {
        available: !Boolean(exists),
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function directSignup(req, res, next) {
  try {
    await ensureAdminUser()

    const walletAddress = req.body.walletAddress?.trim()
    const smartWalletAddress = req.body.smartWalletAddress?.trim()
    const referralAddress = req.body.referralAddress?.trim()
    const name = req.body.name?.trim()
    const username = req.body.username?.trim()
    const email = req.body.email?.trim()
    const country = req.body.country?.trim()
    const password = typeof req.body.password === 'string' ? req.body.password.trim() : ''

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress is required.',
      })
    }

    if (!name || !username || !email || !country) {
      return res.status(400).json({
        success: false,
        message: 'name, username, email and country are required.',
      })
    }

    if (!isValidSignupEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email address.',
      })
    }

    if (normalizeWallet(walletAddress) !== normalizeWallet(env.adminWalletAddress)) {
      if (!referralAddress || normalizeWallet(walletAddress) === normalizeWallet(referralAddress)) {
        return res.status(400).json({
          success: false,
          message: 'A valid referral address is required for registration.',
        })
      }
    }

    const user = await registerUserWithReferral({
      walletAddress,
      smartWalletAddress,
      referralAddress,
      name,
      username,
      email,
      country,
      passwordHash: password ? hashPassword(password) : undefined,
      txHash: null,
    })

    res.status(201).json({
      success: true,
      data: {
        walletAddress: user.walletAddress,
        smartWalletAddress: user.smartWalletAddress || null,
        isRegistered: user.isRegistered,
        registrationPaymentDone: user.registrationPaymentDone ?? false,
        name: user.name || '',
        username: user.username || '',
        email: user.email || '',
        country: user.country || '',
        mainBalance: user.mainBalance ?? 0,
        referralBalance: user.referralBalance ?? 0,
        referredBy: user.referredBy,
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function loginWithWalletPassword(req, res, next) {
  try {
    const walletAddress = req.body.walletAddress?.trim()
    const password = req.body.password?.trim()

    if (!walletAddress || !password) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress and password are required.',
      })
    }

    const user = await findRegisteredUser(walletAddress)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'This wallet is not registered yet. Complete sign up first.',
      })
    }

    if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid wallet password.',
      })
    }

    res.json({
      success: true,
      data: {
        walletAddress: user.walletAddress,
        isRegistered: true,
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function setWalletPassword(req, res, next) {
  try {
    const walletAddress = req.body.walletAddress?.trim()
    const password = req.body.password?.trim()

    if (!walletAddress || !password) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress and password are required.',
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.',
      })
    }

    const user = await findRegisteredUser(walletAddress)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'This wallet is not registered yet. Complete sign up first.',
      })
    }

    if (user.passwordHash) {
      return res.status(409).json({
        success: false,
        message: 'Password is already set for this wallet.',
      })
    }

    user.passwordHash = hashPassword(password)
    await user.save()

    res.json({
      success: true,
      data: {
        walletAddress: user.walletAddress,
        hasPassword: true,
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function getTeam(req, res, next) {
  try {
    const walletAddress = req.query.wallet?.trim()

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'wallet query parameter is required.',
      })
    }

    const user = await findRegisteredUser(walletAddress)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Registered user not found.',
      })
    }

    res.json({
      success: true,
      data: await buildBinaryTreeResponse(user),
    })
  } catch (error) {
    next(error)
  }
}


