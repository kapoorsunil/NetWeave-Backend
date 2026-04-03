const { User } = require('./src/models/User');
const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ username: 'jimmyv' }).select('walletAddress username treeParent referredBy ancestors');
  const referrer = await User.findOne({ walletAddress: user.referredBy }).select('username walletAddress');
  const treeParent = await User.findOne({ walletAddress: user.treeParent }).select('username walletAddress');
  const fs = require('fs');
  fs.writeFileSync('result_jimmyv.json', JSON.stringify({ user, referrer, treeParent }, null, 2));
  console.log('Result written to result_jimmyv.json');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
