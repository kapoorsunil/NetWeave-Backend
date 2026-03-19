import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const DEDUCTIONS = [
    { wallet: '0x8479Ec17E4ee77b9d174348f665460859B8F4f14', amount: 44.00 },
    { wallet: '0xB0fAD5d0140529C94D43FDA39e918A23B9E5F555', amount: 7.50 },
    { wallet: '0x0000000000000000000000000000000000000003', amount: 1.50 },
    { wallet: '0xC64A0728049738091Ab64352019F4FDD7286E5aD', amount: 1.00 },
    { wallet: '0x0000000000000000000000000000000000000002', amount: 0.50 },
    { wallet: '0x0000000000000000000000000000000000000009', amount: 0.50 },
    { wallet: '0x0000000000000000000000000000000000000014', amount: 0.25 },
    { wallet: '0x0000000000000000000000000000000000000006', amount: 0.25 },
    { wallet: '0x000000000000000000000000000000000000000f', amount: 0.25 },
    { wallet: '0x0000000000000000000000000000000000000008', amount: 0.25 },
    { wallet: '0x0000000000000000000000000000000000000013', amount: 0.25 },
    { wallet: '0x0000000000000000000000000000000000000015', amount: 0.25 }
];

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        console.log("\n--- PRE-EXECUTION BALANCE AUDIT ---\n");

        for (const entry of DEDUCTIONS) {
            const user = await User.findOne({ walletAddress: new RegExp(`^${entry.wallet}$`, 'i') });
            if (!user) {
                console.log(`User Not Found: ${entry.wallet}`);
                continue;
            }

            const current = user.referralBalance || 0;
            const projected = current - entry.amount;
            const willGoNegative = projected < 0;

            console.log(`User: ${user.name || user.username} (${user.walletAddress})`);
            console.log(`  - Current Balance: $${current.toFixed(2)}`);
            console.log(`  - Proposed Deduction: -$${entry.amount.toFixed(2)}`);
            console.log(`  - Projected Balance: $${projected.toFixed(2)} ${willGoNegative ? '[!!! NEGATIVE !!!]' : '[OK]'}`);
        }

    } finally {
        await mongoose.disconnect();
    }
}

run();
