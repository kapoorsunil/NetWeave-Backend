import mongoose from 'mongoose';
import { env } from '../src/config/env.js';

async function run() {
    await mongoose.connect(env.mongoUri);
    try {
        const db = mongoose.connection.db;
        const ids = [
            '69b7f9869b8e7366e332bf03',
            '69b7fd459b8e7366e332bf4f',
            '69b8082e102b3b5bb1df7835',
            '69b812ad0bf04dc262ffcc4f'
        ];

        console.log("\n--- SEARCHING FOR SPECIFIC IDs ---\n");
        const collections = await db.listCollections().toArray();
        for (const col of collections) {
            for (const id of ids) {
                const doc = await db.collection(col.name).findOne({ _id: new mongoose.Types.ObjectId(id) });
                if (doc) {
                    console.log(`Found ID ${id} in collection: ${col.name}`);
                    console.log(JSON.stringify(doc, null, 2));
                    console.log('');
                }
            }
        }

        console.log("\n--- SEARCHING FOR ANY NEGATIVE VALUES ---\n");
        for (const col of collections) {
            const query = {
                $or: [
                    { amount: { $lt: 0 } },
                    { usdcAmount: { $lt: 0 } },
                    { referralBalance: { $lt: 0 } },
                    { mainBalance: { $lt: 0 } }
                ]
            };
            const count = await db.collection(col.name).countDocuments(query);
            if (count > 0) {
                console.log(`Found ${count} negative records in: ${col.name}`);
                const examples = await db.collection(col.name).find(query).limit(5).toArray();
                examples.forEach(e => {
                    console.log(`  - Wallet: ${e.walletAddress} | Referral: ${e.referralBalance} | Main: ${e.mainBalance} | ID: ${e._id}`);
                });
            }
        }

    } finally {
        await mongoose.disconnect();
    }
}

run();
