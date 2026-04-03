import mongoose from 'mongoose'

const podCycleSchema = new mongoose.Schema(
  {
    cycleKey: {
      type: String,
      required: true,
      unique: true,
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
    epochDurationDays: {
      type: Number,
      required: true,
      min: 1,
    },
    totalPods: {
      type: Number,
      required: true,
      min: 0,
    },
    availablePods: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPodsSold: {
      type: Number,
      default: 0,
      min: 0,
    },
    purchasesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    opensAt: {
      type: Date,
      required: true,
    },
    closesAt: {
      type: Date,
      required: true,
    },
    soldOutAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
)

export const PodCycle = mongoose.model('PodCycle', podCycleSchema)
