const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const PurchaseItem = require('../models/PurchaseItem');
const PurchaseReturn = require('../models/PurchaseReturn');
const PurchaseReturnItem = require('../models/PurchaseReturnItem');
const SupplierPayment = require('../models/SupplierPayment');
const AgencyLedger = require('../models/AgencyLedger');
const InventoryBatch = require('../models/InventoryBatch');
const InventoryActivity = require('../models/InventoryActivity');
const Medicine = require('../models/Medicine');
const Agency = require('../models/Agency');

const { execute: runInTransaction } = require('../config/TransactionManager');

// Generate next code helpers
const generateNextPurchaseNumber = async () => {
  const latest = await Purchase.findOne({}, {}, { sort: { createdAt: -1 } });
  let num = 1;
  if (latest && latest.purchaseNumber) {
    const match = latest.purchaseNumber.match(/\d+/);
    if (match) {
      num = parseInt(match[0], 10) + 1;
    }
  }
  return `PUR${String(num).padStart(6, '0')}`;
};

const generateNextReturnNumber = async () => {
  const latest = await PurchaseReturn.findOne({}, {}, { sort: { createdAt: -1 } });
  let num = 1;
  if (latest && latest.returnNumber) {
    const match = latest.returnNumber.match(/\d+/);
    if (match) {
      num = parseInt(match[0], 10) + 1;
    }
  }
  return `PRT${String(num).padStart(6, '0')}`;
};

const generateNextPaymentNumber = async () => {
  const latest = await SupplierPayment.findOne({}, {}, { sort: { createdAt: -1 } });
  let num = 1;
  if (latest && latest.paymentNumber) {
    const match = latest.paymentNumber.match(/\d+/);
    if (match) {
      num = parseInt(match[0], 10) + 1;
    }
  }
  return `PAY${String(num).padStart(6, '0')}`;
};

const generateNextBatchCode = async () => {
  const latest = await InventoryBatch.findOne({}, {}, { sort: { createdAt: -1 } });
  let num = 1;
  if (latest && latest.batchCode) {
    const match = latest.batchCode.match(/\d+/);
    if (match) {
      num = parseInt(match[0], 10) + 1;
    }
  }
  return `BAT${String(num).padStart(6, '0')}`;
};

// Update agency running balance and create ledger entry helper
const updateAgencyLedgerAndBalance = async (agencyId, transactionType, referenceId, referenceNumber, debit, credit, remarks, session = null) => {
  const agency = await Agency.findOne({ _id: agencyId, isDeleted: false }).session(session);
  if (!agency) throw new Error('Supplier agency not found or has been deleted');
  
  const change = credit - debit;
  agency.currentBalance = (agency.currentBalance || 0) + change;
  if (transactionType === 'Purchase') {
    agency.lastPurchaseDate = new Date();
  }
  await agency.save({ session });

  const ledgerEntry = new AgencyLedger({
    agencyId,
    transactionType,
    referenceId,
    referenceNumber,
    debit,
    credit,
    runningBalance: agency.currentBalance,
    remarks
  });
  await ledgerEntry.save({ session });
  
  return ledgerEntry;
};

// @desc    Create new purchase (Draft)
// @route   POST /api/purchases
// @access  Private
const createPurchase = async (req, res) => {
  try {
    const {
      invoiceNumber,
      invoiceDate,
      purchaseDate,
      agencyId,
      billAmount,
      gstAmount,
      discountAmount,
      grandTotal,
      paidAmount = 0,
      creditDays = 0,
      paymentMethod = 'Cash',
      remarks = '',
      items = []
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one medicine item is required' });
    }

    const agency = await Agency.findOne({ _id: agencyId, isDeleted: false });
    if (!agency) {
      return res.status(404).json({ success: false, message: 'Supplier agency not found' });
    }

    const purchaseNumber = await generateNextPurchaseNumber();
    const pendingAmount = Number(grandTotal) - Number(paidAmount);
    
    // Set due date based on purchaseDate + creditDays
    const purchaseDateObj = new Date(purchaseDate);
    const dueDate = new Date(purchaseDateObj.getTime() + creditDays * 24 * 60 * 60 * 1000);

    const purchaseData = {
      purchaseNumber,
      invoiceNumber,
      invoiceDate,
      purchaseDate,
      agencyId,
      billAmount,
      gstAmount,
      discountAmount,
      grandTotal,
      paidAmount,
      pendingAmount: pendingAmount < 0 ? 0 : pendingAmount,
      dueDate,
      creditDays,
      paymentMethod,
      purchaseStatus: 'Draft',
      remarks,
      createdBy: req.user.id
    };

    const purchase = await Purchase.create(purchaseData);

    const purchaseItems = items.map(item => ({
      purchaseId: purchase._id,
      medicineId: item.medicineId,
      batchNumber: item.batchNumber,
      manufacturingDate: item.manufacturingDate,
      expiryDate: item.expiryDate,
      quantity: item.quantity,
      freeQuantity: item.freeQuantity || 0,
      purchasePrice: item.purchasePrice,
      sellingPrice: item.sellingPrice,
      mrp: item.mrp,
      gstPercentage: item.gstPercentage,
      discountPercentage: item.discountPercentage || 0,
      lineTotal: item.lineTotal
    }));

    await PurchaseItem.insertMany(purchaseItems);

    res.status(201).json({
      success: true,
      purchase,
      message: 'Purchase draft created successfully'
    });
  } catch (error) {
    console.error('Error creating purchase:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error creating purchase draft' });
  }
};

