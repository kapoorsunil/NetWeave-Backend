import { Router } from 'express'
import { checkEmailAvailability, checkUsernameAvailability, directSignup, getStatus, getTeam, loginWithWalletPassword, requestSignupOtp, setWalletPassword, verifySignupOtp } from '../controllers/userController.js'

const router = Router()

router.get('/status', getStatus)
router.get('/username-available', checkUsernameAvailability)
router.get('/email-available', checkEmailAvailability)
router.post('/signup/direct', directSignup)
router.post('/signup/request-otp', requestSignupOtp)
router.post('/signup/verify-otp', verifySignupOtp)
router.post('/login', loginWithWalletPassword)
router.post('/set-password', setWalletPassword)
router.get('/team', getTeam)

export default router
