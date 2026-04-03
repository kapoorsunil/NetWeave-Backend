import { Router } from 'express'
import { buyPods, getPodPurchaseHistory, getPodsStatus, claimPods } from '../controllers/podController.js'

const router = Router()

router.get('/status', getPodsStatus)
router.get('/purchases', getPodPurchaseHistory)
router.post('/buy', buyPods)
router.post('/claim', claimPods)

export default router
