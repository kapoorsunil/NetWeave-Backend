import mongoose from 'mongoose'

const podPurchaseSchema = new mongoose.Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    cycleKey: {
      type: String,
      required: true,
      trim: true,
    },
    cycleIndex: {
      type: Number,
      required: true,
      min: 1,
    },
    blockNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    epochNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 4,
    },
    dayNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    amountUsd: {
      type: Number,
      required: true,
      min: 0,
    },
    podCount: {
      type: Number,
      required: true,
      min: 1,
    },
    balanceSource: {
      type: String,
      enum: ['main', 'referral', 'total'],
      required: true,
    },
    mainAmountUsd: {
      type: Number,
      default: 0,
      min: 0,
    },
    referralAmountUsd: {
      type: Number,
      default: 0,
      min: 0,
    },
    purchasedAt: {
      type: Date,
      default: Date.now,
    },
    isClaimed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
)

podPurchaseSchema.index({ walletAddress: 1, cycleKey: 1 }, { unique: true })

export const PodPurchase = mongoose.model('PodPurchase', podPurchaseSchema)
