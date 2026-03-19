import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const ORPHANS = [
    '0x4630301db9dbc026ca7db4ba3a552b5e62aefb25',
    '0xc64a0728049738091aa64352019f4fcd7286e5ad',
    '0xf050afa9ca20d7ce9649eff23627a8c7ac293655',
    '0xbe91f8f51e617dc899288c1e595f86367896774a'
];

// We are ADDING THESE BACK because they were subtracted automatically during failed registrations/deletions
const RESTORE_AMOUNTS = [
    { wallet: '0x8479Ec17E4ee77b9d174348f665460859B8F4f14', amount: 44.00, name: 'Dummy 1-1' },
    { wallet: '0xB0fAD5d0140529C94D43FDA39e918A23B9E5F555', amount: 7.50, name: 'Admin' },
    { wallet: '0x0000000000000000000000000000000000000003', amount: 1.50, name: 'Dummy 2-2' },
    { wallet: '0xC64A0728049738091Ab64352019F4FDD7286E5aD', amount: 1.00, name: 'Sunil Kapoor' },
    { wallet: '0x0000000000000000000000000000000000000002', amount: 0.50, name: 'Dummy 2-1' },
    { wallet: '0x0000000000000000000000000000000000000009', amount: 0.50, name: 'Dummy 3-4' },
    { wallet: '0x0000000000000000000000000000000000000014', amount: 0.25, name: 'Dummy 4-7' },
    { wallet: '0x0000000000000000000000000000000000000006', amount: 0.25, name: 'Dummy 3-1' },
    { wallet: '0x000000000000000000000000000000000000000f', amount: 0.25, name: 'Dummy 4-2' },
    { wallet: '0x0000000000000000000000000000000000000008', amount: 0.25, name: 'Dummy 3-3' },
    { wallet: '0x0000000000000000000000000000000000000013', amount: 0.25, name: 'Dummy 4-6' },
    { wallet: '0x0000000000000000000000000000000000000015', amount: 0.25, name: 'Dummy 4-8' }
];

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        console.log("\n--- STARTING PERMANENT REPAIR (RESTORING PREVIOUS BALANCES) ---\n");

        // 1. STRUCTURAL REPAIR
        for (const orphan of ORPHANS) {
            console.log(`Processing Orphan Cleanup: ${orphan}`);
            const parents = await User.find({
                $or: [
                    { treeLeftChild: new RegExp(`^${orphan}$`, 'i') },
                    { treeRightChild: new RegExp(`^${orphan}$`, 'i') }
                ]
            });

            for (const parent of parents) {
                const isLeft = parent.treeLeftChild?.toLowerCase() === orphan.toLowerCase();
                const isRight = parent.treeRightChild?.toLowerCase() === orphan.toLowerCase();

                if (isLeft) {
                    if (parent.treeRightChild && parent.treeRightChild.toLowerCase() !== orphan.toLowerCase()) {
                        console.log(`  [SHIFT] Moving Right Child ${parent.treeRightChild} to Left under parent ${parent.walletAddress}`);
                        parent.treeLeftChild = parent.treeRightChild;
                        parent.treeRightChild = null;
                        await User.updateOne({ walletAddress: new RegExp(`^${parent.treeLeftChild}$`, 'i') }, { $set: { placementSide: 'left', treeParent: parent.walletAddress } });
                    } else {
                        console.log(`  [CLEAN] Clearing Left slot under parent ${parent.walletAddress}`);
                        parent.treeLeftChild = null;
                    }
                }

                if (isRight) {
                    console.log(`  [CLEAN] Clearing Right slot under parent ${parent.walletAddress}`);
                    parent.treeRightChild = null;
                }
                await parent.save();
            }
            console.log('---------------------------------------------------------');
        }

        // 2. BALANCE RESTORATION
        console.log("\n--- RESTORING PREVIOUS BALANCES ---");
        for (const entry of RESTORE_AMOUNTS) {
            console.log(`  [RESTORE] Adding back $${entry.amount.toFixed(2)} to ${entry.name} (${entry.wallet})`);
            const result = await User.updateOne(
                { walletAddress: new RegExp(`^${entry.wallet}$`, 'i') },
                { $inc: { referralBalance: entry.amount } }
            );
            if (result.matchedCount === 0) console.warn(`    [!] Wallet not found for restoration: ${entry.wallet}`);
        }

        console.log("\n--- DATABASE REPAIR COMPLETE ---");

    } finally {
        await mongoose.disconnect();
    }
}

run();