// @desc    Get all purchases (with search, pagination, status and agency filter)
// @route   GET /api/purchases
// @access  Private
const getPurchases = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      agencyId,
      startDate,
      endDate
    } = req.query;

    const query = { isDeleted: false };

    if (search) {
      query.$or = [
        { purchaseNumber: { $regex: search, $options: 'i' } },
        { invoiceNumber: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.purchaseStatus = status;
    }

    if (agencyId) {
      query.agencyId = agencyId;
    }

    if (startDate || endDate) {
      query.purchaseDate = {};
      if (startDate) query.purchaseDate.$gte = new Date(startDate);
      if (endDate) query.purchaseDate.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const purchases = await Purchase.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('agencyId', 'agencyName agencyCode')
      .populate('createdBy', 'name');

    const total = await Purchase.countDocuments(query);

    res.json({
      success: true,
      purchases,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      total
    });
  } catch (error) {
    console.error('Error listing purchases:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving purchases list' });
  }
};

// @desc    Get single purchase by ID
// @route   GET /api/purchases/:id
// @access  Private
const getPurchaseById = async (req, res) => {
  try {
    const purchase = await Purchase.findOne({ _id: req.params.id, isDeleted: false })
      .populate('agencyId')
      .populate('approvedBy', 'name')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase invoice not found' });
    }

    const items = await PurchaseItem.find({ purchaseId: purchase._id }).populate('medicineId');
    const ledger = await AgencyLedger.find({ referenceId: purchase._id });

    res.json({ success: true, purchase, items, ledger });
  } catch (error) {
    console.error('Error getting purchase details:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving details' });
  }
};

// @desc    Update purchase draft (Only if status is Draft)
// @route   PUT /api/purchases/:id
// @access  Private
const updatePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findOne({ _id: req.params.id, isDeleted: false });
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase invoice not found' });
    }

    if (purchase.purchaseStatus !== 'Draft') {
      return res.status(400).json({ success: false, message: `Cannot update a purchase in ${purchase.purchaseStatus} status` });
    }

    const {
      invoiceNumber,
      invoiceDate,
      purchaseDate,
      agencyId,
      billAmount,
      gstAmount,
      discountAmount,
      grandTotal,
      paidAmount = 0,
      creditDays = 0,
      paymentMethod = 'Cash',
      remarks = '',
      items = []
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one medicine item is required' });
    }

    const agency = await Agency.findOne({ _id: agencyId, isDeleted: false });
    if (!agency) {
      return res.status(404).json({ success: false, message: 'Supplier agency not found' });
    }

    const pendingAmount = Number(grandTotal) - Number(paidAmount);
    const purchaseDateObj = new Date(purchaseDate);
    const dueDate = new Date(purchaseDateObj.getTime() + creditDays * 24 * 60 * 60 * 1000);

    purchase.invoiceNumber = invoiceNumber;
    purchase.invoiceDate = invoiceDate;
    purchase.purchaseDate = purchaseDate;
    purchase.agencyId = agencyId;
    purchase.billAmount = billAmount;
    purchase.gstAmount = gstAmount;
    purchase.discountAmount = discountAmount;
    purchase.grandTotal = grandTotal;
    purchase.paidAmount = paidAmount;
    purchase.pendingAmount = pendingAmount < 0 ? 0 : pendingAmount;
    purchase.dueDate = dueDate;
    purchase.creditDays = creditDays;
    purchase.paymentMethod = paymentMethod;
    purchase.remarks = remarks;
    purchase.updatedBy = req.user.id;

    await purchase.save();

    // Re-create items (delete old, insert new)
    await PurchaseItem.deleteMany({ purchaseId: purchase._id });

    const purchaseItems = items.map(item => ({
      purchaseId: purchase._id,
      medicineId: item.medicineId,
      batchNumber: item.batchNumber,
      manufacturingDate: item.manufacturingDate,
      expiryDate: item.expiryDate,
      quantity: item.quantity,
      freeQuantity: item.freeQuantity || 0,
      purchasePrice: item.purchasePrice,
      sellingPrice: item.sellingPrice,
      mrp: item.mrp,
      gstPercentage: item.gstPercentage,
      discountPercentage: item.discountPercentage || 0,
      lineTotal: item.lineTotal
    }));

    await PurchaseItem.insertMany(purchaseItems);

    res.json({
      success: true,
      purchase,
      message: 'Purchase draft updated successfully'
    });
  } catch (error) {
    console.error('Error updating purchase:', error);
    res.status(500).json({ success: false, message: 'Server error updating purchase draft' });
  }
};

