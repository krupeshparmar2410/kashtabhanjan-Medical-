const mongoose = require('mongoose');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const Customer = require('../models/Customer');
const InventoryBatch = require('../models/InventoryBatch');

const devURI = 'mongodb://127.0.0.1:27017/medical_shop';

const seedDevData = async () => {
  try {
    await mongoose.connect(devURI);
    console.log('Connected to development database.');

    // Find admin user
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.error('Please start the dev server first to initialize user collections.');
      process.exit(1);
    }
    const adminId = admin._id;

    // Create a Registered test customer if not exists
    let testCust = await Customer.findOne({ phone: '9876543210' });
    if (!testCust) {
      testCust = await Customer.create({
        customerType: 'Registered',
        name: 'Ramesh Kumar',
        phone: '9876543210',
        email: 'ramesh@gmail.com',
        creditLimit: 5000,
        creditDays: 30,
        outstandingBalance: 0,
        loyaltyPoints: 150,
        createdBy: adminId
      });
      console.log('Seed: Test Customer Ramesh created.');
    } else {
      console.log('Seed: Customer already exists.');
    }

    // Find some medicines to seed batches for
    const crocin = await Medicine.findOne({ medicineName: 'Paracetamol 500mg' });
    const okacet = await Medicine.findOne({ medicineName: 'Cetirizine 10mg' });
    const azee = await Medicine.findOne({ medicineName: 'Azithromycin 500mg' });

    if (crocin) {
      // Seed two batches for crocin (one expiring soon, one later)
      const count = await InventoryBatch.countDocuments({ medicineId: crocin._id });
      if (count === 0) {
        await InventoryBatch.create([
          {
            batchCode: 'BAT-C001',
            batchNumber: 'CR-EXP-90D',
            medicineId: crocin._id,
            purchaseItemId: new mongoose.Types.ObjectId(),
            manufacturingDate: new Date(),
            expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days (warning limit)
            originalQuantity: 100,
            availableQuantity: 100,
            purchasePrice: 10,
            sellingPrice: 15,
            mrp: 20,
            createdBy: adminId
          },
          {
            batchCode: 'BAT-C002',
            batchNumber: 'CR-EXP-1YR',
            medicineId: crocin._id,
            purchaseItemId: new mongoose.Types.ObjectId(),
            manufacturingDate: new Date(),
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 365 days
            originalQuantity: 100,
            availableQuantity: 100,
            purchasePrice: 10,
            sellingPrice: 15,
            mrp: 20,
            createdBy: adminId
          }
        ]);
        
        crocin.currentStock = 200;
        await crocin.save();
        console.log('Seed: 2 Batches for Crocin (Paracetamol) created.');
      }
    }

    if (okacet) {
      const count = await InventoryBatch.countDocuments({ medicineId: okacet._id });
      if (count === 0) {
        await InventoryBatch.create({
          batchCode: 'BAT-O001',
          batchNumber: 'OK-EXP-1YR',
          medicineId: okacet._id,
          purchaseItemId: new mongoose.Types.ObjectId(),
          manufacturingDate: new Date(),
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          originalQuantity: 150,
          availableQuantity: 150,
          purchasePrice: 12,
          sellingPrice: 18,
          mrp: 22,
          createdBy: adminId
        });
        
        okacet.currentStock = 150;
        await okacet.save();
        console.log('Seed: Batch for Okacet (Cetirizine) created.');
      }
    }

    if (azee) {
      // Azithromycin is Schedule H (requires prescription)
      const count = await InventoryBatch.countDocuments({ medicineId: azee._id });
      if (count === 0) {
        await InventoryBatch.create({
          batchCode: 'BAT-A001',
          batchNumber: 'AZ-EXP-1YR',
          medicineId: azee._id,
          purchaseItemId: new mongoose.Types.ObjectId(),
          manufacturingDate: new Date(),
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          originalQuantity: 50,
          availableQuantity: 50,
          purchasePrice: 65,
          sellingPrice: 105,
          mrp: 120,
          createdBy: adminId
        });
        
        azee.currentStock = 50;
        azee.scheduleCategory = 'H';
        azee.prescriptionRequired = 'Yes';
        await azee.save();
        console.log('Seed: Batch for Azee (Azithromycin) created (Schedule H).');
      }
    }

    console.log('Development Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
};

seedDevData();
