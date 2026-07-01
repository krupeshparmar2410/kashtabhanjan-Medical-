const mongoose = require('mongoose');
const logger = require('../config/logger');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const SalesReturn = require('../models/SalesReturn');
const SalesReturnItem = require('../models/SalesReturnItem');
const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');
const LoyaltyLedger = require('../models/LoyaltyLedger');
const CustomerActivity = require('../models/CustomerActivity');
const InventoryBatch = require('../models/InventoryBatch');
const InventoryActivity = require('../models/InventoryActivity');
const Medicine = require('../models/Medicine');
const MedicineRecall = require('../models/MedicineRecall');
const Notification = require('../models/Notification');
const FailedTransaction = require('../models/FailedTransaction');
const AuditLog = require('../models/AuditLog');
const CashClosing = require('../models/CashClosing');
const { getNextSequence } = require('../config/SequenceService');
const { getSetting } = require('../config/SettingsService');

const { execute: runInTransaction } = require('../config/TransactionManager');

// Log central audit helper
const logAudit = async (userId, action, entityType, entityId, oldValues = null, newValues = null, ipAddress = '', session = null) => {
  const audit = new AuditLog({
    user: userId,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
    ipAddress
  });
  await audit.save({ session });
};

// @desc    Get substitute suggestions matching same generic/salt composition & category
// @route   GET /api/sales/substitutes/:medicineId
// @access  Private
const getSubstituteMedicines = async (req, res, next) => {
  try {
    const medicine = await Medicine.findById(req.params.medicineId);
    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Source medicine not found' });
    }

    const query = {
      _id: { $ne: medicine._id },
      isDeleted: false,
      status: 'Active',
      currentStock: { $gt: 0 }
    };

    if (medicine.genericName) {
      query.genericName = { $regex: new RegExp(`^${medicine.genericName}$`, 'i') };
    } else if (medicine.category) {
      query.category = medicine.category;
    }

    const substitutes = await Medicine.find(query).limit(5).lean();

    res.json({ success: true, substitutes, message: 'Substitution suggestions retrieved (generic salt-match)' });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new Sale invoice (Checkout)
// @route   POST /api/sales
// @access  Private
const createSale = async (req, res, next) => {
  try {
    const {
      customerId,
      isGstInclusive = true,
      discountType = 'None',
      discountValue = 0,
      paymentMethod = 'Cash',
      paymentDetails = {},
      creditDays = 0,
      remarks = '',
      billingCounter = 'Counter-1',
      orderSource = 'POS',
      prescriptionNumber = '',
      prescriptionDocumentUrl = '',
      items = [],
      redeemLoyalty = false,
      adminOverrideUsed = false,
      adminOverrideReason = '',
      idempotencyKey,
      invoiceStatus = 'Completed',
      draftSaleId
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'POS Invoice must contain at least one medicine item.' });
    }

    // Check Idempotency to prevent duplicate checkouts (only for non-draft checkouts)
    if (idempotencyKey && invoiceStatus !== 'Draft') {
      const duplicate = await Sale.findOne({ idempotencyKey, isDeleted: false });
      if (duplicate) {
        return res.status(200).json({
          success: true,
          sale: duplicate,
          message: 'Retrieved duplicate transaction invoice cached reference (idempotency safety triggered).'
        });
      }
    }

    // Find existing draft if resuming a draft
    let draftSale = null;
    let invoiceNumber;
    if (draftSaleId) {
      draftSale = await Sale.findOne({ _id: draftSaleId, invoiceStatus: 'Draft', isDeleted: false });
      if (!draftSale) {
        return res.status(404).json({ success: false, message: 'Draft invoice not found or is no longer in Draft status' });
      }
      invoiceNumber = draftSale.invoiceNumber;
    } else {
      const invoicePrefix = getSetting('INVOICE_PREFIX', 'INV');
      
      // Self-healing duplicate invoice number collision protection
      let collision = true;
      let attempts = 0;
      while (collision && attempts < 10) {
        invoiceNumber = await getNextSequence('salesInvoiceNumber', invoicePrefix);
        const existingInvoice = await Sale.findOne({ invoiceNumber, isDeleted: false });
        if (!existingInvoice) {
          collision = false;
        } else {
          logger.warn(`Sequence collision: Invoice number ${invoiceNumber} already exists in DB. Auto-incrementing sequence.`);
          attempts++;
        }
      }
      if (collision) {
        return res.status(409).json({ success: false, message: 'Failed to generate a unique invoice number sequence due to high rate of collisions' });
      }
    }

    // Load customer profile (Registered or default Walk-In)
    let customer = await Customer.findOne({ _id: customerId, isDeleted: false });
    if (!customer) {
      // Fetch default Walk-In customer
      customer = await Customer.findOne({ customerType: 'Walk-In' });
      if (!customer) {
        return res.status(400).json({ success: false, message: 'No customer reference selected and default Walk-In profile is missing' });
      }
    }

    // Run POS operation wrapped in transaction
    const savedSale = await runInTransaction(async (session) => {
      // Track original states and created documents for manual rollback if standalone MongoDB fails
      const createdDocs = [];
      const originalBatches = [];
      const originalMedicines = [];
      const originalPrescriptions = [];
      let originalCustomer = null;

      try {
        if (draftSaleId) {
          const draftSaleObj = await Sale.findOne({ _id: draftSaleId, invoiceStatus: 'Draft', isDeleted: false }).session(session);
          if (!draftSaleObj) {
            throw new Error(`Draft invoice ID ${draftSaleId} not found or is no longer in Draft status`);
          }

          // Release existing draft reservations to prevent duplicate count/leaks
          const draftItems = await SaleItem.find({ saleId: draftSaleObj._id }).session(session);
          for (const item of draftItems) {
            for (const itemBatch of item.batches) {
              const batch = await InventoryBatch.findById(itemBatch.inventoryBatchId).session(session);
              if (batch) {
                batch.reservedQuantity = Math.max(0, (batch.reservedQuantity || 0) - itemBatch.quantity);
                batch.availableQuantity = Math.round((batch.availableQuantity + itemBatch.quantity) * 100) / 100;
                if (batch.status === 'Sold Out' || batch.availableQuantity > 0) {
                  const todayDate = new Date();
                  if (new Date(batch.expiryDate) > todayDate && !batch.isLocked) {
                    batch.status = 'Active';
                    batch.isSaleBlocked = false;
                  } else if (new Date(batch.expiryDate) <= todayDate) {
                    batch.status = 'Expired';
                    batch.isSaleBlocked = true;
                  }
                }
                await batch.save({ session });
              }
              
              const medicine = await Medicine.findById(item.medicineId).session(session);
              if (medicine) {
                medicine.currentStock = Math.round((medicine.currentStock + itemBatch.quantity) * 100) / 100;
                await medicine.save({ session });
              }
            }
          }

          // Delete existing SaleItems for this draft so new ones can be inserted
          await SaleItem.deleteMany({ saleId: draftSaleObj._id }).session(session);
        }

        if (customer) {
          originalCustomer = {
            id: customer._id,
            outstandingBalance: customer.outstandingBalance,
            loyaltyPoints: customer.loyaltyPoints
          };
        }

        let subtotal = 0;
        let gstAmount = 0;
        let totalPurchaseCost = 0;
        const saleItemsData = [];
        const linkedPrescriptions = [];
        const prescriptionUsagesToCreate = [];
        let rxReqFound = false;

        // Process items FEFO and compliance checks
        for (const item of items) {
          const medicine = await Medicine.findOne({ _id: item.medicineId, isDeleted: false }).session(session);
          if (!medicine) {
            throw new Error(`Medicine code ${item.medicineId} not found or has been deleted`);
          }

          // Snapshot medicine stock before update
          originalMedicines.push({
            id: medicine._id,
            currentStock: medicine.currentStock
          });

          // Compliance checks for Schedule H, H1, X or general prescriptions
          const rxReq = medicine.prescriptionRequired === true || medicine.prescriptionRequired === 'Yes' || medicine.scheduleCategory !== 'Normal' || medicine.scheduleH || medicine.scheduleH1 || medicine.scheduleX;
          if (rxReq) {
            rxReqFound = true;
            const rxId = item.prescriptionId || req.body.prescriptionId;
            const rxNum = item.prescriptionNumber || req.body.prescriptionNumber || prescriptionNumber;

            if (customer.customerType === 'Walk-In') {
              if (!rxNum || rxNum.trim() === '') {
                throw new Error(`Restricted medicine "${medicine.medicineName}" (Schedule ${medicine.scheduleCategory || 'H/H1/X'}) requires a prescription number for Walk-In checkout`);
              }
            } else {
              const Prescription = require('../models/Prescription');
              let rx;
              if (rxId) {
                rx = await Prescription.findOne({ _id: rxId, isArchived: false }).session(session);
              } else if (rxNum) {
                rx = await Prescription.findOne({ prescriptionNumber: rxNum, isArchived: false }).session(session);
              }

              if (!rx) {
                throw new Error(`Restricted medicine "${medicine.medicineName}" (Schedule ${medicine.scheduleCategory || 'H/H1/X'}) requires a valid approved doctor prescription`);
              }

              if (String(rx.customerId) !== String(customerId)) {
                throw new Error(`Prescription patient customer mismatch: Prescription does not belong to the selected customer.`);
              }

              if (rx.status !== 'Approved') {
                throw new Error(`Prescription is not approved. Current status: ${rx.status}`);
              }

              if (rx.expiryDate && new Date(rx.expiryDate) < new Date()) {
                throw new Error(`Prescription has expired on ${rx.expiryDate.toLocaleDateString()}`);
              }

              const rxMedicine = rx.medicines.find(m => String(m.medicineId) === String(medicine._id));
              if (!rxMedicine) {
                throw new Error(`Medicine "${medicine.medicineName}" is not listed in prescription ${rx.prescriptionNumber}`);
              }

              if (rxMedicine.quantityRemaining < item.quantity) {
                throw new Error(`Billed quantity ${item.quantity} exceeds allowed prescription quantity remaining (${rxMedicine.quantityRemaining} units left)`);
              }

              // Snapshot prescription before decrement
              originalPrescriptions.push({
                id: rx._id,
                lastUsedAt: rx.lastUsedAt,
                medicines: rx.medicines.map(m => ({
                  medicineId: m.medicineId,
                  quantityBilled: m.quantityBilled,
                  quantityConsumed: m.quantityConsumed,
                  quantityRemaining: m.quantityRemaining
                }))
              });

              // Decrement remaining allowed, increment consumed inside transaction
              rxMedicine.quantityConsumed += item.quantity;
              rxMedicine.quantityRemaining -= item.quantity;
              if (rxMedicine.quantityRemaining < 0) {
                throw new Error(`Validation Error: Prescription quantity remaining cannot be negative.`);
              }
              rx.lastUsedAt = new Date();
              await rx.save({ session });

              if (!linkedPrescriptions.includes(String(rx._id))) {
                linkedPrescriptions.push(String(rx._id));
              }
              prescriptionUsagesToCreate.push({
                prescriptionId: rx._id,
                medicineId: medicine._id,
                quantityConsumed: item.quantity,
                billedQuantity: item.quantity,
                invoiceNumber,
                verifiedBy: req.user.id
              });
            }
          }

          // FEFO Stock allocation logic
          let remainingQty = item.quantity;
          const consumedBatches = [];

          // Exclude expired, locked, sale blocked, recalled
          const today = new Date();
          const batches = await InventoryBatch.find({
            medicineId: medicine._id,
            isDeleted: false,
            isLocked: false,
            isSaleBlocked: false,
            recallStatus: 'Normal',
            expiryDate: { $gt: today },
            availableQuantity: { $gt: 0 }
          })
            .sort({ expiryDate: 1 })
            .session(session);

          for (const batch of batches) {
            if (remainingQty <= 0) break;

            const takeQty = Math.min(batch.availableQuantity, remainingQty);

            // Snapshot batch state before decrement
            originalBatches.push({
              id: batch._id,
              availableQuantity: batch.availableQuantity,
              status: batch.status,
              isSaleBlocked: batch.isSaleBlocked,
              reservedQuantity: batch.reservedQuantity || 0
            });

            batch.availableQuantity = Math.round((batch.availableQuantity - takeQty) * 100) / 100;
            if (invoiceStatus === 'Draft') {
              batch.reservedQuantity = (batch.reservedQuantity || 0) + takeQty;
            }
            if (batch.availableQuantity === 0) {
              batch.status = 'Sold Out';
              batch.isSaleBlocked = true;
            }
            await batch.save({ session });

            consumedBatches.push({
              inventoryBatchId: batch._id,
              batchNumber: batch.batchNumber,
              expiryDate: batch.expiryDate,
              quantity: takeQty,
              purchasePrice: batch.purchasePrice,
              sellingPrice: batch.sellingPrice,
              mrp: batch.mrp
            });

            // Log inventory movement activity
            const invAct = new InventoryActivity({
              inventoryBatchId: batch._id,
              action: 'Sale',
              description: `Deducted ${takeQty} units for Sale Invoice ${invoiceNumber}`,
              performedBy: req.user.id
            });
            await invAct.save({ session });
            createdDocs.push(invAct);

            totalPurchaseCost += takeQty * batch.purchasePrice;
            remainingQty -= takeQty;
          }

          if (remainingQty > 0) {
            throw new Error(`Insufficient stock for medicine "${medicine.medicineName}". Missing ${remainingQty} units.`);
          }

          // Deduct Medicine Master current stock
          medicine.currentStock = Math.max(0, medicine.currentStock - item.quantity);
          await medicine.save({ session });

          // Item Price calculations
          const sellingPrice = item.sellingPrice || medicine.sellingPrice;
          const mrp = item.mrp || medicine.mrp;
          const gstPct = medicine.gstPercentage || 0;
          const discPct = item.discountPercentage || 0;

          let lineSubtotal = 0;
          let lineGst = 0;
          let lineDiscount = 0;
          let lineTotal = 0;

          if (isGstInclusive) {
            // GST-Inclusive calculations
            const originalLineTotal = item.quantity * sellingPrice;
            lineDiscount = originalLineTotal * (discPct / 100);
            lineTotal = originalLineTotal - lineDiscount;

            // Back-calculate taxable value and gst amount
            const taxableValue = lineTotal / (1 + gstPct / 100);
            lineGst = lineTotal - taxableValue;
            lineSubtotal = taxableValue;
          } else {
            // GST-Exclusive calculations
            const baseTotal = item.quantity * sellingPrice;
            lineDiscount = baseTotal * (discPct / 100);
            const taxableValue = baseTotal - lineDiscount;
            lineGst = taxableValue * (gstPct / 100);
            lineTotal = taxableValue + lineGst;
            lineSubtotal = taxableValue;
          }

          subtotal += lineSubtotal;
          gstAmount += lineGst;

          saleItemsData.push({
            medicineId: medicine._id,
            medicineName: medicine.medicineName,
            medicineCode: medicine.medicineCode,
            hsnCode: medicine.hsnCode || '',
            unitType: medicine.unitType,
            quantity: item.quantity,
            sellingPrice,
            mrp,
            gstPercentage: gstPct,
            gstAmount: Math.round(lineGst * 100) / 100,
            discountPercentage: discPct,
            discountAmount: Math.round(lineDiscount * 100) / 100,
            lineTotal: Math.round(lineTotal * 100) / 100,
            batches: consumedBatches
          });
        }

        // Grand total computations before overall discount
        let grandTotal = subtotal + gstAmount;

        // Handle overall discount
        let finalDiscountAmount = 0;
        if (discountType === 'Percentage' && discountValue > 0) {
          finalDiscountAmount = grandTotal * (discountValue / 100);
        } else if (discountType === 'Fixed' && discountValue > 0) {
          finalDiscountAmount = discountValue;
        }
        grandTotal = Math.max(0, grandTotal - finalDiscountAmount);

        // Handle Loyalty points redemption & earnings & credit checks
        let loyaltyRedemptionValue = 0;
        let loyaltyPointsRedeemed = 0;
        let loyaltyPointsEarned = 0;
        let paid = 0;
        let pending = 0;
        let due = null;

        if (invoiceStatus !== 'Draft') {
          if (redeemLoyalty && customer.customerType === 'Registered' && customer.loyaltyPoints > 0) {
            const pointsRate = getSetting('LOYALTY_REDEMPTION_RATE', 1);
            const maxRedemptionValue = customer.loyaltyPoints * pointsRate;

            loyaltyRedemptionValue = Math.min(grandTotal, maxRedemptionValue);
            loyaltyPointsRedeemed = Math.ceil(loyaltyRedemptionValue / pointsRate);

            grandTotal = Math.max(0, grandTotal - loyaltyRedemptionValue);

            // Deduct points
            customer.loyaltyPoints -= loyaltyPointsRedeemed;
            await customer.save({ session });

            // Loyalty ledger entry
            const loyLed = new LoyaltyLedger({
              customerId: customer._id,
              transactionType: 'Redeemed',
              points: -loyaltyPointsRedeemed,
              runningBalance: customer.loyaltyPoints,
              referenceNumber: invoiceNumber,
              remarks: `Redeemed ${loyaltyPointsRedeemed} points for Invoice discount of ₹${loyaltyRedemptionValue}`
            });
            loyLed.referenceId = new mongoose.Types.ObjectId(); // temporary
            await loyLed.save({ session });
            createdDocs.push(loyLed);
          }

          // Calculate Loyalty earned (1 point per ₹100 post-discount taxable amount)
          if (customer.customerType === 'Registered') {
            const earnRate = getSetting('LOYALTY_EARN_RATE', 100);
            loyaltyPointsEarned = Math.floor(grandTotal / earnRate);

            if (loyaltyPointsEarned > 0) {
              customer.loyaltyPoints += loyaltyPointsEarned;
              await customer.save({ session });

              const loyLed = new LoyaltyLedger({
                customerId: customer._id,
                transactionType: 'Earned',
                points: loyaltyPointsEarned,
                runningBalance: customer.loyaltyPoints,
                referenceNumber: invoiceNumber,
                remarks: `Earned ${loyaltyPointsEarned} points for Purchase Invoice ${invoiceNumber}`
              });
              loyLed.referenceId = new mongoose.Types.ObjectId(); // temporary
              await loyLed.save({ session });
              createdDocs.push(loyLed);
            }
          }

          if (paymentMethod === 'Credit') {
            pending = grandTotal;
            paid = 0;

            // Credit control validation check
            const allowedCreditLimit = customer.creditLimit || 5000;
            if (customer.outstandingBalance + grandTotal > allowedCreditLimit) {
              if (!adminOverrideUsed) {
                throw new Error(`Transaction BLOCKED: Customer credit limit exceeded (Allowed: ₹${allowedCreditLimit}, Current outstanding: ₹${customer.outstandingBalance}, Trying to bill: ₹${grandTotal})`);
              } else {
                // Check override reason
                if (!adminOverrideReason) {
                  throw new Error('Admin override reason is required to bypass customer credit limits.');
                }
              }
            }

            // Calculate due date
            const creditDaysAllowed = customer.creditDays || 30;
            due = new Date(Date.now() + creditDaysAllowed * 24 * 60 * 60 * 1000);

            // Update customer outstanding balance
            const oldOutstanding = customer.outstandingBalance;
            customer.outstandingBalance = Math.round((customer.outstandingBalance + grandTotal) * 100) / 100;
            await customer.save({ session });

            // Log Customer Ledger
            const custLed = new CustomerLedger({
              customerId: customer._id,
              transactionType: 'Sale',
              referenceNumber: invoiceNumber,
              debit: grandTotal,
              credit: 0,
              runningBalance: customer.outstandingBalance,
              remarks: `Credit sale invoice entry ${invoiceNumber}`
            });
            custLed.referenceId = new mongoose.Types.ObjectId(); // temporary
            await custLed.save({ session });
            createdDocs.push(custLed);

            if (adminOverrideUsed) {
              const createdActs = await CustomerActivity.create([{
                customerId: customer._id,
                action: 'Credit Limit Overridden',
                description: `Bypassed credit limit block for ₹${grandTotal}. Reason: ${adminOverrideReason}`,
                beforeValues: { outstandingBalance: oldOutstanding },
                afterValues: { outstandingBalance: customer.outstandingBalance },
                performedBy: req.user.id
              }], { session });
              createdDocs.push(...createdActs);
            }

          } else if (paymentMethod === 'Mixed') {
            paid = Number(paymentDetails.cashAmount || 0) + Number(paymentDetails.upiAmount || 0) + Number(paymentDetails.cardAmount || 0);
            pending = Math.max(0, grandTotal - paid);
            if (pending > 0) {
              // Rest goes to credit outstanding
              const allowedCreditLimit = customer.creditLimit || 5000;
              if (customer.outstandingBalance + pending > allowedCreditLimit) {
                if (!adminOverrideUsed) {
                  throw new Error(`Transaction BLOCKED: Customer credit limit exceeded on unpaid mixed balance`);
                }
              }

              const creditDaysAllowed = customer.creditDays || 30;
              due = new Date(Date.now() + creditDaysAllowed * 24 * 60 * 60 * 1000);

              customer.outstandingBalance = Math.round((customer.outstandingBalance + pending) * 100) / 100;
              await customer.save({ session });

              const custLed = new CustomerLedger({
                customerId: customer._id,
                transactionType: 'Sale',
                referenceNumber: invoiceNumber,
                debit: pending,
                credit: 0,
                runningBalance: customer.outstandingBalance,
                remarks: `Mixed payment credit sale balance ${invoiceNumber}`
              });
              custLed.referenceId = new mongoose.Types.ObjectId(); // temporary
              await custLed.save({ session });
              createdDocs.push(custLed);
            }
          } else {
            // Paid in full
            paid = grandTotal;
            pending = 0;
          }
        }

        const saleData = {
          invoiceNumber,
          customerId: customer._id,
          customerName: customer.name,
          customerPhone: customer.phone,
          isGstInclusive,
          subtotal: Math.round(subtotal * 100) / 100,
          discountType,
          discountValue,
          discountAmount: Math.round(finalDiscountAmount * 100) / 100,
          gstAmount: Math.round(gstAmount * 100) / 100,
          grandTotal: Math.round(grandTotal * 100) / 100,
          paidAmount: Math.round(paid * 100) / 100,
          pendingAmount: Math.round(pending * 100) / 100,
          paymentMethod,
          paymentDetails: {
            cashAmount: paymentDetails.cashAmount || (paymentMethod === 'Cash' ? grandTotal : 0),
            upiAmount: paymentDetails.upiAmount || (paymentMethod === 'UPI' ? grandTotal : 0),
            cardAmount: paymentDetails.cardAmount || (paymentMethod === 'Card' ? grandTotal : 0),
            creditAmount: paymentDetails.creditAmount || (paymentMethod === 'Credit' ? grandTotal : pending)
          },
          dueDate: due,
          creditDays: paymentMethod === 'Credit' || paymentMethod === 'Mixed' ? creditDays || customer.creditDays : 0,
          billingCounter,
          orderSource,
          prescriptionNumber,
          prescriptionDocumentUrl,
          linkedPrescriptionIds: linkedPrescriptions,
          complianceVerifiedBy: req.body.complianceVerifiedBy || req.user.id,
          complianceVerifiedAt: rxReqFound ? new Date() : null,
          invoiceStatus: invoiceStatus || 'Completed',
          expiresAt: invoiceStatus === 'Draft' ? new Date(Date.now() + 15 * 60 * 1000) : null,
          loyaltyPointsEarned: invoiceStatus === 'Draft' ? 0 : loyaltyPointsEarned,
          loyaltyPointsRedeemed: invoiceStatus === 'Draft' ? 0 : loyaltyPointsRedeemed,
          remarks,
          adminOverrideUsed,
          adminOverrideReason,
          idempotencyKey,
          createdBy: req.user.id
        };

        let sale;
        if (draftSale) {
          sale = draftSale;
          sale.set(saleData);
        } else {
          sale = new Sale(saleData);
        }
        await sale.save({ session });
        createdDocs.push(sale);

        // Save prescription usages inside transaction
        if (prescriptionUsagesToCreate.length > 0) {
          const PrescriptionUsage = require('../models/PrescriptionUsage');
          const usages = prescriptionUsagesToCreate.map(u => ({
            ...u,
            saleId: sale._id,
            createdBy: req.user.id
          }));
          const savedUsages = await PrescriptionUsage.insertMany(usages, { session });
          createdDocs.push(...savedUsages);
        }

        // Generate compliance audit log if restricted medicines were sold
        if (rxReqFound) {
          await logAudit(
            req.user.id,
            'Compliance POS Checkout',
            'Sale',
            sale._id,
            null,
            { linkedPrescriptionIds: linkedPrescriptions },
            req.ip || '127.0.0.1',
            session
          );
        }

        // Save sale items
        const finalItems = saleItemsData.map(item => ({
          ...item,
          saleId: sale._id
        }));
        const savedSaleItems = await SaleItem.insertMany(finalItems, { session });
        createdDocs.push(...savedSaleItems);

        // Update temporary IDs in Ledgers
        await LoyaltyLedger.updateMany({ referenceNumber: invoiceNumber }, { referenceId: sale._id }, { session });
        await CustomerLedger.updateMany({ referenceNumber: invoiceNumber }, { referenceId: sale._id }, { session });

        // Trigger analytics updates in background
        const createdActs = await CustomerActivity.create([{
          customerId: customer._id,
          action: 'Invoice Created',
          description: `Billed Invoice #${invoiceNumber} for ₹${grandTotal}`,
          performedBy: req.user.id
        }], { session });
        createdDocs.push(...createdActs);

        await logAudit(
          req.user.id,
          'Sale Invoice Completed',
          'Sale',
          sale._id,
          null,
          { invoiceNumber, grandTotal, paymentMethod },
          req.ip,
          session
        );

        return sale;

      } catch (err) {
        // Application-level compensation (manual rollback) for standalone MongoDB deployments
        const { getStatus } = require('../config/TransactionManager');
        const hasTxSupport = (await getStatus()).transactionSupport;
        if (!hasTxSupport) {
          logger.warn(`Stand-alone database rollback: compensating createSale failure for invoice ${invoiceNumber || 'N/A'}...`);

          // 1. Delete created documents in reverse order to prevent orphans
          for (let i = createdDocs.length - 1; i >= 0; i--) {
            try {
              const doc = createdDocs[i];
              await doc.constructor.deleteOne({ _id: doc._id });
            } catch (delErr) {
              logger.error(`Manual Rollback ERROR: Failed to delete doc from ${createdDocs[i].constructor.modelName}: ${delErr.message}`);
            }
          }

          // 2. Restore modified inventory batches
          for (const b of originalBatches) {
            try {
              await InventoryBatch.updateOne(
                { _id: b.id },
                { $set: { 
                  availableQuantity: b.availableQuantity, 
                  status: b.status, 
                  isSaleBlocked: b.isSaleBlocked,
                  reservedQuantity: b.reservedQuantity
                } }
              );
            } catch (bErr) {
              logger.error(`Manual Rollback ERROR: Failed to restore InventoryBatch ${b.id}: ${bErr.message}`);
            }
          }

          // 3. Restore medicine currentStock levels
          for (const m of originalMedicines) {
            try {
              await Medicine.updateOne(
                { _id: m.id },
                { $set: { currentStock: m.currentStock } }
              );
            } catch (mErr) {
              logger.error(`Manual Rollback ERROR: Failed to restore Medicine ${m.id}: ${mErr.message}`);
            }
          }

          // 4. Restore prescription consumption quotas
          for (const p of originalPrescriptions) {
            try {
              const Prescription = require('../models/Prescription');
              await Prescription.updateOne(
                { _id: p.id },
                { $set: { medicines: p.medicines, lastUsedAt: p.lastUsedAt } }
              );
            } catch (pErr) {
              logger.error(`Manual Rollback ERROR: Failed to restore Prescription ${p.id}: ${pErr.message}`);
            }
          }

          // 5. Restore customer outstanding balance and loyalty points
          if (originalCustomer) {
            try {
              await Customer.updateOne(
                { _id: originalCustomer.id },
                { $set: { outstandingBalance: originalCustomer.outstandingBalance, loyaltyPoints: originalCustomer.loyaltyPoints } }
              );
            } catch (cErr) {
              logger.error(`Manual Rollback ERROR: Failed to restore Customer ${originalCustomer.id}: ${cErr.message}`);
            }
          }
        }
        throw err;
      }
    });

    res.status(201).json({
      success: true,
      sale: savedSale,
      message: `Invoice #${savedSale.invoiceNumber} checked out successfully.`
    });

  } catch (error) {
    if (error.message && (
      error.message.includes('Prescription') ||
      error.message.includes('Restricted') ||
      error.message.includes('exceeds') ||
      error.message.includes('allowed')
    )) {
      try {
        const AuditLog = require('../models/AuditLog');
        await AuditLog.create({
          user: req.user.id,
          action: 'Compliance Validation Failure',
          entityType: 'Sale',
          entityId: req.body.customerId || new mongoose.Types.ObjectId(),
          remarks: error.message,
          ipAddress: req.ip || '127.0.0.1'
        });
      } catch (logErr) {
        console.error('Failed to log compliance failure:', logErr);
      }
    }
    next(error);
  }
};

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
const getSales = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      customerId,
      startDate,
      endDate,
      counter
    } = req.query;

    const query = { isDeleted: false, isArchived: { $ne: true } };

    if (search) {
      query.invoiceNumber = { $regex: search, $options: 'i' };
    }

    if (status) {
      query.invoiceStatus = status;
    }

    if (customerId) {
      query.customerId = customerId;
    }

    if (counter) {
      query.billingCounter = counter;
    }

    if (startDate || endDate) {
      query.saleDate = {};
      if (startDate) query.saleDate.$gte = new Date(startDate);
      if (endDate) query.saleDate.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const sales = await Sale.find(query)
      .sort({ saleDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('customerId', 'name phone')
      .populate('createdBy', 'name')
      .lean();

    const total = await Sale.countDocuments(query);

    res.json({
      success: true,
      sales,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      total
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single sale details
// @route   GET /api/sales/:id
// @access  Private
const getSaleById = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, isDeleted: false, isArchived: { $ne: true } })
      .populate('customerId')
      .populate('createdBy', 'name')
      .lean();

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale invoice not found' });
    }

    const items = await SaleItem.find({ saleId: sale._id }).populate('medicineId').lean();

    res.json({ success: true, sale, items });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel a completed sale invoice (Full Revert)
// @route   POST /api/sales/:id/cancel
// @access  Private
const cancelSale = async (req, res, next) => {
  try {
    const { reason = '' } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
    }

    const sale = await Sale.findOne({ _id: req.params.id, isDeleted: false, isArchived: { $ne: true } });
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale invoice not found' });
    }

    if (sale.invoiceStatus === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'Invoice is already cancelled' });
    }

    const result = await runInTransaction(async (session) => {
      // Revert Inventory Stock
      const items = await SaleItem.find({ saleId: sale._id }).session(session);
      for (const item of items) {
        // Restore each batch
        for (const itemBatch of item.batches) {
          const batch = await InventoryBatch.findById(itemBatch.inventoryBatchId).session(session);
          if (batch) {
            batch.availableQuantity = Math.round((batch.availableQuantity + itemBatch.quantity) * 100) / 100;
            // Re-open status if it was sold out
            if (batch.status === 'Sold Out') {
              batch.status = 'Active';
              batch.isSaleBlocked = false;
            }
            await batch.save({ session });
          }

          // Log restore action
          const invAct = new InventoryActivity({
            inventoryBatchId: itemBatch.inventoryBatchId,
            action: 'Stock Adjustment',
            description: `Restored ${itemBatch.quantity} units due to cancellation of Sale ${sale.invoiceNumber}`,
            performedBy: req.user.id
          });
          await invAct.save({ session });
        }

        // Restore Medicine Master Stock
        const medicine = await Medicine.findById(item.medicineId).session(session);
        if (medicine) {
          medicine.currentStock = Math.max(0, medicine.currentStock + item.quantity);
          await medicine.save({ session });
        }
      }

      // Revert Loyalty points
      const customer = await Customer.findById(sale.customerId).session(session);
      if (customer && customer.customerType === 'Registered') {
        const netPoints = sale.loyaltyPointsEarned - sale.loyaltyPointsRedeemed;
        customer.loyaltyPoints = Math.max(0, customer.loyaltyPoints - netPoints);
        await customer.save({ session });

        const loyLed = new LoyaltyLedger({
          customerId: customer._id,
          transactionType: 'Reverted',
          points: -netPoints,
          runningBalance: customer.loyaltyPoints,
          referenceId: sale._id,
          referenceNumber: sale.invoiceNumber,
          remarks: `Reversal log due to invoice cancellation of ${sale.invoiceNumber}`
        });
        await loyLed.save({ session });
      }

      // Revert Customer Ledger & outstanding balance
      if (sale.paymentMethod === 'Credit' || (sale.paymentMethod === 'Mixed' && sale.pendingAmount > 0)) {
        const amountToDeduct = sale.pendingAmount;
        if (customer) {
          const oldOutstanding = customer.outstandingBalance;
          customer.outstandingBalance = Math.round((customer.outstandingBalance - amountToDeduct) * 100) / 100;
          await customer.save({ session });

          const custLed = new CustomerLedger({
            customerId: customer._id,
            transactionType: 'Sale Return',
            referenceId: sale._id,
            referenceNumber: sale.invoiceNumber,
            debit: 0,
            credit: amountToDeduct,
            runningBalance: customer.outstandingBalance,
            remarks: `Outstanding reverted due to cancellation of invoice ${sale.invoiceNumber}`
          });
          await custLed.save({ session });

          await CustomerActivity.create([{
            customerId: customer._id,
            action: 'Outstanding Reverted',
            description: `Outstanding debt of ₹${amountToDeduct} reversed due to cancellation of ${sale.invoiceNumber}`,
            beforeValues: { outstandingBalance: oldOutstanding },
            afterValues: { outstandingBalance: customer.outstandingBalance },
            performedBy: req.user.id
          }], { session });
        }
      }

      // Mark Invoice Cancelled
      sale.invoiceStatus = 'Cancelled';
      sale.remarks = `${sale.remarks ? sale.remarks + ' | ' : ''}Cancelled: ${reason}`;
      await sale.save({ session });

      await logAudit(
        req.user.id,
        'Sale Invoice Cancelled',
        'Sale',
        sale._id,
        { invoiceStatus: 'Completed' },
        { invoiceStatus: 'Cancelled', reason },
        req.ip,
        session
      );

      return sale;
    });

    res.json({ success: true, sale: result, message: 'Sale invoice cancelled and inventory/ledger reverted.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Process Sales Return (Partial or Full)
// @route   POST /api/sales/returns
// @access  Private
const createSalesReturn = async (req, res, next) => {
  try {
    const { saleId, returnDate, remarks = '', items = [] } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item is required for processing returns' });
    }

    const sale = await Sale.findOne({ _id: saleId, isDeleted: false, isArchived: { $ne: true } });
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Original sale invoice not found' });
    }

    const prefix = getSetting('RETURN_PREFIX', 'SRN');
    const returnNumber = await getNextSequence('salesReturnNumber', prefix);

    const result = await runInTransaction(async (session) => {
      // Track original states and created documents for manual rollback if standalone MongoDB fails
      const createdDocs = [];
      const originalBatches = [];
      const originalMedicines = [];
      const originalSaleStatus = { id: sale._id, invoiceStatus: sale.invoiceStatus };
      let originalCustomer = null;

      try {
        let subtotal = 0;
        let gstAmount = 0;
        let refundAmount = 0;
        const returnItemsData = [];

        const customer = await Customer.findById(sale.customerId).session(session);
        if (customer) {
          originalCustomer = {
            id: customer._id,
            outstandingBalance: customer.outstandingBalance,
            loyaltyPoints: customer.loyaltyPoints
          };
        }

        for (const item of items) {
          const saleItem = await SaleItem.findOne({ saleId: sale._id, medicineId: item.medicineId }).session(session);
          if (!saleItem) {
            throw new Error(`Item ${item.medicineId} was not part of the original sale invoice`);
          }

          // Calculate cumulative quantity already returned for this item to prevent over-returns
          const previousReturns = await SalesReturn.find({ saleId: sale._id, isDeleted: false }).session(session);
          const previousReturnIds = previousReturns.map(r => r._id);
          const previousReturnItems = await SalesReturnItem.find({
            salesReturnId: { $in: previousReturnIds },
            medicineId: item.medicineId
          }).session(session);
          const alreadyReturnedQty = previousReturnItems.reduce((sum, rItem) => sum + rItem.quantity, 0);
          const maxAllowedToReturn = saleItem.quantity - alreadyReturnedQty;

          if (item.quantity > maxAllowedToReturn) {
            throw new Error(`Return quantity (${item.quantity}) exceeds remaining returnable quantity (${maxAllowedToReturn}) for medicine "${saleItem.medicineName}"`);
          }

          // Restore Stock to batches FIFO style based on what was sold
          let remainingToReturn = item.quantity;
          const restoredBatches = [];

          for (const saleBatch of saleItem.batches) {
            if (remainingToReturn <= 0) break;

            const restoreQty = Math.min(saleBatch.quantity, remainingToReturn);
            const batch = await InventoryBatch.findById(saleBatch.inventoryBatchId).session(session);
            if (batch) {
              // Snapshot batch before update
              originalBatches.push({
                id: batch._id,
                availableQuantity: batch.availableQuantity,
                status: batch.status,
                isSaleBlocked: batch.isSaleBlocked
              });

              batch.availableQuantity = Math.round((batch.availableQuantity + restoreQty) * 100) / 100;
              if (batch.status === 'Sold Out') {
                batch.status = 'Active';
                batch.isSaleBlocked = false;
              }
              await batch.save({ session });

              restoredBatches.push({
                inventoryBatchId: batch._id,
                batchNumber: batch.batchNumber,
                quantity: restoreQty
              });

              // Log activity
              const invAct = new InventoryActivity({
                inventoryBatchId: batch._id,
                action: 'Sale Return',
                description: `Restored ${restoreQty} units via Sales Return ${returnNumber}`,
                performedBy: req.user.id
              });
              await invAct.save({ session });
              createdDocs.push(invAct);
            }
            remainingToReturn -= restoreQty;
          }

          // Restore Medicine master stock
          const medicine = await Medicine.findById(item.medicineId).session(session);
          if (medicine) {
            originalMedicines.push({
              id: medicine._id,
              currentStock: medicine.currentStock
            });
            medicine.currentStock = Math.max(0, medicine.currentStock + item.quantity);
            await medicine.save({ session });
          }

          // Calculate refund pricing
          const price = saleItem.sellingPrice;
          const itemSubtotal = item.quantity * price / (1 + (saleItem.gstPercentage / 100));
          const itemGst = item.quantity * price - itemSubtotal;
          const itemTotal = item.quantity * price;

          subtotal += itemSubtotal;
          gstAmount += itemGst;
          refundAmount += itemTotal;

          returnItemsData.push({
            medicineId: item.medicineId,
            quantity: item.quantity,
            sellingPrice: price,
            gstPercentage: saleItem.gstPercentage,
            gstAmount: Math.round(itemGst * 100) / 100,
            lineTotal: Math.round(itemTotal * 100) / 100,
            batches: restoredBatches
          });
        }

        // Create Sales Return record
        const salesReturn = new SalesReturn({
          returnNumber,
          saleId: sale._id,
          returnDate: returnDate || new Date(),
          customerId: sale.customerId,
          subtotal: Math.round(subtotal * 100) / 100,
          gstAmount: Math.round(gstAmount * 100) / 100,
          refundAmount: Math.round(refundAmount * 100) / 100,
          paymentMethod: sale.paymentMethod === 'Credit' ? 'Credit Adjustment' : 'Cash',
          remarks,
          createdBy: req.user.id
        });
        await salesReturn.save({ session });
        createdDocs.push(salesReturn);

        // Save return items
        const finalReturnItems = returnItemsData.map(item => ({
          ...item,
          salesReturnId: salesReturn._id
        }));
        const savedReturnItems = await SalesReturnItem.insertMany(finalReturnItems, { session });
        createdDocs.push(...savedReturnItems);

        // Adjust customer balance / outstanding
        if (sale.paymentMethod === 'Credit' || (sale.paymentMethod === 'Mixed' && sale.pendingAmount > 0)) {
          // Credit adjustment: reduce customer outstanding balance
          if (customer) {
            const oldOutstanding = customer.outstandingBalance;
            customer.outstandingBalance = Math.max(0, Math.round((customer.outstandingBalance - refundAmount) * 100) / 100);
            await customer.save({ session });

            const custLed = new CustomerLedger({
              customerId: customer._id,
              transactionType: 'Sale Return',
              referenceId: salesReturn._id,
              referenceNumber: returnNumber,
              debit: 0,
              credit: refundAmount,
              runningBalance: customer.outstandingBalance,
              remarks: `Credit reduction for Return ${returnNumber}`
            });
            await custLed.save({ session });
            createdDocs.push(custLed);

            const createdActs = await CustomerActivity.create([{
              customerId: customer._id,
              action: 'Outstanding Reverted',
              description: `Outstanding debt reduced by ₹${refundAmount} via Sales Return ${returnNumber}`,
              beforeValues: { outstandingBalance: oldOutstanding },
              afterValues: { outstandingBalance: customer.outstandingBalance },
              performedBy: req.user.id
            }], { session });
            createdDocs.push(...createdActs);
          }
        }

        // Deduct loyalty points accrued on returned items
        if (customer && customer.customerType === 'Registered') {
          const earnRate = getSetting('LOYALTY_EARN_RATE', 100);
          const pointsToDeduct = Math.floor(refundAmount / earnRate);
          if (pointsToDeduct > 0) {
            customer.loyaltyPoints = Math.max(0, customer.loyaltyPoints - pointsToDeduct);
            await customer.save({ session });

            const loyLed = new LoyaltyLedger({
              customerId: customer._id,
              transactionType: 'Reverted',
              points: -pointsToDeduct,
              runningBalance: customer.loyaltyPoints,
              referenceId: salesReturn._id,
              referenceNumber: returnNumber,
              remarks: `Points reversed due to Return ${returnNumber}`
            });
            await loyLed.save({ session });
            createdDocs.push(loyLed);
          }
        }

        // Mark original Sale status
        sale.invoiceStatus = 'Returned';
        await sale.save({ session });

        await logAudit(
          req.user.id,
          'Sales Return Processed',
          'SalesReturn',
          salesReturn._id,
          null,
          { returnNumber, refundAmount },
          req.ip,
          session
        );

        return salesReturn;

      } catch (err) {
        const { getStatus } = require('../config/TransactionManager');
        const hasTxSupport = (await getStatus()).transactionSupport;
        if (!hasTxSupport) {
          logger.warn(`Stand-alone database rollback: compensating createSalesReturn failure for return ${returnNumber || 'N/A'}...`);

          // 1. Delete created documents in reverse order to prevent orphans
          for (let i = createdDocs.length - 1; i >= 0; i--) {
            try {
              const doc = createdDocs[i];
              await doc.constructor.deleteOne({ _id: doc._id });
            } catch (delErr) {
              logger.error(`Manual Rollback ERROR: Failed to delete doc from ${createdDocs[i].constructor.modelName}: ${delErr.message}`);
            }
          }

          // 2. Restore modified inventory batches
          for (const b of originalBatches) {
            try {
              await InventoryBatch.updateOne(
                { _id: b.id },
                { $set: { availableQuantity: b.availableQuantity, status: b.status, isSaleBlocked: b.isSaleBlocked } }
              );
            } catch (bErr) {
              logger.error(`Manual Rollback ERROR: Failed to restore InventoryBatch ${b.id}: ${bErr.message}`);
            }
          }

          // 3. Restore medicine currentStock levels
          for (const m of originalMedicines) {
            try {
              await Medicine.updateOne(
                { _id: m.id },
                { $set: { currentStock: m.currentStock } }
              );
            } catch (mErr) {
              logger.error(`Manual Rollback ERROR: Failed to restore Medicine ${m.id}: ${mErr.message}`);
            }
          }

          // 4. Restore customer balance and loyalty points
          if (originalCustomer) {
            try {
              await Customer.updateOne(
                { _id: originalCustomer.id },
                { $set: { outstandingBalance: originalCustomer.outstandingBalance, loyaltyPoints: originalCustomer.loyaltyPoints } }
              );
            } catch (cErr) {
              logger.error(`Manual Rollback ERROR: Failed to restore Customer ${originalCustomer.id}: ${cErr.message}`);
            }
          }

          // 5. Restore original sale invoice status
          try {
            await Sale.updateOne(
              { _id: originalSaleStatus.id },
              { $set: { invoiceStatus: originalSaleStatus.invoiceStatus } }
            );
          } catch (sErr) {
            logger.error(`Manual Rollback ERROR: Failed to restore Sale ${originalSaleStatus.id}: ${sErr.message}`);
          }
        }
        throw err;
      }
    });

    res.status(201).json({
      success: true,
      salesReturn: result,
      message: `Sales return ${result.returnNumber} processed successfully. Stock restored.`
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get all processed returns
// @route   GET /api/sales/returns
// @access  Private
const getSalesReturns = async (req, res, next) => {
  try {
    const returns = await SalesReturn.find({ isDeleted: false, isArchived: { $ne: true } })
      .sort({ returnDate: -1 })
      .populate('customerId', 'name phone')
      .populate('saleId', 'invoiceNumber')
      .populate('createdBy', 'name')
      .lean();

    res.json({ success: true, returns });
  } catch (error) {
    next(error);
  }
};

// @desc    Get reports listing
// @route   GET /api/sales/reports
// @access  Private
const getSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, customerId, productSearch, category, counter, format = 'json' } = req.query;

    const query = { isDeleted: false, invoiceStatus: { $ne: 'Cancelled' }, isArchived: { $ne: true } };

    if (startDate || endDate) {
      query.saleDate = {};
      if (startDate) query.saleDate.$gte = new Date(startDate);
      if (endDate) query.saleDate.$lte = new Date(endDate);
    }

    if (customerId) {
      query.customerId = customerId;
    }

    if (counter) {
      query.billingCounter = counter;
    }

    const sales = await Sale.find(query).sort({ saleDate: -1 }).populate('customerId', 'name phone').lean();
    const salesIds = sales.map(s => s._id);

    // Load line items
    const itemQuery = { saleId: { $in: salesIds } };
    if (productSearch) {
      itemQuery.medicineName = { $regex: productSearch, $options: 'i' };
    }

    const saleItems = await SaleItem.find(itemQuery).lean();

    // Group items by invoice for detailed tables
    const reportsData = sales.map((sale) => {
      const items = saleItems.filter(i => String(i.saleId) === String(sale._id));
      let profit = 0;
      items.forEach((item) => {
        item.batches.forEach((b) => {
          profit += b.quantity * (b.sellingPrice - b.purchasePrice);
        });
      });

      return {
        ...sale,
        items,
        calculatedProfit: Math.round(profit * 100) / 100
      };
    });

    if (format === 'csv') {
      let csv = 'Invoice Number,Date,Customer,Total,Paid,Pending,Payment Method,Profit,Status\n';
      reportsData.forEach((row) => {
        const date = new Date(row.saleDate).toLocaleDateString();
        const cust = row.customerName;
        csv += `"${row.invoiceNumber}","${date}","${cust}",${row.grandTotal},${row.paidAmount},${row.pendingAmount},"${row.paymentMethod}",${row.calculatedProfit},"${row.invoiceStatus}"\n`;
      });
      res.header('Content-Type', 'text/csv');
      res.attachment(`Sales_Report_${Date.now()}.csv`);
      return res.send(csv);
    }

    res.json({ success: true, reports: reportsData });
  } catch (error) {
    next(error);
  }
};

// @desc    Get system health status monitoring
// @route   GET /api/sales/health
// @access  Public
const getSystemHealth = async (req, res, next) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    const uptime = process.uptime();
    
    // Count failed transactions
    const failedCount = await FailedTransaction.countDocuments();
    // Count active sessions/users
    const activeCustomers = await Customer.countDocuments({ isDeleted: false, customerType: 'Registered' });

    res.json({
      success: true,
      health: {
        databaseStatus: dbStatus,
        apiStatus: 'Healthy',
        uptime: `${Math.round(uptime)} seconds`,
        failedTransactionsCount: failedCount,
        registeredCustomers: activeCustomers,
        lastBackupTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toLocaleString() // Mock 4 hours ago
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Sales Dashboard metrics calculations
// @route   GET /api/sales/dashboard
// @access  Private
const getSalesDashboard = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0,0,0,0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Sales Aggregations
    const todaySales = await Sale.aggregate([
      { $match: { saleDate: { $gte: today }, isDeleted: false, invoiceStatus: { $ne: 'Cancelled' }, isArchived: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
    ]);

    const weekSales = await Sale.aggregate([
      { $match: { saleDate: { $gte: startOfWeek }, isDeleted: false, invoiceStatus: { $ne: 'Cancelled' }, isArchived: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } }
    ]);

    const monthSales = await Sale.aggregate([
      { $match: { saleDate: { $gte: startOfMonth }, isDeleted: false, invoiceStatus: { $ne: 'Cancelled' }, isArchived: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } }
    ]);

    const overallSales = await Sale.aggregate([
      { $match: { isDeleted: false, invoiceStatus: { $ne: 'Cancelled' }, isArchived: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' }, avgBill: { $avg: '$grandTotal' } } }
    ]);

    // Profit engine aggregations (using stored snapshots)
    const todayItems = await SaleItem.aggregate([
      {
        $lookup: {
          from: 'sales',
          localField: 'saleId',
          foreignField: '_id',
          as: 'sale'
        }
      },
      { $unwind: '$sale' },
      { $match: { 'sale.saleDate': { $gte: today }, 'sale.isDeleted': false, 'sale.invoiceStatus': { $ne: 'Cancelled' }, 'sale.isArchived': { $ne: true } } },
      { $unwind: '$batches' },
      {
        $group: {
          _id: null,
          revenue: { $sum: { $multiply: ['$batches.quantity', '$batches.sellingPrice'] } },
          cost: { $sum: { $multiply: ['$batches.quantity', '$batches.purchasePrice'] } }
        }
      }
    ]);

    const monthItems = await SaleItem.aggregate([
      {
        $lookup: {
          from: 'sales',
          localField: 'saleId',
          foreignField: '_id',
          as: 'sale'
        }
      },
      { $unwind: '$sale' },
      { $match: { 'sale.saleDate': { $gte: startOfMonth }, 'sale.isDeleted': false, 'sale.invoiceStatus': { $ne: 'Cancelled' }, 'sale.isArchived': { $ne: true } } },
      { $unwind: '$batches' },
      {
        $group: {
          _id: null,
          revenue: { $sum: { $multiply: ['$batches.quantity', '$batches.sellingPrice'] } },
          cost: { $sum: { $multiply: ['$batches.quantity', '$batches.purchasePrice'] } }
        }
      }
    ]);

    const topMedicines = await SaleItem.aggregate([
      {
        $lookup: {
          from: 'sales',
          localField: 'saleId',
          foreignField: '_id',
          as: 'sale'
        }
      },
      { $unwind: '$sale' },
      { $match: { 'sale.isDeleted': false, 'sale.invoiceStatus': 'Completed', 'sale.isArchived': { $ne: true } } },
      {
        $group: {
          _id: '$medicineId',
          medicineName: { $first: '$medicineName' },
          medicineCode: { $first: '$medicineCode' },
          soldQuantity: { $sum: '$quantity' },
          totalSales: { $sum: '$lineTotal' }
        }
      },
      { $sort: { soldQuantity: -1 } },
      { $limit: 5 }
    ]);

    // Counter Wise
    const counterSales = await Sale.aggregate([
      { $match: { isDeleted: false, invoiceStatus: { $ne: 'Cancelled' }, isArchived: { $ne: true } } },
      { $group: { _id: '$billingCounter', sales: { $sum: '$grandTotal' } } }
    ]);

    const todayVal = todaySales[0] || { total: 0, count: 0 };
    const monthVal = monthSales[0] || { total: 0, count: 0 };
    const overallVal = overallSales[0] || { total: 0, avgBill: 0 };

    const todayProfitObj = todayItems[0] || { revenue: 0, cost: 0 };
    const monthProfitObj = monthItems[0] || { revenue: 0, cost: 0 };

    const grossTodayProfit = todayProfitObj.revenue - todayProfitObj.cost;
    const grossMonthProfit = monthProfitObj.revenue - monthProfitObj.cost;

    // Accounts alerts outstanding check
    const outstandingCount = await Customer.countDocuments({ outstandingBalance: { $gt: 5000 }, isDeleted: false });

    res.json({
      success: true,
      kpis: {
        todaySales: Math.round(todayVal.total * 100) / 100,
        weeklySales: Math.round((weekSales[0] ? weekSales[0].total : 0) * 100) / 100,
        monthlySales: Math.round(monthVal.total * 100) / 100,
        totalRevenue: Math.round(overallVal.total * 100) / 100,
        todayProfit: Math.round(grossTodayProfit * 100) / 100,
        monthlyProfit: Math.round(grossMonthProfit * 100) / 100,
        averageBillValue: Math.round(overallVal.avgBill * 100) / 100,
        outstandingAlerts: outstandingCount
      },
      topMedicines,
      counterSales
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard activities feed
// @route   GET /api/sales/activities
// @access  Private
const getSalesActivity = async (req, res, next) => {
  try {
    const recentSales = await Sale.find({ isDeleted: false, isArchived: { $ne: true } })
      .sort({ saleDate: -1 })
      .limit(5)
      .populate('customerId', 'name')
      .lean();

    const recentReturns = await SalesReturn.find({ isDeleted: false, isArchived: { $ne: true } })
      .sort({ returnDate: -1 })
      .limit(5)
      .populate('customerId', 'name')
      .lean();

    const registrations = await Customer.find({ isDeleted: false, customerType: 'Registered' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      recentSales,
      recentReturns,
      registrations
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new medicine batch recall and lock stock
// @route   POST /api/sales/recalls
// @access  Private
const createMedicineRecall = async (req, res, next) => {
  try {
    const { medicineId, affectedBatches = [], recallReason } = req.body;

    if (!medicineId || affectedBatches.length === 0 || !recallReason) {
      return res.status(400).json({ success: false, message: 'Medicine ID, list of affected batches, and recall reason are required.' });
    }

    const recallPrefix = getSetting('RECALL_PREFIX', 'REC');
    const recallNumber = await getNextSequence('medicineRecallNumber', recallPrefix);

    const result = await runInTransaction(async (session) => {
      const recall = new MedicineRecall({
        recallNumber,
        medicineId,
        affectedBatches,
        recallReason,
        createdBy: req.user.id
      });
      await recall.save({ session });

      // Flag each inventory batch as recalled and block selling
      for (const batchId of affectedBatches) {
        const batch = await InventoryBatch.findById(batchId).session(session);
        if (batch) {
          batch.recallStatus = 'Recalled';
          batch.recallReason = recallReason;
          batch.isSaleBlocked = true;
          await batch.save({ session });

          // Log inventory disposal activity
          const invAct = new InventoryActivity({
            inventoryBatchId: batch._id,
            action: 'Stock Adjustment',
            description: `Batch locked due to Recall Registry ${recallNumber}`,
            performedBy: req.user.id
          });
          await invAct.save({ session });
        }
      }

      await Notification.create([{
        title: 'Medicine Batch Recalled',
        message: `Recall ${recallNumber} has been logged. ${affectedBatches.length} stock batches are now blocked from billing.`,
        type: 'Recall'
      }], { session });

      await logAudit(
        req.user.id,
        'Medicine Recall Logged',
        'MedicineRecall',
        recall._id,
        null,
        { recallNumber, affectedBatchesCount: affectedBatches.length },
        req.ip,
        session
      );

      return recall;
    });

    res.status(201).json({
      success: true,
      recall: result,
      message: `Recall registry ${result.recallNumber} filed successfully. Associated stock batches are blocked.`
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get medicine recalls history
// @route   GET /api/sales/recalls
// @access  Private
const getMedicineRecalls = async (req, res, next) => {
  try {
    const recalls = await MedicineRecall.find()
      .sort({ recallDate: -1 })
      .populate('medicineId', 'medicineName medicineCode')
      .populate('createdBy', 'name')
      .lean();

    res.json({ success: true, recalls });
  } catch (error) {
    next(error);
  }
};

// @desc    Get recent dashboard notifications
// @route   GET /api/sales/notifications
// @access  Private
const getRecentNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ isRead: false })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({ success: true, notifications });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark dashboard notifications as read
// @route   PUT /api/sales/notifications/:id
// @access  Private
const markNotificationRead = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    notification.isRead = true;
    await notification.save();

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get print invoice HTML
// @route   GET /api/sales/:id/pdf
// @access  Private
const getInvoicePDF = async (req, res, next) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, isDeleted: false, isArchived: { $ne: true } })
      .populate('customerId')
      .populate('createdBy', 'name')
      .lean();

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale invoice not found' });
    }

    const items = await SaleItem.find({ saleId: sale._id }).lean();
    const footerText = getSetting('INVOICE_FOOTER', 'Thank you for choosing Kashtbhanjan Medical!');

    const tableRows = items.map((item, idx) => `
      <tr style="border-bottom: 1px solid #f2f2f2;">
        <td style="padding: 10px 5px; text-align: center;">${idx + 1}</td>
        <td style="padding: 10px 5px;">
          <strong>${item.medicineName}</strong><br>
          <span style="font-size: 11px; color: #7f8c8d;">HSN: ${item.hsnCode || 'N/A'} | Form: ${item.unitType || 'Strip'}</span>
        </td>
        <td style="padding: 10px 5px; text-align: center;">
          ${item.batches.map(b => b.batchNumber).join(', ')}
        </td>
        <td style="padding: 10px 5px; text-align: center;">
          ${item.batches.map(b => new Date(b.expiryDate).toLocaleDateString()).join(', ')}
        </td>
        <td style="padding: 10px 5px; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px 5px; text-align: right;">₹${item.sellingPrice.toFixed(2)}</td>
        <td style="padding: 10px 5px; text-align: center;">${item.discountPercentage}%</td>
        <td style="padding: 10px 5px; text-align: center;">${item.gstPercentage}%</td>
        <td style="padding: 10px 5px; text-align: right;">₹${item.lineTotal.toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; max-width: 850px; margin: auto; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b; background: #ffffff;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px;">
          <div>
            <h1 style="margin: 0; color: #0f172a; font-size: 26px; font-weight: 800;">KASHTBHANJAN MEDICAL</h1>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b; line-height: 1.4;">
              101-103, Shree Ram Plaza, GIDC Estate<br>
              Ahmedabad, Gujarat - 382430<br>
              Phone: +91 9988776655 | GSTIN: 24AAACK1234F1Z0<br>
              Drug License: DL-GUJ-123456 & DL-GUJ-123457
            </p>
          </div>
          <div style="text-align: right;">
            <div style="background: #eff6ff; color: #1d4ed8; padding: 6px 14px; font-size: 12px; font-weight: 700; border-radius: 6px; display: inline-block; margin-bottom: 8px;">TAX INVOICE</div>
            <p style="margin: 0; font-size: 13px; color: #64748b;">
              <strong>Invoice #:</strong> ${sale.invoiceNumber}<br>
              <strong>Date:</strong> ${new Date(sale.saleDate).toLocaleString()}<br>
              <strong>Counter:</strong> ${sale.billingCounter}<br>
              <strong>Billed By:</strong> ${sale.createdBy.name}
            </p>
          </div>
        </div>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">

        <div style="display: flex; justify-content: space-between; margin-bottom: 25px; font-size: 13px; line-height: 1.5;">
          <div style="width: 50%;">
            <strong style="color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Billed To:</strong><br>
            <span style="font-size: 15px; font-weight: 700; color: #0f172a; display: block; margin-top: 4px;">${sale.customerName}</span>
            Phone: ${sale.customerPhone || 'N/A'}<br>
            Address: ${sale.customerId.address || 'N/A'}<br>
            City: ${sale.customerId.city || 'N/A'}
          </div>
          <div style="width: 50%; text-align: right;">
            <strong style="color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Payment Details:</strong><br>
            <span style="font-size: 15px; font-weight: 700; color: #0f172a; display: block; margin-top: 4px;">Method: ${sale.paymentMethod}</span>
            Status: <span style="font-weight: 700; color: ${sale.pendingAmount > 0 ? '#b91c1c' : '#15803d'};">${sale.pendingAmount > 0 ? 'PARTIAL/UNPAID' : 'PAID'}</span><br>
            ${sale.dueDate ? `Due Date: ${new Date(sale.dueDate).toLocaleDateString()}` : ''}
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 700;">
              <th style="padding: 10px 5px; text-align: center; width: 5%;">#</th>
              <th style="padding: 10px 5px; text-align: left; width: 30%;">Product / Description</th>
              <th style="padding: 10px 5px; text-align: center; width: 12%;">Batch</th>
              <th style="padding: 10px 5px; text-align: center; width: 12%;">Expiry</th>
              <th style="padding: 10px 5px; text-align: center; width: 8%;">Qty</th>
              <th style="padding: 10px 5px; text-align: right; width: 10%;">Price</th>
              <th style="padding: 10px 5px; text-align: center; width: 8%;">Disc</th>
              <th style="padding: 10px 5px; text-align: center; width: 8%;">GST</th>
              <th style="padding: 10px 5px; text-align: right; width: 12%;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; margin-top: 30px;">
          <div style="width: 50%; font-size: 12px; color: #64748b; line-height: 1.5;">
            <strong>Terms & Conditions:</strong><br>
            1. Goods once sold will only be returned according to our return policy.<br>
            2. Requires valid physician prescription validation for restricted medicines.<br>
            3. Thank you for shopping with us!
          </div>
          <div style="width: 45%; font-size: 14px; line-height: 1.8;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
              <span style="color: #64748b;">Subtotal:</span>
              <strong>₹${sale.subtotal.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding: 4px 0;">
              <span style="color: #64748b;">GST Total:</span>
              <strong>₹${sale.gstAmount.toFixed(2)}</strong>
            </div>
            ${sale.discountAmount > 0 ? `
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding: 4px 0; color: #b91c1c;">
                <span>Discount Applied:</span>
                <strong>-₹${sale.discountAmount.toFixed(2)}</strong>
              </div>
            ` : ''}
            ${sale.loyaltyPointsRedeemed > 0 ? `
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding: 4px 0; color: #15803d;">
                <span>Points Redeemed:</span>
                <strong>-₹${sale.loyaltyPointsRedeemed.toFixed(2)}</strong>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding-top: 6px; font-size: 18px; color: #0f172a;">
              <span>Grand Total:</span>
              <strong style="color: #1d4ed8;">₹${sale.grandTotal.toFixed(2)}</strong>
            </div>
          </div>
        </div>

        <div style="text-align: center; margin-top: 40px; border-top: 1px dashed #e2e8f0; padding-top: 20px;">
          <p style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 10px 0;">${footerText}</p>
          <div style="display: inline-block; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc;">
            <!-- Simple simulated dynamic CSS QR code block -->
            <div style="display: flex; flex-wrap: wrap; width: 60px; height: 60px; margin: auto;">
              <div style="width: 30px; height: 30px; background: #000;"></div>
              <div style="width: 30px; height: 30px; background: #fff; border: 3px solid #000; box-sizing: border-box;"></div>
              <div style="width: 30px; height: 30px; background: #fff; border: 3px solid #000; box-sizing: border-box;"></div>
              <div style="width: 30px; height: 30px; background: #000;"></div>
            </div>
            <span style="font-size: 10px; color: #94a3b8; display: block; margin-top: 4px;">SCAN FOR UPI</span>
          </div>
        </div>
      </div>
    `;

    res.json({ success: true, pdfHtml: html });
  } catch (error) {
    next(error);
  }
};

// @desc    Process Counter Cash Closing record creation
// @route   POST /api/sales/cash-closings
// @access  Private
const createCashClosing = async (req, res, next) => {
  try {
    const { billingCounter, openingCash, actualCashInDrawer, notes = '', branchId = null } = req.body;

    if (!billingCounter || openingCash === undefined || actualCashInDrawer === undefined) {
      return res.status(400).json({ success: false, message: 'Counter name, opening cash balance, and physical drawer cash are required.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Sum up completed cash sales processed on this counter today
    const salesAggregate = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: today },
          billingCounter,
          paymentMethod: 'Cash',
          invoiceStatus: { $in: ['Completed', 'Returned'] },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalCash: { $sum: '$grandTotal' }
        }
      }
    ]);

    // Sum up mixed payments cash amounts
    const mixedAggregate = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: today },
          billingCounter,
          paymentMethod: 'Mixed',
          invoiceStatus: { $in: ['Completed', 'Returned'] },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalCash: { $sum: '$paymentDetails.cashAmount' }
        }
      }
    ]);

    // Sum up cash refunds on returns today (isolated by billingCounter)
    const returnsAggregate = await SalesReturn.aggregate([
      {
        $match: {
          returnDate: { $gte: today },
          paymentMethod: 'Cash',
          isDeleted: false
        }
      },
      {
        $lookup: {
          from: 'sales',
          localField: 'saleId',
          foreignField: '_id',
          as: 'saleInfo'
        }
      },
      {
        $unwind: '$saleInfo'
      },
      {
        $match: {
          'saleInfo.billingCounter': billingCounter
        }
      },
      {
        $group: {
          _id: null,
          totalRefunds: { $sum: '$refundAmount' }
        }
      }
    ]);

    // Sum up UPI sales processed on this counter today
    const upiSalesAggregate = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: today },
          billingCounter,
          paymentMethod: 'UPI',
          invoiceStatus: { $in: ['Completed', 'Returned'] },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalUPI: { $sum: '$grandTotal' }
        }
      }
    ]);

    // Sum up mixed payments UPI amounts
    const mixedUpiAggregate = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: today },
          billingCounter,
          paymentMethod: 'Mixed',
          invoiceStatus: { $in: ['Completed', 'Returned'] },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalUPI: { $sum: '$paymentDetails.upiAmount' }
        }
      }
    ]);

    // Sum up Credit sales processed on this counter today
    const creditSalesAggregate = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: today },
          billingCounter,
          paymentMethod: 'Credit',
          invoiceStatus: { $in: ['Completed', 'Returned'] },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalCredit: { $sum: '$grandTotal' }
        }
      }
    ]);

    // Sum up mixed payments Credit amounts
    const mixedCreditAggregate = await Sale.aggregate([
      {
        $match: {
          saleDate: { $gte: today },
          billingCounter,
          paymentMethod: 'Mixed',
          invoiceStatus: { $in: ['Completed', 'Returned'] },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalCredit: { $sum: '$paymentDetails.creditAmount' }
        }
      }
    ]);

    // Sum up UPI/Credit returns today (isolated by billingCounter)
    const upiReturnsAggregate = await SalesReturn.aggregate([
      {
        $match: {
          returnDate: { $gte: today },
          paymentMethod: 'UPI',
          isDeleted: false
        }
      },
      {
        $lookup: {
          from: 'sales',
          localField: 'saleId',
          foreignField: '_id',
          as: 'saleInfo'
        }
      },
      {
        $unwind: '$saleInfo'
      },
      {
        $match: {
          'saleInfo.billingCounter': billingCounter
        }
      },
      {
        $group: {
          _id: null,
          totalRefunds: { $sum: '$refundAmount' }
        }
      }
    ]);

    const creditReturnsAggregate = await SalesReturn.aggregate([
      {
        $match: {
          returnDate: { $gte: today },
          paymentMethod: 'Credit Adjustment',
          isDeleted: false
        }
      },
      {
        $lookup: {
          from: 'sales',
          localField: 'saleId',
          foreignField: '_id',
          as: 'saleInfo'
        }
      },
      {
        $unwind: '$saleInfo'
      },
      {
        $match: {
          'saleInfo.billingCounter': billingCounter
        }
      },
      {
        $group: {
          _id: null,
          totalRefunds: { $sum: '$refundAmount' }
        }
      }
    ]);

    const cashSales = (salesAggregate[0] ? salesAggregate[0].totalCash : 0) + (mixedAggregate[0] ? mixedAggregate[0].totalCash : 0);
    const refunds = returnsAggregate[0] ? returnsAggregate[0].totalRefunds : 0;
    const upiSales = (upiSalesAggregate[0] ? upiSalesAggregate[0].totalUPI : 0) + (mixedUpiAggregate[0] ? mixedUpiAggregate[0].totalUPI : 0);
    const creditSales = (creditSalesAggregate[0] ? creditSalesAggregate[0].totalCredit : 0) + (mixedCreditAggregate[0] ? mixedCreditAggregate[0].totalCredit : 0);
    const upiRefunds = upiReturnsAggregate[0] ? upiReturnsAggregate[0].totalRefunds : 0;
    const creditRefunds = creditReturnsAggregate[0] ? creditReturnsAggregate[0].totalRefunds : 0;

    const calculatedClosing = openingCash + cashSales - refunds;
    const variance = actualCashInDrawer - calculatedClosing;

    const closing = await CashClosing.create({
      billingCounter,
      openingCash,
      cashSales,
      expenses: 0,
      refunds,
      closingCash: calculatedClosing,
      actualCashInDrawer,
      difference: variance,
      status: 'Closed',
      notes,
      performedBy: req.user.id,
      branchId
    });

    await logAudit(
      req.user.id,
      'Counter Cash Closing Saved',
      'CashClosing',
      closing._id,
      null,
      { 
        billingCounter, 
        difference: variance,
        cashSales,
        upiSales,
        creditSales,
        refunds,
        upiRefunds,
        creditRefunds
      },
      req.ip
    );

    res.status(201).json({
      success: true,
      closing,
      details: {
        cashSales,
        upiSales,
        creditSales,
        refunds,
        upiRefunds,
        creditRefunds,
        openingCash,
        calculatedClosing,
        actualCashInDrawer,
        difference: variance
      },
      message: `Cash closing logged. Drawer discrepancy variance: ₹${variance >= 0 ? '+' : ''}${variance}`
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get Counter Cash Closings
// @route   GET /api/sales/cash-closings
// @access  Private
const getCashClosings = async (req, res, next) => {
  try {
    const closings = await CashClosing.find()
      .sort({ createdAt: -1 })
      .populate('performedBy', 'name')
      .lean();

    res.json({ success: true, closings });
  } catch (error) {
    next(error);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find({ isArchived: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('user', 'name')
      .lean();
    res.json({ success: true, logs });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSale,
  getSales,
  getSaleById,
  cancelSale,
  createSalesReturn,
  getSalesReturns,
  getSubstituteMedicines,
  getSalesDashboard,
  getSalesActivity,
  getSalesReport,
  getSystemHealth,
  createMedicineRecall,
  getMedicineRecalls,
  getRecentNotifications,
  markNotificationRead,
  getInvoicePDF,
  createCashClosing,
  getCashClosings,
  getAuditLogs
};
