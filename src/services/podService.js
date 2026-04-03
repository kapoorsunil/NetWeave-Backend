import mongoose from 'mongoose'
import { PodCycle } from '../models/PodCycle.js'
import { PodPurchase } from '../models/PodPurchase.js'
import { User } from '../models/User.js'
import { ClaimRecord } from '../models/ClaimRecord.js'
import { ClaimLevelReward } from '../models/ClaimLevelReward.js'
import { distributeClaimProfit } from './userService.js'

const walletCollation = { locale: 'en', strength: 2 }
const POD_LAUNCH_AT = new Date('2026-03-28T13:00:00Z')
const POD_PRICE_USD = 10
const POD_INITIAL_TOTAL = 30
const POD_PURCHASE_OPTIONS_USD = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150]
const EPOCHS_PER_BLOCK = 4
const DAY_MS = 24 * 60 * 60 * 1000
const POD_BUY_WINDOW_MS = 4 * 60 * 60 * 1000

function normalizeWallet(walletAddress) {
  return walletAddress?.toLowerCase().trim()
}

function toCurrencyUnits(value) {
  return Math.round(Number(value || 0) * 100)
}

function fromCurrencyUnits(value) {
  return Number((Number(value || 0) / 100).toFixed(2))
}

function getEpochDurationDays(blockNumber) {
  return 6 + (blockNumber - 1) * 2
}

function getGlobalEpochNumber(blockNumber, epochNumber) {
  return (blockNumber - 1) * EPOCHS_PER_BLOCK + epochNumber
}

function getTotalPodsForEpoch(globalEpochNumber) {
  return Math.round(POD_INITIAL_TOTAL * (1.3 ** (globalEpochNumber - 1)))
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS)
}

function addMilliseconds(date, milliseconds) {
  return new Date(date.getTime() + milliseconds)
}

function computeCycleMetaForDayOffset(dayOffset) {
  let remainingDays = dayOffset
  let blockNumber = 1

  while (true) {
    const epochDurationDays = getEpochDurationDays(blockNumber)
    const blockDays = epochDurationDays * EPOCHS_PER_BLOCK

    if (remainingDays < blockDays) {
      const epochNumber = Math.floor(remainingDays / epochDurationDays) + 1
      const dayNumber = (remainingDays % epochDurationDays) + 1
      const cycleIndex = dayOffset + 1
      const globalEpochNumber = getGlobalEpochNumber(blockNumber, epochNumber)
      const opensAt = addDays(POD_LAUNCH_AT, dayOffset)
      const closesAt = addMilliseconds(opensAt, POD_BUY_WINDOW_MS)

      return {
        cycleKey: `b${blockNumber}-e${epochNumber}-d${dayNumber}`,
        cycleIndex,
        blockNumber,
        epochNumber,
        dayNumber,
        epochDurationDays,
        globalEpochNumber,
        totalPods: getTotalPodsForEpoch(globalEpochNumber),
        opensAt,
        closesAt,
      }
    }

    remainingDays -= blockDays
    blockNumber += 1
  }
}

export function getCurrentOrUpcomingCycleMeta(now = new Date()) {
  if (now.getTime() < POD_LAUNCH_AT.getTime()) {
    const firstCycle = computeCycleMetaForDayOffset(0)
    return {
      phase: 'prelaunch',
      serverNow: now,
      activeMeta: null,
      displayMeta: firstCycle,
      nextMeta: firstCycle,
    }
  }

  const dayOffset = Math.floor((now.getTime() - POD_LAUNCH_AT.getTime()) / DAY_MS)
  const currentDayMeta = computeCycleMetaForDayOffset(dayOffset)

  if (now.getTime() < currentDayMeta.closesAt.getTime()) {
    const nextMeta = computeCycleMetaForDayOffset(dayOffset + 1)

    return {
      phase: 'active',
      serverNow: now,
      activeMeta: currentDayMeta,
      displayMeta: currentDayMeta,
      nextMeta,
    }
  }

  const upcomingMeta = computeCycleMetaForDayOffset(dayOffset + 1)

  return {
    phase: 'closed_waiting',
    serverNow: now,
    activeMeta: null,
    displayMeta: upcomingMeta,
    nextMeta: upcomingMeta,
  }
}

export async function getEffectiveCycleIndex() {
  const now = new Date()
  const cycleState = getCurrentOrUpcomingCycleMeta(now)

  if (cycleState.phase === 'prelaunch') {
    return 0
  }

  if (cycleState.phase === 'closed_waiting') {
    return cycleState.displayMeta.cycleIndex
  }

  // If active, we MUST check for sell-out status in the DB
  const activeCycle = await PodCycle.findOne({ cycleKey: cycleState.activeMeta.cycleKey }).lean()

  if (activeCycle && activeCycle.availablePods <= 0) {
    return cycleState.nextMeta.cycleIndex
  }

  return cycleState.activeMeta.cycleIndex
}

