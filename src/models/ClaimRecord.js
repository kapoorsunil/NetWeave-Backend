import mongoose from 'mongoose'

const claimRecordSchema = new mongoose.Schema(
  {
    userWalletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PodPurchase',
      required: true,
    },
    principalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    profitAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['completed'],
      default: 'completed',
    },
  },
  {
    timestamps: true,
  },
)

claimRecordSchema.index({ userWalletAddress: 1 })
claimRecordSchema.index({ purchaseId: 1 }, { unique: true })

export const ClaimRecord = mongoose.model('ClaimRecord', claimRecordSchema)
