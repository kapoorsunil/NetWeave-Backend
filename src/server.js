import { app } from './app.js'
import { connectDatabase } from './config/db.js'
import { env } from './config/env.js'
import { resumePendingWithdrawals } from './controllers/walletController.js'
import { ensureAdminAccount } from './services/adminService.js'
import { migrateDownlineLevelsToCurrentDepth } from './services/migrationService.js'
import { ensureAdminUser } from './services/userService.js'

async function startServer() {
  await connectDatabase()
  const migrationResult = await migrateDownlineLevelsToCurrentDepth()
  if (migrationResult.modified > 0) {
    console.log(
      `Migrated downlineLevels for ${migrationResult.modified} existing users to ${migrationResult.matched ? 'the current' : 'the'} depth.`,
    )
  }
  await ensureAdminUser()
  await ensureAdminAccount()
  await resumePendingWithdrawals()

  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start backend', error)
  process.exit(1)
})
