import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { PodCycle } from '../src/models/PodCycle.js'
import { PodPurchase } from '../src/models/PodPurchase.js'

dotenv.config()

const walletAddress = '0xA36a43c3C537fe48Ec604d4037F4d9220b1a5d32'
const cycleKey = 'b1-e1-d1'
const amountUsd = 50
const podCount = 5
const balanceSource = 'main'

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI

  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing in backend/.env')
  }

  await mongoose.connect(mongoUri)

  const cycle = await PodCycle.findOne({ cycleKey })
  if (!cycle) {
    throw new Error(`PodCycle not found for cycleKey: ${cycleKey}`)
  }

  const doc = await PodPurchase.findOneAndUpdate(
    { walletAddress, cycleKey },
    {
      $set: {
        walletAddress,
        cycleKey,
        cycleIndex: cycle.cycleIndex,
        blockNumber: cycle.blockNumber,
        epochNumber: cycle.epochNumber,
        dayNumber: cycle.dayNumber,
        amountUsd,
        podCount,
        balanceSource,
        mainAmountUsd: balanceSource === 'main' ? amountUsd : 0,
        referralAmountUsd: balanceSource === 'referral' ? amountUsd : 0,
        purchasedAt: new Date(),
        isClaimed: false,
      },
    },
    { upsert: true, new: true },
  )

  console.log('PodPurchase upserted:', doc)
  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
