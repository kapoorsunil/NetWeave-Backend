import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const startWallet = process.argv[2] || '0xB0fAD5d0140529C94D43FDA39e918A23B9E5F555';

async function buildTree(wallet, visited = new Set()) {
    if (!wallet) return null;
    const normalized = wallet.toLowerCase();
    
    // We check locally within the current build path to detect loops in the parent-child relationships
    // but the user also wants to know about duplicates in the general database.
    
    const user = await User.findOne({ walletAddress: new RegExp(`^${wallet}$`, 'i') });
    if (!user) return { wallet, name: 'Not Found' };

    return {
        wallet: user.walletAddress,
        name: user.name || user.username || 'N/A',
        left: await buildTree(user.treeLeftChild, visited),
        right: await buildTree(user.treeRightChild, visited)
    };
}

function formatTree(node, prefix = "", isLeft = true, isRoot = true) {
    if (!node) return "";
    let res = prefix + (isRoot ? "" : (isLeft ? "├── " : "└── ")) + node.name + " (" + node.wallet.slice(0, 6) + "..." + node.wallet.slice(-4) + ")\n";
    let newPrefix = prefix + (isRoot ? "" : (isLeft ? "│   " : "    "));
    res += formatTree(node.left, newPrefix, true, false);
    res += formatTree(node.right, newPrefix, false, false);
    return res;
}

async function run() {
    if (!env.mongoUri) {
        console.error("MONGODB_URI is not defined in environment.");
        process.exit(1);
    }

    await mongoose.connect(env.mongoUri);
    try {
        const tree = await buildTree(startWallet);
        console.log("\n--- TREE STRUCTURE ---");
        console.log(formatTree(tree));

        // Global check for any duplicate walletAddress in the entire collection
        console.log("--- DUPLICATE CHECK ---");
        const allUsers = await User.find({}, { walletAddress: 1 });
        const counts = {};
        allUsers.forEach(u => {
            const w = u.walletAddress.toLowerCase();
            counts[w] = (counts[w] || 0) + 1;
        });
        const duplicates = Object.entries(counts).filter(([w, c]) => c > 1);
        
        if (duplicates.length > 0) {
            console.log("WARNING: DUPLICATE WALLET ADDRESSES FOUND IN DATABASE:");
            duplicates.forEach(([w, c]) => console.log(` - ${w}: ${c} occurrences`));
        } else {
            console.log("No duplicate wallet addresses found in the database.");
        }
    } catch (err) {
        console.error("Error exploring tree:", err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
