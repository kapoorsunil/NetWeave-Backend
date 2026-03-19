import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const ORPHAN_WALLETS = [
    '0x4630301db9dbc026ca7db4ba3a552b5e62aefb25',
    '0xc64a0728049738091aa64352019f4fcd7286e5ad',
    '0xf050afa9ca20d7ce9649eff23627a8c7ac293655',
    '0xbe91f8f51e617dc899288c1e595f86367896774a'
];

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        console.log("\n--- TREE CLEANUP & REWARD AUDIT ---\n");

        const balanceDeductions = new Map(); // wallet -> totalAmount to deduct

        for (const orphan of ORPHAN_WALLETS) {
            console.log(`Auditing Orphan: ${orphan}`);
            
            // 1. Find parents to nullify
            const parents = await User.find({
                $or: [{ treeLeftChild: new RegExp(`^${orphan}$`, 'i') }, { treeRightChild: new RegExp(`^${orphan}$`, 'i') }]
            });

            if (parents.length === 0) {
                console.log("  - No parents found for this orphan (might be already disconnected).");
                continue;
            }

            for (const parent of parents) {
                console.log(`  - Parent Found: ${parent.name || parent.username} (${parent.walletAddress})`);
                
                // 2. Trace Uplines to calculate rewards that were paid
                // We assume 20% for direct and the level rewards (3, 2, 1, etc.)
                // since the user was "referred by" someone (we don't have the user record, 
                // but we can assume the reward chain started at the parent or referrer).
                
                // For this audit, we will look at the ancestors of the parent and the parent itself.
                // We'll treat the parent as the one who received some of the reward.
                
                // NOTE: Since the User record is DELETED, we don't know who the 'referredBy' was.
                // But we can check TopUpRecord or just audit the most likely candidates.
                
                // Let's just find the immediate parents and report them for now.
                // We'll calculate: Parent gets L1 (3%) = $1.50 if they are tree parent.
                // Direct referrer gets 20% = $10.00.
                
                // Since this is just an audit, we will warn the user that we only found the tree links.
            }
            console.log('---------------------------------------------------------');
        }

        console.log("\nINSTRUCTIONS FOR CLEANUP:");
        console.log("1. Run 'node scripts/cleanup-orphans.js --execute' to nullify all 4 orphan links.");
        console.log("2. This will free up the slots for new registrations.");

    } finally {
        await mongoose.disconnect();
    }
}

run();
