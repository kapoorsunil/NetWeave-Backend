import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const orphans = [
    '0x4630301db9dbc026ca7db4ba3a552b5e62aefb25',
    '0xc64a0728049738091aa64352019f4fcd7286e5ad',
    '0xf050afa9ca20d7ce9649eff23627a8c7ac293655',
    '0xbe91f8f51e617dc899288c1e595f86367896774a'
];

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        console.log("\n--- RESTRUCTURING REQUIREMENT AUDIT ---\n");
        for (const orphan of orphans) {
            console.log(`Checking Orphan: ${orphan}`);
            
            // 1. Check for descendants (children who need to move UP)
            const descendants = await User.find({ treeParent: new RegExp(`^${orphan}$`, 'i') });
            
            // 2. Check for siblings (Right sibling who needs to move LEFT)
            const parents = await User.find({
                $or: [{ treeLeftChild: new RegExp(`^${orphan}$`, 'i') }, { treeRightChild: new RegExp(`^${orphan}$`, 'i') }]
            });

            let shiftingNeeded = false;
            for (const p of parents) {
                if (p.treeLeftChild?.toLowerCase() === orphan.toLowerCase() && p.treeRightChild) {
                    shiftingNeeded = true;
                }
            }

            console.log(`  - Has Descendants: ${descendants.length > 0 ? 'YES' : 'NO'}`);
            console.log(`  - Sibling Shifting Needed: ${shiftingNeeded ? 'YES' : 'NO'}`);
            
            if (descendants.length === 0 && !shiftingNeeded) {
                console.log("  - FINAL VERDICT: NO restructuring needed for this node. Just nullify.");
            } else {
                console.log("  - FINAL VERDICT: Restructuring REQUIRED.");
            }
            console.log('---------------------------------------------------------');
        }
    } finally {
        await mongoose.disconnect();
    }
}

run();
