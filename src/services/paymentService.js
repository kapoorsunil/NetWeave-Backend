import { createPublicClient, createWalletClient, encodeFunctionData, http, parseEther, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { env } from '../config/env.js'
import { resolvePrivateKey } from '../utils/privateKeyCrypto.js'

const publicClient = createPublicClient({
  chain: base,
  transport: http(env.baseRpcUrl),
})

const resolvedAdminPrivateKey = resolvePrivateKey({
  plainPrivateKey: env.adminPrivateKey,
  encryptedPrivateKey: env.adminPrivateKey ? '' : env.adminPrivateKeyEncrypted,
  encryptionSecret: env.privateKeyEncryptionSecret,
})

const resolvedWithdrawPrivateKey = resolvePrivateKey({
  plainPrivateKey: '',
  encryptedPrivateKey: env.withdrawPrivateKeyEncrypted || '',
  encryptionSecret: env.withdrawPrivateKeyEncryptionSecret,
})

const adminAccount = resolvedAdminPrivateKey ? privateKeyToAccount(resolvedAdminPrivateKey) : null
const walletClient = adminAccount
  ? createWalletClient({
      account: adminAccount,
      chain: base,
      transport: http(env.baseRpcUrl),
    })
  : null

const withdrawAccount = resolvedWithdrawPrivateKey ? privateKeyToAccount(resolvedWithdrawPrivateKey) : null
const withdrawWalletClient = withdrawAccount
  ? createWalletClient({
      account: withdrawAccount,
      chain: base,
      transport: http(env.baseRpcUrl),
    })
  : null

const erc20Abi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
]

function parseTokenAmount(value, decimals) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error('A valid positive amount is required.')
  }

  return numericValue
}

function formatTokenUnits(units, decimals) {
  const negative = units < 0n
  const normalizedUnits = negative ? -units : units
  const divisor = 10n ** BigInt(decimals)
  const whole = normalizedUnits / divisor
  const fraction = normalizedUnits % divisor
  const fractionText = fraction.toString().padStart(decimals, '0')
  const combined = `${negative ? '-' : ''}${whole.toString()}.${fractionText}`
  return Number(combined)
}

export function computeWithdrawalSplit(amount) {
  const totalAmount = Number(amount)

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('A valid positive withdrawal amount is required.')
  }

  const totalUnits = parseUnits(totalAmount.toFixed(env.usdcDecimals), env.usdcDecimals)
  const platformFeeUnits = (totalUnits * 5n) / 100n
  const distributableUnits = totalUnits - platformFeeUnits
  const feeUnits = (distributableUnits * 5n) / 1000n
  const userUnits = distributableUnits - feeUnits

  return {
    totalAmount,
    userAmount: formatTokenUnits(userUnits, env.usdcDecimals),
    feeAmount: formatTokenUnits(feeUnits, env.usdcDecimals),
    platformFeeAmount: formatTokenUnits(platformFeeUnits, env.usdcDecimals),
    userUnits,
    feeUnits,
  }
}

export async function prefundUserGas(walletAddress) {
  if (!walletClient || !adminAccount) {
    throw new Error('Admin private key is not configured for gas prefund.')
  }

  const hash = await walletClient.sendTransaction({
    account: adminAccount,
    to: walletAddress,
    value: parseEther(env.gasPrefundAmount),
  })

  await publicClient.waitForTransactionReceipt({ hash })

  return {
    hash,
    amount: env.gasPrefundAmount,
  }
}

export function normalizeCryptoTopUp({ txHash, amount }) {
  const numericAmount = parseTokenAmount(amount, env.usdcDecimals)

  return {
    txHash: txHash?.trim() || null,
    amount: numericAmount,
    currency: 'usdc',
  }
}

export async function payoutReferralWithdrawal({ toWalletAddress, amount }) {
  if (!withdrawWalletClient || !withdrawAccount) {
    throw new Error('Withdraw private key is not configured for withdrawal payouts.')
  }

  if (!env.usdcContractAddress) {
    throw new Error('USDC contract address is not configured.')
  }

  const split = computeWithdrawalSplit(amount)

  const nonce = await publicClient.getTransactionCount({
    address: withdrawAccount.address,
    blockTag: 'pending',
  })

  const userTxHash = await withdrawWalletClient.sendTransaction({
    account: withdrawAccount,
    chain: base,
    nonce,
    to: env.usdcContractAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [toWalletAddress, split.userUnits],
    }),
  })

  const feeTxHash = await withdrawWalletClient.sendTransaction({
    account: withdrawAccount,
    chain: base,
    nonce: nonce + 1,
    to: env.usdcContractAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [env.withdrawFeeWalletAddress, split.feeUnits],
    }),
  })

  const [userReceipt, feeReceipt] = await Promise.all([
    publicClient.waitForTransactionReceipt({ hash: userTxHash }),
    publicClient.waitForTransactionReceipt({ hash: feeTxHash }),
  ])

  return {
    userTxHash,
    feeTxHash,
    userAmount: split.userAmount,
    feeAmount: split.feeAmount,
    platformFeeAmount: split.platformFeeAmount,
    success: userReceipt.status === 'success' && feeReceipt.status === 'success',
  }
}
