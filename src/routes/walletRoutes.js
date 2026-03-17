import { Router } from 'express'
import {
  completeRegistrationPayment,
  confirmCryptoTopUp,
  prefundGas,
  requestWithdraw,
  sendWithdrawOtp,
  verifyWithdrawOtp,
} from '../controllers/walletController.js'

const router = Router()

router.post('/prefund-gas', prefundGas)
router.post('/topup/crypto/confirm', confirmCryptoTopUp)
router.post('/registration-payment', completeRegistrationPayment)
router.post('/withdraw/send-otp', sendWithdrawOtp)
router.post('/withdraw/verify-otp', verifyWithdrawOtp)
router.post('/withdraw/request', requestWithdraw)

export default router