async function findOrCreateCycleRecord(meta, session) {
  let cycle = await PodCycle.findOne({ cycleKey: meta.cycleKey }).session(session || null)
  if (cycle) {
    const opensAtChanged = new Date(cycle.opensAt).getTime() !== new Date(meta.opensAt).getTime()
    const closesAtChanged = new Date(cycle.closesAt).getTime() !== new Date(meta.closesAt).getTime()

    if (opensAtChanged || closesAtChanged) {
      cycle.opensAt = meta.opensAt
      cycle.closesAt = meta.closesAt
      await cycle.save({ session })
    }

    return cycle
  }

  const [created] = await PodCycle.create(
    [
      {
        cycleKey: meta.cycleKey,
        cycleIndex: meta.cycleIndex,
        blockNumber: meta.blockNumber,
        epochNumber: meta.epochNumber,
        dayNumber: meta.dayNumber,
        epochDurationDays: meta.epochDurationDays,
        totalPods: meta.totalPods,
        availablePods: meta.totalPods,
        opensAt: meta.opensAt,
        closesAt: meta.closesAt,
      },
    ],
    session ? { session } : undefined,
  )

  return created
}

function formatCycleResponse(meta, overrides = {}) {
  return {
    cycleKey: meta.cycleKey,
    cycleIndex: meta.cycleIndex,
    blockNumber: meta.blockNumber,
    epochNumber: meta.epochNumber,
    dayNumber: meta.dayNumber,
    epochDurationDays: meta.epochDurationDays,
    totalPods: overrides.totalPods ?? meta.totalPods,
    availablePods: overrides.availablePods ?? meta.totalPods,
    opensAt: meta.opensAt,
    closesAt: meta.closesAt,
    labels: {
      block: `b${meta.blockNumber}`,
      epoch: `e${meta.epochNumber}`,
      day: `d${meta.dayNumber}`,
    },
  }
}

export async function getPodStatus(walletAddress) {
  const now = new Date()
  const cycleState = getCurrentOrUpcomingCycleMeta(now)

  if (cycleState.phase === 'prelaunch') {
    const displayCycle = formatCycleResponse(cycleState.displayMeta)
    return {
      phase: 'prelaunch',
      serverNow: now,
      buyEnabled: false,
      buyDisabledReason: 'Pods unlock at launch time.',
      countdownTarget: cycleState.displayMeta.opensAt,
      countdownLabel: 'Neural Pods will launch in',
      cycle: displayCycle,
      nextCycle: displayCycle,
      pricePerPodUsd: POD_PRICE_USD,
      purchaseOptionsUsd: POD_PURCHASE_OPTIONS_USD,
      userHasPurchased: false,
      userPurchase: null,
    }
  }

  if (cycleState.phase === 'closed_waiting') {
    const nextCycle = formatCycleResponse(cycleState.displayMeta)
    return {
      phase: 'closed_waiting',
      serverNow: now,
      buyEnabled: false,
      buyDisabledReason: 'The Neural Pod buying window will open when the next cycle begins.',
      countdownTarget: cycleState.displayMeta.opensAt,
      countdownLabel: 'Next cycle will start in',
      cycle: nextCycle,
      nextCycle,
      pricePerPodUsd: POD_PRICE_USD,
      purchaseOptionsUsd: POD_PURCHASE_OPTIONS_USD,
      userHasPurchased: false,
      userPurchase: null,
    }
  }

  const activeCycle = await findOrCreateCycleRecord(cycleState.activeMeta)
  const normalizedWallet = normalizeWallet(walletAddress)
  const userPurchase = normalizedWallet
    ? await PodPurchase.findOne({ walletAddress: walletAddress?.trim(), cycleKey: activeCycle.cycleKey }).collation(walletCollation)
    : null

  if (activeCycle.availablePods <= 0) {
    const nextCycle = formatCycleResponse(cycleState.nextMeta)
    return {
      phase: 'sold_out_waiting',
      serverNow: now,
      buyEnabled: false,
      buyDisabledReason: 'All Neural Pods for today are sold out.',
      countdownTarget: cycleState.nextMeta.opensAt,
      countdownLabel: 'Next cycle will start in',
      cycle: nextCycle,
      nextCycle,
      pricePerPodUsd: POD_PRICE_USD,
      purchaseOptionsUsd: POD_PURCHASE_OPTIONS_USD,
      userHasPurchased: false,
      userPurchase: null,
    }
  }

  const buyDisabledReason = userPurchase
    ? 'You already bought Neural Pods in this cycle.'
    : null

  return {
    phase: 'active',
    serverNow: now,
    buyEnabled: !userPurchase,
    buyDisabledReason,
    countdownTarget: activeCycle.closesAt,
    countdownLabel: 'Buy window closes in',
    cycle: formatCycleResponse(cycleState.activeMeta, {
      totalPods: activeCycle.totalPods,
      availablePods: activeCycle.availablePods,
    }),
    nextCycle: formatCycleResponse(cycleState.nextMeta),
    pricePerPodUsd: POD_PRICE_USD,
    purchaseOptionsUsd: POD_PURCHASE_OPTIONS_USD,
    userHasPurchased: Boolean(userPurchase),
    userPurchase: userPurchase
      ? {
          amountUsd: userPurchase.amountUsd,
          podCount: userPurchase.podCount,
          balanceSource: userPurchase.balanceSource,
          purchasedAt: userPurchase.purchasedAt,
        }
      : null,
  }
}

