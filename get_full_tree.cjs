const { User } = require('./src/models/User');
const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  let current = await User.findOne({ username: 'jimmyv' }).select('walletAddress username treeParent');
  const fullPath = [];
  
  while (current && current.treeParent) {
    const parent = await User.findOne({ walletAddress: current.treeParent })
      .select('walletAddress username treeParent registrationPaymentDone');
    if (!parent) break;
    fullPath.push(parent);
    current = parent;
  }

  const fs = require('fs');
  fs.writeFileSync('full_tree_path.json', JSON.stringify(fullPath, null, 2));
  console.log('Full tree path written to full_tree_path.json');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
