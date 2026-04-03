const { User } = require('./src/models/User');
const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const targetWallet = '0xfff852f1ae1a1c58bffc80b8b37acbd1d5750b67';
  const user = await User.findOne({ walletAddress: targetWallet }).select('walletAddress username ancestors');
  
  if (!user) {
    console.log('User not found');
    process.exit(1);
  }

  const ancestors = await User.find({ walletAddress: { $in: user.ancestors } })
    .select('walletAddress username registrationPaymentDone')
    .lean();

  // Sort ancestors by their position in the user's ancestors array (closest first)
  const sortedAncestors = user.ancestors.map(addr => ancestors.find(a => a.walletAddress.toLowerCase() === addr.toLowerCase())).filter(Boolean);

  const fs = require('fs');
  fs.writeFileSync('result.json', JSON.stringify({ user, ancestors: sortedAncestors }, null, 2));
  console.log('Result written to result.json');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
