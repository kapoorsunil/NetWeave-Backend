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
        
        // Map: childWallet -> [Array of potential parents]
        const parentLinks = new Map();

        allUsers.forEach(parent => {
            const children = [parent.treeLeftChild, parent.treeRightChild].filter(c => !!c);
            children.forEach(child => {
                const normalizedChild = child.trim().toLowerCase();
                if (!parentLinks.has(normalizedChild)) {
                    parentLinks.set(normalizedChild, []);
                }
                parentLinks.get(normalizedChild).push({
                    wallet: parent.walletAddress,
                    name: parent.name || parent.username || 'N/A'
                });
            });
        });

        console.log("\n--- STRUCTURAL DUPLICATE ANALYSIS (Multiple Parents) ---\n");
        let found = false;
        for (const [childWallet, parents] of parentLinks.entries()) {
            if (parents.length > 1) {
                found = true;
                const childRecord = allUsers.find(u => u.walletAddress.trim().toLowerCase() === childWallet);
                const childDisplayName = childRecord ? (childRecord.name || childRecord.username || 'Found in Tree, Missing from DB') : 'Not Found and Not in DB';
                
                console.log(`CHILD WALLET: ${childDisplayName} (${childWallet})`);
                parents.forEach((p, i) => {
                    console.log(`  - Parent ${i + 1}: ${p.name} (${p.wallet})`);
                });
                console.log('---------------------------------------------------------');
            }
        }

        if (!found) {
            console.log("No users with multiple parents were found in the tree.");
        }

    } catch (err) {
        console.error("Error during structural analysis:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
