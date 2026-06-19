const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Prescription = require('../models/Prescription');
const AuditLog = require('../models/AuditLog');
const Medicine = require('../models/Medicine');
const logger = require('../config/logger');

// Helper to log audit actions
const logAudit = async (userId, action, entityId, oldValues = null, newValues = null, ipAddress = '', remarks = '') => {
  const audit = new AuditLog({
    user: userId,
    action,
    entityType: 'Prescription',
    entityId,
    oldValues,
    newValues,
    ipAddress,
    remarks
  });
  await audit.save();
};

// @desc    Upload new prescription & run mock OCR
// @route   POST /api/prescriptions/upload
// @access  Private (Staff, Pharmacist, Admin)
const uploadPrescription = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a prescription image/PDF file.' });
    }

    const {
      customerId,
      doctorName,
      doctorRegistrationNumber,
      patientName,
      prescriptionDate,
      validityDays = 180,
      medicines = '[]',
      branchId = null
    } = req.body;

    if (!customerId || !doctorName || !doctorRegistrationNumber || !patientName || !prescriptionDate) {
      // Clean up uploaded file if validation fails
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, message: 'Missing required prescription details.' });
    }

    const parsedMedicines = typeof medicines === 'string' ? JSON.parse(medicines) : medicines;

    // Check duplicate prescription detection: same customer, doctor, patientName, prescriptionDate
    const duplicate = await Prescription.findOne({
      customerId,
      doctorRegistrationNumber,
      patientName,
      prescriptionDate: new Date(prescriptionDate),
      isArchived: false
    });

    if (duplicate) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, message: 'Duplicate prescription detected: A prescription for this patient and doctor on this date already exists.' });
    }

    // Generate unique prescription sequence number
    const count = await Prescription.countDocuments({});
    const prescriptionNumber = `RX-${String(count + 1).padStart(6, '0')}`;

    // Format validityDays based on Schedule category if medicines are provided
    let finalValidityDays = validityDays;
    let scheduleCategory = 'Normal';
    
    // Check if any medicine requires a more restrictive validity period
    for (const item of parsedMedicines) {
      const med = await Medicine.findById(item.medicineId);
      if (med) {
        if (med.scheduleCategory === 'X') {
          scheduleCategory = 'X';
          finalValidityDays = 30; // Schedule X limit 30 days
        } else if (med.scheduleCategory === 'H1' && scheduleCategory !== 'X') {
          scheduleCategory = 'H1';
          finalValidityDays = 90; // Schedule H1 limit 90 days
        } else if (med.scheduleCategory === 'H' && scheduleCategory !== 'X' && scheduleCategory !== 'H1') {
          scheduleCategory = 'H';
          finalValidityDays = 180; // Schedule H limit 180 days
        }
      }
    }

    const prescriptionDateObj = new Date(prescriptionDate);
    const expiryDate = new Date(prescriptionDateObj.getTime() + finalValidityDays * 24 * 60 * 60 * 1000);

    // Initialize quantityRemaining = quantityAllowed
    const processedMedicines = parsedMedicines.map(m => ({
      ...m,
      quantityConsumed: 0,
      quantityRemaining: m.quantityAllowed
    }));

    const prescription = await Prescription.create({
      prescriptionNumber,
      customerId,
      doctorName,
      doctorRegistrationNumber,
      patientName,
      prescriptionDate: prescriptionDateObj,
      documentUrl: req.file.path,
      status: 'Pending',
      validityDays: finalValidityDays,
      expiryDate,
      uploadedAt: new Date(),
      medicines: processedMedicines,
      statusHistory: [{
        status: 'Pending',
        updatedBy: req.user.id,
        remarks: 'Uploaded manually.'
      }],
      createdBy: req.user.id
    });

    // Log Audit
    await logAudit(
      req.user.id,
      'Prescription Upload',
      prescription._id,
      null,
      { prescriptionNumber, status: prescription.status },
      req.ip || '127.0.0.1',
      `Uploaded prescription file manually`
    );

    res.status(201).json({ success: true, prescription });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve prescription
