import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { hashPassword, verifyPassword } from '../utils/authCrypto.js'
import {
  buildBinaryTreeResponse,
  ensureAdminUser,
  findRegisteredUser,
  generateUniqueInternalWalletAddress,
  getLatestWithdrawRequest,
  getUserByWallet,
  registerUserWithReferral,
} from '../services/userService.js'

function normalizeWallet(value) {
  return value?.toLowerCase().trim()
}

function isValidWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value?.trim() || '')
}

function normalizeLoginIdentifier(value) {
  return value?.trim() || ''
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
    const referralUser = referralAddress ? await findRegisteredUser(referralAddress) : null

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
          phoneCountryCode: '',
          phoneNumber: '',
          accountType: '',
          mainBalance: 0,
          referralBalance: 0,
          claimedBalance: 0,
          claimReferralBalance: 0,
          hasPassword: false,
          latestWithdrawStatus: null,
          canRegister: Boolean(referralUser),
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
        phoneCountryCode: user?.phoneCountryCode || '',
        phoneNumber: user?.phoneNumber || '',
        accountType: user?.accountType || 'legacy_wallet',
        mainBalance: user?.mainBalance ?? 0,
        referralBalance: user?.referralBalance ?? 0,
        claimedBalance: user?.claimedBalance ?? 0,
        claimReferralBalance: user?.claimReferralBalance ?? 0,
        hasPassword: Boolean(user?.passwordHash),
        latestWithdrawStatus: latestWithdraw?.status || null,
        canRegister: Boolean(referralUser) && !user?.isRegistered,
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
      return res.status(400).json({ success: false, message: 'username is required.' })
    }

    const exists = await User.exists({ username: username.toLowerCase() })
    res.json({ success: true, data: { available: !Boolean(exists) } })
  } catch (error) {
    next(error)
  }
}

export async function checkEmailAvailability(req, res, next) {
  try {
    const email = req.query.email?.trim().toLowerCase()

    if (!email) {
      return res.status(400).json({ success: false, message: 'email is required.' })
    }

    const exists = await User.exists({ email })
    res.json({ success: true, data: { available: !Boolean(exists) } })
  } catch (error) {
    next(error)
  }
}

export async function directSignup(req, res, next) {
  try {
    await ensureAdminUser()

    const smartWalletAddress = req.body.smartWalletAddress?.trim()
    const requestedWalletAddress = req.body.walletAddress?.trim()
    const referralAddress = req.body.referralAddress?.trim()
    const name = req.body.name?.trim()
    const username = req.body.username?.trim()
    const email = req.body.email?.trim()
    const confirmEmail = req.body.confirmEmail?.trim()
    const country = req.body.country?.trim()
    const phoneCountryCode = req.body.phoneCountryCode?.trim()
    const phoneNumber = req.body.phoneNumber?.trim()
    const password = typeof req.body.password === 'string' ? req.body.password.trim() : ''

    if (!name || !username || !email || !confirmEmail || !country || !phoneCountryCode || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, username, email, confirmEmail, country, phoneCountryCode, phoneNumber and password are required.',
      })
    }

    if (!isValidSignupEmail(email) || !isValidSignupEmail(confirmEmail)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' })
    }

    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      return res.status(400).json({ success: false, message: 'Email and confirm email must match.' })
    }

    if (!/^\+[0-9]{1,4}$/.test(phoneCountryCode) || !/^[0-9]{6,15}$/.test(phoneNumber)) {
      return res.status(400).json({ success: false, message: 'Enter a valid phone number with country code.' })
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' })
    }

    if (!referralAddress) {
      return res.status(400).json({ success: false, message: 'A valid referral address is required for registration.' })
    }

    const walletAddress = isValidWalletAddress(requestedWalletAddress)
      ? requestedWalletAddress
      : await generateUniqueInternalWalletAddress()

    const user = await registerUserWithReferral({
      walletAddress,
      smartWalletAddress,
      referralAddress,
      name,
      username,
      email,
      country,
      phoneCountryCode,
      phoneNumber,
      accountType: isValidWalletAddress(requestedWalletAddress) ? 'legacy_wallet' : 'phone_signup',
      passwordHash: hashPassword(password),
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
        phoneCountryCode: user.phoneCountryCode || '',
        phoneNumber: user.phoneNumber || '',
        accountType: user.accountType || 'phone_signup',
        mainBalance: user.mainBalance ?? 0,
        referralBalance: user.referralBalance ?? 0,
        claimedBalance: user.claimedBalance ?? 0,
        claimReferralBalance: user.claimReferralBalance ?? 0,
        referredBy: user.referredBy,
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function loginWithWalletPassword(req, res, next) {
  try {
    const identifier = normalizeLoginIdentifier(req.body.identifier ?? req.body.walletAddress)
    const password = req.body.password?.trim()

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'identifier and password are required.' })
    }

    const user = isValidWalletAddress(identifier)
      ? await findRegisteredUser(identifier)
      : await User.findOne({ email: identifier.toLowerCase(), isRegistered: true })

    if (!user) {
      return res.status(404).json({ success: false, message: 'This account is not registered yet. Complete sign up first.' })
    }

    if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ success: false, message: 'Invalid email or wallet password.' })
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
      return res.status(400).json({ success: false, message: 'walletAddress and password are required.' })
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' })
    }

    const user = await findRegisteredUser(walletAddress)
    if (!user) {
      return res.status(404).json({ success: false, message: 'This wallet is not registered yet. Complete sign up first.' })
    }

    if (user.passwordHash) {
      return res.status(409).json({ success: false, message: 'Password is already set for this wallet.' })
    }

    user.passwordHash = hashPassword(password)
    await user.save()

    res.json({ success: true, data: { walletAddress: user.walletAddress, hasPassword: true } })
  } catch (error) {
    next(error)
  }
}

export async function getTeam(req, res, next) {
  try {
    const walletAddress = req.query.wallet?.trim()

    if (!walletAddress) {
      return res.status(400).json({ success: false, message: 'wallet query parameter is required.' })
    }

    const user = await findRegisteredUser(walletAddress)
    if (!user) {
      return res.status(404).json({ success: false, message: 'Registered user not found.' })
    }

    res.json({ success: true, data: await buildBinaryTreeResponse(user) })
  } catch (error) {
    next(error)
  }
}
