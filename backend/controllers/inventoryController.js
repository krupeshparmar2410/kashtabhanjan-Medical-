const mongoose = require('mongoose');
const InventoryBatch = require('../models/InventoryBatch');
const InventoryActivity = require('../models/InventoryActivity');
const InventoryDisposal = require('../models/InventoryDisposal');
const InventorySnapshot = require('../models/InventorySnapshot');
const Medicine = require('../models/Medicine');

// Helper to check and auto-update batch status based on expiry and stock levels
const updateBatchStatuses = async () => {
  const today = new Date();
  const batches = await InventoryBatch.find({ isDeleted: false, status: { $ne: 'Sold Out' } });
  
  for (const batch of batches) {
    let statusChanged = false;
    let newStatus = batch.status;
    let isSaleBlocked = batch.isSaleBlocked;

    if (batch.availableQuantity <= 0) {
      newStatus = 'Sold Out';
      isSaleBlocked = true;
      statusChanged = true;
    } else {
      const expiryDate = new Date(batch.expiryDate);
      if (expiryDate <= today) {
        newStatus = 'Expired';
        isSaleBlocked = true;
        statusChanged = true;
      } else {
        const daysToExpiry = (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
        const medicine = await Medicine.findById(batch.medicineId);
        const limitDays = medicine ? (medicine.expiryAlertDays || 90) : 90;
        
        if (daysToExpiry <= limitDays && batch.status !== 'Near Expiry') {
          newStatus = 'Near Expiry';
          statusChanged = true;
        } else if (daysToExpiry > limitDays && batch.status === 'Near Expiry') {
          newStatus = 'Active';
          statusChanged = true;
        }
      }
    }

    if (statusChanged) {
      batch.status = newStatus;
      batch.isSaleBlocked = isSaleBlocked;
      await batch.save();
    }
  }
};

const { execute: runInTransaction } = require('../config/TransactionManager');

// @desc    Get inventory batches list (with pagination, filters, status updates)
// @route   GET /api/inventory/batches
// @access  Private
const getInventoryBatches = async (req, res) => {
  try {
    await updateBatchStatuses(); // keep data synchronized

    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      medicineId,
      isLocked,
      isSaleBlocked
    } = req.query;

    const query = { isDeleted: false };

    if (medicineId) {
      query.medicineId = medicineId;
    }

    if (status) {
      query.status = status;
    }

    if (isLocked !== undefined) {
      query.isLocked = isLocked === 'true';
    }

    if (isSaleBlocked !== undefined) {
      query.isSaleBlocked = isSaleBlocked === 'true';
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Search query matches batch number or medicine name via join
    let batches = [];
    let total = 0;

    if (search) {
      // Find matching medicines first
      const medicines = await Medicine.find({
        medicineName: { $regex: search, $options: 'i' },
        isDeleted: false
      });
      const medIds = medicines.map(m => m._id);

      query.$or = [
        { batchNumber: { $regex: search, $options: 'i' } },
        { batchCode: { $regex: search, $options: 'i' } },
        { medicineId: { $in: medIds } }
      ];
    }

    batches = await InventoryBatch.find(query)
      .sort({ expiryDate: 1 })
      .skip(skip)
      .limit(limitNum)
      .populate('medicineId')
      .populate('createdBy', 'name');

    total = await InventoryBatch.countDocuments(query);

    res.json({
      success: true,
      batches,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      total
    });
  } catch (error) {
    console.error('Error fetching inventory batches:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving batch inventory' });
  }
};

// @desc    Get FEFO stock allocation list for selling consumption
// @route   GET /api/inventory/fefo/:medicineId
// @access  Private
const getFEFOStock = async (req, res) => {
  try {
    await updateBatchStatuses();

    const today = new Date();
    // Exclude locked, sale blocked, expired, or sold out batches
    const batches = await InventoryBatch.find({
      medicineId: req.params.medicineId,
      isDeleted: false,
      isLocked: false,
      isSaleBlocked: false,
      status: { $nin: ['Expired', 'Sold Out'] },
      expiryDate: { $gt: today },
      $expr: { $gt: ['$availableQuantity', '$reservedQuantity'] }
    })
      .sort({ expiryDate: 1 })
      .populate('medicineId');

    const formatted = batches.map(b => {
      const sellable = b.availableQuantity - b.reservedQuantity;
      return {
        _id: b._id,
        batchNumber: b.batchNumber,
        batchCode: b.batchCode,
        expiryDate: b.expiryDate,
        manufacturingDate: b.manufacturingDate,
        availableQuantity: b.availableQuantity,
        reservedQuantity: b.reservedQuantity,
        sellableQuantity: sellable,
        purchasePrice: b.purchasePrice,
        sellingPrice: b.sellingPrice,
        mrp: b.mrp,
        medicine: b.medicineId
      };
    });

    res.json({ success: true, batches: formatted });
  } catch (error) {
    console.error('Error calculating FEFO stock:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving FEFO allocation details' });
  }
};

