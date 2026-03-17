import { Router } from 'express'
import { handleMoonPayWebhook, signMoonPayUrl } from '../controllers/moonpayController.js'

const router = Router()

router.post('/sign-url', signMoonPayUrl)
router.post('/webhook', handleMoonPayWebhook)

export default router
