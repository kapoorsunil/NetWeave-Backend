import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const ORPHANS = [
    '0x4630301db9dbc026ca7db4ba3a552b5e62aefb25',
    '0xc64a0728049738091aa64352019f4fcd7286e5ad',
    '0xf050afa9ca20d7ce9649eff23627a8c7ac293655',
    '0xbe91f8f51e617dc899288c1e595f86367896774a'
];

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        console.log("\n--- STARTING PERMANENT STRUCTURAL REPAIR ---\n");

        for (const orphan of ORPHANS) {
            console.log(`Processing Orphan Cleanup: ${orphan}`);
            
            // 1. Find all parents pointing to this orphan
            const parents = await User.find({
                $or: [
                    { treeLeftChild: new RegExp(`^${orphan}$`, 'i') },
                    { treeRightChild: new RegExp(`^${orphan}$`, 'i') }
                ]
            });

            for (const parent of parents) {
                console.log(`  - Parent found: ${parent.name || parent.username} (${parent.walletAddress})`);
                
                const isLeft = parent.treeLeftChild?.toLowerCase() === orphan.toLowerCase();
                const isRight = parent.treeRightChild?.toLowerCase() === orphan.toLowerCase();

                if (isLeft) {
                    // Check if there's a Right sibling to shift Left
                    if (parent.treeRightChild && parent.treeRightChild.toLowerCase() !== orphan.toLowerCase()) {
                        console.log(`    [SHIFT] Moving Right Child (${parent.treeRightChild}) to Left position.`);
                        parent.treeLeftChild = parent.treeRightChild;
                        parent.treeRightChild = null;
                        
                        // Also update the shifted child's placementSide metadata if it exists
                        await User.updateOne(
                            { walletAddress: new RegExp(`^${parent.treeLeftChild}$`, 'i') },
                            { $set: { placementSide: 'left' } }
                        );
                    } else {
                        console.log(`    [NULL] Removing orphan from Left (no sibling to shift).`);
                        parent.treeLeftChild = null;
                    }
                }

                if (isRight) {
                    console.log(`    [NULL] Removing orphan from Right.`);
                    parent.treeRightChild = null;
                }

                await parent.save();
                console.log(`    [DONE] Parent links updated.`);
            }
            console.log('---------------------------------------------------------');
        }

        console.log("\n--- TREE REPAIR COMPLETED ---");
        console.log("Next Step: Balances already adjusted according to audit.");

    } finally {
        await mongoose.disconnect();
    }
}

run();