// @desc    Get current inventory valuation details (Weighted average)
// @route   GET /api/inventory/valuation
// @access  Private
const getInventoryValuation = async (req, res) => {
  try {
    await updateBatchStatuses();

    const valuation = await InventoryBatch.aggregate([
      { $match: { isDeleted: false, availableQuantity: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          totalItems: { $sum: 1 },
          totalPhysicalStock: { $sum: '$availableQuantity' },
          totalPurchaseValue: { $sum: { $multiply: ['$availableQuantity', '$purchasePrice'] } },
          totalSellingValue: { $sum: { $multiply: ['$availableQuantity', '$sellingPrice'] } },
          totalMrpValue: { $sum: { $multiply: ['$availableQuantity', '$mrp'] } }
        }
      }
    ]);

    const result = valuation[0] || {
      totalItems: 0,
      totalPhysicalStock: 0,
      totalPurchaseValue: 0,
      totalSellingValue: 0,
      totalMrpValue: 0
    };

    // Group valuation by medicine
    const medicineValuation = await InventoryBatch.aggregate([
      { $match: { isDeleted: false, availableQuantity: { $gt: 0 } } },
      {
        $group: {
          _id: '$medicineId',
          totalStock: { $sum: '$availableQuantity' },
          purchaseVal: { $sum: { $multiply: ['$availableQuantity', '$purchasePrice'] } },
          mrpVal: { $sum: { $multiply: ['$availableQuantity', '$mrp'] } }
        }
      },
      {
        $lookup: {
          from: 'medicines',
          localField: '_id',
          foreignField: '_id',
          as: 'medicine'
        }
      },
      { $unwind: '$medicine' },
      {
        $project: {
          _id: 1,
          medicineName: '$medicine.medicineName',
          medicineCode: '$medicine.medicineCode',
          totalStock: 1,
          purchaseVal: 1,
          mrpVal: 1
        }
      },
      { $sort: { purchaseVal: -1 } }
    ]);

    res.json({
      success: true,
      summary: result,
      details: medicineValuation
    });
  } catch (error) {
    console.error('Error fetching valuation details:', error);
    res.status(500).json({ success: false, message: 'Server error calculating valuations' });
  }
};

// @desc    Take a manual daily stock snapshot
// @route   POST /api/inventory/snapshots
// @access  Private
const takeDailySnapshot = async (req, res) => {
  try {
    await updateBatchStatuses();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Check if snapshot exists for today
    const existing = await InventorySnapshot.findOne({ snapshotDate: startOfDay });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Daily snapshot has already been taken for today.' });
    }

    const valuation = await InventoryBatch.aggregate([
      { $match: { isDeleted: false, availableQuantity: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          totalItems: { $sum: 1 },
          totalPurchaseValue: { $sum: { $multiply: ['$availableQuantity', '$purchasePrice'] } },
          totalSellingValue: { $sum: { $multiply: ['$availableQuantity', '$sellingPrice'] } },
          totalMrpValue: { $sum: { $multiply: ['$availableQuantity', '$mrp'] } }
        }
      }
    ]);

    const result = valuation[0] || {
      totalItems: 0,
      totalPurchaseValue: 0,
      totalSellingValue: 0,
      totalMrpValue: 0
    };

    const snapshot = await InventorySnapshot.create({
      snapshotDate: startOfDay,
      totalItems: result.totalItems,
      totalPurchaseValue: Math.round(result.totalPurchaseValue * 100) / 100,
      totalSellingValue: Math.round(result.totalSellingValue * 100) / 100,
      totalMrpValue: Math.round(result.totalMrpValue * 100) / 100,
      createdBy: req.user.id
    });

    res.status(201).json({ success: true, snapshot, message: 'Daily valuation snapshot logged.' });
  } catch (error) {
    console.error('Error taking snapshot:', error);
    res.status(500).json({ success: false, message: 'Server error logging snapshot' });
  }
};

// @desc    Get historical snapshot trends
// @route   GET /api/inventory/snapshots
// @access  Private
const getInventoryTrends = async (req, res) => {
  try {
    const snapshots = await InventorySnapshot.find().sort({ snapshotDate: 1 }).limit(30);
    res.json({ success: true, snapshots });
  } catch (error) {
    console.error('Error retrieving snapshot trends:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving historical stats' });
  }
};

