const Migration = require('../models/Migration');
const Customer = require('../models/Customer');
const User = require('../models/User');

const migrations = [
  {
    migrationId: '20260616-01-seed-walk-in-customer',
    description: 'Seeds a default Walk-In Customer record for quick POS checkout without registration.',
    up: async () => {
      // Find an admin user to link as creator
      const adminUser = await User.findOne({ role: 'admin' });
      const creatorId = adminUser ? adminUser._id : null;

      if (!creatorId) {
        throw new Error('Admin user must exist to associate with Walk-In Customer creation');
      }

      const walkInExists = await Customer.findOne({ customerType: 'Walk-In' });
      if (!walkInExists) {
        await Customer.create({
          customerType: 'Walk-In',
          name: 'Walk-In Customer',
          phone: '0000000000',
          email: 'walkin@kashtbhanjan.com',
          address: 'POS Counter Cash',
          city: 'Local',
          state: 'Gujarat',
          pincode: '380001',
          loyaltyPoints: 0,
          outstandingBalance: 0,
          creditLimit: 0, // No credit limit allowed
          creditDays: 0,
          createdBy: creatorId
        });
        console.log('Migration SUCCESS: Walk-In customer seeded successfully.');
      } else {
        console.log('Migration SKIPPED: Walk-In customer already exists.');
      }
    },
    down: async () => {
      await Customer.deleteOne({ customerType: 'Walk-In' });
      console.log('Migration ROLLBACK: Walk-In customer removed.');
    }
  },
  {
    migrationId: '20260616-02-migrate-medicine-schedules',
    description: 'Initializes scheduleCategory on existing Medicine records based on old flags.',
    up: async () => {
      const Medicine = require('../models/Medicine');
      const medicines = await Medicine.find({});
      for (const med of medicines) {
        let category = 'Normal';
        if (med.scheduleX) category = 'X';
        else if (med.scheduleH1) category = 'H1';
        else if (med.scheduleH) category = 'H';
        med.scheduleCategory = category;
        await med.save();
      }
      console.log('Migration SUCCESS: Medicine schedules migrated.');
    },
    down: async () => {
      console.log('Migration ROLLBACK: Medicine schedules migration skipped rollback.');
    }
  },
  {
    migrationId: '20260624-01-convert-to-single-admin',
    description: 'Converts multi-user database to Single Admin User Architecture by designating primary admin and purging secondary users without altering historical audit logs performedBy ObjectIds.',
    up: async () => {
      const User = require('../models/User');
      const mongoose = require('mongoose');

      // 1. Identify primary admin user
      let primaryAdmin = await User.findOne({ isPrimaryAdmin: true });
      if (!primaryAdmin) {
        primaryAdmin = await User.findOne({ role: 'admin' });
      }
      if (!primaryAdmin) {
        primaryAdmin = await User.findOne({ email: 'admin@kashtbhanjan.com' });
      }
      if (!primaryAdmin) {
        // Fallback: Promote first user or create default admin
        primaryAdmin = await User.findOne({});
        if (primaryAdmin) {
          primaryAdmin.isPrimaryAdmin = true;
          primaryAdmin.role = 'admin';
          primaryAdmin.isActive = true;
          await primaryAdmin.save();
        }
      }

      if (!primaryAdmin) {
        throw new Error('Migration FAILED: No users exist to designate as Primary Administrator.');
      }

      // Ensure primary admin fields are strictly initialized
      primaryAdmin.isPrimaryAdmin = true;
      primaryAdmin.role = 'admin';
      primaryAdmin.isActive = true;
      await primaryAdmin.save();

      const adminId = primaryAdmin._id;

      // 2. Delete all other user accounts
      const deleteResult = await User.deleteMany({ _id: { $ne: adminId } });
      console.log(`Migration LOG: Purged ${deleteResult.deletedCount} secondary user accounts.`);

      // 3. Reassign transactional references in other collections EXCEPT AuditLog
      const collectionsToReassign = [
        { modelPath: '../models/Customer', fields: ['createdBy', 'updatedBy'] },
        { modelPath: '../models/CustomerActivity', fields: ['performedBy'] },
        { modelPath: '../models/CustomerPayment', fields: ['createdBy', 'updatedBy'] },
        { modelPath: '../models/CustomerLedger', fields: ['createdBy'] },
        { modelPath: '../models/LoyaltyLedger', fields: ['createdBy'] },
        { modelPath: '../models/Medicine', fields: ['createdBy', 'updatedBy'] },
        { modelPath: '../models/MedicineActivity', fields: ['createdBy'] },
        { modelPath: '../models/InventoryBatch', fields: ['createdBy'] },
        { modelPath: '../models/InventoryActivity', fields: ['performedBy', 'updatedBy'] },
        { modelPath: '../models/Sale', fields: ['createdBy', 'updatedBy'] },
        { modelPath: '../models/SalesReturn', fields: ['createdBy', 'updatedBy'] },
        { modelPath: '../models/Purchase', fields: ['createdBy', 'updatedBy', 'postedBy'] },
        { modelPath: '../models/PurchaseReturn', fields: ['createdBy'] },
        { modelPath: '../models/SupplierPayment', fields: ['createdBy'] },
        { modelPath: '../models/Prescription', fields: ['createdBy', 'updatedBy', 'approvedBy', 'rejectedBy', 'uploadedBy'] },
        { modelPath: '../models/PrescriptionUsage', fields: ['performedBy', 'createdBy'] },
        { modelPath: '../models/RefillReminder', fields: ['createdBy', 'updatedBy'] },
        { modelPath: '../models/CashClosing', fields: ['performedBy'] },
        { modelPath: '../models/SystemSettingsHistory', fields: ['changedBy'] },
        { modelPath: '../models/SystemBackup', fields: ['createdBy'] }
      ];

      for (const item of collectionsToReassign) {
        try {
          const Model = require(item.modelPath);
          const updateObj = {};
          for (const field of item.fields) {
            updateObj[field] = adminId;
          }
          const res = await Model.updateMany({ [item.fields[0]]: { $ne: adminId } }, { $set: updateObj });
          console.log(`Migration LOG: Reassigned references in ${Model.modelName} (updated count: ${res.modifiedCount}).`);
        } catch (err) {
          console.error(`Migration WARN: Reassignment error on path ${item.modelPath}: ${err.message}`);
        }
      }

      // Verify final user count is exactly 1
      const finalCount = await User.countDocuments();
      if (finalCount !== 1) {
        throw new Error(`Migration FAILED: Expected exactly 1 user account, found ${finalCount}.`);
      }
      console.log('Migration SUCCESS: Single Admin user architecture conversion successfully enforced.');
    },
    down: async () => {
      console.log('Migration ROLLBACK: Single Admin migration rollback skipped to preserve data integrity.');
    }
  }
];

