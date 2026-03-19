import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const child = process.argv[2] || '0xC64A0728049738091Ab64352019F4FDD7286E5aD';

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        const parents = await User.find({
            $or: [
                { treeLeftChild: new RegExp(`^${child}$`, 'i') },
                { treeRightChild: new RegExp(`^${child}$`, 'i') }
            ]
        });
        
        console.log(`Parents for ${child}:`);
        parents.forEach(p => {
            console.log(` - ${p.name || p.username || 'N/A'} (${p.walletAddress})`);
        });
    } finally {
        await mongoose.disconnect();
    }
}

run();
