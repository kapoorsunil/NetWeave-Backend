import mongoose from 'mongoose'

const withdrawRequestSchema = new mongoose.Schema(
  {
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
    userAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    feeAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    platformFeeAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed'],
      default: 'pending',
    },
    payoutCurrency: {
      type: String,
      default: 'usdc',
    },
    userTxHash: {
      type: String,
      default: null,
    },
    feeTxHash: {
      type: String,
      default: null,
    },
    otpVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
)

export const WithdrawRequest = mongoose.model('WithdrawRequest', withdrawRequestSchema)
