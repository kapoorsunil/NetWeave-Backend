import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const ORPHANS = [
    '0x4630301db9dbc026ca7db4ba3a552b5e62aefb25',
    '0xc64a0728049738091aa64352019f4fcd7286e5ad',
    '0xf050afa9ca20d7ce9649eff23627a8c7ac293655',
    '0xbe91f8f51e617dc899288c1e595f86367896774a'
];

function getLevelRewardPercent(level) {
    if (level === 1) return 3;
    if (level === 2) return 2;
    if (level === 3) return 1;
    if (level >= 4 && level <= 10) return 0.5;
    if (level >= 11 && level <= 20) return 0.2;
    return 0;
}

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        const registrationFee = 50;
        const deductions = new Map(); // wallet -> amount

        for (const orphan of ORPHANS) {
            // 1. Direct Referrer (20% = $10)
            const dr = await User.findOne({ directReferrals: new RegExp(`^${orphan}$`, 'i') });
            if (dr) {
                const w = dr.walletAddress.toLowerCase();
                deductions.set(w, (deductions.get(w) || 0) + 10);
            }

            // 2. Level Rewards
            const parents = await User.find({
                $or: [{ treeLeftChild: new RegExp(`^${orphan}$`, 'i') }, { treeRightChild: new RegExp(`^${orphan}$`, 'i') }]
            });

            for (const parentNode of parents) {
                // We'll calculate level rewards starting from this parent up the tree
                // Based on the code's INVERTED logic: 
                // The TOP ancestor gets L1 (3%), the second top gets L2 (2%), etc.
                
                // First, find the ancestor chain of this parent node (including parent)
                const ancestors = [parentNode.walletAddress, ...parentNode.ancestors];
                // Reverse to get Top-Down
                const chain = ancestors.reverse();
                
                chain.forEach((wallet, index) => {
                    if (index < 20) {
                        const level = index + 1;
                        const percent = getLevelRewardPercent(level);
                        const reward = (registrationFee * percent) / 100;
                        const w = wallet.toLowerCase();
                        deductions.set(w, (deductions.get(w) || 0) + reward);
                    }
                });
            }
        }

        console.log("\n--- AUDIT: PROPOSED BALANCE DEDUCTIONS ---\n");
        for (const [wallet, amount] of deductions.entries()) {
            const user = await User.findOne({ walletAddress: new RegExp(`^${wallet}$`, 'i') });
            console.log(`User: ${user ? (user.name || user.username) : 'Unknown'} (${wallet})`);
            console.log(`  Deduction: -$${amount.toFixed(2)}`);
        }

    } finally {
        await mongoose.disconnect();
    }
}

run();
