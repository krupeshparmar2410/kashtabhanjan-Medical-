const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/db');
const InventoryBatch = require('../models/InventoryBatch');

const query = async () => {
  await connectDB();
  const doloId = '6a2fde1d5e42c340fc2d21c2';
  const batches = await InventoryBatch.find({ medicineId: doloId });
  console.log(`Found ${batches.length} batches for Dolo 650:`);
  console.log(JSON.stringify(batches, null, 2));
  await mongoose.disconnect();
};

query();
