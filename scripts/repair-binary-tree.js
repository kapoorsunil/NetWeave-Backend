import { connectDatabase } from '../src/config/db.js'
import { rebuildBinaryReferralTree } from '../src/services/migrationService.js'

function printChange(change) {
  console.log(`- ${change.walletAddress}`)
  console.log(`  treeParent: ${change.current.treeParent ?? 'null'} -> ${change.next.treeParent ?? 'null'}`)
  console.log(
    `  treeLeftChild: ${change.current.treeLeftChild ?? 'null'} -> ${change.next.treeLeftChild ?? 'null'}`,
  )
  console.log(
    `  treeRightChild: ${change.current.treeRightChild ?? 'null'} -> ${change.next.treeRightChild ?? 'null'}`,
  )
  console.log(
    `  placementSide: ${change.current.placementSide ?? 'null'} -> ${change.next.placementSide ?? 'null'}`,
  )
}

async function main() {
  const apply = process.argv.includes('--apply')

  await connectDatabase()

  const result = await rebuildBinaryReferralTree({ apply })

  console.log(`Mode: ${apply ? 'apply' : 'preview'}`)
  console.log('Fields to rewrite: treeParent, treeLeftChild, treeRightChild, placementSide')
  console.log(`Registered users scanned: ${result.total}`)
  console.log(`Users needing changes: ${result.changes.length}`)

  if (!result.changes.length) {
    console.log('No tree repairs are needed.')
    process.exit(0)
  }

  console.log('')
  console.log('Planned changes:')

  for (const change of result.changes) {
    printChange(change)
  }

  if (!apply) {
    console.log('')
    console.log('Preview only. No database updates were written.')
    console.log('Run `npm run repair:binary-tree:apply` when you want to apply the repair.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
