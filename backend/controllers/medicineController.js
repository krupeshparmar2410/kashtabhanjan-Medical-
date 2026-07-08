const Medicine = require('../models/Medicine');
const MedicineActivity = require('../models/MedicineActivity');
const Agency = require('../models/Agency');

// Helper to log medicine activities
const logActivity = async (medicineId, action, description, userId) => {
  try {
    await MedicineActivity.create({
      medicineId,
      action,
      description,
      performedBy: userId
    });
  } catch (error) {
    console.error(`Error logging medicine activity: ${error.message}`);
  }
};

// Helper to generate the next unique medicine code
const generateNextMedicineCode = async () => {
  try {
    // Retrieve all medicine codes (including soft-deleted ones)
    const medicines = await Medicine.find({}, 'medicineCode');
    
    let maxNumber = 0;
    medicines.forEach(med => {
      const code = med.medicineCode;
      if (code && code.startsWith('MED')) {
        const numPart = parseInt(code.replace('MED', ''), 10);
        if (!isNaN(numPart) && numPart > maxNumber) {
          maxNumber = numPart;
        }
      }
    });

    const nextNumber = maxNumber + 1;
    // Format: MED0001, MED0002, etc.
    const nextCode = `MED${String(nextNumber).padStart(4, '0')}`;
    return nextCode;
  } catch (error) {
    console.error(`Error generating medicine code: ${error.message}`);
    throw new Error('Could not generate unique medicine code');
  }
};

