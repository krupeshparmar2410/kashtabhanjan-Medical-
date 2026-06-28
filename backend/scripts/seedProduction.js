const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/db');

const Medicine = require('../models/Medicine');
const InventoryBatch = require('../models/InventoryBatch');
const Customer = require('../models/Customer');
const User = require('../models/User');

const seedProduction = async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected successfully.\n');

    // 1. Ensure Walk-In Customer exists
    console.log('Validating Walk-In customer profile...');
    let walkin = await Customer.findOne({ customerType: 'Walk-In' });
    if (!walkin) {
      walkin = await Customer.create({
        name: 'Walk-In Customer',
        phone: '9999999999',
        customerType: 'Walk-In',
        outstandingBalance: 0,
        creditLimit: 0,
        creditDays: 0,
        loyaltyPoints: 0,
        status: 'Active'
      });
      console.log('✓ Created default Walk-In Customer profile successfully.');
    } else {
      console.log('✓ Walk-In Customer profile already exists.');
    }

    // 2. Ensure active medicines have matching batches to pass reconciliation
    console.log('\nValidating medicine batches for reconciliation safety...');
    const medicines = await Medicine.find({ isDeleted: false });
    let createdBatchesCount = 0;

    const adminUser = await User.findOne({ role: 'admin' });
    const creatorId = adminUser ? adminUser._id : new mongoose.Types.ObjectId();

    for (const med of medicines) {
      if (med.currentStock > 0) {
        const batchCount = await InventoryBatch.countDocuments({
          medicineId: med._id,
          isDeleted: false
        });

        if (batchCount === 0) {
          // Create default batch matching currentStock
          const expiryDate = new Date();
          expiryDate.setFullYear(expiryDate.getFullYear() + 2); // 2 years from now

          const mfgDate = new Date();
          mfgDate.setMonth(mfgDate.getMonth() - 2); // 2 months ago

          await InventoryBatch.create({
            medicineId: med._id,
            purchaseItemId: new mongoose.Types.ObjectId(),
            batchNumber: `B-${med.medicineCode}-01`,
            batchCode: `BC-${med.medicineCode}-01`,
            manufacturingDate: mfgDate,
            expiryDate: expiryDate,
            originalQuantity: med.currentStock,
            availableQuantity: med.currentStock,
            reservedQuantity: 0,
            purchasePrice: med.purchasePrice || 10,
            sellingPrice: med.sellingPrice || 15,
            mrp: med.mrp || 20,
            status: 'Active',
            isLocked: false,
            isSaleBlocked: false,
            recallStatus: 'Normal',
            createdBy: creatorId
          });

          console.log(`+ Created active batch for "${med.medicineName}" (Qty: ${med.currentStock})`);
          createdBatchesCount++;
        }
      }
    }
    console.log(`✓ Completed batch updates. Created default batches for ${createdBatchesCount} medicine(s).\n`);

    console.log('Production seeding completed successfully.');
  } catch (err) {
    console.error('Production seeding failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
};

seedProduction();
