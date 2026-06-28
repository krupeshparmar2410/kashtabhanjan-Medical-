const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

dotenv.config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/db');
const AuditLog = require('../models/AuditLog');

const runAuditVerification = async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected successfully.\n');

    console.log('--------------------------------------------------');
    console.log('RUNNING CRYPTOGRAPHIC AUDIT LOG CHAIN VERIFICATION');
    console.log('--------------------------------------------------');

    const totalLogs = await AuditLog.countDocuments();
    if (totalLogs === 0) {
      console.log('✓ Audit log collection is empty. Nothing to verify.');
      return;
    }

    console.log(`Scanning ${totalLogs} audit log documents...`);
    const logs = await AuditLog.find().sort({ createdAt: 1 }).lean();

    let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
    let corruptions = 0;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const entityIdStr = log.entityId ? log.entityId.toString() : '';
      const performedByStr = log.performedBy ? log.performedBy.toString() : '';
      const newValuesStr = log.newValues ? JSON.stringify(log.newValues) : '';

      const dataToHash = 
        log.previousHash + 
        log.actionType + 
        log.module + 
        entityIdStr + 
        newValuesStr + 
        performedByStr;

      const calculatedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

      // 1. Verify self-hash matches data
      if (log.hash !== calculatedHash) {
        console.error(`[CORRUPT HASH] Block Index: ${i} | ID: ${log._id}`);
        console.error(`  Expected: ${calculatedHash}`);
        console.error(`  Found:    ${log.hash}`);
        corruptions++;
      }

      // 2. Verify previousHash matches the actual previous entry's hash
      if (log.previousHash !== prevHash) {
        console.error(`[BROKEN LINK] Block Index: ${i} | ID: ${log._id}`);
        console.error(`  Expected previousHash: ${prevHash}`);
        console.error(`  Found previousHash:    ${log.previousHash}`);
        corruptions++;
      }

      prevHash = log.hash;
    }

    console.log('==================================================');
    console.log('AUDIT VERIFICATION SUMMARY');
    console.log('==================================================');
    console.log(`Total blocks scanned: ${totalLogs}`);
    console.log(`Corruptions detected: ${corruptions}`);
    console.log('==================================================\n');

    if (corruptions === 0) {
      console.log('✓ Cryptographic chain integrity is intact. Zero tampering detected.');
    } else {
      console.error(`⚠ Warning: Found ${corruptions} integrity failure(s) in the audit logs.`);
    }

  } catch (error) {
    console.error('Audit verification script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
};

runAuditVerification();
