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
        console.log("\n--- SIBLING / SHIFTING AUDIT ---\n");
        for (const orphan of orphans) {
            console.log(`Auditing Orphan: ${orphan}`);
            const parents = await User.find({
                $or: [{ treeLeftChild: new RegExp(`^${orphan}$`, 'i') }, { treeRightChild: new RegExp(`^${orphan}$`, 'i') }]
            });

            if (parents.length === 0) {
                console.log("  - No parents found.");
                continue;
            }

            for (const p of parents) {
                console.log(`  - Parent: ${p.name || p.username} (${p.walletAddress})`);
                const isLeft = p.treeLeftChild?.toLowerCase() === orphan.toLowerCase();
                const isRight = p.treeRightChild?.toLowerCase() === orphan.toLowerCase();
                
                if (isLeft) {
                    const sibling = p.treeRightChild;
                    if (sibling) {
                        console.log(`    [!] Shift Required: Orphan is LEFT. Right sibling exists: ${sibling}.`);
                        console.log(`        Rule: Right child should move to Left.`);
                    } else {
                        console.log(`    [OK] Orphan is LEFT. No right sibling.`);
                    }
                }
                
                if (isRight) {
                    console.log(`    [OK] Orphan is RIGHT. No shifting needed for remaining Left child.`);
                }
            }
            console.log('---------------------------------------------------------');
        }
    } finally {
        await mongoose.disconnect();
    }
}

run();
