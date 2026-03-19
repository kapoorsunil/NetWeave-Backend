import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        const allUsers = await User.find({});
        const userMap = new Map(allUsers.map(u => [u.walletAddress.toLowerCase(), u]));
        
        const childLinks = new Map(); // child -> [parents]

        allUsers.forEach(parent => {
            const pWallet = parent.walletAddress.toLowerCase();
            const children = [
                { wallet: parent.treeLeftChild, side: 'Left' },
                { wallet: parent.treeRightChild, side: 'Right' }
            ].filter(c => !!c.wallet);

            children.forEach(c => {
                const cWallet = c.wallet.toLowerCase();
                if (!childLinks.has(cWallet)) childLinks.set(cWallet, []);
                childLinks.get(cWallet).push({
                    parentWallet: parent.walletAddress,
                    parentName: parent.name || parent.username || 'N/A',
                    side: c.side
                });
            });
        });

        console.log("\n--- FULL STRUCTURAL AUDIT REPORT ---\n");

        let issueCount = 0;

        // 1. Multiple Parents
        console.log("1. MULTIPLE PARENT DETECTED:");
        for (const [child, parents] of childLinks.entries()) {
            if (parents.length > 1) {
                issueCount++;
                const childRecord = userMap.get(child);
                const childName = childRecord ? (childRecord.name || childRecord.username || 'Found in Tree, Missing from DB') : 'ORPHAN';
                console.log(`[!] Child: ${childName} (${child})`);
                parents.forEach((p, i) => {
                    console.log(`    Parent ${i+1}: ${p.parentName} (${p.parentWallet}) [${p.side} Side]`);
                });
                console.log("");
            }
        }

        // 2. Self-Loops
        console.log("2. SELF-LOOPS (Parent is its own child):");
        allUsers.forEach(u => {
            const w = u.walletAddress.toLowerCase();
            if (u.treeLeftChild?.toLowerCase() === w || u.treeRightChild?.toLowerCase() === w) {
                issueCount++;
                console.log(`[!] User: ${u.name || u.username} (${u.walletAddress})`);
                if (u.treeLeftChild?.toLowerCase() === w) console.log(`    Points to itself on Left`);
                if (u.treeRightChild?.toLowerCase() === w) console.log(`    Points to itself on Right`);
                console.log("");
            }
        });

        // 3. Parent Pointer Mismatch
        console.log("3. PARENT POINTER INCONSISTENCIES:");
        allUsers.forEach(u => {
            if (u.treeParent) {
                const parent = userMap.get(u.treeParent.toLowerCase());
                if (parent) {
                    if (parent.treeLeftChild?.toLowerCase() !== u.walletAddress.toLowerCase() && 
                        parent.treeRightChild?.toLowerCase() !== u.walletAddress.toLowerCase()) {
                        issueCount++;
                        console.log(`[!] User: ${u.name || u.username} (${u.walletAddress})`);
                        console.log(`    Says its parent is ${parent.name} (${parent.walletAddress})`);
                        console.log(`    BUT that parent does not have this user as a child.`);
                        console.log("");
                    }
                }
            }
        });

        if (issueCount === 0) {
            console.log("No further structural issues found.");
        }

    } finally {
        await mongoose.disconnect();
    }
}

run();
