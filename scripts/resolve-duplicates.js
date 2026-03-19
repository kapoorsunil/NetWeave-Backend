import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        console.log("\n--- RESOLVING STRUCTURAL DUPLICATES (MULTIPLE PARENTS) ---\n");

        // 1. Resolve Himanshu shekhar (0x0dC3...FDFF)
        // Canonical Parent: Dummy 4-8 (0x00...0015)
        // Wrong Parent: name (0xaC2A...5e37) [Left Child]
        console.log("Fixing Himanshu shekhar...");
        const nameParent = await User.findOne({ walletAddress: /0xaC2Ac1c235c1dCaE982a646Bd9f4787A5Ae35e37/i });
        if (nameParent && nameParent.treeLeftChild?.toLowerCase() === '0x0dc312489559eb418c196de6e5868f9083c3fdff') {
            nameParent.treeLeftChild = null;
            // Since it was a Left child, and there is no Right child (checked in scan), no shifting needed.
            await nameParent.save();
            console.log("  [DONE] Removed Himanshu from 'name' parent links.");
        }

        // 2. Resolve test2 (0xF21c...7608)
        // Canonical Parent: Dummy 4-4 (0x00...0011)
        // Wrong Parent: Dummy 4-5 (0x00...0012) [Right Child]
        console.log("Fixing test2...");
        const dummy45 = await User.findOne({ walletAddress: /0x0000000000000000000000000000000000000012/i });
        if (dummy45 && dummy45.treeRightChild?.toLowerCase() === '0xf21c0f07bbb5a6c2be134fbc923d50b355c67608') {
            dummy45.treeRightChild = null;
            await dummy45.save();
            console.log("  [DONE] Removed test2 from 'Dummy 4-5' parent links.");
        }

        console.log("\n--- STRUCTURAL REPAIR COMPLETE ---");

    } finally {
        await mongoose.disconnect();
    }
}

run();