// @desc    Post/Approve Purchase invoice (Increases stock, registers ledger/outstanding)
// @route   POST /api/purchases/:id/post
// @access  Private
const postPurchase = async (req, res) => {
  try {
    const result = await runInTransaction(async (session) => {
      const purchase = await Purchase.findOne({ _id: req.params.id, isDeleted: false }).session(session);
      if (!purchase) {
        throw new Error('Purchase invoice not found');
      }

      if (purchase.purchaseStatus === 'Posted') {
        throw new Error('Purchase is already posted');
      }

      const items = await PurchaseItem.find({ purchaseId: purchase._id }).session(session);
      if (items.length === 0) {
        throw new Error('No items found in this purchase invoice');
      }

      // Update purchase header status
      purchase.purchaseStatus = 'Posted';
      purchase.approvedBy = req.user.id;
      purchase.approvedAt = new Date();
      await purchase.save({ session });

      // Process each line item: Create inventory batch, update medicine total stock
      for (const item of items) {
        const medicine = await Medicine.findOne({ _id: item.medicineId, isDeleted: false }).session(session);
        if (!medicine) {
          throw new Error(`Medicine not found or deleted: ID ${item.medicineId}`);
        }

        const batchCode = await generateNextBatchCode();
        
        // Calculate status
        const today = new Date();
        const expiryDate = new Date(item.expiryDate);
        let status = 'Active';
        if (expiryDate <= today) {
          status = 'Expired';
        } else {
          const daysToExpiry = (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
          if (daysToExpiry <= (medicine.expiryAlertDays || 90)) {
            status = 'Near Expiry';
          }
        }

        const totalQty = Number(item.quantity) + Number(item.freeQuantity || 0);

        const newBatch = new InventoryBatch({
          batchCode,
          medicineId: item.medicineId,
          purchaseItemId: item._id,
          batchNumber: item.batchNumber,
          manufacturingDate: item.manufacturingDate,
          expiryDate: item.expiryDate,
          originalQuantity: totalQty,
          availableQuantity: totalQty,
          reservedQuantity: 0,
          purchasePrice: item.purchasePrice,
          sellingPrice: item.sellingPrice,
          mrp: item.mrp,
          status,
          isLocked: false,
          isSaleBlocked: status === 'Expired',
          createdBy: req.user.id
        });

        await newBatch.save({ session });

        // Update medicine stock & cost details
        medicine.currentStock = (medicine.currentStock || 0) + totalQty;
        // Keep prices updated if higher
        if (item.purchasePrice > (medicine.purchasePrice || 0)) medicine.purchasePrice = item.purchasePrice;
        if (item.sellingPrice > (medicine.sellingPrice || 0)) medicine.sellingPrice = item.sellingPrice;
        if (item.mrp > (medicine.mrp || 0)) medicine.mrp = item.mrp;
        
        await medicine.save({ session });

        // Log Activity
        const activity = new InventoryActivity({
          inventoryBatchId: newBatch._id,
          action: 'Purchase Receipt',
          description: `Stock of ${totalQty} units received via Purchase ${purchase.purchaseNumber} (Invoice #${purchase.invoiceNumber})`,
          performedBy: req.user.id
        });
        await activity.save({ session });
      }

      // Ledger Bookkeeping
      // Since it's a purchase, credit supplier ledger
      await updateAgencyLedgerAndBalance(
        purchase.agencyId,
        'Purchase',
        purchase._id,
        purchase.purchaseNumber,
        0,
        purchase.grandTotal,
        `Credit invoice entry for purchase ${purchase.purchaseNumber}`,
        session
      );

      return purchase;
    });

    res.json({
      success: true,
      purchase: result,
      message: 'Purchase invoice posted successfully. Inventory updated and ledger registered.'
    });
  } catch (error) {
    console.error('Error posting purchase:', error);
    res.status(400).json({ success: false, message: error.message || 'Server error posting purchase invoice' });
  }
};

// @desc    Delete purchase (Draft or Posted revert logic)
// @route   DELETE /api/purchases/:id
// @access  Private
const deletePurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findOne({ _id: req.params.id, isDeleted: false });
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase invoice not found' });
    }

    if (purchase.purchaseStatus === 'Posted') {
      // Revert Posted changes
      await runInTransaction(async (session) => {
        const items = await PurchaseItem.find({ purchaseId: purchase._id }).session(session);

        for (const item of items) {
          // Find the batch created
          const batch = await InventoryBatch.findOne({ purchaseItemId: item._id, isDeleted: false }).session(session);
          if (batch) {
            // Check if batch is partially consumed
            if (batch.availableQuantity < batch.originalQuantity) {
              throw new Error(`Cannot delete purchase. Stock from batch ${batch.batchNumber} has already been partially consumed.`);
            }

            // Subtract stock from Medicine
            const medicine = await Medicine.findOne({ _id: item.medicineId }).session(session);
            if (medicine) {
              medicine.currentStock = Math.max(0, (medicine.currentStock || 0) - batch.originalQuantity);
              await medicine.save({ session });
            }

            // Soft delete the batch
            batch.isDeleted = true;
            batch.availableQuantity = 0;
            batch.status = 'Sold Out';
            await batch.save({ session });

            // Create revert log activity
            const activity = new InventoryActivity({
              inventoryBatchId: batch._id,
              action: 'Disposal',
              description: `Stock deleted due to cancellation of Purchase ${purchase.purchaseNumber}`,
              performedBy: req.user.id
            });
            await activity.save({ session });
          }
        }

        // Ledger reversal (debit the ledger to zero out credit balance)
        await updateAgencyLedgerAndBalance(
          purchase.agencyId,
          'Purchase Return',
          purchase._id,
          purchase.purchaseNumber,
          purchase.grandTotal,
          0,
          `Reversal/deletion of purchase bill ${purchase.purchaseNumber}`,
          session
        );

        purchase.purchaseStatus = 'Cancelled';
        purchase.isDeleted = true;
        purchase.updatedBy = req.user.id;
        await purchase.save({ session });
      });
    } else {
      // Just mark deleted if it was a draft
      purchase.purchaseStatus = 'Cancelled';
      purchase.isDeleted = true;
      purchase.updatedBy = req.user.id;
      await purchase.save();
    }

    res.json({ success: true, message: 'Purchase invoice deleted/reverted successfully' });
  } catch (error) {
    console.error('Error deleting purchase:', error);
    res.status(400).json({ success: false, message: error.message || 'Server error deleting purchase invoice' });
  }
};

