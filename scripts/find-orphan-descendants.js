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
        console.log("\n--- DESCANDANTS OF ORPHAN NODES ---\n");
        for (const orphan of orphans) {
            const children = await User.find({ treeParent: new RegExp(`^${orphan}$`, 'i') });
            console.log(`Orphan: ${orphan}`);
            if (children.length === 0) {
                console.log("  - No descendants found (Leaf node).");
            } else {
                children.forEach(c => {
                    console.log(`  - Child Found: ${c.name || c.username} (${c.walletAddress}) [Side: ${c.placementSide}]`);
                });
            }
            console.log('---------------------------------------------------------');
        }
    } finally {
        await mongoose.disconnect();
    }
}

run();
