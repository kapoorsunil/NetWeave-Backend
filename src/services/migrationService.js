import { createEmptyDownlineLevels, TEAM_LEVELS } from '../constants/team.js'
import { env } from '../config/env.js'
import { User } from '../models/User.js'
import { backfillMissingRegistrationRewards } from './userService.js'

function normalizeWallet(walletAddress) {
  return walletAddress?.toLowerCase().trim()
}

function getPlacementSideForReferralCount(referralCount) {
  return referralCount % 2 === 0 ? 'left' : 'right'
}

function findPlacementSlot(rootWalletAddress, userByWallet) {
  const rootUser = userByWallet.get(normalizeWallet(rootWalletAddress))

  if (!rootUser) {
    throw new Error(`Root user not found for wallet ${rootWalletAddress}.`)
  }

  const preferredSide = getPlacementSideForReferralCount(rootUser._migrationReferralCount || 0)
  const preferredChildField = preferredSide === 'left' ? 'treeLeftChild' : 'treeRightChild'

  if (!rootUser[preferredChildField]) {
    return {
      parentWalletAddress: rootUser.walletAddress,
      side: preferredSide,
    }
  }

  const queue = [rootUser[preferredChildField]]

  while (queue.length) {
    const currentWallet = queue.shift()
    const currentNode = userByWallet.get(normalizeWallet(currentWallet))

    if (!currentNode) {
      continue
    }

    if (!currentNode.treeLeftChild) {
      return {
        parentWalletAddress: currentNode.walletAddress,
        side: 'left',
      }
    }

    if (!currentNode.treeRightChild) {
      return {
        parentWalletAddress: currentNode.walletAddress,
        side: 'right',
      }
    }

    queue.push(currentNode.treeLeftChild, currentNode.treeRightChild)
  }

  throw new Error(`Unable to determine binary placement for ${rootWalletAddress}.`)
}

function buildExpandedDownlineLevels(existingLevels = []) {
  const nextLevels = createEmptyDownlineLevels()

  return nextLevels.map((levelData, index) => {
    const existingLevel = existingLevels[index]

    if (!existingLevel) {
      return levelData
    }

    return {
      level: index + 1,
      members: Array.isArray(existingLevel.members) ? existingLevel.members : [],
    }
  })
}

export async function migrateDownlineLevelsToCurrentDepth() {
  const users = await User.find(
    {
      $or: [
        { downlineLevels: { $exists: false } },
        { [`downlineLevels.${TEAM_LEVELS - 1}`]: { $exists: false } },
      ],
    },
    {
      _id: 1,
      downlineLevels: 1,
    },
  )

  if (!users.length) {
    return { matched: 0, modified: 0 }
  }

  const operations = users.map((user) => ({
    updateOne: {
      filter: { _id: user._id },
      update: {
        $set: {
          downlineLevels: buildExpandedDownlineLevels(user.downlineLevels),
        },
      },
    },
  }))

  const result = await User.bulkWrite(operations)

  return {
    matched: users.length,
    modified: result.modifiedCount,
  }
}

async function computeBinaryReferralTreeRebuild() {
  const users = await User.find({ isRegistered: true }).sort({ createdAt: 1, walletAddress: 1 })

  if (!users.length) {
    return {
      total: 0,
      modified: 0,
      changes: [],
    }
  }

  const userByWallet = new Map(
    users.map((user) => [
      normalizeWallet(user.walletAddress),
      {
        _id: user._id,
        walletAddress: user.walletAddress,
        referredBy: user.referredBy,
        treeParent: null,
        treeLeftChild: null,
        treeRightChild: null,
        placementSide: null,
        _migrationReferralCount: 0,
      },
    ]),
  )

  for (const user of users) {
    if (!user.referredBy) {
      continue
    }

    const sponsor = userByWallet.get(normalizeWallet(user.referredBy))
    const currentUser = userByWallet.get(normalizeWallet(user.walletAddress))

    if (!sponsor || !currentUser) {
      continue
    }

    const placement = findPlacementSlot(sponsor.walletAddress, userByWallet)
    const parent = userByWallet.get(normalizeWallet(placement.parentWalletAddress))

    currentUser.treeParent = placement.parentWalletAddress
    currentUser.placementSide = placement.side

    if (placement.side === 'left') {
      parent.treeLeftChild = currentUser.walletAddress
    } else {
      parent.treeRightChild = currentUser.walletAddress
    }

    sponsor._migrationReferralCount += 1
  }

  const changes = users
    .map((user) => {
      const rebuiltUser = userByWallet.get(normalizeWallet(user.walletAddress))

      if (!rebuiltUser) {
        return null
      }

      const current = {
        treeParent: user.treeParent || null,
        treeLeftChild: user.treeLeftChild || null,
        treeRightChild: user.treeRightChild || null,
        placementSide: user.placementSide || null,
      }

      const next = {
        treeParent: rebuiltUser.treeParent,
        treeLeftChild: rebuiltUser.treeLeftChild,
        treeRightChild: rebuiltUser.treeRightChild,
        placementSide: rebuiltUser.placementSide,
      }

      const hasChanged =
        current.treeParent !== next.treeParent ||
        current.treeLeftChild !== next.treeLeftChild ||
        current.treeRightChild !== next.treeRightChild ||
        current.placementSide !== next.placementSide

      if (!hasChanged) {
        return null
      }

      return {
        walletAddress: user.walletAddress,
        current,
        next,
      }
    })
    .filter(Boolean)

  const operations = Array.from(userByWallet.values()).map((user) => ({
    updateOne: {
      filter: { _id: user._id },
      update: {
        $set: {
          treeParent: user.treeParent,
          treeLeftChild: user.treeLeftChild,
          treeRightChild: user.treeRightChild,
          placementSide: user.placementSide,
        },
      },
    },
  }))

  return {
    total: users.length,
    modified: changes.length,
    changes,
    operations,
  }
}