// @desc    Get medicine statistics
// @route   GET /api/medicines/stats
// @access  Private
const getMedicineStats = async (req, res) => {
  try {
    const stats = await Medicine.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalMedicines: { $sum: 1 },
          activeMedicines: {
            $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
          },
          inactiveMedicines: {
            $sum: { $cond: [{ $eq: ['$status', 'Inactive'] }, 1, 0] }
          },
          prescriptionMedicines: {
            $sum: { $cond: [{ $eq: ['$prescriptionRequired', true] }, 1, 0] }
          },
          nonPrescriptionMedicines: {
            $sum: { $cond: [{ $eq: ['$prescriptionRequired', false] }, 1, 0] }
          },
          blockedMedicines: {
            $sum: { $cond: [{ $eq: ['$isBlocked', true] }, 1, 0] }
          },
          lowStockMedicines: {
            // currentStock <= minimumStockLevel
            $sum: {
              $cond: [
                { $lte: ['$currentStock', '$minimumStockLevel'] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalMedicines: 0,
      activeMedicines: 0,
      inactiveMedicines: 0,
      prescriptionMedicines: 0,
      nonPrescriptionMedicines: 0,
      blockedMedicines: 0,
      lowStockMedicines: 0
    };

    res.json({
      success: true,
      stats: {
        totalMedicines: result.totalMedicines,
        activeMedicines: result.activeMedicines,
        inactiveMedicines: result.inactiveMedicines,
        prescriptionMedicines: result.prescriptionMedicines,
        nonPrescriptionMedicines: result.nonPrescriptionMedicines,
        blockedMedicines: result.blockedMedicines,
        lowStockMedicines: result.lowStockMedicines
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error retrieving statistics' });
  }
};

// @desc    Get all medicines with filters, search, pagination, and sorting
// @route   GET /api/medicines
// @access  Private
const getMedicines = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      category,
      prescriptionRequired,
      blocked,
      agencyId,
      lowStock, // 'true' or 'false'
      sort = 'latest'
    } = req.query;

    const query = { isDeleted: false };

    // Search filter: matches medicineCode, medicineName, genericName, barcode
    if (search) {
      query.$or = [
        { medicineName: { $regex: search, $options: 'i' } },
        { medicineCode: { $regex: search, $options: 'i' } },
        { genericName: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status && ['Active', 'Inactive'].includes(status)) {
      query.status = status;
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Prescription filter
    if (prescriptionRequired) {
      query.prescriptionRequired = (prescriptionRequired === 'Yes' || prescriptionRequired === 'true');
    }

    // Blocked filter
    if (blocked === 'true') {
      query.isBlocked = true;
    } else if (blocked === 'false') {
      query.isBlocked = false;
    }

    // Agency filter
    if (agencyId) {
      query.agencyId = agencyId;
    }

    // Low stock filter (currentStock <= minimumStockLevel)
    if (lowStock === 'true') {
      query.$expr = { $lte: ['$currentStock', '$minimumStockLevel'] };
    }

    // Pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    let sortQuery = { createdAt: -1 };
    if (sort === 'oldest') {
      sortQuery = { createdAt: 1 };
    } else if (sort === 'name_asc') {
      sortQuery = { medicineName: 1 };
    } else if (sort === 'name_desc') {
      sortQuery = { medicineName: -1 };
    } else if (sort === 'stock_asc') {
      sortQuery = { currentStock: 1 };
    } else if (sort === 'stock_desc') {
      sortQuery = { currentStock: -1 };
    }

    const medicines = await Medicine.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limitNum)
      .populate('agencyId', 'agencyName agencyCode')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    const total = await Medicine.countDocuments(query);

    res.json({
      success: true,
      medicines,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      total
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error retrieving medicines' });
  }
};

// @desc    Get single medicine by ID
// @route   GET /api/medicines/:id
// @access  Private
const getMedicineById = async (req, res) => {
  try {
    const medicine = await Medicine.findOne({ _id: req.params.id, isDeleted: false })
      .populate('agencyId', 'agencyName agencyCode contactPerson phone')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');

    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    res.json({ success: true, medicine });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error retrieving medicine details' });
  }
};

// @desc    Create new medicine
// @route   POST /api/medicines
// @access  Private
const createMedicine = async (req, res) => {
  try {
    const {
      medicineName,
      purchasePrice,
      sellingPrice,
      mrp,
      barcode,
      agencyId
    } = req.body;

    // Check if supplier agency exists and is active
    const agency = await Agency.findOne({ _id: agencyId, isDeleted: false });
    if (!agency) {
      return res.status(404).json({ success: false, message: 'Supplier agency not found or has been deleted' });
    }

    // Custom pricing validation
    if (Number(sellingPrice) > Number(mrp)) {
      return res.status(400).json({ success: false, message: 'Selling price cannot exceed Maximum Retail Price (MRP)' });
    }

    // Clean barcode
    const cleanBarcode = barcode && barcode.trim() !== '' ? barcode.trim() : null;

    // Check barcode unique if provided
    if (cleanBarcode) {
      const barcodeExists = await Medicine.findOne({ barcode: cleanBarcode, isDeleted: false });
      if (barcodeExists) {
        return res.status(400).json({ success: false, message: `Barcode "${cleanBarcode}" is already assigned to ${barcodeExists.medicineName}` });
      }
    }

    // Generate unique code
    const medicineCode = await generateNextMedicineCode();

    const medicineData = {
      ...req.body,
      barcode: cleanBarcode,
      medicineCode,
      createdBy: req.user.id
    };

    const medicine = await Medicine.create(medicineData);

    // Log creation
    await logActivity(
      medicine._id,
      'Medicine Created',
      `Medicine registered with code ${medicine.medicineCode} by ${req.user.name}`,
      req.user.id
    );

    res.status(201).json({ success: true, medicine });
  } catch (error) {
    console.error(error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error creating medicine' });
  }
};

// @desc    Update medicine
// @route   PUT /api/medicines/:id
// @access  Private
const updateMedicine = async (req, res) => {
  try {
    let medicine = await Medicine.findOne({ _id: req.params.id, isDeleted: false });

    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    const {
      purchasePrice,
      sellingPrice,
      mrp,
      barcode,
      agencyId,
      status,
      isBlocked
    } = req.body;

    // Check if supplier agency exists if changing
    if (agencyId && agencyId !== medicine.agencyId.toString()) {
      const agency = await Agency.findOne({ _id: agencyId, isDeleted: false });
      if (!agency) {
        return res.status(404).json({ success: false, message: 'Supplier agency not found or has been deleted' });
      }
    }

    // Custom pricing validation
    const checkMrp = mrp !== undefined ? Number(mrp) : medicine.mrp;
    const checkSellingPrice = sellingPrice !== undefined ? Number(sellingPrice) : medicine.sellingPrice;
    if (checkSellingPrice > checkMrp) {
      return res.status(400).json({ success: false, message: 'Selling price cannot exceed Maximum Retail Price (MRP)' });
    }

    // Clean barcode
    const cleanBarcode = barcode && barcode.trim() !== '' ? barcode.trim() : null;

    // Check unique barcode if changing
    if (cleanBarcode && cleanBarcode !== medicine.barcode) {
      const barcodeExists = await Medicine.findOne({ barcode: cleanBarcode, isDeleted: false });
      if (barcodeExists) {
        return res.status(400).json({ success: false, message: `Barcode "${cleanBarcode}" is already assigned to ${barcodeExists.medicineName}` });
      }
    }

    // Detect audit flags
    const priceChanged = (purchasePrice !== undefined && Number(purchasePrice) !== medicine.purchasePrice) ||
                         (sellingPrice !== undefined && Number(sellingPrice) !== medicine.sellingPrice) ||
                         (mrp !== undefined && Number(mrp) !== medicine.mrp);
    const statusChanged = status !== undefined && status !== medicine.status;
    const blockStateChanged = isBlocked !== undefined && isBlocked !== medicine.isBlocked;

    const updatedData = {
      ...req.body,
      barcode: cleanBarcode,
      updatedBy: req.user.id
    };

    // Prevent direct code change
    delete updatedData.medicineCode;

    medicine = await Medicine.findByIdAndUpdate(req.params.id, updatedData, {
      new: true,
      runValidators: true
    });

    // Activities Log details
    if (priceChanged) {
      await logActivity(
        medicine._id,
        'Price Updated',
        `Pricing details modified (PP: ₹${medicine.purchasePrice}, SP: ₹${medicine.sellingPrice}, MRP: ₹${medicine.mrp}) by ${req.user.name}`,
        req.user.id
      );
    }

    if (statusChanged) {
      const activityAction = medicine.status === 'Active' ? 'Medicine Activated' : 'Medicine Marked Inactive';
      await logActivity(
        medicine._id,
        activityAction,
        `Status set to ${medicine.status} by ${req.user.name}`,
        req.user.id
      );
    }

    if (blockStateChanged) {
      const activityAction = medicine.isBlocked ? 'Medicine Blocked' : 'Medicine Unblocked';
      const desc = medicine.isBlocked 
        ? `Medicine blocked from transaction system by ${req.user.name}`
        : `Medicine unblocked and restored by ${req.user.name}`;
      await logActivity(medicine._id, activityAction, desc, req.user.id);
    }

    // If generic updates only
    if (!priceChanged && !statusChanged && !blockStateChanged) {
      await logActivity(
        medicine._id,
        'Medicine Updated',
        `Medicine specifications updated by ${req.user.name}`,
        req.user.id
      );
    }

    res.json({ success: true, medicine });
  } catch (error) {
    console.error(error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error updating medicine' });
  }
};

// @desc    Soft delete medicine
// @route   DELETE /api/medicines/:id
// @access  Private
const deleteMedicine = async (req, res) => {
  try {
    const medicine = await Medicine.findOne({ _id: req.params.id, isDeleted: false });

    if (!medicine) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    // Set soft-delete flags. Clear barcode to free up sparse unique index
    const updateQuery = {
      $set: {
        isDeleted: true,
        status: 'Inactive',
        updatedBy: req.user.id
      }
    };

    if (medicine.barcode != null) {
      updateQuery.$unset = { barcode: 1 };
    }

    await Medicine.updateOne({ _id: medicine._id }, updateQuery);
    
    // Update local object for activity logging context
    medicine.isDeleted = true;
    medicine.status = 'Inactive';
    medicine.updatedBy = req.user.id;
    await logActivity(
      medicine._id,
      'Medicine Deleted',
      `Medicine soft-deleted by ${req.user.name}. References retained for archive logs.`,
      req.user.id
    );

    res.json({ success: true, message: 'Medicine soft deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error deleting medicine' });
  }
};

// @desc    Get activity logs of a medicine
// @route   GET /api/medicines/:id/activities
// @access  Private
const getMedicineActivities = async (req, res) => {
  try {
    const activities = await MedicineActivity.find({ medicineId: req.params.id })
      .sort({ createdAt: -1 })
      .populate('performedBy', 'name');

    res.json({ success: true, activities });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error retrieving logs' });
  }
};

module.exports = {
  getMedicineStats,
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getMedicineActivities
};