// @route   PUT /api/prescriptions/:id/approve
// @access  Private (Pharmacist, Admin only)
const approvePrescription = async (req, res, next) => {
  try {
    const { remarks = '' } = req.body;
    const prescription = await Prescription.findOne({ _id: req.params.id, isArchived: false });

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found or archived' });
    }

    const oldStatus = prescription.status;
    prescription.status = 'Approved';
    prescription.approvedBy = req.user.id;
    prescription.approvedAt = new Date();
    prescription.approvalRemarks = remarks;
    prescription.statusHistory.push({
      status: 'Approved',
      updatedBy: req.user.id,
      remarks: remarks || 'Approved manually by authorized staff.'
    });

    await prescription.save();

    await logAudit(
      req.user.id,
      'Prescription Approval',
      prescription._id,
      { status: oldStatus },
      { status: 'Approved', approvedBy: req.user.id, approvalRemarks: remarks },
      req.ip || '127.0.0.1',
      remarks
    );

    res.json({ success: true, prescription, message: 'Prescription approved successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject prescription
// @route   PUT /api/prescriptions/:id/reject
// @access  Private (Pharmacist, Admin only)
const rejectPrescription = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const prescription = await Prescription.findOne({ _id: req.params.id, isArchived: false });
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found or archived' });
    }

    const oldStatus = prescription.status;
    prescription.status = 'Rejected';
    prescription.rejectedBy = req.user.id;
    prescription.rejectionReason = rejectionReason;
    prescription.statusHistory.push({
      status: 'Rejected',
      updatedBy: req.user.id,
      remarks: rejectionReason
    });

    await prescription.save();

    await logAudit(
      req.user.id,
      'Prescription Rejection',
      prescription._id,
      { status: oldStatus },
      { status: 'Rejected', rejectedBy: req.user.id, rejectionReason },
      req.ip || '127.0.0.1',
      rejectionReason
    );

    res.json({ success: true, prescription, message: 'Prescription rejected successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get prescription list with filters
// @route   GET /api/prescriptions
// @access  Private (Staff, Pharmacist, Admin)
const getPrescriptions = async (req, res, next) => {
  try {
    const {
      customerId,
      status,
      doctorName,
      patientName,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 10
    } = req.query;

    const query = { isArchived: false };

    if (customerId) query.customerId = customerId;
    if (status) query.status = status;
    if (doctorName) query.doctorName = { $regex: doctorName, $options: 'i' };
    if (patientName) query.patientName = { $regex: patientName, $options: 'i' };

    if (search) {
      query.$or = [
        { prescriptionNumber: { $regex: search, $options: 'i' } },
        { patientName: { $regex: search, $options: 'i' } },
        { doctorName: { $regex: search, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      query.prescriptionDate = {};
      if (startDate) query.prescriptionDate.$gte = new Date(startDate);
      if (endDate) query.prescriptionDate.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const prescriptions = await Prescription.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('customerId', 'name phone email');

    const total = await Prescription.countDocuments(query);

    res.json({
      success: true,
      prescriptions,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      total
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get prescription by ID
// @route   GET /api/prescriptions/:id
// @access  Private (Staff, Pharmacist, Admin)
const getPrescriptionById = async (req, res, next) => {
  try {
    const prescription = await Prescription.findById(req.params.id)
      .populate('customerId', 'name phone email')
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .populate('rejectedBy', 'name');

    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    res.json({ success: true, prescription });
  } catch (error) {
    next(error);
  }
};

// @desc    Download / View encrypted prescription file
// @route   GET /api/prescriptions/:id/download
// @access  Private (Staff, Pharmacist, Admin)
const downloadPrescriptionFile = async (req, res, next) => {
  try {
    const prescription = await Prescription.findById(req.params.id);
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    if (!prescription.documentUrl || !fs.existsSync(prescription.documentUrl)) {
      return res.status(404).json({ success: false, message: 'Prescription file not found on disk' });
    }

    // Log Download action in AuditLog
    await logAudit(
      req.user.id,
      'Prescription Download',
      prescription._id,
      null,
      { prescriptionNumber: prescription.prescriptionNumber },
      req.ip || '127.0.0.1',
      `File name: ${path.basename(prescription.documentUrl)}`
    );

    res.sendFile(path.resolve(prescription.documentUrl));
  } catch (error) {
    next(error);
  }
};

// @desc    Update prescription details (modification)
// @route   PUT /api/prescriptions/:id
// @access  Private (Pharmacist, Admin only)
const updatePrescription = async (req, res, next) => {
  try {
    const prescription = await Prescription.findOne({ _id: req.params.id, isArchived: false });
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found or archived' });
    }

    const oldValues = {
      doctorName: prescription.doctorName,
      doctorRegistrationNumber: prescription.doctorRegistrationNumber,
      patientName: prescription.patientName,
      medicines: JSON.parse(JSON.stringify(prescription.medicines))
    };

    const {
      doctorName,
      doctorRegistrationNumber,
      patientName,
      prescriptionDate,
      medicines
    } = req.body;

    if (doctorName) prescription.doctorName = doctorName;
    if (doctorRegistrationNumber) prescription.doctorRegistrationNumber = doctorRegistrationNumber;
    if (patientName) prescription.patientName = patientName;
    if (prescriptionDate) {
      prescription.prescriptionDate = new Date(prescriptionDate);
      prescription.expiryDate = new Date(new Date(prescriptionDate).getTime() + prescription.validityDays * 24 * 60 * 60 * 1000);
    }

    if (medicines) {
      // Modify medicines list and keep quantities alignment
      prescription.medicines = medicines.map(m => ({
        ...m,
        quantityRemaining: m.quantityAllowed - (m.quantityConsumed || 0)
      }));
    }

    prescription.history.push({
      modifiedBy: req.user.id,
      modifiedAt: new Date(),
      changes: req.body
    });

    prescription.updatedBy = req.user.id;
    await prescription.save();

    await logAudit(
      req.user.id,
      'Prescription Modification',
      prescription._id,
      oldValues,
      req.body,
      req.ip || '127.0.0.1',
      'Prescription details updated by authorized staff'
    );

    res.json({ success: true, prescription, message: 'Prescription updated successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Archive prescription (soft delete)
// @route   PUT /api/prescriptions/:id/archive
// @access  Private (Pharmacist, Admin only)
const archivePrescription = async (req, res, next) => {
  try {
    const prescription = await Prescription.findOne({ _id: req.params.id, isArchived: false });
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found or already archived' });
    }

    prescription.isArchived = true;
    prescription.archivedAt = new Date();
    await prescription.save();

    await logAudit(
      req.user.id,
      'Prescription Archive',
      prescription._id,
      { isArchived: false },
      { isArchived: true, archivedAt: prescription.archivedAt },
      req.ip || '127.0.0.1',
      'Prescription soft-archived'
    );

    res.json({ success: true, message: 'Prescription soft-archived successfully.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Restore archived prescription
// @route   PUT /api/prescriptions/:id/restore
// @access  Private (Pharmacist, Admin only)
const restorePrescription = async (req, res, next) => {
  try {
    const prescription = await Prescription.findOne({ _id: req.params.id, isArchived: true });
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Archived prescription not found' });
    }

    prescription.isArchived = false;
    prescription.archivedAt = null;
    await prescription.save();

    await logAudit(
      req.user.id,
      'Prescription Restore',
      prescription._id,
      { isArchived: true },
      { isArchived: false, archivedAt: null },
      req.ip || '127.0.0.1',
      'Prescription restored from archive'
    );

    res.json({ success: true, message: 'Prescription restored from archive successfully.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Permanently delete prescription & cleanup files
// @route   DELETE /api/prescriptions/:id
// @access  Private (Admin only)
const deletePrescription = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin permission required to delete records permanently.' });
    }

    const prescription = await Prescription.findById(req.params.id);
    if (!prescription) {
      return res.status(404).json({ success: false, message: 'Prescription not found' });
    }

    const docPath = prescription.documentUrl;

    // Delete prescription from DB
    await Prescription.deleteOne({ _id: prescription._id });

    // Clean up file from disk
    if (docPath && fs.existsSync(docPath)) {
      try {
        fs.unlinkSync(docPath);
        logger.info(`Cleaned up prescription file: ${docPath}`);
      } catch (err) {
        console.error(`Failed to delete prescription file on disk: ${err.message}`);
      }
    }

    await logAudit(
      req.user.id,
      'Prescription Permanent Delete',
      prescription._id,
      { prescriptionNumber: prescription.prescriptionNumber },
      null,
      req.ip || '127.0.0.1',
      `Permanently deleted record. Cleaned up path: ${docPath}`
    );

    res.json({ success: true, message: 'Prescription and associated files permanently deleted.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadPrescription,
  approvePrescription,
  rejectPrescription,
  getPrescriptions,
  getPrescriptionById,
  downloadPrescriptionFile,
  updatePrescription,
  archivePrescription,
  restorePrescription,
  deletePrescription
};
