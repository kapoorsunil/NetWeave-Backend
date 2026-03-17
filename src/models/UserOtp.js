import mongoose from 'mongoose'

const userOtpSchema = new mongoose.Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    purpose: {
      type: String,
      enum: ['signup', 'withdraw'],
      required: true,
    },
    codeHash: {
      type: String,
      required: true,
    },
    payload: {
      type: String,
      default: '',
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
)

userOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const UserOtp = mongoose.model('UserOtp', userOtpSchema)
