import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
const WithdrawRequest = mongoose.model('WithdrawRequest', new mongoose.Schema({}, { strict: false }));
const TopUpRecord = mongoose.model('TopUpRecord', new mongoose.Schema({}, { strict: false }));

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        const wallet = '0x8479Ec17E4ee77b9d174348f665460859B8F4f14';
        console.log(`\n--- FINANCIAL AUDIT: ${wallet} ---\n`);

        const user = await User.findOne({ walletAddress: new RegExp(`^${wallet}$`, 'i') });
        if (!user) {
            console.log("User not found.");
            return;
        }

        console.log("USER PROFILE:");
        console.log(`  Name: ${user.name || user.username}`);
        console.log(`  Referral Balance: $${user.referralBalance ?? 0}`);
        console.log(`  Main Balance: $${user.mainBalance ?? 0}`);
        console.log(`  Is Registered: ${user.isRegistered}`);
        console.log(`  Registration Pay Done: ${user.registrationPaymentDone}`);

        const withdrawals = await WithdrawRequest.find({ walletAddress: new RegExp(`^${wallet}$`, 'i') });
        console.log(`\nWITHDRAWAL REQUESTS (${withdrawals.length}):`);
        withdrawals.forEach(w => {
            console.log(`  - Amount: $${w.amount || w.userAmount} | Status: ${w.status} | Date: ${w.createdAt}`);
        });

        const topups = await TopUpRecord.find({ walletAddress: new RegExp(`^${wallet}$`, 'i') });
        console.log(`\nTOP-UP RECORDS (${topups.length}):`);
        topups.forEach(t => {
            console.log(`  - Amount: $${t.amount || t.usdcAmount} | Status: ${t.status} | Date: ${t.createdAt}`);
        });

    } finally {
        await mongoose.disconnect();
    }
}

run();
