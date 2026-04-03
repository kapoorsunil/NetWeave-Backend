import mongoose from 'mongoose'

const claimLevelRewardSchema = new mongoose.Schema(
  {
    claimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClaimRecord',
      required: true,
    },
    userWalletAddress: {
      type: String, // The user whose claim triggered this reward
      required: true,
      trim: true,
    },
    recipientWalletAddress: {
      type: String, // The ancestor receiving the reward
      required: true,
      trim: true,
    },
    level: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
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

claimLevelRewardSchema.index({ recipientWalletAddress: 1 })
claimLevelRewardSchema.index({ claimId: 1, recipientWalletAddress: 1 }, { unique: true })

export const ClaimLevelReward = mongoose.model('ClaimLevelReward', claimLevelRewardSchema)