// @desc    Dispose of stock (damage, theft, lost, expired write-offs)
// @route   POST /api/inventory/dispose
// @access  Private
const disposeStock = async (req, res) => {
  try {
    const { inventoryBatchId, quantity, reason, notes = '' } = req.body;

    if (!inventoryBatchId || !quantity || Number(quantity) <= 0 || !reason) {
      return res.status(400).json({ success: false, message: 'Batch ID, positive quantity, and reason are required' });
    }

    const result = await runInTransaction(async (session) => {
      const batch = await InventoryBatch.findOne({ _id: inventoryBatchId, isDeleted: false }).session(session);
      if (!batch) {
        throw new Error('Inventory batch not found or deleted');
      }

      if (batch.availableQuantity < quantity) {
        throw new Error(`Insufficient batch quantity to dispose (Available: ${batch.availableQuantity}, Request: ${quantity})`);
      }

      const medicine = await Medicine.findOne({ _id: batch.medicineId, isDeleted: false }).session(session);
      if (!medicine) {
        throw new Error('Medicine profile not found or deleted');
      }

      // Generate disposal number
      const latestDisp = await InventoryDisposal.findOne({}, {}, { sort: { createdAt: -1 } });
      let dispNum = 1;
      if (latestDisp && latestDisp.disposalNumber) {
        const match = latestDisp.disposalNumber.match(/\d+/);
        if (match) dispNum = parseInt(match[0], 10) + 1;
      }
      const disposalNumber = `DSP${String(dispNum).padStart(6, '0')}`;

      // Create disposal record
      const disposal = new InventoryDisposal({
        disposalNumber,
        inventoryBatchId,
        medicineId: batch.medicineId,
        quantity,
        reason,
        notes,
        performedBy: req.user.id
      });
      await disposal.save({ session });

      // Deduct stock
      batch.availableQuantity -= quantity;
      if (batch.availableQuantity === 0) {
        batch.status = 'Sold Out';
        batch.isSaleBlocked = true;
      }
      await batch.save({ session });

      medicine.currentStock = Math.max(0, (medicine.currentStock || 0) - quantity);
      await medicine.save({ session });

      // Create activity record
      const activity = new InventoryActivity({
        inventoryBatchId: batch._id,
        action: 'Disposal',
        description: `Disposed of ${quantity} units due to ${reason}. Notes: ${notes}`,
        adjustmentReason: reason === 'Expired' ? 'Expiry' : (reason === 'Theft' ? 'Theft' : 'Damage'),
        performedBy: req.user.id
      });
      await activity.save({ session });

      return disposal;
    });

    res.status(201).json({
      success: true,
      disposal: result,
      message: 'Stock disposal completed successfully.'
    });
  } catch (error) {
    console.error('Error disposing stock:', error);
    res.status(400).json({ success: false, message: error.message || 'Server error processing stock disposal' });
  }
};

// @desc    Adjust stock quantity (Audited, admin approved count adjustment)
// @route   POST /api/inventory/adjust
// @access  Private
const adjustInventory = async (req, res) => {
  try {
    const { inventoryBatchId, newQuantity, reason, notes = '' } = req.body;

    if (!inventoryBatchId || newQuantity === undefined || Number(newQuantity) < 0 || !reason) {
      return res.status(400).json({ success: false, message: 'Batch ID, valid positive new quantity, and adjustment reason are required' });
    }

    const result = await runInTransaction(async (session) => {
      const batch = await InventoryBatch.findOne({ _id: inventoryBatchId, isDeleted: false }).session(session);
      if (!batch) {
        throw new Error('Inventory batch not found or deleted');
      }

      const medicine = await Medicine.findOne({ _id: batch.medicineId, isDeleted: false }).session(session);
      if (!medicine) {
        throw new Error('Medicine profile not found or deleted');
      }

      const oldQuantity = batch.availableQuantity;
      const difference = Number(newQuantity) - oldQuantity;

      // Update quantities
      batch.availableQuantity = Number(newQuantity);
      if (batch.availableQuantity === 0) {
        batch.status = 'Sold Out';
        batch.isSaleBlocked = true;
      } else if (batch.status === 'Sold Out') {
        // Re-calculate if stock restored
        batch.status = 'Active';
        batch.isSaleBlocked = false;
      }
      await batch.save({ session });

      medicine.currentStock = Math.max(0, (medicine.currentStock || 0) + difference);
      await medicine.save({ session });

      // Create activity record (stores audited parameters)
      const activity = new InventoryActivity({
        inventoryBatchId: batch._id,
        action: 'Stock Adjustment',
        description: `Physical count adjustment from ${oldQuantity} to ${newQuantity} (Diff: ${difference > 0 ? '+' : ''}${difference}). Notes: ${notes}`,
        adjustmentReason: reason,
        performedBy: req.user.id
      });
      await activity.save({ session });

      return { batch, difference };
    });

    res.json({
      success: true,
      batch: result.batch,
      message: `Stock adjusted by ${result.difference > 0 ? '+' : ''}${result.difference} units.`
    });
  } catch (error) {
    console.error('Error adjusting inventory:', error);
    res.status(400).json({ success: false, message: error.message || 'Server error processing stock adjustment' });
  }
};

