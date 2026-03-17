import mongoose from 'mongoose'

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      trim: true,
    },
    balance: {
      type: Number,
      default: 10000,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
)

export const Admin = mongoose.model('Admin', adminSchema)
