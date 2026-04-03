import mongoose from 'mongoose'
import { Admin } from '../models/Admin.js'
import { AdminTopUpRecord } from '../models/AdminTopUpRecord.js'
import { PodCycle } from '../models/PodCycle.js'
import { PodPurchase } from '../models/PodPurchase.js'
import { TopUpRecord } from '../models/TopUpRecord.js'
import { env } from './env.js'
import { User } from '../models/User.js'

export async function connectDatabase() {
  await mongoose.connect(env.mongoUri)
  await User.syncIndexes()
  await Admin.syncIndexes()
  await AdminTopUpRecord.syncIndexes()
  await PodCycle.syncIndexes()
  await PodPurchase.syncIndexes()
  await TopUpRecord.syncIndexes()
}