// @desc    Create Purchase Return
// @route   POST /api/purchases/returns
// @access  Private
const createPurchaseReturn = async (req, res) => {
  try {
    const {
      purchaseId,
      agencyId,
      returnDate,
      remarks = '',
      items = []
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one return item is required' });
    }

    const agency = await Agency.findOne({ _id: agencyId, isDeleted: false });
    if (!agency) {
      return res.status(404).json({ success: false, message: 'Supplier agency not found' });
    }

    const returnNumber = await generateNextReturnNumber();

    const result = await runInTransaction(async (session) => {
      let totalAmount = 0;
      let totalGst = 0;

      const returnItemsData = [];

      for (const item of items) {
        const batch = await InventoryBatch.findOne({ _id: item.inventoryBatchId, isDeleted: false }).session(session);
        if (!batch) {
          throw new Error(`Inventory batch not found: ID ${item.inventoryBatchId}`);
        }

        if (batch.availableQuantity < item.quantity) {
          throw new Error(`Insufficient stock in batch ${batch.batchNumber} (Available: ${batch.availableQuantity}, Trying to return: ${item.quantity})`);
        }

        const medicine = await Medicine.findOne({ _id: item.medicineId, isDeleted: false }).session(session);
        if (!medicine) {
          throw new Error(`Medicine not found: ID ${item.medicineId}`);
        }

        // Subtract quantity from batch availableQuantity
        batch.availableQuantity -= item.quantity;
        if (batch.availableQuantity === 0) {
          batch.status = 'Sold Out';
          batch.isSaleBlocked = true;
        }
        await batch.save({ session });

        // Subtract quantity from medicine currentStock
        medicine.currentStock = Math.max(0, (medicine.currentStock || 0) - item.quantity);
        await medicine.save({ session });

        // Calculate pricing
        const lineTotal = item.quantity * item.purchasePrice;
        totalAmount += lineTotal;

        // Calculate GST estimated (can base on line item gst or assume 12%)
        const gst = lineTotal * (medicine.gstPercentage / 100);
        totalGst += gst;

        returnItemsData.push({
          medicineId: item.medicineId,
          inventoryBatchId: item.inventoryBatchId,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice,
          lineTotal
        });

        // Log Activity
        const activity = new InventoryActivity({
          inventoryBatchId: batch._id,
          action: 'Return',
          description: `Returned ${item.quantity} units to supplier via Return ${returnNumber}`,
          performedBy: req.user.id
        });
        await activity.save({ session });
      }

      // Grand total return value (inclusive of gst)
      const grandTotalReturn = totalAmount + totalGst;

      const purchaseReturn = new PurchaseReturn({
        returnNumber,
        purchaseId: purchaseId || null,
        agencyId,
        returnDate,
        totalAmount: grandTotalReturn,
        gstAmount: totalGst,
        remarks,
        createdBy: req.user.id
      });

      await purchaseReturn.save({ session });

      // Insert return items
      const savedReturnItems = returnItemsData.map(item => ({
        ...item,
        purchaseReturnId: purchaseReturn._id
      }));
      await PurchaseReturnItem.insertMany(savedReturnItems, { session });

      // Ledger debit posting (reverts what we owe to supplier)
      await updateAgencyLedgerAndBalance(
        agencyId,
        'Purchase Return',
        purchaseReturn._id,
        returnNumber,
        grandTotalReturn,
        0,
        `Debit invoice entry for purchase return ${returnNumber}`,
        session
      );

      // If tied to a specific purchase, reduce pending outstanding amount
      if (purchaseId) {
        const purchase = await Purchase.findById(purchaseId).session(session);
        if (purchase) {
          purchase.pendingAmount = Math.max(0, purchase.pendingAmount - grandTotalReturn);
          await purchase.save({ session });
        }
      }

      return purchaseReturn;
    });

    res.status(201).json({
      success: true,
      purchaseReturn: result,
      message: 'Purchase return created successfully. Inventory updated and supplier balance adjusted.'
    });
  } catch (error) {
    console.error('Error creating purchase return:', error);
    res.status(400).json({ success: false, message: error.message || 'Server error creating purchase return' });
  }
};

