import {
  authenticateAdmin,
  getAdminDashboardSummary,
  getAdminRecordSections,
  getAdminUserOverview,
  topUpUserFromAdmin,
} from '../services/adminService.js'

export async function adminLogin(req, res, next) {
  try {
    const email = req.body.email?.trim()
    const password = req.body.password?.trim()

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      })
    }

    const { token, admin } = await authenticateAdmin(email, password)
    const dashboardSummary = await getAdminDashboardSummary()
    const recordSections = await getAdminRecordSections()

    res.json({
      success: true,
      data: {
        token,
        admin: {
          email: admin.email,
          balance: admin.balance ?? 0,
          dashboardSummary,
          recordSections,
        },
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function adminMe(req, res, next) {
  try {
    const dashboardSummary = await getAdminDashboardSummary()
    const recordSections = await getAdminRecordSections()

    res.json({
      success: true,
      data: {
        email: req.admin.email,
        balance: req.admin.balance ?? 0,
        dashboardSummary,
        recordSections,
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function adminRecords(req, res, next) {
  try {
    const walletAddress = req.query.wallet?.trim() || ''
    const section = req.query.section?.trim() || ''
    const data = await getAdminRecordSections({ walletAddress, section })

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
}

export async function searchUserForAdmin(req, res, next) {
  try {
    const walletAddress = req.query.wallet?.trim()

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'wallet query parameter is required.',
      })
    }

    const overview = await getAdminUserOverview(walletAddress)
    res.json({
      success: true,
      data: overview,
    })
  } catch (error) {
    next(error)
  }
}

export async function adminTopUpUser(req, res, next) {
  try {
    const walletAddress = req.body.walletAddress?.trim()
    const amount = req.body.amount

    const result = await topUpUserFromAdmin(req.admin, walletAddress, amount)
    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}
