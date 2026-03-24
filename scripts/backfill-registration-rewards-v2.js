import { connectDatabase } from '../src/config/db.js'
import { rebuildReferralBalancesFromRegistrations } from '../src/services/migrationService.js'

const apply = process.argv.includes('--apply')

try {
  await connectDatabase()
  const result = await rebuildReferralBalancesFromRegistrations({ apply })
  console.log(JSON.stringify(result, null, 2))
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
