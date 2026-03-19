import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

async function run() {
    if (!env.mongoUri) {
        console.error("MONGODB_URI is not defined.");
        process.exit(1);
    }

    await mongoose.connect(env.mongoUri);
    try {
        const allUsers = await User.find({}, { walletAddress: 1, treeLeftChild: 1, treeRightChild: 1, name: 1, username: 1 });
        const existingWallets = new Set(allUsers.map(u => u.walletAddress.trim().toLowerCase()));
        
        const referencedChildren = new Map(); // childWallet -> [parents]

        allUsers.forEach(parent => {
            [
                { wallet: parent.treeLeftChild, side: 'Left' },
                { wallet: parent.treeRightChild, side: 'Right' }
            ].forEach(c => {
                if (c.wallet) {
                    const normalized = c.wallet.trim().toLowerCase();
                    if (!referencedChildren.has(normalized)) {
                        referencedChildren.set(normalized, []);
                    }
                    referencedChildren.get(normalized).push({
                        parentWallet: parent.walletAddress,
                        parentName: parent.name || parent.username || 'N/A',
                        side: c.side
                    });
                }
            });
        });

        console.log("\n--- ORPHAN NODE ANALYSIS (Referenced as child, missing from DB primary record) ---\n");
        let found = false;
        for (const [child, parents] of referencedChildren.entries()) {
            if (!existingWallets.has(child)) {
                found = true;
                console.log(`[!] ORPHAN WALLET: ${child}`);
                parents.forEach((p, i) => {
                    console.log(`    - Linked as ${p.side} Child of: ${p.parentName} (${p.parentWallet})`);
                });
                console.log('---------------------------------------------------------');
            }
        }

        if (!found) {
            console.log("Success: No orphan nodes were found! All referenced children have corresponding user records.");
        }

    } catch (err) {
        console.error("Error during orphan node analysis:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
