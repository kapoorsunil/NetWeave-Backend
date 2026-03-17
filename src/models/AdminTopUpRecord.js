import mongoose from 'mongoose'

const adminTopUpRecordSchema = new mongoose.Schema(
  {
    adminEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    walletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
)

adminTopUpRecordSchema.index({ walletAddress: 1, createdAt: -1 })

export const AdminTopUpRecord = mongoose.model('AdminTopUpRecord', adminTopUpRecordSchema)
