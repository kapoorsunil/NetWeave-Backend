import { Router } from 'express'
import { adminLogin, adminMe, adminRecords, adminTopUpUser, searchUserForAdmin } from '../controllers/adminController.js'
import { requireAdminAuth } from '../middleware/adminAuth.js'

const router = Router()

router.post('/login', adminLogin)
router.get('/me', requireAdminAuth, adminMe)
router.get('/records', requireAdminAuth, adminRecords)
router.get('/users/search', requireAdminAuth, searchUserForAdmin)
router.post('/users/topup', requireAdminAuth, adminTopUpUser)

export default router
