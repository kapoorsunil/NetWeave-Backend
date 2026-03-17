import mongoose from 'mongoose'
import { Admin } from '../models/Admin.js'
import { AdminTopUpRecord } from '../models/AdminTopUpRecord.js'
import { env } from './env.js'
import { User } from '../models/User.js'

export async function connectDatabase() {
  await mongoose.connect(env.mongoUri)
  await User.syncIndexes()
  await Admin.syncIndexes()
  await AdminTopUpRecord.syncIndexes()
}