// @desc    Get all purchase returns
// @route   GET /api/purchases/returns
// @access  Private
const getPurchaseReturns = async (req, res) => {
  try {
    const returns = await PurchaseReturn.find()
      .sort({ createdAt: -1 })
      .populate('agencyId', 'agencyName agencyCode')
      .populate('purchaseId', 'purchaseNumber invoiceNumber')
      .populate('createdBy', 'name');

    res.json({ success: true, returns });
  } catch (error) {
    console.error('Error getting purchase returns:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving returns' });
  }
};

// @desc    Create Supplier Payment
// @route   POST /api/purchases/payments
// @access  Private
const createSupplierPayment = async (req, res) => {
  try {
    const {
      agencyId,
      paymentDate,
      amountPaid,
      paymentMethod = 'Cash',
      referenceNumber = '',
      remarks = ''
    } = req.body;

    if (!agencyId || !amountPaid || Number(amountPaid) <= 0) {
      return res.status(400).json({ success: false, message: 'Agency ID and valid positive amount are required' });
    }

    const agency = await Agency.findOne({ _id: agencyId, isDeleted: false });
    if (!agency) {
      return res.status(404).json({ success: false, message: 'Supplier agency not found' });
    }

    const paymentNumber = await generateNextPaymentNumber();

    const result = await runInTransaction(async (session) => {
      // Save payment
      const payment = new SupplierPayment({
        paymentNumber,
        agencyId,
        paymentDate,
        amountPaid,
        paymentMethod,
        referenceNumber,
        remarks,
        createdBy: req.user.id
      });
      await payment.save({ session });

      // Ledger debit entry (reduces balance we owe to agency)
      await updateAgencyLedgerAndBalance(
        agencyId,
        'Payment',
        payment._id,
        paymentNumber,
        amountPaid,
        0,
        `Payment record to agency via ${paymentMethod} ref ${referenceNumber}`,
        session
      );

      // Distribute payment to outstanding purchases FIFO
      let remainingPayment = Number(amountPaid);
      const outstandingPurchases = await Purchase.find({
        agencyId,
        purchaseStatus: 'Posted',
        pendingAmount: { $gt: 0 },
        isDeleted: false
      })
        .sort({ purchaseDate: 1 })
        .session(session);

      for (const purchase of outstandingPurchases) {
        if (remainingPayment <= 0) break;

        const deduct = Math.min(purchase.pendingAmount, remainingPayment);
        purchase.pendingAmount -= deduct;
        purchase.paidAmount = (purchase.paidAmount || 0) + deduct;
        await purchase.save({ session });

        remainingPayment -= deduct;
      }

      return payment;
    });

    res.status(201).json({
      success: true,
      payment: result,
      message: 'Supplier payment recorded and outstanding invoices updated.'
    });
  } catch (error) {
    console.error('Error creating supplier payment:', error);
    res.status(400).json({ success: false, message: error.message || 'Server error recording payment' });
  }
};

