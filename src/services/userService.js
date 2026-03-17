import { TEAM_LEVELS, createEmptyDownlineLevels } from '../constants/team.js'
import { env } from '../config/env.js'
import { WithdrawRequest } from '../models/WithdrawRequest.js'
import { User } from '../models/User.js'

function normalizeWallet(walletAddress) {
  return walletAddress?.toLowerCase().trim()
}

const walletCollation = { locale: 'en', strength: 2 }

function toCurrencyUnits(value) {
  return Math.round(Number(value || 0) * 100)
}

function fromCurrencyUnits(value) {
  return Number((Number(value || 0) / 100).toFixed(2))
}

function getReferralRewardPercent(level) {
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

function formatRewardPercent(level) {
  return `${getReferralRewardPercent(level)}%`
}

function getPlacementSideForReferralCount(referralCount) {
  return referralCount % 2 === 0 ? 'left' : 'right'
}

function getDisplayLabel(user) {
  return user.username || user.name || `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
}

async function findPlacementSlot(referrer) {
  const preferredSide = getPlacementSideForReferralCount(referrer.directReferrals.length)
  const preferredChildField = preferredSide === 'left' ? 'treeLeftChild' : 'treeRightChild'

  if (!referrer[preferredChildField]) {
    return {
      side: preferredSide,
      parentWalletAddress: referrer.walletAddress,
    }
  }

  const queue = [referrer[preferredChildField]]

  while (queue.length) {
    const batch = queue.splice(0, queue.length)
    const nodes = await User.find({ walletAddress: { $in: batch } }).collation(walletCollation)
    const nodeMap = new Map(nodes.map((node) => [normalizeWallet(node.walletAddress), node]))

    for (const wallet of batch) {
      const currentNode = nodeMap.get(normalizeWallet(wallet))
      if (!currentNode) {
        continue
      }

      if (!currentNode.treeLeftChild) {
        return {
          side: 'left',
          parentWalletAddress: currentNode.walletAddress,
        }
      }

      if (!currentNode.treeRightChild) {
        return {
          side: 'right',
          parentWalletAddress: currentNode.walletAddress,
        }
      }

      queue.push(currentNode.treeLeftChild, currentNode.treeRightChild)
    }
  }

  throw new Error('Unable to determine referral tree placement.')
}

function createTreeNode(user, rootWalletAddress, nodeMap) {
  if (!user) {
    return null
  }

  const normalizedRootWallet = normalizeWallet(rootWalletAddress)
  const normalizedParentWallet = normalizeWallet(user.referredBy)
  const leftChild = user.treeLeftChild ? nodeMap.get(normalizeWallet(user.treeLeftChild)) : null
  const rightChild = user.treeRightChild ? nodeMap.get(normalizeWallet(user.treeRightChild)) : null

  return {
    walletAddress: user.walletAddress,
    label: getDisplayLabel(user),
    username: user.username || '',
    name: user.name || '',
    placementSide: user.placementSide || null,
    isRoot: normalizeWallet(user.walletAddress) === normalizedRootWallet,
    isDirectForRoot:
      normalizeWallet(user.walletAddress) !== normalizedRootWallet && normalizedParentWallet === normalizedRootWallet,
    left: createTreeNode(leftChild, rootWalletAddress, nodeMap),
    right: createTreeNode(rightChild, rootWalletAddress, nodeMap),
  }
}

async function getPlacementSubtreeUsers(rootUser) {
  const descendants = []
  const queue = [rootUser]
  const visited = new Set([normalizeWallet(rootUser.walletAddress)])

  while (queue.length) {
    const currentBatch = queue.splice(0, queue.length)
    const nextWallets = []

    for (const currentUser of currentBatch) {
      for (const childWallet of [currentUser.treeLeftChild, currentUser.treeRightChild]) {
        const normalizedChildWallet = normalizeWallet(childWallet)
        if (normalizedChildWallet && !visited.has(normalizedChildWallet)) {
          visited.add(normalizedChildWallet)
          nextWallets.push(childWallet)
        }
      }
    }

    if (!nextWallets.length) {
      continue
    }

    const nextUsers = await User.find({
      walletAddress: { $in: nextWallets },
      isRegistered: true,
    }).collation(walletCollation)

    descendants.push(...nextUsers)
    queue.push(...nextUsers)
  }

  return descendants
}

function countTreeDepth(node) {
  if (!node) {
    return 0
  }

  return 1 + Math.max(countTreeDepth(node.left), countTreeDepth(node.right))
}

export async function ensureAdminUser() {
  const walletAddress = env.adminWalletAddress

  return User.findOneAndUpdate(
    { walletAddress },
    {
      $set: {
        walletAddress,
        isAdmin: true,
        isRegistered: true,
        registrationPaymentDone: true,
        referredBy: null,
      },
      $setOnInsert: {
        mainBalance: 0,
        referralBalance: 0,
        ancestors: [],
        directReferrals: [],
        treeParent: null,
        treeLeftChild: null,
        treeRightChild: null,
        placementSide: null,
        downlineLevels: createEmptyDownlineLevels(),
        adminGasSendCount: 0,
        userCryptoTransferCount: 0,
      },
    },
    {
      upsert: true,
      new: true,
      collation: walletCollation,
    },
  ).collation(walletCollation)
}

export async function findRegisteredUser(walletAddress) {
  return User.findOne({
    walletAddress: walletAddress?.trim(),
    isRegistered: true,
  }).collation(walletCollation)
}

export async function getUserByWallet(walletAddress) {
  return User.findOne({
    walletAddress: walletAddress?.trim(),
  }).collation(walletCollation)
}

export async function requireExistingUser(walletAddress) {
  const user = await getUserByWallet(walletAddress)

  if (!user) {
    throw new Error('User not found.')
  }

  return user
}

function isSeedOrSystemUser(user) {
  const username = user?.username?.toLowerCase() || ''
  const email = user?.email?.toLowerCase() || ''
  const country = user?.country?.toLowerCase() || ''

  return user?.isAdmin || username.startsWith('dummy') || email.endsWith('@netweave.local') || country === 'dummy'
}

async function buildRegistrationRewardChain(user) {
  const directReferrer = user.referredBy || null
  const placementPathFromDirect = []
  const visited = new Set([normalizeWallet(user.walletAddress)])
  let currentParentWallet = user.treeParent

  while (currentParentWallet) {
    const normalizedParentWallet = normalizeWallet(currentParentWallet)

    if (
      normalizedParentWallet &&
      normalizedParentWallet !== normalizeWallet(directReferrer) &&
      !visited.has(normalizedParentWallet)
    ) {
      placementPathFromDirect.push(currentParentWallet)
      visited.add(normalizedParentWallet)
    }

    const parentUser = await User.findOne({ walletAddress: currentParentWallet }).collation(walletCollation)
    if (!parentUser || normalizeWallet(parentUser.walletAddress) === normalizeWallet(directReferrer)) {
      break
    }

    currentParentWallet = parentUser.treeParent || null
  }

  return {
    directReferrer,
    levels: placementPathFromDirect.reverse().slice(0, TEAM_LEVELS),
  }
}

async function distributeRegistrationReferralRewards(user, registrationAmount) {
  const rewardChain = await buildRegistrationRewardChain(user)
  const baseAmountUnits = toCurrencyUnits(registrationAmount)
  const appliedRewards = []

  if (rewardChain.directReferrer) {
    const directRewardUnits = Math.round((baseAmountUnits * 20) / 100)

    if (directRewardUnits > 0) {
      const directRewardAmount = fromCurrencyUnits(directRewardUnits)
      const updatedDirectUser = await User.findOneAndUpdate(
        { walletAddress: rewardChain.directReferrer.trim() },
        {
          $inc: {
            referralBalance: directRewardAmount,
          },
        },
        {
          new: true,
          collation: walletCollation,
        },
      ).collation(walletCollation)

      if (!updatedDirectUser) {
        throw new Error('Failed to distribute direct referral reward.')
      }

      appliedRewards.push({
        walletAddress: updatedDirectUser.walletAddress,
        level: 'direct',
        amount: directRewardAmount,
      })
    }
  }

  for (const [index, walletAddress] of rewardChain.levels.entries()) {
    const level = index + 1
    const rewardPercent = getReferralRewardPercent(level)
    const rewardUnits = Math.round((baseAmountUnits * rewardPercent) / 100)

    if (rewardUnits <= 0) {
      continue
    }

    const creditedAmount = fromCurrencyUnits(rewardUnits)
    const updatedUser = await User.findOneAndUpdate(
      { walletAddress: walletAddress?.trim() },
      {
        $inc: {
          referralBalance: creditedAmount,
        },
      },
      {
        new: true,
        collation: walletCollation,
      },
    ).collation(walletCollation)

    if (!updatedUser) {
      throw new Error(`Failed to distribute referral reward for level ${level}.`)
    }

    appliedRewards.push({
      walletAddress: updatedUser.walletAddress,
      level,
      amount: creditedAmount,
    })
  }

  return appliedRewards
}

async function markRegistrationRewardsDistributed(walletAddress) {
  return User.findOneAndUpdate(
    { walletAddress: walletAddress?.trim() },
    {
      $set: {
        registrationRewardsDistributed: true,
      },
    },
    {
      new: true,
      collation: walletCollation,
    },
  ).collation(walletCollation)
}

export async function registerUserWithReferral({
  walletAddress,
  smartWalletAddress,
  referralAddress,
  name,
  username,
  email,
  country,
  passwordHash,
  txHash,
}) {
  const normalizedWallet = normalizeWallet(walletAddress)
  const normalizedSmartWallet = normalizeWallet(smartWalletAddress)
  const normalizedName = name?.trim()
  const normalizedUsername = username?.trim()
  const normalizedEmail = email?.trim().toLowerCase()
  const normalizedCountry = country?.trim()

  if (!normalizedWallet) {
    throw new Error('Wallet address is required.')
  }

  if (normalizedWallet === normalizeWallet(env.adminWalletAddress)) {
    return ensureAdminUser()
  }

  const existingUser = await User.findOne({ walletAddress: walletAddress?.trim() }).collation(walletCollation)
  if (existingUser?.isRegistered) {
    throw new Error('User is already registered.')
  }

  if (normalizedUsername) {
    const existingUsername = await User.findOne({
      username: normalizedUsername.toLowerCase(),
      walletAddress: { $ne: walletAddress?.trim() },
    })

    if (existingUsername) {
      throw new Error('Username is already taken.')
    }
  }

  if (normalizedEmail) {
    const existingEmail = await User.findOne({
      email: normalizedEmail,
      walletAddress: { $ne: walletAddress?.trim() },
    })

    if (existingEmail) {
      throw new Error('Email is already taken.')
    }
  }

  const referrer = await User.findOne({
    walletAddress: referralAddress?.trim(),
    isRegistered: true,
  }).collation(walletCollation)

  if (!referrer) {
    throw new Error('Valid registered referral address is required.')
  }

  const ancestors = [referrer.walletAddress, ...referrer.ancestors].slice(0, TEAM_LEVELS)
  const placement = await findPlacementSlot(referrer)
  const updateSet = {
    walletAddress,
    isRegistered: true,
    registrationPaymentDone: false,
    isAdmin: false,
    referredBy: referrer.walletAddress,
    ancestors,
    treeParent: placement.parentWalletAddress,
    placementSide: placement.side,
    name: normalizedName || undefined,
    username: normalizedUsername?.toLowerCase() || undefined,
    email: normalizedEmail || undefined,
    country: normalizedCountry || undefined,
    passwordHash: passwordHash || undefined,
  }

  if (normalizedSmartWallet) {
    updateSet.smartWalletAddress = smartWalletAddress
  }

  if (txHash) {
    updateSet.registrationTxHash = txHash
  }

  const user = await User.findOneAndUpdate(
    { walletAddress: walletAddress?.trim() },
    {
      $set: updateSet,
      $setOnInsert: {
        mainBalance: 0,
        referralBalance: 0,
        treeLeftChild: null,
        treeRightChild: null,
        downlineLevels: createEmptyDownlineLevels(),
        directReferrals: [],
        adminGasSendCount: 0,
        userCryptoTransferCount: 0,
      },
    },
    {
      upsert: true,
      new: true,
      collation: walletCollation,
    },
  ).collation(walletCollation)

  await User.updateOne(
    { walletAddress: referrer.walletAddress },
    {
      $addToSet: {
        directReferrals: walletAddress,
      },
    },
    { collation: walletCollation },
  )

  await User.updateOne(
    { walletAddress: placement.parentWalletAddress },
    {
      $set: {
        [placement.side === 'left' ? 'treeLeftChild' : 'treeRightChild']: walletAddress,
      },
    },
    { collation: walletCollation },
  )

  await Promise.all(
    ancestors.map((ancestorWallet, index) =>
      User.updateOne(
        { walletAddress: ancestorWallet },
        {
          $addToSet: {
            [`downlineLevels.${index}.members`]: walletAddress,
          },
        },
        { collation: walletCollation },
      ),
    ),
  )

  return user
}

export function buildTeamResponse(user) {
  const levels = Array.from({ length: TEAM_LEVELS }, (_, index) => {
    const levelData = user.downlineLevels[index] || { members: [] }
    return {
      level: index + 1,
      rewardPercent: formatRewardPercent(index + 1),
      membersCount: levelData.members.length,
      members: levelData.members,
    }
  })

  return {
    walletAddress: user.walletAddress,
    smartWalletAddress: user.smartWalletAddress || null,
    registrationPaymentDone: user.registrationPaymentDone ?? false,
    mainBalance: user.mainBalance ?? 0,
    referralBalance: user.referralBalance ?? 0,
    name: user.name || '',
    username: user.username || '',
    email: user.email || '',
    country: user.country || '',
    referralLink: `${env.frontendUrl}/?referral=${user.walletAddress}`,
    totalTeamMembers: levels.reduce((sum, item) => sum + item.membersCount, 0),
    activeLevels: levels.filter((item) => item.membersCount > 0).length,
    maxLevels: TEAM_LEVELS,
    levels,
  }
}

export async function getLatestWithdrawRequest(walletAddress) {
  if (!walletAddress) {
    return null
  }

  return WithdrawRequest.findOne({ walletAddress: walletAddress?.trim() }).sort({ createdAt: -1 })
}

export async function buildBinaryTreeResponse(user) {
  const descendants = await getPlacementSubtreeUsers(user)
  const treeUsers = [user, ...descendants]
  const nodeMap = new Map(treeUsers.map((member) => [normalizeWallet(member.walletAddress), member]))
  const tree = createTreeNode(user, user.walletAddress, nodeMap)
  const directReferralCount = descendants.filter(
    (member) => normalizeWallet(member.referredBy) === normalizeWallet(user.walletAddress),
  ).length
  const activeLevels = Math.max(countTreeDepth(tree) - 1, 0)
  const baseResponse = buildTeamResponse(user)

  return {
    ...baseResponse,
    totalTeamMembers: descendants.length,
    directReferralCount,
    activeLevels,
    tree,
  }
}

export async function markGasPrefundSent(walletAddress) {
  return User.findOneAndUpdate(
    { walletAddress: walletAddress?.trim() },
    {
      $set: { lastGasPrefundAt: new Date() },
      $inc: { adminGasSendCount: 1 },
    },
    {
      new: true,
      collation: walletCollation,
    },
  ).collation(walletCollation)
}

export async function creditUserMainBalance(walletAddress, amount) {
  return creditUserMainBalanceWithOptions(walletAddress, amount)
}

export async function creditUserMainBalanceWithOptions(walletAddress, amount, options = {}) {
  const shouldCountCryptoTransfer = Boolean(options.countCryptoTransfer)
  const user = await User.findOneAndUpdate(
    { walletAddress: walletAddress?.trim() },
    {
      $inc: {
        mainBalance: amount,
        ...(shouldCountCryptoTransfer ? { userCryptoTransferCount: 1 } : {}),
      },
    },
    {
      new: true,
      collation: walletCollation,
    },
  ).collation(walletCollation)

  if (!user) {
    throw new Error('User not found.')
  }

  return user
}

export async function consumeRegistrationBalance(walletAddress) {
  const user = await User.findOne({
    walletAddress: walletAddress?.trim(),
  }).collation(walletCollation)

  if (!user) {
    throw new Error('User not found.')
  }

  if (!user.isRegistered) {
    throw new Error('User must complete sign up first.')
  }

  if (user.registrationPaymentDone) {
    throw new Error('Registration payment is already completed.')
  }

  const registrationAmount = Number(env.registrationAmount)
  const registrationAmountUnits = toCurrencyUnits(registrationAmount)
  const currentBalanceUnits = toCurrencyUnits(user.mainBalance ?? 0)

  if (currentBalanceUnits < registrationAmountUnits) {
    throw new Error('Insufficient main balance for registration payment.')
  }

  let updatedUser = await User.findOneAndUpdate(
    {
      walletAddress: walletAddress?.trim(),
      registrationPaymentDone: false,
    },
    {
      $inc: {
        mainBalance: -registrationAmount,
      },
      $set: {
        registrationPaymentDone: true,
      },
    },
    {
      new: true,
      collation: walletCollation,
    },
  ).collation(walletCollation)

  if (!updatedUser) {
    throw new Error('Unable to complete registration payment.')
  }

  if (toCurrencyUnits(updatedUser.mainBalance ?? 0) < 0) {
    await User.updateOne(
      { walletAddress: walletAddress?.trim() },
      {
        $inc: {
          mainBalance: registrationAmount,
        },
        $set: {
          registrationPaymentDone: false,
        },
      },
      { collation: walletCollation },
    )
    throw new Error('Insufficient main balance for registration payment.')
  }

  let appliedRewards = []

  try {
    appliedRewards = await distributeRegistrationReferralRewards(updatedUser, registrationAmount)
    updatedUser = await markRegistrationRewardsDistributed(walletAddress)
  } catch (error) {
    await User.updateOne(
      { walletAddress: walletAddress?.trim() },
      {
        $inc: {
          mainBalance: registrationAmount,
        },
        $set: {
          registrationPaymentDone: false,
          registrationRewardsDistributed: false,
        },
      },
      { collation: walletCollation },
    )

    if (appliedRewards.length) {
      await Promise.all(
        appliedRewards.map((reward) =>
          User.updateOne(
            { walletAddress: reward.walletAddress },
            {
              $inc: {
                referralBalance: -reward.amount,
              },
            },
            { collation: walletCollation },
          ),
        ),
      )
    }

    throw error
  }

  return updatedUser
}

export async function backfillMissingRegistrationRewards() {
  const users = await User.find({
    isRegistered: true,
    registrationPaymentDone: true,
    $or: [
      { registrationRewardsDistributed: { $exists: false } },
      { registrationRewardsDistributed: false },
    ],
  }).collation(walletCollation)

  let processed = 0
  let rewarded = 0
  let skipped = 0

  for (const user of users) {
    processed += 1

    if (isSeedOrSystemUser(user)) {
      await markRegistrationRewardsDistributed(user.walletAddress)
      skipped += 1
      continue
    }

    await distributeRegistrationReferralRewards(user, Number(env.registrationAmount))
    await markRegistrationRewardsDistributed(user.walletAddress)
    rewarded += 1
  }

  return {
    processed,
    rewarded,
    skipped,
  }
}