export async function buyNeuralPods({ walletAddress, amountUsd, balanceSource }) {
  const now = new Date()
  if (now.getTime() < POD_LAUNCH_AT.getTime()) {
    throw new Error('Neural Pods are not live yet.')
  }

  if (!POD_PURCHASE_OPTIONS_USD.includes(amountUsd)) {
    throw new Error('Only $10 to $150 Neural Pod purchases are allowed.')
  }

  if (!['main', 'referral', 'total'].includes(balanceSource)) {
    throw new Error('A valid balance source is required.')
  }

  const cycleState = getCurrentOrUpcomingCycleMeta(now)
  if (cycleState.phase !== 'active' || !cycleState.activeMeta) {
    throw new Error('Neural Pod buying is only available during the daily 4-hour buy window.')
  }

  const podCount = amountUsd / POD_PRICE_USD
  const session = await mongoose.startSession()

  try {
    let purchaseResult = null

    await session.withTransaction(async () => {
      const cycle = await findOrCreateCycleRecord(cycleState.activeMeta, session)

      if (cycle.availablePods <= 0 || cycle.availablePods < podCount) {
        throw new Error('Not enough Neural Pods are available in this cycle.')
      }

      const existingPurchase = await PodPurchase.findOne({
        walletAddress: walletAddress?.trim(),
        cycleKey: cycle.cycleKey,
      })
        .collation(walletCollation)
        .session(session)

      if (existingPurchase) {
        throw new Error('You already bought Neural Pods in this cycle.')
      }

      const user = await User.findOne({ walletAddress: walletAddress?.trim() }).collation(walletCollation).session(session)
      if (!user || !user.isRegistered || !user.registrationPaymentDone) {
        throw new Error('Complete registration payment before buying Neural Pods.')
      }
      const spendUnits = toCurrencyUnits(amountUsd)
      let mainSpendUnits = 0
      let referralSpendUnits = 0

      if (balanceSource === 'main') {
        const currentBalanceUnits = toCurrencyUnits(user.mainBalance ?? 0)
        if (currentBalanceUnits < spendUnits) {
          throw new Error('Insufficient main balance to buy Neural Pods.')
        }
        mainSpendUnits = spendUnits
        user.mainBalance = fromCurrencyUnits(currentBalanceUnits - spendUnits)
      } else if (balanceSource === 'referral') {
        const currentBalanceUnits = toCurrencyUnits(user.referralBalance ?? 0)
        if (currentBalanceUnits < spendUnits) {
          throw new Error('Insufficient referral balance to buy Neural Pods.')
        }
        referralSpendUnits = spendUnits
        user.referralBalance = fromCurrencyUnits(currentBalanceUnits - spendUnits)
      } else {
        const referralBalanceUnits = toCurrencyUnits(user.referralBalance ?? 0)
        const mainBalanceUnits = toCurrencyUnits(user.mainBalance ?? 0)
        if (referralBalanceUnits + mainBalanceUnits < spendUnits) {
          throw new Error('Insufficient total balance to buy Neural Pods.')
        }
        referralSpendUnits = Math.min(referralBalanceUnits, spendUnits)
        mainSpendUnits = spendUnits - referralSpendUnits
        user.referralBalance = fromCurrencyUnits(referralBalanceUnits - referralSpendUnits)
        user.mainBalance = fromCurrencyUnits(mainBalanceUnits - mainSpendUnits)
      }

      await user.save({ session })

      cycle.availablePods -= podCount
      cycle.totalPodsSold += podCount
      cycle.purchasesCount += 1
      if (cycle.availablePods === 0) {
        cycle.soldOutAt = now
      }
      await cycle.save({ session })

      const [purchase] = await PodPurchase.create(
        [
          {
            walletAddress: walletAddress?.trim(),
            cycleKey: cycle.cycleKey,
            cycleIndex: cycle.cycleIndex,
            blockNumber: cycle.blockNumber,
            epochNumber: cycle.epochNumber,
            dayNumber: cycle.dayNumber,
            amountUsd,
            podCount,
            balanceSource,
            mainAmountUsd: fromCurrencyUnits(mainSpendUnits),
            referralAmountUsd: fromCurrencyUnits(referralSpendUnits),
            purchasedAt: now,
          },
        ],
        { session },
      )

      purchaseResult = {
        cycle: formatCycleResponse(cycle, {
          totalPods: cycle.totalPods,
          availablePods: cycle.availablePods,
        }),
        purchase: {
          amountUsd: purchase.amountUsd,
          podCount: purchase.podCount,
          balanceSource: purchase.balanceSource,
          mainAmountUsd: purchase.mainAmountUsd ?? 0,
          referralAmountUsd: purchase.referralAmountUsd ?? 0,
          purchasedAt: purchase.purchasedAt,
        },
        balances: {
          mainBalance: user.mainBalance ?? 0,
          referralBalance: user.referralBalance ?? 0,
        },
      }
    })

    return purchaseResult
  } finally {
    await session.endSession()
  }
}

