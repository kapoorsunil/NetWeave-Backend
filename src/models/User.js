import mongoose from 'mongoose'
import { createEmptyDownlineLevels, TEAM_LEVELS } from '../constants/team.js'

const caseInsensitiveCollation = { locale: 'en', strength: 2 }

const downlineLevelSchema = new mongoose.Schema(
  {
    level: {
      type: Number,
      required: true,
      min: 1,
      max: TEAM_LEVELS,
    },
    members: {
      type: [String],
      default: [],
    },
  },
  { _id: false },
)

const userSchema = new mongoose.Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    smartWalletAddress: {
      type: String,
      default: undefined,
      trim: true,
    },
    isRegistered: {
      type: Boolean,
      default: false,
    },
    registrationPaymentDone: {
      type: Boolean,
      default: false,
    },
    registrationRewardsDistributed: {
      type: Boolean,
      default: false,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    username: {
      type: String,
      default: undefined,
      trim: true,
      lowercase: true,
      maxlength: 50,
    },
    name: {
      type: String,
      default: undefined,
      trim: true,
      maxlength: 80,
    },
    email: {
      type: String,
      default: undefined,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    country: {
      type: String,
      default: undefined,
      trim: true,
      maxlength: 60,
    },
    phoneCountryCode: {
      type: String,
      default: undefined,
      trim: true,
      maxlength: 10,
    },
    phoneNumber: {
      type: String,
      default: undefined,
      trim: true,
      maxlength: 25,
    },
    accountType: {
      type: String,
      enum: ['legacy_wallet', 'phone_signup'],
      default: 'legacy_wallet',
    },
    passwordHash: {
      type: String,
      default: undefined,
    },
    mainBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    referralBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    claimedBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    claimReferralBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    referredBy: {
      type: String,
      default: null,
      trim: true,
    },
    ancestors: {
      type: [String],
      default: [],
    },
    directReferrals: {
      type: [String],
      default: [],
    },
    treeParent: {
      type: String,
      default: null,
      trim: true,
    },
    treeLeftChild: {
      type: String,
      default: null,
      trim: true,
    },
    treeRightChild: {
      type: String,
      default: null,
      trim: true,
    },
    placementSide: {
      type: String,
      enum: ['left', 'right', null],
      default: null,
    },
    downlineLevels: {
      type: [downlineLevelSchema],
      default: createEmptyDownlineLevels,
    },
    registrationTxHash: {
      type: String,
      default: undefined,
    },
    lastGasPrefundAt: {
      type: Date,
      default: null,
    },
    adminGasSendCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    userCryptoTransferCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
)

userSchema.index(
  { walletAddress: 1 },
  {
    unique: true,
    collation: caseInsensitiveCollation,
  },
)

userSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: {
      username: { $exists: true, $type: 'string' },
    },
  },
)

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $exists: true, $type: 'string' },
    },
  },
)

userSchema.index(
  { phoneCountryCode: 1, phoneNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phoneCountryCode: { $exists: true, $type: 'string' },
      phoneNumber: { $exists: true, $type: 'string' },
    },
  },
)

userSchema.index(
  { smartWalletAddress: 1 },
  {
    unique: true,
    collation: caseInsensitiveCollation,
    partialFilterExpression: {
      smartWalletAddress: { $exists: true, $type: 'string' },
    },
  },
)

userSchema.index(
  { registrationTxHash: 1 },
  {
    unique: true,
    partialFilterExpression: {
      registrationTxHash: { $exists: true, $type: 'string' },
    },
  },
)

export const User = mongoose.model('User', userSchema)