export async function rebuildBinaryReferralTree(options = {}) {
  const { apply = true } = options
  const rebuildPlan = await computeBinaryReferralTreeRebuild()

  if (!apply || !rebuildPlan.operations?.length) {
    return rebuildPlan
  }

  const result = await User.bulkWrite(rebuildPlan.operations)

  return {
    total: rebuildPlan.total,
    modified: result.modifiedCount,
    changes: rebuildPlan.changes,
  }
}

function createDummyWallet(index) {
  return `0x${index.toString(16).padStart(40, '0')}`
}

const fixedSeedWallets = {
  '1-left': '0x8479Ec17E4ee77b9d174348f665460859B8F4f14',
}

function createDummyProfile(level, position, walletAddress) {
  const shortId = `${level}-${position}`
  return {
    walletAddress,
    username: `dummy${shortId}`.toLowerCase(),
    name: `Dummy ${shortId}`,
    email: `dummy${shortId.replace('-', '')}@netweave.local`,
    country: 'Dummy',
  }
}

export async function seedAdminTreeToLevelFour() {
  const admin = await User.findOneAndUpdate(
    { walletAddress: env.adminWalletAddress },
    {
      $set: {
        walletAddress: env.adminWalletAddress,
        isAdmin: true,
        isRegistered: true,
        registrationPaymentDone: true,
        referredBy: null,
        ancestors: [],
        treeParent: null,
        treeLeftChild: null,
        treeRightChild: null,
        placementSide: null,
        downlineLevels: createEmptyDownlineLevels(),
        directReferrals: [],
        mainBalance: 0,
        referralBalance: 0,
        adminGasSendCount: 0,
        userCryptoTransferCount: 0,
      },
    },
    {
      upsert: true,
      new: true,
    },
  )

  await User.deleteMany({
    walletAddress: { $ne: admin.walletAddress },
  })

  const createdUsers = []
  const parentQueue = [
    {
      walletAddress: admin.walletAddress,
      ancestors: [],
      depth: 0,
    },
  ]
  let walletIndex = 1

  while (parentQueue.length) {
    const currentParent = parentQueue.shift()

    if (currentParent.depth >= 4) {
      continue
    }

    for (const side of ['left', 'right']) {
      const childDepth = currentParent.depth + 1
      const positionAtLevel = createdUsers.filter((user) => user.depth === childDepth).length + 1
      const fixedWalletKey = `${childDepth}-${side}`
      const walletAddress = fixedSeedWallets[fixedWalletKey] || createDummyWallet(walletIndex)

      if (!fixedSeedWallets[fixedWalletKey]) {
        walletIndex += 1
      }

      const profile = createDummyProfile(childDepth, positionAtLevel, walletAddress)
      const ancestors = [currentParent.walletAddress, ...currentParent.ancestors].slice(0, TEAM_LEVELS)

      createdUsers.push({
        depth: childDepth,
        walletAddress,
        treeParent: currentParent.walletAddress,
        placementSide: side,
        referredBy: currentParent.walletAddress,
        ancestors,
        ...profile,
      })

      parentQueue.push({
        walletAddress,
        ancestors,
        depth: childDepth,
      })
    }
  }

  if (createdUsers.length) {
    await User.insertMany(
      createdUsers.map((user) => ({
        walletAddress: user.walletAddress,
        isRegistered: true,
        registrationPaymentDone: true,
        isAdmin: false,
        username: user.username,
        name: user.name,
        email: user.email,
        country: user.country,
        mainBalance: 0,
        referralBalance: 0,
        referredBy: user.referredBy,
        ancestors: user.ancestors,
        directReferrals: [],
        treeParent: user.treeParent,
        treeLeftChild: null,
        treeRightChild: null,
        placementSide: user.placementSide,
        downlineLevels: createEmptyDownlineLevels(),
        adminGasSendCount: 0,
        userCryptoTransferCount: 0,
      })),
    )
  }

  const childrenByParent = new Map()
  for (const user of createdUsers) {
    const normalizedParent = normalizeWallet(user.treeParent)
    const currentChildren = childrenByParent.get(normalizedParent) || {}
    currentChildren[user.placementSide] = user.walletAddress
    childrenByParent.set(normalizedParent, currentChildren)
  }

  const usersByWallet = new Map([
    [normalizeWallet(admin.walletAddress), admin],
    ...createdUsers.map((user) => [normalizeWallet(user.walletAddress), user]),
  ])

  const updateOperations = Array.from(usersByWallet.values()).map((user) => {
    const childSet = childrenByParent.get(normalizeWallet(user.walletAddress)) || {}
    const directReferrals = [childSet.left, childSet.right].filter(Boolean)

    return {
      updateOne: {
        filter: { walletAddress: user.walletAddress },
        update: {
          $set: {
            treeLeftChild: childSet.left || null,
            treeRightChild: childSet.right || null,
            directReferrals,
          },
        },
      },
    }
  })

  if (updateOperations.length) {
    await User.bulkWrite(updateOperations)
  }

  return {
    rootWallet: admin.walletAddress,
    seededLevels: 4,
    seededUsers: createdUsers.length,
    nextSignupStartsAtLevel: 5,
  }
}

export async function migrateMissingRegistrationRewards() {
  return backfillMissingRegistrationRewards()
}
