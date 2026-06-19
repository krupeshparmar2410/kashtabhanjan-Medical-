const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');
const LoyaltyLedger = require('../models/LoyaltyLedger');
const CustomerActivity = require('../models/CustomerActivity');
const CustomerPayment = require('../models/CustomerPayment');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const AuditLog = require('../models/AuditLog');
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

// @desc    Create new customer
// @route   POST /api/customers
// @access  Private
const createCustomer = async (req, res, next) => {
  try {
    const { name, phone, email = '', address = '', city = '', state = '', pincode = '', creditLimit, creditDays } = req.body;

    const defaultLimit = getSetting('CREDIT_LIMIT_DEFAULT', 5000);

    // Check if phone already exists for active registered customer
    if (phone && phone !== '0000000000') {
      const exists = await Customer.findOne({ phone, customerType: 'Registered', isDeleted: false });
      if (exists) {
        return res.status(400).json({ success: false, message: 'Customer with this phone number already exists' });
      }
    }

    const customer = await Customer.create({
      customerType: 'Registered',
      name,
      phone,
      email,
      address,
      city,
      state,
      pincode,
      creditLimit: creditLimit !== undefined ? creditLimit : defaultLimit,
      creditDays: creditDays !== undefined ? creditDays : 30,
      createdBy: req.user.id
    });

    await logAudit(req.user.id, 'Customer Created', 'Customer', customer._id, null, customer, req.ip);

    await CustomerActivity.create({
      customerId: customer._id,
      action: 'Profile Created',
      description: `Customer account registered for ${name}`,
      performedBy: req.user.id
    });

    res.status(201).json({ success: true, customer, message: 'Customer registered successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all customers (search, page, list deleted filter)
// @route   GET /api/customers
// @access  Private
const getCustomers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = '', isDeleted = 'false' } = req.query;

    const query = {
      isDeleted: isDeleted === 'true',
      customerType: 'Registered' // skip default Walk-In
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const customers = await Customer.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Customer.countDocuments(query);

    res.json({
      success: true,
      customers,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      total
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get walk-in customer + registered customer search autocomplete lists
// @route   GET /api/customers/search
// @access  Private
const searchCustomers = async (req, res, next) => {
  try {
    const { query = '' } = req.query;

    // Load walkin and matching registered customers
    const walkin = await Customer.findOne({ customerType: 'Walk-In' }).lean();
    
    let list = [];
    if (walkin) {
      list.push(walkin);
    }

    const filter = { isDeleted: false, customerType: 'Registered' };
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } }
      ];
    }

    const registered = await Customer.find(filter).limit(10).lean();
    list = list.concat(registered);

    res.json({ success: true, customers: list });
  } catch (error) {
    next(error);
  }
};

// @desc    Get customer details by ID
// @route   GET /api/customers/:id
// @access  Private
const getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer profile not found' });
    }

    // Load activities
    const activities = await CustomerActivity.find({ customerId: customer._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('performedBy', 'name');

    // Load recent sales
    const sales = await Sale.find({ customerId: customer._id, isDeleted: false, isArchived: { $ne: true } })
      .sort({ saleDate: -1 })
      .limit(10)
      .populate('createdBy', 'name');

    res.json({ success: true, customer, activities, sales });
  } catch (error) {
    next(error);
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private
const updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const beforeValues = customer.toObject();

    const fields = ['name', 'phone', 'email', 'address', 'city', 'state', 'pincode', 'creditLimit', 'creditDays'];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        customer[f] = req.body[f];
      }
    });

    customer.updatedBy = req.user.id;
    await customer.save();

    const afterValues = customer.toObject();

    await logAudit(req.user.id, 'Customer Updated', 'Customer', customer._id, beforeValues, afterValues, req.ip);

    await CustomerActivity.create({
      customerId: customer._id,
      action: 'Profile Updated',
      description: 'Customer contact details modified',
      beforeValues,
      afterValues,
      performedBy: req.user.id
    });

    res.json({ success: true, customer, message: 'Customer details updated successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Soft delete customer
// @route   DELETE /api/customers/:id
// @access  Private
const deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (customer.outstandingBalance > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete customer with active outstanding credit balance' });
    }

    customer.isDeleted = true;
    customer.updatedBy = req.user.id;
    await customer.save();

    await logAudit(req.user.id, 'Customer Soft Deleted', 'Customer', customer._id, null, { isDeleted: true }, req.ip);

    await CustomerActivity.create({
      customerId: customer._id,
      action: 'Profile Deleted',
      description: 'Customer marked as deleted in directory',
      performedBy: req.user.id
    });

    res.json({ success: true, message: 'Customer profile deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Restore soft deleted customer
// @route   POST /api/customers/:id/restore
// @access  Private
const restoreCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    customer.isDeleted = false;
    customer.updatedBy = req.user.id;
    await customer.save();

    await logAudit(req.user.id, 'Customer Restored', 'Customer', customer._id, null, { isDeleted: false }, req.ip);

    await CustomerActivity.create({
      customerId: customer._id,
      action: 'Profile Restored',
      description: 'Soft-deleted customer restored back to active directory',
      performedBy: req.user.id
    });

    res.json({ success: true, customer, message: 'Customer profile restored successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get customer credit ledger
// @route   GET /api/customers/:id/ledger
// @access  Private
const getCustomerLedger = async (req, res, next) => {
  try {
    const ledger = await CustomerLedger.find({ customerId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, ledger });
  } catch (error) {
    next(error);
  }
};

// @desc    Get customer loyalty points ledger
// @route   GET /api/customers/:id/loyalty
// @access  Private
const getCustomerLoyaltyLedger = async (req, res, next) => {
  try {
    const ledger = await LoyaltyLedger.find({ customerId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, ledger });
  } catch (error) {
    next(error);
  }
};

// @desc    Pay outstanding credit balance (FIFO allocation across overdue sales)
// @route   POST /api/customers/:id/payments
// @access  Private
const createCustomerPayment = async (req, res, next) => {
  try {
    const { amountPaid, paymentMethod = 'Cash', referenceNumber = '', remarks = '' } = req.body;

    if (!amountPaid || Number(amountPaid) <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid payment amount' });
    }

    const customer = await Customer.findOne({ _id: req.params.id, isDeleted: false });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found or has been deleted' });
    }

    const prefix = getSetting('PAYMENT_PREFIX', 'CPM');
    const paymentNumber = await getNextSequence('customerPaymentNumber', prefix);

    const result = await runInTransaction(async (session) => {
      // Create payment document
      const payment = new CustomerPayment({
        paymentNumber,
        customerId: customer._id,
        amountPaid,
        paymentMethod,
        referenceNumber,
        remarks,
        createdBy: req.user.id
      });
      await payment.save({ session });

      // Deduct outstanding
      const oldOutstanding = customer.outstandingBalance;
      customer.outstandingBalance = Math.round((customer.outstandingBalance - amountPaid) * 100) / 100;
      await customer.save({ session });

      // Post Customer Ledger
      const ledger = new CustomerLedger({
        customerId: customer._id,
        transactionType: 'Payment',
        referenceId: payment._id,
        referenceNumber: paymentNumber,
        debit: 0,
        credit: amountPaid,
        runningBalance: customer.outstandingBalance,
        remarks: remarks || `Outstanding credit payment of ₹${amountPaid}`
      });
      await ledger.save({ session });

      // Distribute payment to outstanding credit sales FIFO
      let remaining = amountPaid;
      const sales = await Sale.find({
        customerId: customer._id,
        invoiceStatus: 'Completed',
        paymentMethod: 'Credit',
        pendingAmount: { $gt: 0 },
        isDeleted: false,
        isArchived: { $ne: true }
      }).sort({ saleDate: 1 }).session(session);

      for (const sale of sales) {
        if (remaining <= 0) break;
        const deduct = Math.min(sale.pendingAmount, remaining);
        sale.pendingAmount = Math.round((sale.pendingAmount - deduct) * 100) / 100;
        sale.paidAmount = Math.round((sale.paidAmount + deduct) * 100) / 100;
        await sale.save({ session });
        remaining = Math.round((remaining - deduct) * 100) / 100;
      }

      // Record Activity & Audits
      await CustomerActivity.create([{
        customerId: customer._id,
        action: 'Credit Payment',
        description: `Paid ₹${amountPaid} to outstanding balance (Invoice references updated)`,
        performedBy: req.user.id
      }], { session });

      await logAudit(
        req.user.id,
        'Customer Credit Payment Received',
        'CustomerPayment',
        payment._id,
        { outstandingBalance: oldOutstanding },
        { outstandingBalance: customer.outstandingBalance, paymentNumber },
        req.ip,
        session
      );

      return payment;
    });

    res.status(201).json({
      success: true,
      payment: result,
      message: `Successfully processed outstanding payment of ₹${amountPaid}`
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get customer payments history
// @route   GET /api/customers/:id/payments
// @access  Private
const getCustomerPayments = async (req, res, next) => {
  try {
    const payments = await CustomerPayment.find({ customerId: req.params.id, isDeleted: false, isArchived: { $ne: true } })
      .sort({ paymentDate: -1 })
      .lean();

    res.json({ success: true, payments });
  } catch (error) {
    next(error);
  }
};

// @desc    Get customer purchase analytics
// @route   GET /api/customers/:id/analytics
// @access  Private
const getCustomerAnalytics = async (req, res, next) => {
  try {
    const customerId = new mongoose.Types.ObjectId(req.params.id);

    // Calculate dynamic stats
    const stats = await Sale.aggregate([
      { $match: { customerId, isDeleted: false, invoiceStatus: 'Completed' } },
      {
        $group: {
          _id: null,
          totalPurchases: { $sum: '$grandTotal' },
          purchaseCount: { $sum: 1 },
          averageBillValue: { $avg: '$grandTotal' },
          lastPurchaseDate: { $max: '$saleDate' }
        }
      }
    ]);

    const statsObj = stats[0] || {
      totalPurchases: 0,
      purchaseCount: 0,
      averageBillValue: 0,
      lastPurchaseDate: null
    };

    // Aggregate top purchased medicines
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
      { $match: { 'sale.customerId': customerId, 'sale.isDeleted': false, 'sale.invoiceStatus': 'Completed' } },
      {
        $group: {
          _id: '$medicineId',
          medicineName: { $first: '$medicineName' },
          medicineCode: { $first: '$medicineCode' },
          totalQuantity: { $sum: '$quantity' },
          totalAmount: { $sum: '$lineTotal' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 }
    ]);

    // Update customer analytics profiles
    const customer = await Customer.findById(customerId);
    if (customer) {
      customer.lifetimeValue = Math.round(statsObj.totalPurchases * 100) / 100;
      customer.purchaseFrequency = statsObj.purchaseCount;
      // Repeat purchase rate simple assessment
      customer.repeatPurchaseRate = statsObj.purchaseCount > 1 ? 100 : 0;
      await customer.save();
    }

    res.json({
      success: true,
      analytics: {
        totalPurchases: Math.round(statsObj.totalPurchases * 100) / 100,
        purchaseCount: statsObj.purchaseCount,
        averageBillValue: Math.round(statsObj.averageBillValue * 100) / 100,
        lastPurchaseDate: statsObj.lastPurchaseDate,
        topMedicines
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCustomer,
  getCustomers,
  searchCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  getCustomerLedger,
  getCustomerLoyaltyLedger,
  createCustomerPayment,
  getCustomerPayments,
  getCustomerAnalytics
};
