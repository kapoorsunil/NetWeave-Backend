import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const wallets = [
    '0x0dc312489559eb418c196de6e5868f9083c3fdff', // Himanshu shekhar
    '0xf21c0f07bbb5a6c2be134fbc923d50b355c67608'  // test2
];

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        for (const w of wallets) {
            const user = await User.findOne({ walletAddress: new RegExp(`^${w}$`, 'i') });
            if (user) {
                console.log(`User: ${user.name || user.username} (${user.walletAddress})`);
                console.log(`  Canonical Parent (treeParent): ${user.treeParent}`);
                console.log(`  Placement Side: ${user.placementSide}`);
                
                // Also check who actually points to this user in the DB
                const parentsInDB = await User.find({
                    $or: [
                        { treeLeftChild: new RegExp(`^${w}$`, 'i') },
                        { treeRightChild: new RegExp(`^${w}$`, 'i') }
                    ]
                });
                console.log(`  Parents currently pointing to this child in DB:`);
                parentsInDB.forEach(p => {
                    console.log(`    - ${p.name || p.username} (${p.walletAddress}) [L: ${p.treeLeftChild}, R: ${p.treeRightChild}]`);
                });
            }
            console.log('---------------------------------------------------------');
        }
    } finally {
        await mongoose.disconnect();
    }
}

run();