export async function claimPodPurchase(walletAddress, purchaseId) {
  const normalizedWallet = normalizeWallet(walletAddress)
  const session = await mongoose.startSession()

  try {
    let claimResult = null

    await session.withTransaction(async () => {
      const purchase = await PodPurchase.findById(purchaseId).session(session)
      if (!purchase) {
        throw new Error('Neural Pod purchase not found.')
      }

      if (normalizeWallet(purchase.walletAddress) !== normalizedWallet) {
        throw new Error('Not authorized to claim this Neural Pod purchase.')
      }

      if (purchase.isClaimed) {
        throw new Error('This Neural Pod purchase has already been claimed.')
      }

      const effectiveCycleIndex = await getEffectiveCycleIndex()
      if (effectiveCycleIndex < purchase.cycleIndex + 5) {
        throw new Error('Neural Pod maturity period has not finished.')
      }

      const user = await User.findOne({ walletAddress: walletAddress?.trim() })
        .collation(walletCollation)
        .session(session)
      
      if (!user) {
        throw new Error('User not found.')
      }

      const principalAmount = purchase.amountUsd
      const profitAmount = Number((principalAmount * 0.1).toFixed(2))
      const totalAmount = principalAmount + profitAmount

      const existingClaimRecord = await ClaimRecord.findOne({ purchaseId: purchase._id }).session(session)
      if (existingClaimRecord) {
        throw new Error('This Neural Pod purchase has already been claimed.')
      }

      user.claimedBalance = fromCurrencyUnits(toCurrencyUnits(user.claimedBalance ?? 0) + toCurrencyUnits(totalAmount))
      await user.save({ session })

      purchase.isClaimed = true
      await purchase.save({ session })

      const [claimRecord] = await ClaimRecord.create(
        [
          {
            userWalletAddress: walletAddress?.trim(),
            purchaseId: purchase._id,
            principalAmount,
            profitAmount,
            totalAmount,
            status: 'completed',
          },
        ],
        { session, ordered: true },
      )

      const appliedRewards = await distributeClaimProfit(user, profitAmount, claimRecord._id)

      if (appliedRewards.length > 0) {
        await ClaimLevelReward.create(
          appliedRewards.map(reward => ({
            claimId: claimRecord._id,
            userWalletAddress: walletAddress?.trim(),
            recipientWalletAddress: reward.recipientWalletAddress,
            level: reward.level,
            amount: reward.amount,
          })),
          { session, ordered: true }
        )
      }

      claimResult = {
        success: true,
        claim: {
          principalAmount,
          profitAmount,
          totalAmount,
        },
        balances: {
          claimedBalance: user.claimedBalance,
        }
      }
    })

    return claimResult
  } finally {
    await session.endSession()
  }
}

export async function getPodPurchases(walletAddress) {
  const normalizedWallet = normalizeWallet(walletAddress)

  if (!normalizedWallet) {
    return []
  }

  const purchases = await PodPurchase.find({ walletAddress: walletAddress?.trim() })
    .collation(walletCollation)
    .sort({ cycleIndex: 1, purchasedAt: 1, createdAt: 1 })
    .lean()

  return purchases.map((purchase) => ({
    id: String(purchase._id),
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
    isClaimed: Boolean(purchase.isClaimed),
    purchasedAt: purchase.purchasedAt,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
  }))
}
