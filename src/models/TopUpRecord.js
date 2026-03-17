import mongoose from 'mongoose'

const topUpRecordSchema = new mongoose.Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      enum: ['crypto', 'fiat', 'direct'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    referenceId: {
      type: String,
      required: true,
      trim: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
)

topUpRecordSchema.index({ referenceId: 1 }, { unique: true })

export const TopUpRecord = mongoose.model('TopUpRecord', topUpRecordSchema)