// @desc    Get all Supplier Payments
// @route   GET /api/purchases/payments
// @access  Private
const getSupplierPayments = async (req, res) => {
  try {
    const payments = await SupplierPayment.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .populate('agencyId', 'agencyName agencyCode')
      .populate('createdBy', 'name');

    res.json({ success: true, payments });
  } catch (error) {
    console.error('Error listing payments:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving supplier payments' });
  }
};

// @desc    Get purchase financial and credit dashboard stats
// @route   GET /api/purchases/stats
// @access  Private
const getPurchaseStats = async (req, res) => {
  try {
    const today = new Date();
    
    // Total Outstanding = sum of pendingAmount in Posted Purchases
    const purchaseStats = await Purchase.aggregate([
      { $match: { isDeleted: false, purchaseStatus: 'Posted' } },
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: '$pendingAmount' },
          overdueBills: {
            $sum: {
              $cond: [
                { $and: [{ $lt: ['$dueDate', today] }, { $gt: ['$pendingAmount', 0] }] },
                '$pendingAmount',
                0
              ]
            }
          },
          billsDueThisWeek: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$dueDate', today] },
                    { $lte: ['$dueDate', new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)] },
                    { $gt: ['$pendingAmount', 0] }
                  ]
                },
                '$pendingAmount',
                0
              ]
            }
          }
        }
      }
    ]);

    const result = purchaseStats[0] || {
      totalOutstanding: 0,
      overdueBills: 0,
      billsDueThisWeek: 0
    };

    // Calculate agency level balance checks
    const agencyBalances = await Agency.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalAgencyBalance: { $sum: '$currentBalance' }
        }
      }
    ]);

    const totalAgencyBal = agencyBalances[0]?.totalAgencyBalance || 0;

    res.json({
      success: true,
      stats: {
        totalOutstanding: result.totalOutstanding,
        overdueBills: result.overdueBills,
        billsDueThisWeek: result.billsDueThisWeek,
        totalAgencyBalance: totalAgencyBal
      }
    });
  } catch (error) {
    console.error('Error fetching purchase stats:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving statistics' });
  }
};

