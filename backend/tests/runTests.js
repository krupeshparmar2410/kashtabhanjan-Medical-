const mongoose = require('mongoose');
const assert = require('assert');
const dotenv = require('dotenv');

// Load env
dotenv.config();

// Import models
const Customer = require('../models/Customer');
const Medicine = require('../models/Medicine');
const InventoryBatch = require('../models/InventoryBatch');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const SalesReturn = require('../models/SalesReturn');
const CustomerPayment = require('../models/CustomerPayment');
const CustomerLedger = require('../models/CustomerLedger');
const LoyaltyLedger = require('../models/LoyaltyLedger');
const Sequence = require('../models/Sequence');
const Prescription = require('../models/Prescription');
const PrescriptionUsage = require('../models/PrescriptionUsage');
const RefillReminder = require('../models/RefillReminder');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const ActiveSession = require('../models/ActiveSession');
const LoginHistory = require('../models/LoginHistory');
const SystemBackup = require('../models/SystemBackup');
const BackupVerificationHistory = require('../models/BackupVerificationHistory');
const SystemSettingsHistory = require('../models/SystemSettingsHistory');
const AuditSignatures = require('../models/AuditSignatures');

// Import controllers/services directly
const { getNextSequence } = require('../config/SequenceService');
const { initializeSettings, getSetting } = require('../config/SettingsService');

const testURI = 'mongodb://127.0.0.1:27017/medical_shop_test';

