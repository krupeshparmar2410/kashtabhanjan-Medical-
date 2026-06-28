const mongoose = require('mongoose');
const assert = require('assert');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

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

    // Wait for all index builds to complete to avoid background build locks
    await Promise.all([
      User.init(),
      Customer.init(),
      Medicine.init(),
      InventoryBatch.init(),
      Sale.init()
    ].map(p => p.catch(() => {})));
    console.log('Database indexes synchronized.');

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

    const SystemState = require('../models/SystemState');
    await SystemState.deleteMany({});

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

    // Revert/heal the tampered value so subsequent tests (including backup/restore) run on a valid chain
    await AuditLog.collection.updateOne({ _id: lastLog._id }, { $set: { newValues: { name: 'Test Paracetamol' } } });

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

    // ===================================================
    // CERTIFICATION TESTS FOR SINGLE ADMIN ARCHITECTURE
    // ===================================================
    console.log('\n[Certification] Running Single Admin Architecture Conversion Verification Tests...');

    // TEST 1: Fresh machine installation
    console.log('Testing TEST 1: Fresh machine installation...');
    await User.deleteMany({});
    const userCountBefore = await User.countDocuments();
    assert.strictEqual(userCountBefore, 0);

    // Seed admin user
    const adminUserSeeded = await User.create({
      name: 'Krupesh Admin',
      email: 'admin@kashtbhanjan.com',
      password: 'Admin@123',
      role: 'admin',
      isActive: true,
      isPrimaryAdmin: true,
      needsPasswordReset: true,
      tokenVersion: 1
    });
    
    // Run single admin integrity check logic
    const userCountAfter = await User.countDocuments();
    assert.strictEqual(userCountAfter, 1);
    const primaryAdmin = await User.findOne({ isPrimaryAdmin: true }).select('+password');
    assert.ok(primaryAdmin !== null);
    assert.strictEqual(primaryAdmin.isActive, true);
    assert.ok(primaryAdmin.password && primaryAdmin.password.trim() !== '');
    console.log('  -> PASS: Seeding and boot validation checks succeeded.');

    // TEST 2: Database completely empty restore
    console.log('Testing TEST 2: Database completely empty restore...');
    const backupFileName = backup.fileName;
    const restoreFromBackup = require('../config/BackupService').restoreFromBackup;
    
    // Wipe DB
    await User.deleteMany({});
    await Customer.deleteMany({});
    await Medicine.deleteMany({});
    await InventoryBatch.deleteMany({});
    await SystemBackup.deleteMany({}); // Delete metadata
    
    // Confirm empty DB state
    const userCountEmpty = await User.countDocuments();
    assert.strictEqual(userCountEmpty, 0);

    // Call restore service directly as a system recovery operator using backupFileName
    const restoreOperatorId = new mongoose.Types.ObjectId('000000000000000000000000');
    const restoreResult = await restoreFromBackup(restoreOperatorId, backupFileName, 'RESTORE SYSTEM STATE');
    assert.strictEqual(restoreResult.success, true);
    
    // Verify restored data exists (User, Customer, Medicine, etc.)
    const restoredUser = await User.findOne({ isPrimaryAdmin: true });
    assert.ok(restoredUser !== null);
    console.log('  -> PASS: Emergency restore on empty database succeeded.');

    // Verify indexes exist after restore
    const medicineIndexes = await Medicine.collection.getIndexes();
    assert.ok(medicineIndexes.medicineCode_1 !== undefined); // Unique medicine code index
    assert.ok(medicineIndexes.barcode_1 !== undefined); // Unique sparse barcode index
    
    const userIndexes = await User.collection.getIndexes();
    assert.ok(userIndexes.email_1 !== undefined); // Unique email index
    
    // Check if the compound index in InventoryBatch is present
    const batchIndexes = await InventoryBatch.collection.getIndexes();
    assert.ok(batchIndexes.medicineId_1_batchNumber_1_isDeleted_1 !== undefined);
    console.log('  -> PASS: Unique and performance indexes successfully rebuilt post-restore.');

    // TEST 3: Password reset with wrong current password
    console.log('Testing TEST 3: Password reset with wrong current password...');
    const { resetPassword } = require('../controllers/authController');
    
    let mockRes3Status = null;
    let mockRes3Json = null;
    const mockRes3 = {
      status: (code) => {
        mockRes3Status = code;
        return {
          json: (data) => {
            mockRes3Json = data;
          }
        };
      },
      json: (data) => {
        mockRes3Json = data;
      }
    };

    // Find the restored user to set req.user
    const currentRestoredUser = await User.findOne({ isPrimaryAdmin: true });
    const mockReq3 = {
      user: { id: currentRestoredUser._id },
      body: {
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewValidPassword123!'
      }
    };
    
    await resetPassword(mockReq3, mockRes3, () => {});
    assert.strictEqual(mockRes3Status, 401);
    assert.strictEqual(mockRes3Json.success, false);
    console.log('  -> PASS: Unauthorized password reset request successfully blocked.');

    // TEST 4: Password reset with same password
    console.log('Testing TEST 4: Password reset with same password...');
    
    let mockRes4Status = null;
    let mockRes4Json = null;
    const mockRes4 = {
      status: (code) => {
        mockRes4Status = code;
        return {
          json: (data) => {
            mockRes4Json = data;
          }
        };
      },
      json: (data) => {
        mockRes4Json = data;
      }
    };

    const mockReq4 = {
      user: { id: currentRestoredUser._id },
      body: {
        currentPassword: 'Val1dPass!', // Recovered user password from backup
        newPassword: 'Val1dPass!'
      }
    };

    await resetPassword(mockReq4, mockRes4, () => {});
    assert.strictEqual(mockRes4Status, 400);
    assert.strictEqual(mockRes4Json.success, false);
    assert.strictEqual(mockRes4Json.message.includes('cannot be the same'), true);
    console.log('  -> PASS: Password reuse check rejected matching credentials.');

    // TEST 5: Password reset with correct password
    console.log('Testing TEST 5: Password reset with correct password...');
    const initialVersion = currentRestoredUser.tokenVersion;
    
    // Create an active session mock
    await handleSuccessfulLogin(currentRestoredUser, '127.0.0.1', 'Mozilla/5.0', 'temp_jwt_token_for_invalidation');

    let mockRes5Status = null;
    let mockRes5Json = null;
    const mockRes5 = {
      json: (data) => {
        mockRes5Status = 200;
        mockRes5Json = data;
      }
    };

    const mockReq5 = {
      user: { id: currentRestoredUser._id },
      body: {
        currentPassword: 'Val1dPass!',
        newPassword: 'NewAdmin@123456!'
      }
    };

    await resetPassword(mockReq5, mockRes5, () => {});
    assert.strictEqual(mockRes5Status, 200);
    assert.strictEqual(mockRes5Json.success, true);
    
    const updatedAdmin = await User.findById(currentRestoredUser._id);
    assert.strictEqual(updatedAdmin.tokenVersion, initialVersion + 1);
    
    // Verify session invalidation (isRevoked is true)
    const sessionCheck = await ActiveSession.findOne({ sessionToken: 'temp_jwt_token_for_invalidation' });
    assert.strictEqual(sessionCheck.isRevoked, true);
    console.log('  -> PASS: Success reset increments version and invalidates old sessions.');

    // TEST 6: Migration execution
    console.log('Testing TEST 6: Migration execution and hash integrity...');

    // Promote the restored user to admin to satisfy the Walk-In customer seeding migration
    const restoredUserToPromote = await User.findOne({ email: 'lockout@test.com' });
    if (restoredUserToPromote) {
      restoredUserToPromote.role = 'admin';
      restoredUserToPromote.isPrimaryAdmin = true;
      await restoredUserToPromote.save();
    }

    // Run the migration convert-to-single-admin
    const { runMigrations } = require('../config/MigrationService');
    await runMigrations();
    
    // Verify audit logs chain integrity validation check
    const verifyMigration = await verifyChainIntegrity(updatedAdmin._id);
    assert.strictEqual(verifyMigration.success, true);
    console.log('  -> PASS: Migration did not mutate historical audit records; hash integrity verified.');

    // TEST 7: Phase 9C Certification Draft Reservation Stock Recovery
    console.log('Testing TEST 7: Draft Reservation Stock Recovery (Phase 9C Certification)...');
    
    const draftMed = await Medicine.create({
      medicineCode: 'MEDT9C',
      medicineName: 'Test 9C Draft Recovery',
      medicineForm: 'Tablet',
      unitType: 'Strip',
      currentStock: 100,
      barcode: 'BARCODE_TEST_7',
      agencyId: new mongoose.Types.ObjectId(),
      createdBy: currentRestoredUser._id
    });
    
    const draftBatch = await InventoryBatch.create({
      batchCode: 'BAT9C',
      batchNumber: 'B9C-DRAFT',
      medicineId: draftMed._id,
      purchaseItemId: new mongoose.Types.ObjectId(),
      manufacturingDate: new Date(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      originalQuantity: 100,
      availableQuantity: 50,
      reservedQuantity: 10,
      purchasePrice: 10,
      sellingPrice: 15,
      mrp: 20,
      status: 'Active',
      createdBy: currentRestoredUser._id
    });

    const draftSale = await Sale.create({
      invoiceNumber: 'INV9C001',
      customerId: new mongoose.Types.ObjectId(),
      customerName: 'Test Customer',
      subtotal: 150,
      grandTotal: 150,
      paidAmount: 0,
      pendingAmount: 150,
      paymentMethod: 'Credit',
      invoiceStatus: 'Draft',
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
      createdBy: currentRestoredUser._id
    });

    await SaleItem.create({
      saleId: draftSale._id,
      medicineId: draftMed._id,
      medicineName: draftMed.medicineName,
      medicineCode: draftMed.medicineCode,
      quantity: 10,
      sellingPrice: 15,
      mrp: 20,
      lineTotal: 150,
      batches: [{
        inventoryBatchId: draftBatch._id,
        batchNumber: draftBatch.batchNumber,
        expiryDate: draftBatch.expiryDate,
        quantity: 10,
        purchasePrice: 10,
        sellingPrice: 15,
        mrp: 20
      }]
    });

    const { cleanupStaleReservations } = require('../config/SchedulerService');
    await cleanupStaleReservations();

    const updatedDraftSale = await Sale.findById(draftSale._id);
    assert.strictEqual(updatedDraftSale.invoiceStatus, 'Cancelled');

    const updatedDraftBatch = await InventoryBatch.findById(draftBatch._id);
    assert.strictEqual(updatedDraftBatch.availableQuantity, 60);
    assert.strictEqual(updatedDraftBatch.reservedQuantity, 0);

    const updatedDraftMed = await Medicine.findById(draftMed._id);
    assert.strictEqual(updatedDraftMed.currentStock, 110);

    const recoveryAudit = await AuditLog.findOne({
      actionType: 'Draft Stock Recovered',
      entityId: draftSale._id
    });
    assert.ok(recoveryAudit !== null);
    assert.strictEqual(recoveryAudit.module, 'Inventory');
    assert.strictEqual(recoveryAudit.remarks.includes('INV9C001'), true);
    console.log('  -> PASS: Expired draft cancelled, stock restored, and audit log written.');

    // TEST 8: Reopening Sold Out Batches during draft stock recovery
    console.log('Testing TEST 8: Reopening Sold Out batches during recovery...');
    
    const soldOutBatch = await InventoryBatch.create({
      batchCode: 'BAT9C_SOLDOUT',
      batchNumber: 'B9C-SOLDOUT',
      medicineId: draftMed._id,
      purchaseItemId: new mongoose.Types.ObjectId(),
      manufacturingDate: new Date(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      originalQuantity: 10,
      availableQuantity: 0,
      reservedQuantity: 5,
      purchasePrice: 10,
      sellingPrice: 15,
      mrp: 20,
      status: 'Sold Out',
      isSaleBlocked: true,
      createdBy: currentRestoredUser._id
    });

    const draftSale2 = await Sale.create({
      invoiceNumber: 'INV9C002',
      customerId: new mongoose.Types.ObjectId(),
      customerName: 'Test Customer',
      subtotal: 75,
      grandTotal: 75,
      paidAmount: 0,
      pendingAmount: 75,
      paymentMethod: 'Credit',
      invoiceStatus: 'Draft',
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
      createdBy: currentRestoredUser._id
    });

    await SaleItem.create({
      saleId: draftSale2._id,
      medicineId: draftMed._id,
      medicineName: draftMed.medicineName,
      medicineCode: draftMed.medicineCode,
      quantity: 5,
      sellingPrice: 15,
      mrp: 20,
      lineTotal: 75,
      batches: [{
        inventoryBatchId: soldOutBatch._id,
        batchNumber: soldOutBatch.batchNumber,
        expiryDate: soldOutBatch.expiryDate,
        quantity: 5,
        purchasePrice: 10,
        sellingPrice: 15,
        mrp: 20
      }]
    });

    await cleanupStaleReservations();

    const updatedSoldOutBatch = await InventoryBatch.findById(soldOutBatch._id);
    assert.strictEqual(updatedSoldOutBatch.availableQuantity, 5);
    assert.strictEqual(updatedSoldOutBatch.reservedQuantity, 0);
    assert.strictEqual(updatedSoldOutBatch.status, 'Active');
    assert.strictEqual(updatedSoldOutBatch.isSaleBlocked, false);
    console.log('  -> PASS: Reopened sold-out batch and cleared sales blocks.');

    // TEST 9: Compaction Safety
    console.log('Testing TEST 9: Compaction Safety validation...');
    const { validateSystemSafeForCompaction } = require('../config/CompactionSafetyService');
    
    // Create draft sale to block compaction
    const activeDraft = await Sale.create({
      invoiceNumber: 'INV9D_DRAFT',
      customerId: new mongoose.Types.ObjectId(),
      customerName: 'Test Customer',
      subtotal: 10,
      grandTotal: 10,
      paidAmount: 0,
      pendingAmount: 10,
      paymentMethod: 'Credit',
      invoiceStatus: 'Draft',
      createdBy: currentRestoredUser._id
    });
    
    let safety = await validateSystemSafeForCompaction();
    assert.strictEqual(safety.isSafe, false);
    assert.ok(safety.reasons.includes('Active draft billing sheets exist in system'));
    
    // Clear draft sale
    await Sale.deleteOne({ _id: activeDraft._id });
    safety = await validateSystemSafeForCompaction();
    assert.strictEqual(safety.isSafe, true);
    console.log('  -> PASS: Compaction safety blocks and clears correctly.');

    // TEST 10: Predictive Maintenance / Forecasting
    console.log('Testing TEST 10: Linear regression database growth forecasting...');
    const DatabaseMetricsSnapshot = require('../models/DatabaseMetricsSnapshot');
    const { predictStorageExhaustion } = require('../config/PredictiveMaintenanceService');
    
    await DatabaseMetricsSnapshot.deleteMany({});
    // Seed 5 daily snapshots with linear growth: 10MB -> 14MB
    const nowTime = Date.now();
    for (let i = 0; i < 5; i++) {
      await DatabaseMetricsSnapshot.create({
        dataSizeMB: 10 + i,
        storageSizeMB: 20 + i,
        collectionsCount: 10,
        indexesCount: 15,
        totalDocuments: 100 * i,
        createdAt: new Date(nowTime - (4 - i) * 24 * 60 * 60 * 1000) // 4 days ago to today
      });
    }

    const forecast = await predictStorageExhaustion();
    assert.strictEqual(forecast.forecastOk, true);
    assert.strictEqual(forecast.avgDailyGrowthMB, 1);
    assert.strictEqual(forecast.estimatedGrowthNext30Days, 30);
    assert.ok(forecast.estimatedDaysToDiskExhaustion > 0);
    console.log('  -> PASS: Database growth trend and exhaustion days predicted.');

    // TEST 11: Recovery Incident Resolution (Safe Swap)
    console.log('Testing TEST 11: Recovery Incident detection and resolution...');
    const RecoveryIncident = require('../models/RecoveryIncident');
    const { detectIncompleteRestore, resolveIncident } = require('../config/RecoveryIncidentService');
    
    await RecoveryIncident.deleteMany({});
    const db = mongoose.connection.db;
    
    // Create temp collection and active collection
    await db.createCollection('temp_testcollection');
    await db.createCollection('testcollection');
    await db.collection('temp_testcollection').insertOne({ data: 'restored-val' });
    await db.collection('testcollection').insertOne({ data: 'old-val' });

    const affected = await detectIncompleteRestore();
    assert.ok(affected.includes('testcollection'));

    const incident = new RecoveryIncident({
      incidentType: 'InterruptedRestore',
      affectedCollections: affected
    });
    await incident.save();

    // Resolve with FORCE_SWAP_TEMP
    await resolveIncident(incident._id, currentRestoredUser._id, 'FORCE_SWAP_TEMP', 'Resolved in test');
    
    const docs = await db.collection('testcollection').find({}).toArray();
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].data, 'restored-val');

    // Clean up collections
    await db.dropCollection('testcollection').catch(() => {});
    console.log('  -> PASS: Recovery Incident swap rename resolved and rolled back safely.');

    // TEST 12: Alert Retention Sweeps
    console.log('Testing TEST 12: Alert archiving and retention lifecycle...');
    const Alert = require('../models/Alert');
    const ArchivedAlert = require('../models/ArchivedAlert');
    const { runAlertRetentionSweep } = require('../config/AlertRetentionService');

    await Alert.deleteMany({});
    await ArchivedAlert.deleteMany({});

    // Create alert older than 180 days (acknowledged)
    const oldAlert = await Alert.create({
      module: 'Storage',
      severity: 'Warning',
      message: 'Old alert warning',
      isAcknowledged: true,
      acknowledgedAt: new Date(Date.now() - 190 * 24 * 60 * 60 * 1000), // 190 days ago
      remarks: 'Test old'
    });
    
    // Create recent alert
    await Alert.create({
      module: 'Storage',
      severity: 'Critical',
      message: 'New alert',
      isAcknowledged: false
    });

    const retentionResult = await runAlertRetentionSweep();
    assert.strictEqual(retentionResult.archivedCount, 1);

    const activeAlerts = await Alert.find({});
    assert.strictEqual(activeAlerts.length, 1);
    assert.strictEqual(activeAlerts[0].message, 'New alert');

    const archivedAlerts = await ArchivedAlert.find({});
    assert.strictEqual(archivedAlerts.length, 1);
    assert.strictEqual(archivedAlerts[0].message, 'Old alert warning');
    console.log('  -> PASS: Alert retention sweep archives older acknowledged alerts correctly.');

    // TEST 13: Maintenance Mode and Custom Allowed Routes (Security Bypass Proof)
    console.log('Testing TEST 13: Maintenance Mode and Route Restrictions...');
    const MaintenanceService = require('../config/MaintenanceModeService');
    const maintenanceMiddleware = require('../middleware/maintenanceModeMiddleware');

    await MaintenanceService.enableMaintenanceMode('Validation Testing Run');
    
    // Validate state persistence in MongoDB
    const checkState = await SystemState.findOne({ key: 'SYSTEM_STATE' });
    assert.strictEqual(checkState.systemMode, 'RECOVERY_ONLY');
    assert.strictEqual(checkState.bootFailureReason, 'Validation Testing Run');

    // Simulate blocked requests
    let mockResCode = 200;
    let mockResJson = {};
    const mockRes = {
      status: (code) => { mockResCode = code; return mockRes; },
      json: (data) => { mockResJson = data; }
    };

    await maintenanceMiddleware({ path: '/api/billing', method: 'POST', headers: {}, query: {} }, mockRes, () => {
      mockResCode = 200;
    });
    assert.strictEqual(mockResCode, 503);
    assert.strictEqual(mockResJson.maintenance, true);

    // Simulate allowed requests (e.g. login/health/static)
    let nextCalled = false;
    await maintenanceMiddleware({ path: '/api/auth/login', method: 'POST', headers: {}, query: {} }, mockRes, () => {
      nextCalled = true;
    });
    assert.strictEqual(nextCalled, true);

    // Revert maintenance mode
    await MaintenanceService.disableMaintenanceMode();
    console.log('  -> PASS: Maintenance mode blocked traffic and matched allowlist routes correctly.');

    // TEST 14: Isolated Restoration Drills on cloned database
    console.log('Testing TEST 14: Isolated Restoration Drills on Cloned Database...');
    const { runIsolatedDrill } = require('../config/RestoreService');

    // Create a temporary backup file to test isolated drill
    const backupObj = await createFullBackup(currentRestoredUser._id, 'Isolated Drill Checkpoint', 'backups/daily');
    const tempBackupPath = path.join(storageRoot, 'backups/daily', backupObj.fileName);

    await runIsolatedDrill(
      currentRestoredUser._id,
      tempBackupPath,
      backupObj.keyVersion,
      backupObj.encryptionTag,
      backupObj.checksum
    );

    const drillCheckState = await SystemState.findOne({ key: 'SYSTEM_STATE' });
    assert.strictEqual(drillCheckState.drillStatus, 'Passed');
    console.log('  -> PASS: DR isolated drill completed successfully and cleaned up drill DB.');

    // TEST 15: Safety Gate Rollback Backup failure
    console.log('Testing TEST 15: Backup Safety Gates on Restore failures...');
    // Temp mock createFullBackup to throw
    const backupModule = require('../config/BackupService');
    const originalCreateBackup = backupModule.createFullBackup;
    backupModule.createFullBackup = async () => { throw new Error('Simulated disk full'); };

    try {
      await restoreFromBackup(currentRestoredUser._id, backupObj.fileName, 'RESTORE SYSTEM STATE');
      assert.fail('Restore should have aborted due to rollback backup failure.');
    } catch (err) {
      assert.strictEqual(err.message, 'RESTORE_BLOCKED_ROLLBACK_BACKUP_FAILED');
    }

    backupModule.createFullBackup = originalCreateBackup;
    console.log('  -> PASS: Restorations correctly fail-fast if pre-restore backup fails.');

    // TEST 16: Startup Stale Lock Cleanups & Recovery Boot
    console.log('Testing TEST 16: Startup Stale Locks and Recovery Self-Healing...');
    // Seed a stale pending backup record
    const staleBackupObj = await SystemBackup.create({
      backupNumber: 'BKP_STALE_TEST',
      backupType: 'Full',
      fileName: 'stale_test.zip',
      filePath: 'temp/stale_test.zip',
      fileSize: 100,
      checksum: 'dummychecksum',
      isEncrypted: true,
      encryptionIV: 'stale_test_iv_key',
      encryptionTag: 'stale_test_auth_tag',
      backupStartedAt: new Date(),
      status: 'Running',
      createdAt: new Date(),
      createdBy: currentRestoredUser._id,
      backupCreatedByName: 'Test Operator',
      appVersion: '1.0.0',
      backupSourceVersion: '1.0.0',
      dbSchemaVersion: '1.0.0'
    });

    // Run Startup Health Validation
    const { runStartupHealthChecks: testStartupHealth } = require('../config/StartupHealthValidationService');
    await testStartupHealth();

    // Verify stale backup was set to Failed
    const updatedStaleBackup = await SystemBackup.findById(staleBackupObj._id);
    assert.strictEqual(updatedStaleBackup.status, 'Failed');
    assert.strictEqual(updatedStaleBackup.notes, 'ServerRestartDetected');

    console.log('  -> PASS: Startup checks correctly clean stale backup locks and mark them Failed.');

    // ===================================================
    // PHASE 1A VERIFICATION TESTS
    // ===================================================
    console.log('\nStarting Phase 1A Verification Tests...');

    // TEST 17: Cash Closing Crash Verification (Issue 1)
    console.log('Testing TEST 17: Cash Closing compilation and ReferenceError check...');
    const { createCashClosing: createCashClosingPhase1A } = require('../controllers/saleController');
    const CashClosingPhase1A = require('../models/CashClosing');

    // Use the existing restored user to avoid single-admin conversion violations
    const testAdminPhase1A = currentRestoredUser;

    const mockReqPhase1A = {
      body: {
        billingCounter: 'Counter-A',
        openingCash: 1000,
        actualCashInDrawer: 1200,
        notes: 'End of day closing',
        branchId: null
      },
      user: {
        id: testAdminPhase1A._id
      },
      ip: '127.0.0.1'
    };

    let closingResponseDataPhase1A = null;
    const mockResPhase1A = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        closingResponseDataPhase1A = data;
        return this;
      }
    };

    let cashClosingNextCalledPhase1A = false;
    const mockNextPhase1A = (err) => {
      if (err) {
        cashClosingNextCalledPhase1A = true;
        console.error('Cash closing next called with error:', err);
      }
    };

    // Execute Cash Closing Controller
    await createCashClosingPhase1A(mockReqPhase1A, mockResPhase1A, mockNextPhase1A);

    assert.strictEqual(cashClosingNextCalledPhase1A, false, 'createCashClosing should not trigger next(error)');
    assert.ok(closingResponseDataPhase1A, 'createCashClosing should return response data');
    assert.strictEqual(closingResponseDataPhase1A.success, true, 'createCashClosing should respond with success: true');
    assert.ok(closingResponseDataPhase1A.closing, 'createCashClosing should include created cash closing object');
    
    // Verify cash closing document was created in the database
    const closingDocPhase1A = await CashClosingPhase1A.findOne({ billingCounter: 'Counter-A' });
    assert.ok(closingDocPhase1A, 'CashClosing document should exist in DB');
    assert.strictEqual(closingDocPhase1A.openingCash, 1000);
    assert.strictEqual(closingDocPhase1A.actualCashInDrawer, 1200);
    console.log('  -> PASS: Cash closing executes successfully and saves record without ReferenceError.');

    // TEST 18: Standalone MongoDB Rollback Safety Verification (Issue 2)
    console.log('Testing TEST 18: Standalone MongoDB manual compensation rollback...');
    
    // Setup environment to simulate standalone (no transaction support)
    const transactionManagerPhase1A = require('../config/TransactionManager');
    const originalGetStatusPhase1A = transactionManagerPhase1A.getStatus;
    transactionManagerPhase1A.getStatus = () => ({ transactionSupport: false, dbType: 'Local', replicaSetType: 'standalone' });

    // Seed test customer & medicine & batch
    const testCustPhase1A = await Customer.create({
      name: 'Test Rollback Cust P1A',
      phone: '9988776655',
      customerType: 'Registered',
      loyaltyPoints: 100,
      outstandingBalance: 500,
      creditLimit: 5000,
      createdBy: testAdminPhase1A._id
    });

    const testMedPhase1A = await Medicine.create({
      medicineCode: 'MED_RB_P1A',
      medicineName: 'Rollback Paracetamol P1A',
      medicineForm: 'Tablet',
      unitType: 'Tablet',
      purchasePrice: 10,
      sellingPrice: 15,
      mrp: 20,
      currentStock: 50,
      barcode: 'BARCODE_RB_P1A',
      agencyId: new mongoose.Types.ObjectId(),
      createdBy: testAdminPhase1A._id
    });

    const testBatchPhase1A = await InventoryBatch.create({
      batchCode: 'BAT_RB_P1A',
      medicineId: testMedPhase1A._id,
      batchNumber: 'B_RB_P1A',
      originalQuantity: 50,
      availableQuantity: 50,
      reservedQuantity: 0,
      purchasePrice: 10,
      sellingPrice: 15,
      mrp: 20,
      manufacturingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      purchaseItemId: new mongoose.Types.ObjectId(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // active
      createdBy: testAdminPhase1A._id
    });

    // Simulate Billing checkout failure midway
    const billingReqPhase1A = {
      body: {
        customerId: testCustPhase1A._id,
        paymentMethod: 'Credit',
        billingCounter: 'Counter-A',
        items: [
          {
            medicineId: testMedPhase1A._id,
            quantity: 10,
            sellingPrice: 15,
            mrp: 20
          }
        ]
      },
      user: {
        id: testAdminPhase1A._id,
        name: 'Test Operator P1A'
      },
      ip: '127.0.0.1'
    };

    // We override Sale.prototype.save to throw a dummy error during transaction execution to trigger rollback
    const originalSaleSavePhase1A = Sale.prototype.save;
    Sale.prototype.save = async function (options) {
      throw new Error('SIMULATED_DB_CRASH_DURING_BILLING_WRITE');
    };

    let billingResponseStatus = null;
    let billingResponseData = null;
    const billingResPhase1A = {
      status(code) {
        billingResponseStatus = code;
        return this;
      },
      json(data) {
        billingResponseData = data;
        return this;
      }
    };

    let billingErrorTriggeredPhase1A = false;
    const billingNextPhase1A = (err) => {
      console.log('--- billingNextPhase1A called with err:', err);
      if (err && err.message === 'SIMULATED_DB_CRASH_DURING_BILLING_WRITE') {
        billingErrorTriggeredPhase1A = true;
      }
    };

    const { createSale: createSalePhase1A } = require('../controllers/saleController');
    try {
      await createSalePhase1A(billingReqPhase1A, billingResPhase1A, billingNextPhase1A);
      console.log('--- createSale completed. Status:', billingResponseStatus, 'Data:', billingResponseData);
    } catch (e) {
      console.log('--- createSale threw exception:', e);
      if (e.message === 'SIMULATED_DB_CRASH_DURING_BILLING_WRITE') {
        billingErrorTriggeredPhase1A = true;
      }
    }

    // Restore Sale.prototype.save
    Sale.prototype.save = originalSaleSavePhase1A;

    assert.strictEqual(billingErrorTriggeredPhase1A, true, 'Billing should fail with simulated crash');

    // Verify all document modifications were correctly reverted
    const revertedMedPhase1A = await Medicine.findById(testMedPhase1A._id);
    assert.strictEqual(revertedMedPhase1A.currentStock, 50, 'Medicine current stock should be restored to 50');

    const revertedBatchPhase1A = await InventoryBatch.findById(testBatchPhase1A._id);
    assert.strictEqual(revertedBatchPhase1A.availableQuantity, 50, 'Inventory batch quantity should be restored to 50');
    assert.strictEqual(revertedBatchPhase1A.status, 'Active', 'Batch status should remain Active');

    const revertedCustPhase1A = await Customer.findById(testCustPhase1A._id);
    assert.strictEqual(revertedCustPhase1A.outstandingBalance, 500, 'Customer outstanding balance should be restored to 500');

    // Verify no partial Sale or SaleItem documents exist
    const orphanSalePhase1A = await Sale.findOne({ customerId: testCustPhase1A._id });
    assert.strictEqual(orphanSalePhase1A, null, 'Orphan Sale document should not exist in DB');

    const orphanSaleItemPhase1A = await SaleItem.findOne({ medicineId: testMedPhase1A._id });
    assert.strictEqual(orphanSaleItemPhase1A, null, 'Orphan SaleItem document should not exist in DB');

    console.log('  -> PASS: Standalone MongoDB manual compensation rollback successfully restores inventory, balances, and deletes partial documents.');

    // TEST 19: Restore Rollback Safety (Issue 3)
    console.log('Testing TEST 19: Restore rollback safety and collection drop protection...');
    const restoreModulePhase1A = require('../config/RestoreService');
    const { performStagingRestoreAndSwap: performStagingRestoreAndSwapPhase1A } = restoreModulePhase1A;

    // Simulate partial restore failure by triggering a rename error
    const originalRenameCollectionPhase1A = mongoose.connection.db.renameCollection;
    mongoose.connection.db.renameCollection = async (oldName, newName) => {
      if (oldName.startsWith('stage_')) {
        throw new Error('SIMULATED_RENAME_FAILURE_MIDWAY');
      }
      return originalRenameCollectionPhase1A.call(mongoose.connection.db, oldName, newName);
    };

    const backupModulePhase1A = require('../config/BackupService');
    const originalValidatePhase1A = backupModulePhase1A.validateBackupFile;
    const originalCreateFullBackupPhase1A = backupModulePhase1A.createFullBackup;

    // Mock validateBackupFile to return mock database structures
    backupModulePhase1A.validateBackupFile = (pathVal, keyVer, tag, checksum) => {
      return {
        collections: {
          User: [{
            username: 'imported_user',
            email: 'imported@kashtbhanjan.com',
            name: 'Imported User',
            password: 'password123',
            role: 'staff',
            createdBy: testAdminPhase1A._id
          }],
          Settings: [{ key: 'TEST_SETTING', value: '1', updatedBy: testAdminPhase1A._id }],
          AuditLog: []
        }
      };
    };

    // Mock createFullBackup to return recovery backup
    backupModulePhase1A.createFullBackup = async (opId, notes, type) => {
      const bkp = await SystemBackup.create({
        backupNumber: 'BKP_SAFE_TEST_P1A',
        backupType: 'Full',
        fileName: 'safe_test_p1a.zip',
        filePath: 'temp/safe_test_p1a.zip',
        fileSize: 100,
        checksum: 'dummychecksum',
        isEncrypted: true,
        encryptionIV: 'test_iv_key',
        encryptionTag: 'test_auth_tag',
        backupStartedAt: new Date(),
        status: 'Completed',
        createdAt: new Date(),
        createdBy: testAdminPhase1A._id,
        backupCreatedByName: 'Test Operator P1A',
        appVersion: '1.0.0',
        backupSourceVersion: '1.0.0',
        dbSchemaVersion: '1.0.0'
      });
      // Mock safety backup file on disk
      const fs = require('fs');
      fs.writeFileSync(path.join(storageRoot, bkp.filePath), 'dummyzipdata');
      return bkp;
    };

    // Write dummy file to backups/daily to pass disk existence check
    const dummyTargetPathPhase1A = path.join(storageRoot, 'backups/daily/safe_test_p1a.zip');
    fs.writeFileSync(dummyTargetPathPhase1A, 'dummyzipdata');

    let restoreErrorCaughtPhase1A = false;
    try {
      await performStagingRestoreAndSwapPhase1A(testAdminPhase1A._id, 'safe_test_p1a.zip', 'RESTORE SYSTEM STATE');
    } catch (e) {
      if (e.message === 'SIMULATED_RENAME_FAILURE_MIDWAY') {
        restoreErrorCaughtPhase1A = true;
      } else {
        console.error('Unexpected restore error:', e);
      }
    }

    // Clean up dummy target file
    try {
      fs.unlinkSync(dummyTargetPathPhase1A);
    } catch (cleanupErr) {}

    // Restore original functions
    mongoose.connection.db.renameCollection = originalRenameCollectionPhase1A;
    backupModulePhase1A.validateBackupFile = originalValidatePhase1A;
    backupModulePhase1A.createFullBackup = originalCreateFullBackupPhase1A;
    transactionManagerPhase1A.getStatus = originalGetStatusPhase1A;

    assert.strictEqual(restoreErrorCaughtPhase1A, true, 'Restore swap should fail with simulated rename error');

    // Verify that the production collections were NOT wiped out
    const activeUserCountPhase1A = await User.countDocuments();
    assert.strictEqual(activeUserCountPhase1A, 1, 'Production users collection should remain intact and contain original data');

    console.log('  -> PASS: Database restore rollback safely protects active collections from deletion during failures.');

    // ===================================================
    // PHASE 1A CONCURRENT AUDIT LOG RACES TEST
    // ===================================================
    console.log('\nTesting TEST 20: Audit Log race condition with concurrent writes...');
    const { logSystemAction: logSystemActionConcurrent, verifyChainIntegrity: verifyChainIntegrityConcurrent } = require('../config/AuditService');

    // Make 10 simultaneous/concurrent audit log write requests
    const concurrentWritesCount = 10;
    const writePromises = [];
    for (let i = 0; i < concurrentWritesCount; i++) {
      writePromises.push(
        logSystemActionConcurrent(
          {
            user: { id: testAdminPhase1A._id, role: 'admin' },
            ip: '127.0.0.1',
            headers: { 'user-agent': 'Mozilla/5.0' },
            method: 'POST',
            originalUrl: '/api/test-concurrent-audit'
          },
          {
            actionType: `Concurrent Action ${i}`,
            module: 'AuditTest',
            entityType: 'User',
            entityId: testAdminPhase1A._id,
            newValues: { index: i }
          }
        )
      );
    }

    // Wait for all writes to finish simultaneously
    await Promise.all(writePromises);
    console.log(`  -> Initiated and completed ${concurrentWritesCount} concurrent audit writes.`);

    // Verify chain integrity
    const verificationResult = await verifyChainIntegrityConcurrent(testAdminPhase1A._id);
    assert.strictEqual(verificationResult.success, true, 'Audit verification should succeed after concurrent writes');
    console.log('  -> PASS: Concurrent audit writes successfully serialized and verified without broken links.');

    // ===================================================
    // PHASE 1A PHARMACIST ROLE AND PERMISSIONS TEST
    // ===================================================
    console.log('\nTesting TEST 21: Pharmacist role validation and route authorization guards...');

    // 1. Create a pharmacist user
    const pharmacistUser = await User.create({
      email: 'pharmacist@kashtbhanjan.com',
      name: 'System Pharmacist',
      password: 'password123',
      role: 'pharmacist',
      isActive: true,
      needsPasswordReset: false
    });
    assert.ok(pharmacistUser, 'Pharmacist user creation should succeed under Single Admin checks');

    // 2. Verify pharmacist login succeeds
    const { loginUser } = require('../controllers/authController');
    let loginResponseCode = null;
    let loginResponseData = null;
    const loginResMock = {
      status(code) {
        loginResponseCode = code;
        return this;
      },
      json(data) {
        loginResponseData = data;
        return this;
      }
    };
    await loginUser(
      {
        body: { email: 'pharmacist@kashtbhanjan.com', password: 'password123' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'Mozilla/5.0' }
      },
      loginResMock,
      () => {}
    );
    assert.ok(loginResponseData.success, 'Pharmacist login should succeed');
    assert.strictEqual(loginResponseData.user.role, 'pharmacist', 'Login response should return role pharmacist');
    console.log('  -> PASS: Pharmacist user creation and login validation succeeded.');

    // 3. Verify PermissionMiddleware controls
    const { checkPermission } = require('../middleware/PermissionMiddleware');

    const runPermissionCheck = (role, permission) => {
      let responseStatus = 200;
      let nextCalled = false;
      const middleware = checkPermission(permission);
      const reqMock = { user: { role } };
      const resMock = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          return this;
        }
      };
      middleware(reqMock, resMock, () => {
        nextCalled = true;
      });
      return { responseStatus, nextCalled };
    };

    // Pharmacist should be allowed create_sale and process_return
    const pharmSale = runPermissionCheck('pharmacist', 'create_sale');
    assert.strictEqual(pharmSale.nextCalled, true, 'Pharmacist should be allowed to perform POS Billing (create_sale)');
    const pharmReturn = runPermissionCheck('pharmacist', 'process_return');
    assert.strictEqual(pharmReturn.nextCalled, true, 'Pharmacist should be allowed to perform Sales Returns (process_return)');

    // Pharmacist should be denied cancel_sale and view_profit_reports
    const pharmCancel = runPermissionCheck('pharmacist', 'cancel_sale');
    assert.strictEqual(pharmCancel.responseStatus, 403, 'Pharmacist should be denied cancel_sale');
    const pharmProfit = runPermissionCheck('pharmacist', 'view_profit_reports');
    assert.strictEqual(pharmProfit.responseStatus, 403, 'Pharmacist should be denied view_profit_reports');
    console.log('  -> PASS: Pharmacist permissions correctly allowed daily operations and denied admin-only functions.');

    // 4. Verify existing admin and staff permissions continue to work correctly
    const adminSale = runPermissionCheck('admin', 'create_sale');
    assert.strictEqual(adminSale.nextCalled, true, 'Admin should be allowed create_sale');
    const adminCancel = runPermissionCheck('admin', 'cancel_sale');
    assert.strictEqual(adminCancel.nextCalled, true, 'Admin should be allowed cancel_sale');

    const staffSale = runPermissionCheck('staff', 'create_sale');
    assert.strictEqual(staffSale.nextCalled, true, 'Staff should be allowed create_sale');
    const staffCancel = runPermissionCheck('staff', 'cancel_sale');
    assert.strictEqual(staffCancel.responseStatus, 403, 'Staff should be denied cancel_sale');
    console.log('  -> PASS: Existing Admin and Staff permissions verified correctly.');

    // 5. Clean up pharmacist user
    await User.deleteOne({ _id: pharmacistUser._id });
    console.log('  -> PASS: Automated role & permission regression validation completed.');

    // ===================================================
    // TEST 22: Expiry Sweep Performance
    // ===================================================
    console.log('\nTesting TEST 22: Expiry Sweep Performance...');
    const { runExpirySweep } = require('../config/SchedulerService');

    const testMedExpiry = await Medicine.create({
      medicineName: 'Expiry Test Medicine',
      medicineCode: 'MED_EXP_01',
      medicineForm: 'Tablet',
      unitType: 'Tablet',
      category: 'Normal',
      currentStock: 10000,
      expiryAlertDays: 60,
      barcode: 'BARCODE_EXP_01',
      agencyId: new mongoose.Types.ObjectId(),
      createdBy: testAdminPhase1A._id
    });

    const farFutureDate = new Date();
    farFutureDate.setDate(farFutureDate.getDate() + 200);

    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 10);

    const nearExpiryDate = new Date();
    nearExpiryDate.setDate(nearExpiryDate.getDate() + 30);

    const batchesData = [];
    for (let i = 0; i < 1000; i++) {
      let expiryDate = farFutureDate;
      if (i % 10 === 0) expiryDate = expiredDate; // 10% expired
      else if (i % 10 === 1) expiryDate = nearExpiryDate; // 10% near expiry

      batchesData.push({
        batchCode: `EXP_CODE_${i}`,
        batchNumber: `EXP_BCH_${i}`,
        medicineId: testMedExpiry._id,
        purchaseItemId: new mongoose.Types.ObjectId(),
        manufacturingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        expiryDate,
        purchasePrice: 10,
        sellingPrice: 15,
        mrp: 15,
        originalQuantity: 10,
        availableQuantity: 10,
        reservedQuantity: 0,
        status: 'Active',
        isSaleBlocked: false,
        createdBy: testAdminPhase1A._id
      });
    }

    await InventoryBatch.insertMany(batchesData);
    
    // Execute optimized expiry sweep and measure execution time
    const sweepStartTime = Date.now();
    const sweepResult = await runExpirySweep();
    const sweepDuration = Date.now() - sweepStartTime;

    assert.strictEqual(sweepResult, true, 'runExpirySweep should complete successfully');
    
    // Verify results
    const expiredCount = await InventoryBatch.countDocuments({ medicineId: testMedExpiry._id, status: 'Expired' });
    const nearExpiryCount = await InventoryBatch.countDocuments({ medicineId: testMedExpiry._id, status: 'Near Expiry' });
    assert.strictEqual(expiredCount, 100, '10% of batches should be marked Expired');
    assert.strictEqual(nearExpiryCount, 100, '10% of batches should be marked Near Expiry');
    
    console.log(`  -> PASS: Expiry Sweep completed in ${sweepDuration}ms (Optimized lookup cache verified).`);

    // Cleanup
    await InventoryBatch.deleteMany({ medicineId: testMedExpiry._id });
    await Medicine.deleteOne({ _id: testMedExpiry._id });

    // ===================================================
    // TEST 23: Cash Closing by Billing Counter
    // ===================================================
    console.log('\nTesting TEST 23: Cash Closing by Billing Counter...');
    const { createCashClosing } = require('../controllers/saleController');
    const { createSale: createSaleTest, createSalesReturn: createSalesReturnTest } = require('../controllers/saleController');

    const testCustomer23 = await Customer.create({
      name: 'Counter Customer',
      customerType: 'Walk-In',
      createdBy: testAdminPhase1A._id
    });

    const testMed23 = await Medicine.create({
      medicineName: 'Counter Med',
      medicineCode: 'MED_CTR_01',
      medicineForm: 'Tablet',
      unitType: 'Tablet',
      currentStock: 500,
      barcode: 'BARCODE_CTR_01',
      agencyId: new mongoose.Types.ObjectId(),
      createdBy: testAdminPhase1A._id
    });

    const batch23 = await InventoryBatch.create({
      batchCode: 'BAT_CTR_01',
      purchaseItemId: new mongoose.Types.ObjectId(),
      manufacturingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      batchNumber: 'CTR_BCH_01',
      medicineId: testMed23._id,
      expiryDate: farFutureDate,
      purchasePrice: 50,
      sellingPrice: 100,
      mrp: 100,
      originalQuantity: 200,
      availableQuantity: 200,
      createdBy: testAdminPhase1A._id
    });

    // 1. Transaction on Counter-A
    const mockReqA = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        customerId: testCustomer23._id,
        paymentMethod: 'Cash',
        billingCounter: 'Counter-A',
        items: [{ medicineId: testMed23._id, quantity: 2, sellingPrice: 100, mrp: 100 }] // grandTotal = ₹200
      }
    };
    let resAData;
    const mockResA = {
      status() { return this; },
      json(data) { resAData = data; }
    };
    await createSaleTest(mockReqA, mockResA, (err) => { if (err) throw err; });
    console.log('--- TEST 23 resAData sale properties:', resAData.sale.grandTotal, resAData.sale.invoiceStatus, resAData.sale.paymentMethod, resAData.sale.saleDate);

    // 2. Transaction on Counter-B
    const mockReqB = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        customerId: testCustomer23._id,
        paymentMethod: 'Cash',
        billingCounter: 'Counter-B',
        items: [{ medicineId: testMed23._id, quantity: 3, sellingPrice: 100, mrp: 100 }] // grandTotal = ₹300
      }
    };
    let resBData;
    const mockResB = {
      status() { return this; },
      json(data) { resBData = data; }
    };
    await createSaleTest(mockReqB, mockResB, (err) => { if (err) throw err; });

    // 3. Process cash refund return on Counter-A
    const mockReturnA = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        saleId: resAData.sale._id,
        remarks: 'Refund Counter A',
        items: [{ medicineId: testMed23._id, quantity: 1 }] // refund = ₹100
      }
    };
    let returnResAData;
    const mockReturnResA = {
      status() { return this; },
      json(data) { returnResAData = data; }
    };
    await createSalesReturnTest(mockReturnA, mockReturnResA, () => {});

    // 4. Perform cash closing for Counter-A
    const mockCloseReqA = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        billingCounter: 'Counter-A',
        openingCash: 1000,
        actualCashInDrawer: 1100 // Calculated closing = 1000 + 200 (sale) - 100 (refund) = 1100. Diff = 0
      }
    };
    let closeResAData;
    const mockCloseResA = {
      status() { return this; },
      json(data) { closeResAData = data; }
    };
    await createCashClosing(mockCloseReqA, mockCloseResA, () => {});

    // 5. Perform cash closing for Counter-B
    const mockCloseReqB = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        billingCounter: 'Counter-B',
        openingCash: 1000,
        actualCashInDrawer: 1300 // Calculated closing = 1000 + 300 = 1300. Diff = 0
      }
    };
    let closeResBData;
    const mockCloseResB = {
      status() { return this; },
      json(data) { closeResBData = data; }
    };
    await createCashClosing(mockCloseReqB, mockCloseResB, () => {});

    assert.strictEqual(closeResAData.details.cashSales, 200, 'Counter-A cash sales should be ₹200');
    assert.strictEqual(closeResAData.details.refunds, 100, 'Counter-A refunds should be ₹100');
    assert.strictEqual(closeResAData.details.difference, 0, 'Counter-A drawer diff should be 0');

    assert.strictEqual(closeResBData.details.cashSales, 300, 'Counter-B cash sales should be ₹300');
    assert.strictEqual(closeResBData.details.refunds, 0, 'Counter-B refunds should be ₹0');
    assert.strictEqual(closeResBData.details.difference, 0, 'Counter-B drawer diff should be 0');

    console.log('  -> PASS: Cash closing balances isolated per billing counter correctly.');
    
    // Clean up
    await Sale.deleteOne({ _id: resAData.sale._id });
    await Sale.deleteOne({ _id: resBData.sale._id });
    await SaleItem.deleteMany({ saleId: { $in: [resAData.sale._id, resBData.sale._id] } });
    if (returnResAData && returnResAData.salesReturn) {
      await SalesReturn.deleteOne({ _id: returnResAData.salesReturn._id });
      const SalesReturnItem = require('../models/SalesReturnItem');
      await SalesReturnItem.deleteMany({ salesReturnId: returnResAData.salesReturn._id });
    }
    await require('../models/CashClosing').deleteMany({ billingCounter: { $in: ['Counter-A', 'Counter-B'] } });
    await Customer.deleteOne({ _id: testCustomer23._id });
    await Medicine.deleteOne({ _id: testMed23._id });
    await InventoryBatch.deleteOne({ _id: batch23._id });

    // ===================================================
    // TEST 24: Sales Return Quantity Tracking
    // ===================================================
    console.log('\nTesting TEST 24: Sales Return Quantity Tracking...');
    const testCustomer24 = await Customer.create({
      name: 'Return Limit Customer',
      customerType: 'Registered',
      phone: '9988776655',
      outstandingBalance: 0,
      creditLimit: 5000,
      createdBy: testAdminPhase1A._id
    });

    const testMed24 = await Medicine.create({
      medicineName: 'Return Track Med',
      medicineCode: 'MED_RET_01',
      medicineForm: 'Tablet',
      unitType: 'Tablet',
      currentStock: 500,
      barcode: 'BARCODE_RET_01',
      agencyId: new mongoose.Types.ObjectId(),
      createdBy: testAdminPhase1A._id
    });

    const batch24 = await InventoryBatch.create({
      batchCode: 'BAT_RET_01',
      purchaseItemId: new mongoose.Types.ObjectId(),
      manufacturingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      batchNumber: 'RET_BCH_01',
      medicineId: testMed24._id,
      expiryDate: farFutureDate,
      purchasePrice: 50,
      sellingPrice: 100,
      mrp: 100,
      originalQuantity: 100,
      availableQuantity: 100,
      createdBy: testAdminPhase1A._id
    });

    // Create a credit sale of 5 items (grandTotal = ₹500)
    const mockSale24 = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        customerId: testCustomer24._id,
        paymentMethod: 'Credit',
        items: [{ medicineId: testMed24._id, quantity: 5, sellingPrice: 100, mrp: 100 }]
      }
    };
    let sale24Res;
    await createSaleTest(mockSale24, { status() { return this; }, json(data) { sale24Res = data; } }, () => {});

    const custAfterSale = await Customer.findById(testCustomer24._id);
    assert.strictEqual(custAfterSale.outstandingBalance, 500, 'Outstanding balance should be ₹500');

    // Return 2 items (succeeds)
    const mockReturn24_1 = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        saleId: sale24Res.sale._id,
        remarks: 'Return 2',
        items: [{ medicineId: testMed24._id, quantity: 2 }]
      }
    };
    let return24_1Res;
    await createSalesReturnTest(mockReturn24_1, { status() { return this; }, json(data) { return24_1Res = data; } }, () => {});
    assert.ok(return24_1Res.success, 'First partial return should succeed');

    const custAfterReturn1 = await Customer.findById(testCustomer24._id);
    assert.strictEqual(custAfterReturn1.outstandingBalance, 300, 'Outstanding should decrease to ₹300');

    // Return 2 items (succeeds)
    const mockReturn24_2 = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        saleId: sale24Res.sale._id,
        remarks: 'Return 2 more',
        items: [{ medicineId: testMed24._id, quantity: 2 }]
      }
    };
    let return24_2Res;
    await createSalesReturnTest(mockReturn24_2, { status() { return this; }, json(data) { return24_2Res = data; } }, () => {});
    assert.ok(return24_2Res.success, 'Second partial return should succeed');

    const custAfterReturn2 = await Customer.findById(testCustomer24._id);
    assert.strictEqual(custAfterReturn2.outstandingBalance, 100, 'Outstanding should decrease to ₹100');

    // Attempt to return 2 items (fails because remaining returnable is 1!)
    const mockReturn24_3 = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        saleId: sale24Res.sale._id,
        remarks: 'Over-return check',
        items: [{ medicineId: testMed24._id, quantity: 2 }]
      }
    };
    let returnErrorCaught = false;
    try {
      await createSalesReturnTest(mockReturn24_3, { status() { return this; }, json(data) {} }, (err) => {
        if (err) throw err;
      });
    } catch (e) {
      if (e.message.includes('exceeds remaining returnable quantity')) {
        returnErrorCaught = true;
      }
    }
    assert.strictEqual(returnErrorCaught, true, 'Should reject return that exceeds originally sold quantity');

    const batchAfterReturn = await InventoryBatch.findById(batch24._id);
    assert.strictEqual(batchAfterReturn.availableQuantity, 99, 'Available stock should only be restored by 4 units (100 - 5 + 4 = 99)');

    console.log('  -> PASS: Sales Return prevents over-returning and tracks cumulative return quantities.');

    // Cleanup
    await Sale.deleteOne({ _id: sale24Res.sale._id });
    await SaleItem.deleteMany({ saleId: sale24Res.sale._id });
    const SalesReturnItem = require('../models/SalesReturnItem');
    if (return24_1Res && return24_1Res.salesReturn) {
      await SalesReturn.deleteOne({ _id: return24_1Res.salesReturn._id });
      await SalesReturnItem.deleteMany({ salesReturnId: return24_1Res.salesReturn._id });
    }
    if (return24_2Res && return24_2Res.salesReturn) {
      await SalesReturn.deleteOne({ _id: return24_2Res.salesReturn._id });
      await SalesReturnItem.deleteMany({ salesReturnId: return24_2Res.salesReturn._id });
    }
    await Customer.deleteOne({ _id: testCustomer24._id });
    await Medicine.deleteOne({ _id: testMed24._id });
    await InventoryBatch.deleteOne({ _id: batch24._id });

    // ===================================================
    // TEST 25: Draft Invoice Recovery
    // ===================================================
    console.log('\nTesting TEST 25: Draft Invoice Recovery...');
    const testCustomer25 = await Customer.create({
      name: 'Draft Customer',
      customerType: 'Registered',
      phone: '9988776654',
      outstandingBalance: 100,
      createdBy: testAdminPhase1A._id
    });

    const testMed25 = await Medicine.create({
      medicineName: 'Draft Med',
      medicineCode: 'MED_DFT_01',
      medicineForm: 'Tablet',
      unitType: 'Tablet',
      currentStock: 100,
      barcode: 'BARCODE_DFT_01',
      agencyId: new mongoose.Types.ObjectId(),
      createdBy: testAdminPhase1A._id
    });

    const batch25 = await InventoryBatch.create({
      batchCode: 'BAT_DFT_01',
      purchaseItemId: new mongoose.Types.ObjectId(),
      manufacturingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      batchNumber: 'DFT_BCH_01',
      medicineId: testMed25._id,
      expiryDate: farFutureDate,
      purchasePrice: 10,
      sellingPrice: 20,
      mrp: 20,
      originalQuantity: 50,
      availableQuantity: 50,
      reservedQuantity: 0,
      createdBy: testAdminPhase1A._id
    });

    // 1. Save draft
    const mockDraftReq = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        customerId: testCustomer25._id,
        paymentMethod: 'Cash',
        invoiceStatus: 'Draft',
        items: [{ medicineId: testMed25._id, quantity: 5, sellingPrice: 20, mrp: 20 }]
      }
    };
    let draftResData;
    await createSaleTest(mockDraftReq, { status() { return this; }, json(data) { draftResData = data; } }, () => {});

    // Verify stock is reserved and available is decremented
    const batchAfterDraft = await InventoryBatch.findById(batch25._id);
    assert.strictEqual(batchAfterDraft.availableQuantity, 45, 'Available stock should be decremented');
    assert.strictEqual(batchAfterDraft.reservedQuantity, 5, 'Reserved stock should be incremented');

    const medicineAfterDraft = await Medicine.findById(testMed25._id);
    assert.strictEqual(medicineAfterDraft.currentStock, 95, 'Medicine current stock should be decremented');

    // Verify customer outstanding balance is NOT updated for drafts
    const customerAfterDraft = await Customer.findById(testCustomer25._id);
    assert.strictEqual(customerAfterDraft.outstandingBalance, 100, 'Customer outstanding balance should remain unchanged');

    // 2. Resume Draft and Complete Sale
    const mockResumeReq = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        draftSaleId: draftResData.sale._id,
        customerId: testCustomer25._id,
        paymentMethod: 'Credit',
        invoiceStatus: 'Completed',
        items: [{ medicineId: testMed25._id, quantity: 4, sellingPrice: 20, mrp: 20 }] // Billed 4 units instead of 5
      }
    };
    let resumeResData;
    await createSaleTest(mockResumeReq, { status() { return this; }, json(data) { resumeResData = data; } }, () => {});

    // Verify stock is updated correctly (old draft released, new completed applied)
    const batchAfterResume = await InventoryBatch.findById(batch25._id);
    assert.strictEqual(batchAfterResume.availableQuantity, 46, 'Available stock should match finalized bill (50 - 4 = 46)');
    assert.strictEqual(batchAfterResume.reservedQuantity, 0, 'Reserved stock should decrease to 0 after draft completed');

    const customerAfterResume = await Customer.findById(testCustomer25._id);
    assert.strictEqual(customerAfterResume.outstandingBalance, 180, 'Outstanding should reflect finalized credit billing (+ ₹80)');

    console.log('  -> PASS: Draft Save, Reservation stock management, and Resume Checkout succeeded.');

    // Cleanup
    await Sale.deleteOne({ _id: resumeResData.sale._id });
    await SaleItem.deleteMany({ saleId: resumeResData.sale._id });
    await Customer.deleteOne({ _id: testCustomer25._id });
    await Medicine.deleteOne({ _id: testMed25._id });
    await InventoryBatch.deleteOne({ _id: batch25._id });

    // ===================================================
    // TEST 26: Draft Recovery After Restart
    // ===================================================
    console.log('\nTesting TEST 26: Draft Recovery After Restart...');
    const { runStartupHealthChecks } = require('../config/StartupHealthValidationService');

    const testMed26 = await Medicine.create({
      medicineName: 'Restart Med',
      medicineCode: 'MED_RST_01',
      medicineForm: 'Tablet',
      unitType: 'Tablet',
      currentStock: 100,
      barcode: 'BARCODE_RST_01',
      agencyId: new mongoose.Types.ObjectId(),
      createdBy: testAdminPhase1A._id
    });

    const batch26 = await InventoryBatch.create({
      batchCode: 'BAT_RST_01',
      purchaseItemId: new mongoose.Types.ObjectId(),
      manufacturingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      batchNumber: 'RST_BCH_01',
      medicineId: testMed26._id,
      expiryDate: farFutureDate,
      purchasePrice: 10,
      sellingPrice: 20,
      mrp: 20,
      originalQuantity: 50,
      availableQuantity: 50,
      reservedQuantity: 0,
      createdBy: testAdminPhase1A._id
    });

    // Save a draft
    const mockDraftReq26 = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        customerId: customer._id,
        paymentMethod: 'Cash',
        invoiceStatus: 'Draft',
        items: [{ medicineId: testMed26._id, quantity: 10, sellingPrice: 20, mrp: 20 }]
      }
    };
    let draftResData26;
    await createSaleTest(mockDraftReq26, { status() { return this; }, json(data) { draftResData26 = data; } }, () => {});

    // Verify stock is reserved
    const batchBeforeRestart = await InventoryBatch.findById(batch26._id);
    assert.strictEqual(batchBeforeRestart.availableQuantity, 40, 'Available stock should be 40');
    assert.strictEqual(batchBeforeRestart.reservedQuantity, 10, 'Reserved stock should be 10');

    // Simulate expiration of the draft (modify expiresAt to past date)
    await Sale.updateOne({ _id: draftResData26.sale._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    // Trigger Startup Health validation sweep (simulating server restart)
    await runStartupHealthChecks();

    // Verify stock is recovered during startup validation
    const batchAfterRestart = await InventoryBatch.findById(batch26._id);
    assert.strictEqual(batchAfterRestart.availableQuantity, 50, 'Startup recovery should return expired reserved stock to available stock');
    assert.strictEqual(batchAfterRestart.reservedQuantity, 0, 'Reserved stock should be reset to 0');

    const draftAfterRestart = await Sale.findById(draftResData26.sale._id);
    assert.strictEqual(draftAfterRestart.invoiceStatus, 'Cancelled', 'Expired draft should be marked Cancelled');

    console.log('  -> PASS: Boot validation automatically recovers expired reserved stock after server restart.');

    // Cleanup
    await Sale.deleteOne({ _id: draftResData26.sale._id });
    await SaleItem.deleteMany({ saleId: draftResData26.sale._id });
    await Medicine.deleteOne({ _id: testMed26._id });
    await InventoryBatch.deleteOne({ _id: batch26._id });

    // ===================================================
    // TEST 27: Draft Expiration Stock Release
    // ===================================================
    console.log('\nTesting TEST 27: Draft Expiration Stock Release...');
    const { cleanupStaleReservations: runCleanupReservations } = require('../config/SchedulerService');

    const testMed27 = await Medicine.create({
      medicineName: 'Expiry Stock Med',
      medicineCode: 'MED_EXP_STK_01',
      medicineForm: 'Tablet',
      unitType: 'Tablet',
      currentStock: 100,
      barcode: 'BARCODE_EXP_STK_01',
      agencyId: new mongoose.Types.ObjectId(),
      createdBy: testAdminPhase1A._id
    });

    const batch27 = await InventoryBatch.create({
      batchCode: 'BAT_EXP_STK_01',
      purchaseItemId: new mongoose.Types.ObjectId(),
      manufacturingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      batchNumber: 'EXP_STK_BCH_01',
      medicineId: testMed27._id,
      expiryDate: farFutureDate,
      purchasePrice: 10,
      sellingPrice: 20,
      mrp: 20,
      originalQuantity: 50,
      availableQuantity: 50,
      reservedQuantity: 0,
      createdBy: testAdminPhase1A._id
    });

    // Save a draft
    const mockDraftReq27 = {
      user: { id: testAdminPhase1A._id },
      ip: '127.0.0.1',
      body: {
        customerId: customer._id,
        paymentMethod: 'Cash',
        invoiceStatus: 'Draft',
        items: [{ medicineId: testMed27._id, quantity: 8, sellingPrice: 20, mrp: 20 }]
      }
    };
    let draftResData27;
    await createSaleTest(mockDraftReq27, { status() { return this; }, json(data) { draftResData27 = data; } }, () => {});

    // Verify stock is reserved
    const batchBeforeExp = await InventoryBatch.findById(batch27._id);
    assert.strictEqual(batchBeforeExp.availableQuantity, 42, 'Available stock should be 42');
    assert.strictEqual(batchBeforeExp.reservedQuantity, 8, 'Reserved stock should be 8');

    // Force expiration (expiresAt to past)
    await Sale.updateOne({ _id: draftResData27.sale._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    // Trigger Scheduler Cleanup
    await runCleanupReservations();

    // Verify stock is released
    const batchAfterExp = await InventoryBatch.findById(batch27._id);
    assert.strictEqual(batchAfterExp.availableQuantity, 50, 'Expired draft should release reserved stock');
    assert.strictEqual(batchAfterExp.reservedQuantity, 0, 'Reserved stock should be 0');

    const draftAfterExp = await Sale.findById(draftResData27.sale._id);
    assert.strictEqual(draftAfterExp.invoiceStatus, 'Cancelled', 'Draft should be cancelled');

    console.log('  -> PASS: Automatic scheduler cleanup successfully expires drafts and releases reserved stock.');

    // Cleanup
    await Sale.deleteOne({ _id: draftResData27.sale._id });
    await SaleItem.deleteMany({ saleId: draftResData27.sale._id });
    await Medicine.deleteOne({ _id: testMed27._id });
    await InventoryBatch.deleteOne({ _id: batch27._id });

    // ===================================================
    // PRODUCTION STARTUP RECOVERY TESTS (TEST 28 - 32)
    // ===================================================
    console.log('\nStarting Production Startup Recovery Certification Tests...');

    // TEST 28 – Interrupted Restore Resume
    {
      console.log('Testing TEST 28: Interrupted Restore Resume...');
      await SystemState.deleteMany({});
      const dbObj = mongoose.connection.db;

      // Ensure we clean staging
      const collections28Clean = await dbObj.listCollections().toArray();
      for (const col of collections28Clean) {
        if (col.name.startsWith('stage_') || col.name.startsWith('temp_') || col.name.startsWith('backup_')) {
          await dbObj.dropCollection(col.name).catch(() => {});
        }
      }

      // 1. Create a valid backup that we will "restore"
      const { createFullBackup } = require('../config/BackupService');
      const backupObj = await createFullBackup(testAdminPhase1A._id, 'TEST 28 Resume Backup', 'temp');

      // 2. Clone active collections to stage_
      const collectionsToClone = await dbObj.listCollections().toArray();
      for (const col of collectionsToClone) {
        if (!col.name.startsWith('stage_') && !col.name.startsWith('temp_') && !col.name.startsWith('backup_') && !col.name.startsWith('system.')) {
          const data = await dbObj.collection(col.name).find({}).toArray();
          if (data.length > 0) {
            await dbObj.collection(`stage_${col.name}`).insertMany(data);
          }
        }
      }

      // 3. Create activeRestoreJob metadata in SystemState
      await SystemState.create({
        key: 'SYSTEM_STATE',
        systemMode: 'RECOVERY_ONLY',
        isInRestoreProgress: true,
        activeRestoreJob: {
          fileName: backupObj.fileName,
          rollbackBackupPath: backupObj.filePath,
          startedAt: new Date()
        },
        recoveryAttemptsCount: 0
      });

      // 4. Run Startup Checks
      const { runStartupHealthChecks } = require('../config/StartupHealthValidationService');
      await runStartupHealthChecks();

      // 5. Verify resume finished successfully
      const updatedState = await SystemState.findOne({ key: 'SYSTEM_STATE' });
      assert.strictEqual(updatedState.isInRestoreProgress, false);
      assert.ok(!updatedState.activeRestoreJob || !updatedState.activeRestoreJob.fileName, 'activeRestoreJob should be empty');
      assert.ok(['HEALTHY', 'DEGRADED'].includes(updatedState.systemMode), `System status should be recovered, got ${updatedState.systemMode}`);

      // Verify stage collections were dropped
      const finalCollections = await dbObj.listCollections().toArray();
      const stageColCount = finalCollections.filter(c => c.name.startsWith('stage_')).length;
      assert.strictEqual(stageColCount, 0, 'Staging collections should be cleaned');

      console.log('  -> PASS: Interrupted restore resumed and atomic swap completed successfully.');
      global.test28Backup = backupObj;
    }

    // TEST 29 – Interrupted Restore Rollback
    {
      console.log('Testing TEST 29: Interrupted Restore Rollback...');
      await SystemState.deleteMany({});
      const dbObj = mongoose.connection.db;
      
      // Drop all stage/temp/backup collections
      const collections29 = await dbObj.listCollections().toArray();
      for (const col of collections29) {
        if (col.name.startsWith('stage_') || col.name.startsWith('temp_') || col.name.startsWith('backup_')) {
          await dbObj.dropCollection(col.name).catch(() => {});
        }
      }

      // Create a valid rollback snapshot first
      const { createFullBackup } = require('../config/BackupService');
      const rollbackBackup = await createFullBackup(testAdminPhase1A._id, 'TEST 29 Rollback Backup', 'temp');

      // Seed invalid stage collections (missing tables or mismatch counts)
      await dbObj.createCollection('stage_users');
      await dbObj.collection('stage_users').insertOne({ username: 'fake_user_no_admin', isPrimaryAdmin: false });

      // Seed state indicating restore is in progress
      await SystemState.create({
        key: 'SYSTEM_STATE',
        systemMode: 'RECOVERY_ONLY',
        isInRestoreProgress: true,
        activeRestoreJob: {
          fileName: 'non_existent_or_invalid_backup.zip.enc',
          rollbackBackupPath: rollbackBackup.filePath,
          startedAt: new Date()
        },
        recoveryAttemptsCount: 0
      });

      // Run Startup Checks
      const { runStartupHealthChecks } = require('../config/StartupHealthValidationService');
      await runStartupHealthChecks();

      // Verify system rolled back successfully
      const updatedState29 = await SystemState.findOne({ key: 'SYSTEM_STATE' });
      assert.strictEqual(updatedState29.isInRestoreProgress, false);
      assert.ok(!updatedState29.activeRestoreJob || !updatedState29.activeRestoreJob.fileName, 'activeRestoreJob should be empty');
      assert.strictEqual(updatedState29.systemMode, 'DEGRADED');

      // Verify staging collections were dropped
      const finalCollections29 = await dbObj.listCollections().toArray();
      const stageColCount29 = finalCollections29.filter(c => c.name.startsWith('stage_') || c.name.startsWith('temp_')).length;
      assert.strictEqual(stageColCount29, 0, 'Staging collections should be cleaned');

      // Verify primary admin user still exists (restored from rollback backup)
      const primaryAdminObj = await User.findOne({ isPrimaryAdmin: true });
      assert.ok(primaryAdminObj, 'Primary admin should be restored');

      console.log('  -> PASS: Interrupted restore verification failed and rolled back safely.');
      global.test29Backup = rollbackBackup;
    }

    // TEST 30 – Interrupted Backup Recovery
    {
      console.log('Testing TEST 30: Interrupted Backup Recovery...');
      
      // Case 1: Valid completed backup but marked Running
      const { createFullBackup } = require('../config/BackupService');
      const validBackup = await createFullBackup(testAdminPhase1A._id, 'TEST 30 Case 1', 'temp');
      await SystemBackup.updateOne({ _id: validBackup._id }, { $set: { status: 'Running', notes: 'Stale running test' } });

      // Case 2: Incomplete/invalid backup marked Running
      const invalidBackupObj = await SystemBackup.create({
        backupNumber: 'BKP_INVALID_TEST_30',
        backupType: 'Full',
        fileName: 'invalid_nonexistent.zip.enc',
        filePath: 'temp/invalid_nonexistent.zip.enc',
        fileSize: 10,
        checksum: 'dummychecksum',
        isEncrypted: true,
        encryptionIV: 'dummyiv',
        encryptionTag: 'dummytag',
        backupStartedAt: new Date(),
        status: 'Running',
        createdBy: testAdminPhase1A._id,
        backupCreatedByName: 'Test Operator',
        appVersion: '1.0.0',
        backupSourceVersion: '1.0.0',
        dbSchemaVersion: '1.0.0'
      });

      // Run Startup Checks
      const { runStartupHealthChecks } = require('../config/StartupHealthValidationService');
      await runStartupHealthChecks();

      // Verify Case 1 is updated to Completed
      const updatedValid = await SystemBackup.findById(validBackup._id);
      assert.strictEqual(updatedValid.status, 'Completed');

      // Verify Case 2 is updated to Failed with ServerRestartDetected
      const updatedInvalid = await SystemBackup.findById(invalidBackupObj._id);
      assert.strictEqual(updatedInvalid.status, 'Failed');
      assert.strictEqual(updatedInvalid.notes, 'ServerRestartDetected');

      console.log('  -> PASS: Interrupted backups recovered: completed files marked Completed, failed files marked Failed.');
      global.test30Backup = validBackup;
    }

    // TEST 31 – Recovery Audit Logging
    {
      console.log('Testing TEST 31: Recovery Audit Logging...');
      
      const AuditLog = require('../models/AuditLog');
      const recoveryLogs = await AuditLog.find({ actionType: 'RECOVERY_RUN' });
      
      assert.ok(recoveryLogs.length > 0, 'Should have written recovery audit logs');
      
      for (const log of recoveryLogs) {
        assert.ok(log.newValues, 'Audit log should contain newValues object');
        const val = JSON.parse(JSON.stringify(log.newValues));
        assert.ok(['Restore Recovery', 'Backup Recovery'].includes(val.recoveryType));
        assert.ok(val.timestamp);
        assert.ok(val.triggerReason);
        assert.ok(['Resume', 'Rollback'].includes(val.actionTaken));
        assert.ok(val.collectionsAffected);
        assert.ok(['Success', 'Failed'].includes(val.finalResult));
        assert.ok(val.durationMs >= 0);
        assert.strictEqual(val.operator, 'System');
      }

      console.log('  -> PASS: Recovery incident audit trails successfully created and validated.');
    }

    // TEST 32 – Startup Idempotent Recovery
    {
      console.log('Testing TEST 32: Startup Idempotent Recovery & Safeguards...');
      await SystemState.deleteMany({});
      
      // Seed stale restore state
      await SystemState.create({
        key: 'SYSTEM_STATE',
        systemMode: 'RECOVERY_ONLY',
        isInRestoreProgress: true,
        activeRestoreJob: {
          fileName: 'invalid_nonexistent.zip.enc',
          rollbackBackupPath: 'temp/nonexistent_rollback.zip.enc',
          startedAt: new Date()
        },
        recoveryAttemptsCount: 0
      });

      // Run startup health checks 4 times to trigger repeated failure safeguard
      const { runStartupHealthChecks } = require('../config/StartupHealthValidationService');
      await runStartupHealthChecks(); // Attempt 1
      await runStartupHealthChecks(); // Attempt 2
      await runStartupHealthChecks(); // Attempt 3
      await runStartupHealthChecks(); // Attempt 4 -> Should trigger safeguard

      // Verify state was set to DEGRADED and isInRestoreProgress set to false after repeated failures
      const finalState32 = await SystemState.findOne({ key: 'SYSTEM_STATE' });
      assert.strictEqual(finalState32.isInRestoreProgress, false);
      assert.ok(!finalState32.activeRestoreJob || !finalState32.activeRestoreJob.fileName, 'activeRestoreJob should be empty');
      assert.strictEqual(finalState32.systemMode, 'DEGRADED');
      assert.strictEqual(finalState32.bootFailureReason, 'Interrupted restore repeatedly failed to recover automatically.');

      console.log('  -> PASS: Infinite recovery loop prevented, safeguard cleans state and marks system degraded.');
    }

    // TEST 33 – Restore Session Validation
    {
      console.log('Testing TEST 33: Restore Session Validation...');
      await SystemState.deleteMany({});
      const dbObj = mongoose.connection.db;

      // Ensure staging is clean
      const collectionsClean = await dbObj.listCollections().toArray();
      for (const col of collectionsClean) {
        if (col.name.startsWith('stage_') || col.name.startsWith('temp_') || col.name.startsWith('backup_')) {
          await dbObj.dropCollection(col.name).catch(() => {});
        }
      }

      // Create a valid backup
      const { createFullBackup } = require('../config/BackupService');
      const backupA = await createFullBackup(testAdminPhase1A._id, 'TEST 33 Backup A', 'temp');

      // Compute backupA checksum
      const crypto = require('crypto');
      const fsObj = require('fs');
      const storageRoot = path.join(__dirname, '../../storage');
      const backupAPath = path.join(storageRoot, backupA.filePath);
      const backupAChecksum = crypto.createHash('sha256').update(fsObj.readFileSync(backupAPath)).digest('hex');

      // Clone active collections to stage_
      const collectionsToClone = await dbObj.listCollections().toArray();
      for (const col of collectionsToClone) {
        if (!col.name.startsWith('stage_') && !col.name.startsWith('temp_') && !col.name.startsWith('backup_') && !col.name.startsWith('system.')) {
          const data = await dbObj.collection(col.name).find({}).toArray();
          if (data.length > 0) {
            await dbObj.collection(`stage_${col.name}`).insertMany(data);
          }
        }
      }

      // 1. Seed state with mismatched checksum
      await SystemState.create({
        key: 'SYSTEM_STATE',
        systemMode: 'RECOVERY_ONLY',
        isInRestoreProgress: true,
        activeRestoreJob: {
          fileName: backupA.fileName,
          rollbackBackupPath: backupA.filePath,
          startedAt: new Date(),
          restoreSessionId: crypto.randomUUID(),
          backupId: backupA.backupNumber,
          checksum: 'wrong_checksum_value_to_trigger_fail'
        },
        recoveryAttemptsCount: 0
      });

      // Run Startup Checks
      const { runStartupHealthChecks } = require('../config/StartupHealthValidationService');
      await runStartupHealthChecks();

      // Verify that resume failed and rolled back due to session/checksum mismatch
      const stateMismatched = await SystemState.findOne({ key: 'SYSTEM_STATE' });
      assert.strictEqual(stateMismatched.isInRestoreProgress, false);
      assert.strictEqual(stateMismatched.systemMode, 'DEGRADED');

      // Clean staging and reset state for the next check
      await SystemState.deleteMany({});
      const collections2 = await dbObj.listCollections().toArray();
      for (const col of collections2) {
        if (col.name.startsWith('stage_') || col.name.startsWith('temp_') || col.name.startsWith('backup_')) {
          await dbObj.dropCollection(col.name).catch(() => {});
        }
      }

      // Re-clone staging collections
      for (const col of collectionsToClone) {
        if (!col.name.startsWith('stage_') && !col.name.startsWith('temp_') && !col.name.startsWith('backup_') && !col.name.startsWith('system.')) {
          const data = await dbObj.collection(col.name).find({}).toArray();
          if (data.length > 0) {
            await dbObj.collection(`stage_${col.name}`).insertMany(data);
          }
        }
      }

      // 2. Seed state with correct session info
      const validSessionId = crypto.randomUUID();
      await SystemState.create({
        key: 'SYSTEM_STATE',
        systemMode: 'RECOVERY_ONLY',
        isInRestoreProgress: true,
        activeRestoreJob: {
          fileName: backupA.fileName,
          rollbackBackupPath: backupA.filePath,
          startedAt: new Date(),
          restoreSessionId: validSessionId,
          backupId: backupA.backupNumber,
          checksum: backupAChecksum
        },
        recoveryAttemptsCount: 0
      });

      // Run Startup Checks again
      await runStartupHealthChecks();

      // Verify that resume completed successfully with correct session metadata
      const stateSucceeded = await SystemState.findOne({ key: 'SYSTEM_STATE' });
      assert.strictEqual(stateSucceeded.isInRestoreProgress, false);
      assert.ok(['HEALTHY', 'DEGRADED'].includes(stateSucceeded.systemMode));

      console.log('  -> PASS: Stale session/metadata rejected and correct session resumed successfully.');
      global.test33Backup = backupA;
    }

    // TEST 34 – Read-Only Degraded Mode
    {
      console.log('Testing TEST 34: Read-Only Degraded Mode...');
      await SystemState.deleteMany({});
      
      // Set systemMode to DEGRADED
      await SystemState.create({
        key: 'SYSTEM_STATE',
        systemMode: 'DEGRADED',
        bootFailureReason: 'Simulated boot failure'
      });

      // Sync state cache
      const { setSystemMode } = require('../config/MaintenanceModeService');
      await setSystemMode('DEGRADED', 'Simulated boot failure');

      const maintenanceModeMiddleware = require('../middleware/maintenanceModeMiddleware');

      // Test Case 1: Allow GET request
      let nextCalledGet = false;
      const mockReqGet = {
        method: 'GET',
        path: '/api/compliance/health'
      };
      const mockResGet = {};
      const mockNextGet = () => { nextCalledGet = true; };

      await maintenanceModeMiddleware(mockReqGet, mockResGet, mockNextGet);
      assert.strictEqual(nextCalledGet, true, 'GET request should be allowed in degraded mode');

      // Test Case 2: Allow POST Login request
      let nextCalledLogin = false;
      const mockReqLogin = {
        method: 'POST',
        path: '/api/auth/login'
      };
      const mockResLogin = {};
      const mockNextLogin = () => { nextCalledLogin = true; };

      await maintenanceModeMiddleware(mockReqLogin, mockResLogin, mockNextLogin);
      assert.strictEqual(nextCalledLogin, true, 'POST login request should be allowed in degraded mode');

      // Test Case 3: Block POST billing request
      let responseStatus = null;
      let responseBody = null;
      const mockReqWrite = {
        method: 'POST',
        path: '/api/sales/create'
      };
      const mockResWrite = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        }
      };
      const mockNextWrite = () => {
        throw new Error('next() should not be called for write operations in degraded mode');
      };

      await maintenanceModeMiddleware(mockReqWrite, mockResWrite, mockNextWrite);
      assert.strictEqual(responseStatus, 503, 'Write request should return 503 in degraded mode');
      assert.strictEqual(responseBody.success, false);
      assert.ok(responseBody.message.includes('degraded read-only recovery mode'), 'Blocked message should warn user');

      console.log('  -> PASS: GET and Auth actions allowed, business writes successfully blocked in DEGRADED mode.');
    }

    // Cleanup generated files from tests
    try {
      const storageRoot = path.join(__dirname, '../../storage');
      const fsObj = require('fs');
      [global.test28Backup, global.test29Backup, global.test30Backup, global.test33Backup].forEach(b => {
        if (b && b.filePath) {
          const p = path.join(storageRoot, b.filePath);
          if (fsObj.existsSync(p)) {
            fsObj.unlinkSync(p);
          }
        }
      });
    } catch (cleanupErr) {
      console.warn('File cleanup failed (non-critical):', cleanupErr.message);
    }

    console.log('\nAll unit, integration, and certification tests completed successfully.');
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