// @desc    Get GST summary slab-wise and input tax credit (ITC)
// @route   GET /api/purchases/gst-summary
// @access  Private
const getPurchaseGSTSummary = async (req, res) => {
  try {
    // Aggregation of purchase items of Posted purchases
    const gstSummary = await PurchaseItem.aggregate([
      {
        $lookup: {
          from: 'purchases',
          localField: 'purchaseId',
          foreignField: '_id',
          as: 'purchase'
        }
      },
      { $unwind: '$purchase' },
      { $match: { 'purchase.isDeleted': false, 'purchase.purchaseStatus': 'Posted' } },
      {
        $group: {
          _id: '$gstPercentage',
          taxableValue: { $sum: { $multiply: ['$quantity', '$purchasePrice'] } },
          gstAmount: {
            $sum: {
              $multiply: [
                { $multiply: ['$quantity', '$purchasePrice'] },
                { $divide: ['$gstPercentage', 100] }
              ]
            }
          },
          itemCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Format output
    const formatted = gstSummary.map(item => ({
      gstRate: item._id,
      taxableValue: Math.round(item.taxableValue * 100) / 100,
      gstAmount: Math.round(item.gstAmount * 100) / 100,
      itemCount: item.itemCount
    }));

    res.json({ success: true, summary: formatted });
  } catch (error) {
    console.error('Error generating GST summary:', error);
    res.status(500).json({ success: false, message: 'Server error generating GST summary report' });
  }
};

// @desc    Get PDF data printable view
// @route   GET /api/purchases/:id/pdf
// @access  Private
const exportInvoicePDF = async (req, res) => {
  try {
    const purchase = await Purchase.findOne({ _id: req.params.id, isDeleted: false })
      .populate('agencyId')
      .populate('createdBy', 'name');

    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase invoice not found' });
    }

    const items = await PurchaseItem.find({ purchaseId: purchase._id }).populate('medicineId');

    res.json({
      success: true,
      pdfHtml: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; max-width: 800px; margin: auto; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="text-align: center; color: #2c3e50; margin-bottom: 5px;">Kashtbhanjan Medical Store</h2>
          <p style="text-align: center; font-size: 13px; color: #7f8c8d; margin-top: 0;">Purchase Invoice Receipt</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="vertical-align: top; width: 50%;">
                <strong>Supplier:</strong><br>
                ${purchase.agencyId.agencyName}<br>
                Phone: ${purchase.agencyId.phone}<br>
                GSTIN: ${purchase.agencyId.gstNumber || 'N/A'}
              </td>
              <td style="vertical-align: top; width: 50%; text-align: right;">
                <strong>Invoice Info:</strong><br>
                Purchase No: ${purchase.purchaseNumber}<br>
                Inv No: ${purchase.invoiceNumber}<br>
                Date: ${new Date(purchase.purchaseDate).toLocaleDateString()}<br>
                Due Date: ${purchase.dueDate ? new Date(purchase.dueDate).toLocaleDateString() : 'N/A'}<br>
                Status: <span style="font-weight: bold; color: ${purchase.purchaseStatus === 'Posted' ? '#27ae60' : '#f39c12'}">${purchase.purchaseStatus}</span>
              </td>
            </tr>
          </table>

          <table style="width: 100%; border-collapse: collapse; margin-top: 25px; font-size: 13px;">
            <thead>
              <tr style="background-color: #f8f9fa; border-bottom: 2px solid #ddd;">
                <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Medicine Name</th>
                <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Batch No</th>
                <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Expiry</th>
                <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Qty</th>
                <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Free</th>
                <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Cost (₹)</th>
                <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">GST %</th>
                <th style="padding: 10px; text-align: right; border: 1px solid #ddd;">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;">${item.medicineId.medicineName}</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${item.batchNumber}</td>
                  <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">${new Date(item.expiryDate).toLocaleDateString()}</td>
                  <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.quantity}</td>
                  <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.freeQuantity}</td>
                  <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.purchasePrice.toFixed(2)}</td>
                  <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.gstPercentage}%</td>
                  <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${item.lineTotal.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <table style="width: 40%; margin-left: 60%; border-collapse: collapse; margin-top: 20px; font-size: 13px; font-weight: bold;">
            <tr>
              <td style="padding: 8px; text-align: left;">Subtotal:</td>
              <td style="padding: 8px; text-align: right;">₹${purchase.billAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; text-align: left;">Total GST:</td>
              <td style="padding: 8px; text-align: right;">₹${purchase.gstAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; text-align: left;">Discount:</td>
              <td style="padding: 8px; text-align: right;">₹${purchase.discountAmount.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 2px solid #333; font-size: 15px;">
              <td style="padding: 8px; text-align: left; color: #2c3e50;">Grand Total:</td>
              <td style="padding: 8px; text-align: right; color: #2c3e50;">₹${purchase.grandTotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; text-align: left; font-weight: normal; color: #7f8c8d;">Paid Amount:</td>
              <td style="padding: 8px; text-align: right; font-weight: normal; color: #7f8c8d;">₹${purchase.paidAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px; text-align: left; color: #c0392b;">Outstanding Balance:</td>
              <td style="padding: 8px; text-align: right; color: #c0392b;">₹${purchase.pendingAmount.toFixed(2)}</td>
            </tr>
          </table>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0 10px 0;">
          <p style="font-size: 11px; text-align: center; color: #95a5a6;">Generated by ${purchase.createdBy.name} on ${new Date().toLocaleDateString()}</p>
        </div>
      `
    });
  } catch (error) {
    console.error('Error generating PDF data:', error);
    res.status(500).json({ success: false, message: 'Server error exporting invoice print layout' });
  }
};

// @desc    Import purchase draft from Excel/CSV (Bulk parsed json)
// @route   POST /api/purchases/import
// @access  Private
const importPurchaseExcelCSV = async (req, res) => {
  try {
    const { agencyId, invoiceNumber, invoiceDate, purchaseDate, items } = req.body;

    if (!agencyId || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Agency and items are required' });
    }

    const agency = await Agency.findOne({ _id: agencyId, isDeleted: false });
    if (!agency) {
      return res.status(404).json({ success: false, message: 'Supplier agency not found' });
    }

    // Auto-calculate billing amounts
    let billAmount = 0;
    let gstAmount = 0;
    let grandTotal = 0;

    const purchaseItemsData = [];

    for (const item of items) {
      const medicine = await Medicine.findOne({ medicineName: item.medicineName, isDeleted: false });
      if (!medicine) {
        return res.status(400).json({ success: false, message: `Medicine "${item.medicineName}" not found in system` });
      }

      const qty = parseInt(item.quantity, 10) || 0;
      const free = parseInt(item.freeQuantity, 10) || 0;
      const price = parseFloat(item.purchasePrice) || 0;
      const selling = parseFloat(item.sellingPrice) || price * 1.15; // default 15% markup if not provided
      const mrpVal = parseFloat(item.mrp) || selling * 1.1; // default 10% markup over selling price if not provided
      const gstPct = parseFloat(item.gstPercentage) || medicine.gstPercentage || 0;

      const sub = qty * price;
      const lineGst = sub * (gstPct / 100);
      const lineTotal = sub + lineGst;

      billAmount += sub;
      gstAmount += lineGst;
      grandTotal += lineTotal;

      purchaseItemsData.push({
        medicineId: medicine._id,
        batchNumber: item.batchNumber || 'UNKNOWN',
        manufacturingDate: item.manufacturingDate || new Date(),
        expiryDate: item.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // default 1 year out
        quantity: qty,
        freeQuantity: free,
        purchasePrice: price,
        sellingPrice: selling,
        mrp: mrpVal,
        gstPercentage: gstPct,
        discountPercentage: 0,
        lineTotal
      });
    }

    const purchaseNumber = await generateNextPurchaseNumber();

    const purchase = await Purchase.create({
      purchaseNumber,
      invoiceNumber: invoiceNumber || `IMP-${Date.now()}`,
      invoiceDate: invoiceDate || new Date(),
      purchaseDate: purchaseDate || new Date(),
      agencyId,
      billAmount: Math.round(billAmount * 100) / 100,
      gstAmount: Math.round(gstAmount * 100) / 100,
      discountAmount: 0,
      grandTotal: Math.round(grandTotal * 100) / 100,
      paidAmount: 0,
      pendingAmount: Math.round(grandTotal * 100) / 100,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // default 30 days
      creditDays: 30,
      paymentMethod: 'Credit',
      purchaseStatus: 'Draft',
      remarks: 'Bulk imported via system CSV/Excel upload',
      createdBy: req.user.id
    });

    const finalItems = purchaseItemsData.map(item => ({
      ...item,
      purchaseId: purchase._id
    }));

    await PurchaseItem.insertMany(finalItems);

    res.status(201).json({
      success: true,
      purchase,
      message: `Successfully imported purchase draft with ${finalItems.length} items.`
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ success: false, message: 'Server error processing file import' });
  }
};

module.exports = {
  createPurchase,
  getPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
  postPurchase,
  createPurchaseReturn,
  getPurchaseReturns,
  createSupplierPayment,
  getSupplierPayments,
  getPurchaseStats,
  getPurchaseGSTSummary,
  exportInvoicePDF,
  importPurchaseExcelCSV
};
