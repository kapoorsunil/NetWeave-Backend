import { buyNeuralPods, getPodPurchases, getPodStatus, claimPodPurchase } from '../services/podService.js'

export async function getPodsStatus(req, res, next) {
  try {
    const walletAddress = req.query.wallet?.trim() || ''
    const data = await getPodStatus(walletAddress)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
}

export async function getPodPurchaseHistory(req, res, next) {
  try {
    const walletAddress = req.query.wallet?.trim() || ''

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'wallet is required.',
      })
    }

    const data = await getPodPurchases(walletAddress)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
}

export async function buyPods(req, res, next) {
  try {
    const walletAddress = req.body.walletAddress?.trim()
    const amountUsd = Number(req.body.amountUsd)
    const balanceSource = req.body.balanceSource?.trim()

    if (!walletAddress || !Number.isFinite(amountUsd) || !balanceSource) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress, amountUsd and balanceSource are required.',
      })
    }

    const result = await buyNeuralPods({
      walletAddress,
      amountUsd,
      balanceSource,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

export async function claimPods(req, res, next) {
  try {
    const walletAddress = req.body.walletAddress?.trim()
    const purchaseId = req.body.purchaseId?.trim()

    if (!walletAddress || !purchaseId) {
      return res.status(400).json({
        success: false,
        message: 'walletAddress and purchaseId are required.',
      })
    }

    const result = await claimPodPurchase(walletAddress, purchaseId)

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}