// @desc    Toggle sale lock state of batch
// @route   PUT /api/inventory/batches/:id/lock
// @access  Private
const toggleLock = async (req, res) => {
  try {
    const { isLocked, lockReason = '' } = req.body;
    const batch = await InventoryBatch.findOne({ _id: req.params.id, isDeleted: false });

    if (!batch) {
      return res.status(404).json({ success: false, message: 'Inventory batch not found' });
    }

    batch.isLocked = isLocked === true;
    batch.lockReason = lockReason;
    // Lock also blocks it from active selling
    batch.isSaleBlocked = isLocked === true || batch.status === 'Expired' || batch.status === 'Sold Out';
    await batch.save();

    // Log Activity
    const activity = await InventoryActivity.create({
      inventoryBatchId: batch._id,
      action: batch.isLocked ? 'Batch Locked' : 'Batch Unlocked',
      description: batch.isLocked 
        ? `Batch locked for sales. Reason: ${lockReason}` 
        : `Batch sales lock released.`,
      performedBy: req.user.id
    });

    res.json({
      success: true,
      batch,
      message: batch.isLocked ? 'Inventory batch locked' : 'Inventory batch unlocked successfully'
    });
  } catch (error) {
    console.error('Error locking/unlocking batch:', error);
    res.status(500).json({ success: false, message: 'Server error modifying lock status' });
  }
};

// @desc    Get recent activities timeline
// @route   GET /api/inventory/activities
// @access  Private
const getRecentActivities = async (req, res) => {
  try {
    const { limit = 15 } = req.query;
    const activities = await InventoryActivity.find({ isArchived: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .populate({
        path: 'inventoryBatchId',
        populate: { path: 'medicineId', select: 'medicineName medicineCode' }
      })
      .populate('performedBy', 'name');

    res.json({ success: true, activities });
  } catch (error) {
    console.error('Error listing activities:', error);
    res.status(500).json({ success: false, message: 'Server error loading activities logs' });
  }
};

// @desc    Get dashboard warning alerts statistics (expired, low stock, near expiry)
// @route   GET /api/inventory/reports
// @access  Private
const getReportingData = async (req, res) => {
  try {
    await updateBatchStatuses();

    const today = new Date();
    
    // Low stock count (medicine level currentStock <= minimumStockLevel)
    const lowStockCount = await Medicine.countDocuments({
      isDeleted: false,
      status: 'Active',
      $expr: { $lte: ['$currentStock', '$minimumStockLevel'] }
    });

    // Near expiry batches count
    const nearExpiryCount = await InventoryBatch.countDocuments({
      isDeleted: false,
      status: 'Near Expiry'
    });

    // Expired batches count
    const expiredCount = await InventoryBatch.countDocuments({
      isDeleted: false,
      status: 'Expired'
    });

    // Detailed lists for tab view rendering
    const lowStockList = await Medicine.find({
      isDeleted: false,
      status: 'Active',
      $expr: { $lte: ['$currentStock', '$minimumStockLevel'] }
    }).populate('agencyId', 'agencyName');

    const nearExpiryList = await InventoryBatch.find({
      isDeleted: false,
      status: 'Near Expiry'
    }).populate('medicineId');

    const expiredList = await InventoryBatch.find({
      isDeleted: false,
      status: 'Expired'
    }).populate('medicineId');

    res.json({
      success: true,
      counts: {
        lowStock: lowStockCount,
        nearExpiry: nearExpiryCount,
        expired: expiredCount
      },
      lists: {
        lowStock: lowStockList,
        nearExpiry: nearExpiryList,
        expired: expiredList
      }
    });
  } catch (error) {
    console.error('Error loading reporting stats:', error);
    res.status(500).json({ success: false, message: 'Server error loading alerts data' });
  }
};

module.exports = {
  getInventoryBatches,
  getFEFOStock,
  getInventoryValuation,
  takeDailySnapshot,
  getInventoryTrends,
  disposeStock,
  adjustInventory,
  toggleLock,
  getRecentActivities,
  getReportingData
};