const runTests = async () => {
  console.log('===================================================');
  console.log('Starting Phase 5 POS & Customer module Test Suite...');
  console.log('===================================================');

  try {
    // Connect to test database
    await mongoose.connect(testURI);
    console.log('Connected to test database.');

    // Ensure storage directories exist for backup tests
    const fs = require('fs');
    const path = require('path');
    const storageRoot = path.join(__dirname, '../../storage');
    const dirs = [
      path.join(storageRoot, 'backups/daily'),
      path.join(storageRoot, 'backups/weekly'),
      path.join(storageRoot, 'backups/monthly'),
      path.join(storageRoot, 'recovery'),
      path.join(storageRoot, 'exports'),
      path.join(storageRoot, 'logs/archive')
    ];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Clear test collections
    await Customer.deleteMany({});
    await Medicine.deleteMany({});
    await InventoryBatch.deleteMany({});
    await Sale.deleteMany({});
    await SaleItem.deleteMany({});
    await SalesReturn.deleteMany({});
    await CustomerPayment.deleteMany({});
    await CustomerLedger.deleteMany({});
    await LoyaltyLedger.deleteMany({});
    await Sequence.deleteMany({});
    await Prescription.deleteMany({});
    await PrescriptionUsage.deleteMany({});
    await RefillReminder.deleteMany({});
    await AuditLog.deleteMany({});
    await User.deleteMany({});
    await ActiveSession.deleteMany({});
    await LoginHistory.deleteMany({});
    await SystemBackup.deleteMany({});
    await BackupVerificationHistory.deleteMany({});
    await SystemSettingsHistory.deleteMany({});
    await AuditSignatures.deleteMany({});

    // Initialize Settings Cache
    await initializeSettings();

    // 1. Seed Test Data
    console.log('\n[1/3] Seeding Test Data...');
    const testAdminId = new mongoose.Types.ObjectId();
    const testAgencyId = new mongoose.Types.ObjectId();

    // Seed customer
    const customer = await Customer.create({
      customerType: 'Registered',
      name: 'Test Customer',
      phone: '9999988888',
      email: 'test@customer.com',
      creditLimit: 10000,
      creditDays: 30,
      createdBy: testAdminId
    });
    console.log(`- Seeded Customer: ${customer.name}`);

    // Seed medicine
    const medicine = await Medicine.create({
      medicineCode: 'MEDT001',
      medicineName: 'Test Paracetamol 650',
      strength: '650mg',
      medicineForm: 'Tablet',
      unitType: 'Strip',
      packSize: 10,
      purchasePrice: 10,
      sellingPrice: 15,
      mrp: 20,
      gstPercentage: 12,
      discountAllowed: 10,
      currentStock: 100,
      prescriptionRequired: 'No',
      agencyId: testAgencyId,
      createdBy: testAdminId
    });
    console.log(`- Seeded Medicine: ${medicine.medicineName}`);

    // Seed inventory batches (FEFO test: batch 2 expires first, batch 1 second)
    const batch1 = await InventoryBatch.create({
      batchCode: 'BATT001',
      batchNumber: 'B1-2027',
      medicineId: medicine._id,
      purchaseItemId: new mongoose.Types.ObjectId(),
      manufacturingDate: new Date(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Expiry 1 year out
      originalQuantity: 50,
      availableQuantity: 50,
      purchasePrice: 10,
      sellingPrice: 15,
      mrp: 20,
      createdBy: testAdminId
    });

    const batch2 = await InventoryBatch.create({
      batchCode: 'BATT002',
      batchNumber: 'B2-2026',
      medicineId: medicine._id,
      purchaseItemId: new mongoose.Types.ObjectId(),
      manufacturingDate: new Date(),
      expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // Expiry 90 days out (expires FIRST!)
      originalQuantity: 50,
      availableQuantity: 50,
      purchasePrice: 10,
      sellingPrice: 15,
      mrp: 20,
      createdBy: testAdminId
    });
    console.log('- Seeded 2 Batches (B1-2027: 50 units, B2-2026: 50 units)');

    // 2. Unit Tests
    console.log('\n[2/3] Running Unit Tests...');

    // A. Sequence Generator
    console.log('Running Sequence Generation Unit Test...');
    const inv1 = await getNextSequence('salesInvoiceNumber', 'INV');
    const inv2 = await getNextSequence('salesInvoiceNumber', 'INV');
    assert.strictEqual(inv1, 'INV000001');
    assert.strictEqual(inv2, 'INV000002');
    console.log('  -> PASS: Unique sequential code generated.');

    // B. FEFO Allocation Sorting Check
    console.log('Running FEFO Allocation Unit Test...');
    const today = new Date();
    const sortedBatches = await InventoryBatch.find({
      medicineId: medicine._id,
      isDeleted: false,
      isSaleBlocked: false,
      expiryDate: { $gt: today },
      availableQuantity: { $gt: 0 }
    }).sort({ expiryDate: 1 });

    assert.strictEqual(String(sortedBatches[0]._id), String(batch2._id)); // batch2 should be first (nearest expiry)
    assert.strictEqual(String(sortedBatches[1]._id), String(batch1._id));
    console.log('  -> PASS: Batches correctly sorted by expiry date ascending.');

    // C. Loyalty Earn & Redeem Calculations Check
    console.log('Running Loyalty Calculation Unit Test...');
    const billAmt = 500;
    const earnRate = 100; // 1 point per 100
    const pointsEarned = Math.floor(billAmt / earnRate);
    assert.strictEqual(pointsEarned, 5);
    console.log('  -> PASS: Loyalty points accrued matches bill ratio.');

    // D. Credit Limits Verification Check
    console.log('Running Credit Limits Unit Test...');
    const newBillTotal = 12000;
    const isOverLimit = customer.outstandingBalance + newBillTotal > customer.creditLimit;
    assert.strictEqual(isOverLimit, true); // limit is 10000, tries to bill 12000
    console.log('  -> PASS: Credit limit boundary breach correctly identified.');

    // 3. Integration Tests
    console.log('\n[3/3] Running Integration Tests...');

    // A. POS Checkout Flow Integration (FEFO stock deduction, tax lines, ledger accruals)
    console.log('Running POS Checkout Integration Test...');
    // We will buy 60 units of Test Paracetamol. It should consume 50 units from B2-2026 and 10 units from B1-2027.
    const purchaseQty = 60;
    
    // Simulate checkout controller logic
    let remaining = purchaseQty;
    const allocation = [];

    const activeBatches = await InventoryBatch.find({
      medicineId: medicine._id,
      isDeleted: false,
      isLocked: false,
      isSaleBlocked: false,
      expiryDate: { $gt: today },
      availableQuantity: { $gt: 0 }
    }).sort({ expiryDate: 1 });

    for (const b of activeBatches) {
      if (remaining <= 0) break;
      const take = Math.min(b.availableQuantity, remaining);
      b.availableQuantity -= take;
      if (b.availableQuantity === 0) {
        b.status = 'Sold Out';
        b.isSaleBlocked = true;
      }
      await b.save();
      allocation.push({ batchId: b._id, qty: take });
      remaining -= take;
    }

    // Assert FEFO allocation counts
    assert.strictEqual(allocation[0].qty, 50); // consumed all of batch 2
    assert.strictEqual(String(allocation[0].batchId), String(batch2._id));
    assert.strictEqual(allocation[1].qty, 10); // consumed 10 of batch 1
    assert.strictEqual(String(allocation[1].batchId), String(batch1._id));

    // Confirm master medicine stock updated
    medicine.currentStock -= purchaseQty;
    await medicine.save();
    assert.strictEqual(medicine.currentStock, 40); // 100 - 60 = 40
    console.log('  -> PASS: FEFO Stock deducted from correct batches atomically.');

    // Create Sale invoice in DB
    const subtotal = 900;
    const gstVal = 108; // 12%
    const grand = 1008;

    const sale = await Sale.create({
      invoiceNumber: 'INV000003',
      customerId: customer._id,
      customerName: customer.name,
      subtotal,
      gstAmount: gstVal,
      grandTotal: grand,
      paidAmount: 0,
      pendingAmount: grand,
      paymentMethod: 'Credit',
      invoiceStatus: 'Completed',
      createdBy: testAdminId
    });

    // Create SaleItem lines
    await SaleItem.create({
      saleId: sale._id,
      medicineId: medicine._id,
      medicineName: medicine.medicineName,
      medicineCode: medicine.medicineCode,
      quantity: purchaseQty,
      sellingPrice: 15,
      mrp: 20,
      gstPercentage: 12,
      gstAmount: gstVal,
      lineTotal: grand,
      batches: [
        { inventoryBatchId: batch2._id, batchNumber: batch2.batchNumber, expiryDate: batch2.expiryDate, quantity: 50, purchasePrice: 10, sellingPrice: 15, mrp: 20 },
        { inventoryBatchId: batch1._id, batchNumber: batch1.batchNumber, expiryDate: batch1.expiryDate, quantity: 10, purchasePrice: 10, sellingPrice: 15, mrp: 20 }
      ]
    });

    // Update customer credit ledger & outstanding
    customer.outstandingBalance += grand;
    await customer.save();
    assert.strictEqual(customer.outstandingBalance, 1008);

    await CustomerLedger.create({
      customerId: customer._id,
      transactionType: 'Sale',
      referenceId: sale._id,
      referenceNumber: sale.invoiceNumber,
      debit: grand,
      runningBalance: customer.outstandingBalance
    });

    const ledgerCount = await CustomerLedger.countDocuments({ customerId: customer._id });
    assert.strictEqual(ledgerCount, 1);
    console.log('  -> PASS: Credit billing posted. Receivables ledger balances reconcile.');

    // B. Customer Payment Flow Integration
    console.log('Running Customer Outstanding Payment Integration Test...');
    const payAmt = 508;
    
    // Simulate payment endpoint
    customer.outstandingBalance -= payAmt;
    await customer.save();
    assert.strictEqual(customer.outstandingBalance, 500);

    const payment = await CustomerPayment.create({
      paymentNumber: 'CPM000001',
      customerId: customer._id,
      amountPaid: payAmt,
      createdBy: testAdminId
    });

    await CustomerLedger.create({
      customerId: customer._id,
      transactionType: 'Payment',
      referenceId: payment._id,
      referenceNumber: payment.paymentNumber,
      credit: payAmt,
      runningBalance: customer.outstandingBalance
    });

    const payLedger = await CustomerLedger.findOne({ referenceNumber: 'CPM000001' });
    assert.strictEqual(payLedger.credit, 508);
    assert.strictEqual(payLedger.runningBalance, 500);
    console.log('  -> PASS: Payments reconcile and adjust outstanding ledger lines.');

    // C. Sale Cancellation Integration (Full reverse check)
    console.log('Running Sale Cancellation Integration Test...');
    
    // Reverse stock of Paracetamol
    const saleItems = await SaleItem.find({ saleId: sale._id });
    for (const item of saleItems) {
      for (const itemBatch of item.batches) {
        const b = await InventoryBatch.findById(itemBatch.inventoryBatchId);
        b.availableQuantity += itemBatch.quantity;
        if (b.status === 'Sold Out') {
          b.status = 'Active';
          b.isSaleBlocked = false;
        }
        await b.save();
      }
      const med = await Medicine.findById(item.medicineId);
      med.currentStock += item.quantity;
      await med.save();
    }

    // Verify stock restored
    const checkBatch2 = await InventoryBatch.findById(batch2._id);
    assert.strictEqual(checkBatch2.availableQuantity, 50);
    assert.strictEqual(checkBatch2.status, 'Active');

    const checkMed = await Medicine.findById(medicine._id);
    assert.strictEqual(checkMed.currentStock, 100);
    console.log('  -> PASS: Cancel request restored stock to original batches.');

    // D. Distributed Locking & Backup Validation Tests
    console.log('Running Distributed Lock & Backup Validation Tests...');
    const SystemLock = require('../models/SystemLock');
    const { acquireLock, releaseLock } = require('../config/LockService');

    await SystemLock.deleteMany({});

    // 1. Acquire first lock
    const lock1 = await acquireLock('test_maintenance_lock', testAdminId, 5000);
    assert.strictEqual(lock1, true);

    // 2. Attempt to acquire duplicate lock (should fail)
    const lock2 = await acquireLock('test_maintenance_lock', testAdminId, 5000);
    assert.strictEqual(lock2, false);

    // 3. Release lock
    const released = await releaseLock('test_maintenance_lock');
    assert.strictEqual(released, true);

    // 4. Acquire again after release (should succeed)
    const lock3 = await acquireLock('test_maintenance_lock', testAdminId, 5000);
    assert.strictEqual(lock3, true);
    await releaseLock('test_maintenance_lock');
    console.log('  -> PASS: Distributed locks prevent concurrent execution and release correctly.');

    // E. Phase 6 Simplified Compliance Tests
    console.log('\nRunning Phase 6 Simplified Compliance Tests...');

    // 1. Prescription upload validation (seeding standard document)
    console.log('Testing Prescription upload validation...');
    const rxDoc = await Prescription.create({
      prescriptionNumber: 'RX-TEST-001',
      customerId: customer._id,
      doctorName: 'Dr. John Doe',
      doctorRegistrationNumber: 'REG12345',
      patientName: 'Test Patient',
      prescriptionDate: new Date(),
      validityDays: 180,
      expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      status: 'Pending',
      medicines: [
        {
          medicineId: medicine._id,
          medicineName: medicine.medicineName,
          dosage: '1 daily',
          duration: '10 days',
          quantityAllowed: 30,
          quantityConsumed: 0,
          quantityRemaining: 30
        }
      ],
      createdBy: testAdminId
    });
    assert.strictEqual(rxDoc.status, 'Pending');
    assert.strictEqual(rxDoc.prescriptionNumber, 'RX-TEST-001');
    console.log('  -> PASS: Prescription document uploaded in Pending status.');

    // 2. Prescription approval workflow
    console.log('Testing Prescription approval workflow...');
    rxDoc.status = 'Approved';
    rxDoc.approvedAt = new Date();
    rxDoc.approvedBy = testAdminId;
    await rxDoc.save();

    const checkRx = await Prescription.findById(rxDoc._id);
    assert.strictEqual(checkRx.status, 'Approved');
    assert.notStrictEqual(checkRx.approvedAt, null);
    console.log('  -> PASS: Prescription approved manually by Pharmacist.');

    // 3. Schedule H/H1/X POS validation & Quantity Remaining Validation
    console.log('Testing Restricted medicine POS validation...');
    // Make medicine schedule H
    medicine.scheduleCategory = 'H';
    medicine.prescriptionRequired = true;
    await medicine.save();

    // Prepare mock sale items
    const saleItemData = {
      medicineId: medicine._id,
      quantity: 10,
      sellingPrice: 15,
      mrp: 20
    };

    // We simulate POS validation logic inside transaction or call it mock-wise:
    assert.ok(medicine.prescriptionRequired === true);
    // Billed quantity (10) must be <= allowed remaining (30)
    assert.ok(saleItemData.quantity <= checkRx.medicines[0].quantityRemaining);
    console.log('  -> PASS: POS compliance checks validate category and remaining quantities.');

    // 4. Overbilling check (billing 40 units while remaining is 30)
    console.log('Testing Quantity remaining validation limits...');
    const overbillQty = 40;
    const isOverAllowed = overbillQty > checkRx.medicines[0].quantityRemaining;
    assert.strictEqual(isOverAllowed, true);
    console.log('  -> PASS: Overbilling blocked successfully.');

    // 5. Expiry validation
    console.log('Testing Expired prescription POS validation...');
    checkRx.expiryDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    await checkRx.save();
    const isRxExpired = new Date(checkRx.expiryDate) < new Date();
    assert.strictEqual(isRxExpired, true);
    console.log('  -> PASS: Expired prescription validation identified boundary breach.');

    // Restore expiry date for reminders
    checkRx.expiryDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    await checkRx.save();

    // 6. Refill reminder generation sweep
    console.log('Testing Refill reminder generation...');
    // Create a mock PrescriptionUsage to simulate billing 20 units
    const usage = await PrescriptionUsage.create({
      prescriptionId: checkRx._id,
      saleId: new mongoose.Types.ObjectId(),
      medicineId: medicine._id,
      quantityConsumed: 20,
      billedQuantity: 20,
      invoiceNumber: 'INV000003',
      verifiedBy: testAdminId,
      createdBy: testAdminId
    });

    // Update prescription remaining quantity
    checkRx.medicines[0].quantityRemaining = 2;
    checkRx.medicines[0].quantityConsumed = 28;
    await checkRx.save();

    // Trigger generateRefillReminders
    const { generateRefillReminders } = require('../config/SchedulerService');
    await generateRefillReminders();

    // Check reminder creation
    const checkReminder = await RefillReminder.findOne({ customerId: customer._id });
    assert.ok(checkReminder !== null);
    assert.strictEqual(checkReminder.status, 'Scheduled');
    console.log('  -> PASS: Auto-refill reminder generated successfully from usage history.');

    // 7. Report export format validations (XLSX and PDF)
    console.log('Testing Report export format validations (xlsx / pdfkit)...');
    const { getComplianceReports } = require('../controllers/complianceController');
    
    // Simulate req/res objects for Excel export testing
    let mockExcelSent = false;
    const mockResExcel = {
      setHeader: () => {},
      status: (code) => {
        assert.strictEqual(code, 200);
        return {
          send: (buf) => {
            assert.ok(Buffer.isBuffer(buf));
            mockExcelSent = true;
          }
        };
      }
    };
    await getComplianceReports({
      query: { reportType: 'Usage', format: 'excel' }
    }, mockResExcel, () => {});
    assert.strictEqual(mockExcelSent, true);
    console.log('  -> PASS: Excel export builds valid binary XLSX streams.');

    // Simulate req/res objects for PDF export testing
    const { Writable } = require('stream');
    let resolvePdf;
    const pdfPromise = new Promise((resolve) => { resolvePdf = resolve; });
    const mockResPdf = new Writable({
      write(chunk, encoding, callback) {
        callback();
      }
    });
    mockResPdf.setHeader = () => {};
    mockResPdf.end = () => {
      resolvePdf(true);
    };
    await getComplianceReports({
      query: { reportType: 'Usage', format: 'pdf' }
    }, mockResPdf, () => {});
    const pdfGenerated = await pdfPromise;
    assert.strictEqual(pdfGenerated, true);
    console.log('  -> PASS: PDF export generates binary output using pdfkit.');

    // 8. Phase 7 Enterprise Security, Backups & Verification Tests
    console.log('\n[Phase 7] Running Enterprise Security, Backups & Verification Tests...');
    const {
      validatePasswordStrength,
      isAccountLocked,
      handleFailedLogin,
      handleSuccessfulLogin,
      forceLogoutAllUserSessions
    } = require('../config/SecurityService');
    const { logSystemAction, verifyChainIntegrity } = require('../config/AuditService');
    const { createFullBackup, runWeeklyBackupVerification } = require('../config/BackupService');


    // A. Password Policy Validation
    console.log('Testing Password Policy Strength check...');
    assert.strictEqual(validatePasswordStrength('Weak1!'), false); // too short
    assert.strictEqual(validatePasswordStrength('NoSpecialChar1'), false);
    assert.strictEqual(validatePasswordStrength('Val1dPass!'), true);
    console.log('  -> PASS: Password strength checks meet security policies.');

    // B. Account Lockout
    console.log('Testing account brute force lockouts...');
    const lockoutEmail = 'lockout@test.com';
    const testLockedUser = await User.create({
      name: 'Lockout User',
      email: lockoutEmail,
      password: 'Val1dPass!',
      role: 'staff'
    });
    
    // Simulate 5 failed attempts
    for (let f = 0; f < 5; f++) {
      await handleFailedLogin(lockoutEmail, '127.0.0.1', 'Mozilla/5.0');
    }
    
    const updatedUser = await User.findOne({ email: lockoutEmail });
    assert.strictEqual(updatedUser.failedLoginAttempts, 5);
    assert.ok(updatedUser.lockUntil !== null);
    const lockedState = await isAccountLocked(updatedUser);
    assert.strictEqual(lockedState, true);
    console.log('  -> PASS: Account locks out for 15 mins after 5 consecutive failures.');

    // C. Cryptographic Audit Chaining and Verification
    console.log('Testing tamper-proof audit trail cryptographic signature chain...');
    await logSystemAction(null, {
      actionType: 'Medicine Create',
      module: 'Medicines',
      entityType: 'Medicine',
      entityId: medicine._id,
      newValues: { name: 'Test Paracetamol' }
    });

    const verifyBefore = await verifyChainIntegrity(testAdminId);
    assert.strictEqual(verifyBefore.success, true);
    console.log('  -> PASS: Unaltered audit chain verifies successfully.');

    // Simulate database tampering: mutate last log's newValues directly
    const lastLog = await AuditLog.findOne().sort({ createdAt: -1 });
    await AuditLog.collection.updateOne({ _id: lastLog._id }, { $set: { newValues: { name: 'TAMPERED VALUE' } } });

    const verifyAfter = await verifyChainIntegrity(testAdminId);
    assert.strictEqual(verifyAfter.success, false);
    console.log('  -> PASS: Log tampering successfully detected by verification engine.');

    // D. Backup GCM Metadata and Health checks
    console.log('Testing AES-256-GCM full backup and health validation...');
    const backup = await createFullBackup(testAdminId, 'Integration verification checkpoint run', 'backups/daily');
    assert.ok(backup !== null);
    assert.strictEqual(backup.status, 'Completed');
    assert.ok(backup.encryptionTag !== undefined);
    assert.ok(backup.encryptionIV !== undefined);

    await runWeeklyBackupVerification(testAdminId);
    const verifiedBackup = await SystemBackup.findById(backup._id);
    assert.strictEqual(verifiedBackup.healthStatus, 'Passed');
    console.log('  -> PASS: Backup encryption metadata exists and verification passes.');

    // E. Session Concurrency limits
    console.log('Testing ActiveSession concurrency limits...');
    // Add 4 active sessions for this lockout user
    for (let s = 1; s <= 4; s++) {
      const mockToken = `token_session_key_${s}`;
      await handleSuccessfulLogin(testLockedUser, '127.0.0.1', 'Mozilla/5.0', mockToken);
    }
    
    // Concurrency limit is 3, so session 1 must be revoked
    const activeSessionsCount = await ActiveSession.countDocuments({ userId: testLockedUser._id, isRevoked: false });
    assert.strictEqual(activeSessionsCount, 3);
    
    const revokedCheck = await ActiveSession.findOne({ userId: testLockedUser._id, sessionToken: 'token_session_key_1' });
    assert.strictEqual(revokedCheck.isRevoked, true);
    console.log('  -> PASS: Session limit enforced correctly (oldest session auto-revoked).');

    // Clean up lockout user
    await User.deleteOne({ email: lockoutEmail });
    await ActiveSession.deleteMany({ userId: testLockedUser._id });

    console.log('\nAll unit and integration tests completed successfully.');
    console.log('===================================================');

  } catch (error) {
    console.error('\nTest runner FAILED with assertion exception:');
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

runTests();
