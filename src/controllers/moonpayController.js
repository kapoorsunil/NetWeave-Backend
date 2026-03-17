import crypto from 'crypto'
import { env } from '../config/env.js'
import { TopUpRecord } from '../models/TopUpRecord.js'
import { creditUserMainBalance } from '../services/userService.js'

function isAllowedMoonPayHost(hostname) {
  return hostname === 'moonpay.com' || hostname.endsWith('.moonpay.com')
}

export async function signMoonPayUrl(req, res, next) {
  try {
    if (!env.moonPayPublishableKey || !env.moonPaySecretKey) {
      return res.status(503).json({
        success: false,
        message: 'MoonPay is not configured on the backend.',
      })
    }

    const urlForSignature = req.body?.urlForSignature

    if (!urlForSignature) {
      return res.status(400).json({
        success: false,
        message: 'urlForSignature is required.',
      })
    }

    let parsedUrl
    try {
      parsedUrl = new URL(urlForSignature)
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Invalid MoonPay URL.',
      })
    }

    if (!isAllowedMoonPayHost(parsedUrl.hostname)) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported MoonPay host.',
      })
    }

    if (parsedUrl.searchParams.get('apiKey') !== env.moonPayPublishableKey) {
      return res.status(400).json({
        success: false,
        message: 'MoonPay apiKey mismatch.',
      })
    }

    const signature = crypto
      .createHmac('sha256', env.moonPaySecretKey)
      .update(parsedUrl.search)
      .digest('base64')

    res.json({
      success: true,
      data: {
        signature,
      },
    })
  } catch (error) {
    next(error)
  }
}

function getMoonPayPayload(body) {
  return body?.data || body
}

function getMoonPayStatus(payload) {
  return String(
    payload?.status ||
      payload?.state ||
      payload?.transactionStatus ||
      '',
  ).toLowerCase()
}

function getMoonPayReferenceId(payload) {
  return payload?.id || payload?.transactionId || payload?.externalTransactionId || null
}

function getMoonPayWallet(payload) {
  return payload?.externalCustomerId || payload?.customerId || payload?.walletAddress || null
}

function getMoonPayAmount(payload) {
  const possibleValues = [
    payload?.quoteCurrencyAmount,
    payload?.currencyAmount,
    payload?.cryptoAmount,
    payload?.baseCurrencyAmount,
  ]

  const amount = possibleValues
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value > 0)

  return amount || 0
}

function getMoonPayCurrency(payload) {
  return String(payload?.currencyCode || payload?.quoteCurrencyCode || payload?.currency?.code || 'usdc').toLowerCase()
}

export async function handleMoonPayWebhook(req, res, next) {
  try {
    const payload = getMoonPayPayload(req.body)
    const status = getMoonPayStatus(payload)
    const referenceId = getMoonPayReferenceId(payload)
    const walletAddress = getMoonPayWallet(payload)?.trim()
    const amount = getMoonPayAmount(payload)
    const currency = getMoonPayCurrency(payload)

    if (!referenceId) {
      return res.status(400).json({
        success: false,
        message: 'MoonPay webhook reference is missing.',
      })
    }

    const existingRecord = await TopUpRecord.findOne({ referenceId })
    if (existingRecord) {
      return res.json({
        success: true,
        data: {
          alreadyProcessed: true,
        },
      })
    }

    if (!walletAddress || !amount) {
      return res.status(400).json({
        success: false,
        message: 'MoonPay webhook is missing wallet or amount.',
      })
    }

    if (!['completed', 'pending_delivery', 'waiting_payment', 'delivered'].includes(status)) {
      return res.json({
        success: true,
        data: {
          ignored: true,
          status,
        },
      })
    }

    const updatedUser = await creditUserMainBalance(walletAddress, amount)

    await TopUpRecord.create({
      walletAddress,
      source: 'fiat',
      amount,
      currency,
      referenceId,
      meta: payload,
    })

    res.json({
      success: true,
      data: {
        mainBalance: updatedUser.mainBalance ?? 0,
      },
    })
  } catch (error) {
    next(error)
  }
}
