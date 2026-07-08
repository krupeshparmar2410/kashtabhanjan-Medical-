require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Medicine = require('../models/Medicine');

const fixNullBarcodes = async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();

    console.log('Finding medicines with explicitly null barcode...');
    // Find documents where barcode is null and unset the field to remove it
    const result = await Medicine.updateMany(
      { barcode: null },
      { $unset: { barcode: "" } }
    );

    console.log(`Successfully fixed ${result.modifiedCount} documents (Matched: ${result.matchedCount}).`);
    
    console.log('Disconnecting from database...');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error fixing null barcodes:', error);
    process.exit(1);
  }
};

fixNullBarcodes();
