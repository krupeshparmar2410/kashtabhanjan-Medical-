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
      await Migration.findOneAndUpdate(
        { migrationId: m.migrationId },
        { description: m.description, status: 'Failed' },
        { upsert: true, new: true }
      );
      // Do not block application load entirely, but signal failure
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
