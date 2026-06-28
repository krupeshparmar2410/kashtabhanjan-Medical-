const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/db');

const Medicine = require('../models/Medicine');
const InventoryBatch = require('../models/InventoryBatch');

const runReconciliationRepair = async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected successfully.\n');

    console.log('--------------------------------------------------');
    console.log('RUNNING MEDICINE STOCK RECONCILIATION REPAIR');
    console.log('--------------------------------------------------');
    const medicines = await Medicine.find({ isDeleted: false });
    let updatedCount = 0;

    for (const med of medicines) {
      const batches = await InventoryBatch.find({
        medicineId: med._id,
        isDeleted: false,
        isLocked: false,
        isSaleBlocked: false,
        status: { $nin: ['Expired', 'Sold Out'] }
      });

      const batchSum = batches.reduce((sum, b) => sum + (b.availableQuantity || 0), 0);
      const roundedBatchSum = Math.round(batchSum * 100) / 100;
      const roundedMasterStock = Math.round(med.currentStock * 100) / 100;

      if (roundedMasterStock !== roundedBatchSum) {
        console.log(`Repairing stock for "${med.medicineName}": ${roundedMasterStock} -> ${roundedBatchSum}`);
        med.currentStock = roundedBatchSum;
        await med.save();
        updatedCount++;
      }
    }

    console.log(`\n✓ Repaired stock quantities for ${updatedCount} medicines.`);
    console.log('--------------------------------------------------\n');

  } catch (error) {
    console.error('Reconciliation repair script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
};

runReconciliationRepair();