const runMigrations = async () => {
  console.log('Starting database migrations scan...');
  for (const m of migrations) {
    try {
      const alreadyRun = await Migration.findOne({ migrationId: m.migrationId, status: 'Completed' });
      if (!alreadyRun) {
        console.log(`Running migration: ${m.migrationId} - ${m.description}`);
        await m.up();
        await Migration.findOneAndUpdate(
          { migrationId: m.migrationId },
          { description: m.description, status: 'Completed' },
          { upsert: true, new: true }
        );
      }
    } catch (err) {
      console.error(`Migration FAILED: ${m.migrationId}. Reason:`, err.message);
      try {
        await Migration.findOneAndUpdate(
          { migrationId: m.migrationId },
          { description: m.description, status: 'Failed' },
          { upsert: true, new: true }
        );
      } catch (dbErr) {
        console.error('Failed to log migration status to database:', dbErr.message);
      }
      throw new Error(`CRITICAL: Database migration failed for "${m.migrationId}". Reason: ${err.message}`);
    }
  }
  console.log('Database migrations scan finished.');
};

const rollbackMigration = async (migrationId) => {
  const m = migrations.find(x => x.migrationId === migrationId);
  if (!m) {
    throw new Error(`Migration ${migrationId} not found in registered list`);
  }

  console.log(`Rolling back migration: ${m.migrationId}`);
  await m.down();
  await Migration.deleteOne({ migrationId });
  console.log(`Migration ${m.migrationId} rollback completed.`);
};

module.exports = {
  runMigrations,
  rollbackMigration,
  migrationsList: migrations.map(m => ({ id: m.migrationId, desc: m.description }))
};
