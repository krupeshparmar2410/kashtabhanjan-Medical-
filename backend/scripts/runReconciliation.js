const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment config
dotenv.config({ path: path.join(__dirname, '../.env') });

const Medicine = require('../models/Medicine');
const InventoryBatch = require('../models/InventoryBatch');
const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Purchase = require('../models/Purchase');
const PurchaseItem = require('../models/PurchaseItem');

const connectDB = require('../config/db');

const runReconciliation = async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();

    console.log('--------------------------------------------------');
    console.log('1. RECONCILING MEDICINE STOCK VS BATCH INVENTORIES');
    console.log('--------------------------------------------------');
    const medicines = await Medicine.find({ isDeleted: false });
    let medIssues = 0;

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
        console.warn(`[VARIANCE] Medicine: "${med.medicineName}" (ID: ${med._id})`);
        console.warn(`           Master Stock: ${roundedMasterStock} | Batch Sum: ${roundedBatchSum} | Diff: ${roundedMasterStock - roundedBatchSum}`);
        medIssues++;
      }
    }
    if (medIssues === 0) {
      console.log('✓ All active medicine stock counts correspond exactly with active batches.\n');
    } else {
      console.warn(`⚠ Found ${medIssues} variance(s) in medicine stock calculations.\n`);
    }

    console.log('--------------------------------------------------');
    console.log('2. RECONCILING CUSTOMER BALANCES VS LEDGER HISTORY');
    console.log('--------------------------------------------------');
    const customers = await Customer.find({ isDeleted: false });
    let custIssues = 0;

    for (const cust of customers) {
      const ledgerEntries = await CustomerLedger.find({ customerId: cust._id });
      const ledgerSum = ledgerEntries.reduce((sum, entry) => sum + (entry.debit || 0) - (entry.credit || 0), 0);
      
      const roundedLedgerSum = Math.round(ledgerSum * 100) / 100;
      const roundedOutstanding = Math.round(cust.outstandingBalance * 100) / 100;

      if (roundedOutstanding !== roundedLedgerSum) {
        console.warn(`[VARIANCE] Customer: "${cust.name}" (ID: ${cust._id})`);
        console.warn(`           Profile Outstanding: ₹${roundedOutstanding} | Ledger Sum: ₹${roundedLedgerSum} | Diff: ₹${roundedOutstanding - roundedLedgerSum}`);
        custIssues++;
      }
    }
    if (custIssues === 0) {
      console.log('✓ All customer outstanding balances correspond exactly with ledger transaction history.\n');
    } else {
      console.warn(`⚠ Found ${custIssues} variance(s) in customer outstanding calculations.\n`);
    }

    console.log('--------------------------------------------------');
    console.log('3. RECONCILING SALES GRAND TOTALS VS LINE ITEMS');
    console.log('--------------------------------------------------');
    const sales = await Sale.find({ isDeleted: false, invoiceStatus: { $ne: 'Cancelled' } });
    let saleIssues = 0;

    for (const sale of sales) {
      const items = await SaleItem.find({ saleId: sale._id });
      const itemsSum = items.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
      const roundedItemsSum = Math.round(itemsSum * 100) / 100;
      const discount = sale.discountAmount || 0;
      const expectedGrandTotal = Math.max(0, Math.round((roundedItemsSum - discount) * 100) / 100);
      
      const roundedGrandTotal = Math.round(sale.grandTotal * 100) / 100;

      if (roundedGrandTotal !== expectedGrandTotal) {
        console.warn(`[VARIANCE] Sale Invoice: ${sale.invoiceNumber} (ID: ${sale._id})`);
        console.warn(`           Grand Total: ₹${roundedGrandTotal} | Summed Items (less disc): ₹${expectedGrandTotal} | Diff: ₹${roundedGrandTotal - expectedGrandTotal}`);
        saleIssues++;
      }
    }
    if (saleIssues === 0) {
      console.log('✓ All sales grand totals match itemized invoice lines correctly.\n');
    } else {
      console.warn(`⚠ Found ${saleIssues} variance(s) in sales invoice records.\n`);
    }

    console.log('==================================================');
    console.log('RECONCILIATION SUMMARY');
    console.log('==================================================');
    console.log(`Medicine variances: ${medIssues}`);
    console.log(`Customer balance variances: ${custIssues}`);
    console.log(`Sales invoice variances: ${saleIssues}`);
    console.log('==================================================\n');

  } catch (error) {
    console.error('Reconciliation script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
};

runReconciliation();
