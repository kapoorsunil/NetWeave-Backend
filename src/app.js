import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import { env } from './config/env.js'
import adminRoutes from './routes/adminRoutes.js'
import moonpayRoutes from './routes/moonpayRoutes.js'
import userRoutes from './routes/userRoutes.js'
import walletRoutes from './routes/walletRoutes.js'
import { errorHandler } from './middleware/errorHandler.js'
import { notFound } from './middleware/notFound.js'

export const app = express()

app.use(
  cors({
    origin(origin, callback) {
      // Allow serverside tools (curl, Postman) and dev tooling to access API.
      if (!origin) {
        return callback(null, true)
      }

      // In development, allow all origins to avoid CORS issues when running from
      // multiple localhost ports.
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true)
      }

      if (env.frontendUrls.includes(origin)) {
        return callback(null, true)
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`))
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.use(express.json())
app.use(morgan('dev'))

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'NetWeave backend is running.',
  })
})

app.use('/api/moonpay', moonpayRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/users', userRoutes)
app.use('/api/wallet', walletRoutes)

app.use(notFound)
app.use(errorHandler)
