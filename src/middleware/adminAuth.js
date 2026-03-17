import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { Admin } from '../models/Admin.js'

export async function requireAdminAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Admin token is required.',
      })
    }

    const payload = jwt.verify(token, env.adminJwtSecret)
    const admin = await Admin.findById(payload.adminId)

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin session is invalid.',
      })
    }

    req.admin = admin
    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Admin authentication failed.',
    })
  }
}
