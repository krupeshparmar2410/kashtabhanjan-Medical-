const Prescription = require('../models/Prescription');
const PrescriptionUsage = require('../models/PrescriptionUsage');
const RefillReminder = require('../models/RefillReminder');
const Medicine = require('../models/Medicine');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const AuditLog = require('../models/AuditLog');
const Customer = require('../models/Customer');

// Helper to compile reports into CSV string
const generateCSV = (headers, rows) => {
  const headerLine = headers.join(',');
  const rowLines = rows.map(row => 
    row.map(val => {
      if (val === null || val === undefined) return '';
      const stringVal = String(val);
      if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
        return `"${stringVal.replace(/"/g, '""')}"`;
      }
      return stringVal;
    }).join(',')
  );
  return [headerLine, ...rowLines].join('\n');
};

// @desc    Get dashboard compliance and prescription KPIs
// @route   GET /api/compliance/stats
// @access  Private (Staff, Pharmacist, Admin)
const getComplianceStats = async (req, res, next) => {
  try {
    const totalPrescriptions = await Prescription.countDocuments({ isArchived: false });
    const pendingPrescriptions = await Prescription.countDocuments({ status: 'Pending', isArchived: false });
    const approvedPrescriptions = await Prescription.countDocuments({ status: 'Approved', isArchived: false });
    const expiredPrescriptions = await Prescription.countDocuments({ status: 'Expired', isArchived: false });
    const rejectedPrescriptions = await Prescription.countDocuments({ status: 'Rejected', isArchived: false });
    const activeReminders = await RefillReminder.countDocuments({ status: 'Scheduled', isArchived: false });
    const complianceViolations = await AuditLog.countDocuments({ action: 'Compliance Validation Failure' });

    // Calculate Schedule category sales counts (from SaleItem linked to Medicine category)
    const getSalesQtyByCategory = async (category) => {
      const meds = await Medicine.find({ scheduleCategory: category, isDeleted: false }, '_id');
      const medIds = meds.map(m => m._id);
      const items = await SaleItem.aggregate([
        { $match: { medicineId: { $in: medIds } } },
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]);
      return items[0] ? items[0].total : 0;
    };

    const scheduleHSales = await getSalesQtyByCategory('H');
    const scheduleH1Sales = await getSalesQtyByCategory('H1');
    const scheduleXSales = await getSalesQtyByCategory('X');

    res.json({
      success: true,
      stats: {
        totalPrescriptions,
        pendingPrescriptions,
        approvedPrescriptions,
        expiredPrescriptions,
        rejectedPrescriptions,
        activeRefillReminders: activeReminders,
        complianceViolations,
        scheduleHSales,
        scheduleH1Sales,
        scheduleXSales
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get detailed compliance reports & export downloads
// @route   GET /api/compliance/reports
// @access  Private (Pharmacist, Admin only)
const getComplianceReports = async (req, res, next) => {
  try {
    const {
      reportType, // 'ScheduleH', 'ScheduleH1', 'ScheduleX', 'Usage', 'Expired', 'Reminders'
      format = 'json', // 'json', 'excel', 'pdf'
      startDate,
      endDate,
      customerId,
      doctorName,
      medicineId
    } = req.query;

    if (!reportType) {
      return res.status(400).json({ success: false, message: 'Report type parameter is required.' });
    }

    let reportData = [];
    let headers = [];

    // Filter build blocks
    const matchFilter = {};
    if (startDate || endDate) {
      matchFilter.createdAt = {};
      if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
      if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
    }


    if (['ScheduleH', 'ScheduleH1', 'ScheduleX'].includes(reportType)) {
      const category = reportType.replace('Schedule', ''); // 'H', 'H1', 'X'
      const meds = await Medicine.find({ scheduleCategory: category, isDeleted: false }, '_id');
      const medIds = meds.map(m => m._id);

      const itemsQuery = { medicineId: { $in: medIds } };
      if (medicineId) itemsQuery.medicineId = medicineId;

      let items = await SaleItem.find(itemsQuery)
        .populate({
          path: 'saleId',
          match: matchFilter,
          populate: { path: 'customerId', select: 'name phone' }
        })
        .populate('medicineId', 'medicineName medicineCode scheduleCategory');

      // Filter out items where saleId was not matched by dates/branch
      items = items.filter(it => it.saleId !== null && it.saleId !== undefined);

      // Filter doctor or customer if specified
      if (doctorName) {
        items = items.filter(it => it.saleId.doctorName && new RegExp(doctorName, 'i').test(it.saleId.doctorName));
      }
      if (customerId) {
        items = items.filter(it => it.saleId.customerId && it.saleId.customerId.toString() === customerId);
      }

      headers = ['Invoice Number', 'Sale Date', 'Customer Name', 'Medicine Code', 'Medicine Name', 'Schedule Category', 'Quantity Billed', 'Line Total'];
      reportData = items.map(it => [
        it.saleId.invoiceNumber,
        it.saleId.createdAt.toLocaleDateString(),
        it.saleId.customerName || 'Walk-In',
        it.medicineId.medicineCode,
        it.medicineId.medicineName,
        it.medicineId.scheduleCategory,
        it.quantity,
        it.lineTotal
      ]);

    } else if (reportType === 'Usage') {
      const usageQuery = {};
      if (medicineId) usageQuery.medicineId = medicineId;
      if (startDate || endDate) {
        usageQuery.consumedAt = {};
        if (startDate) usageQuery.consumedAt.$gte = new Date(startDate);
        if (endDate) usageQuery.consumedAt.$lte = new Date(endDate);
      }


      let usages = await PrescriptionUsage.find(usageQuery)
        .populate({
          path: 'prescriptionId',
          populate: { path: 'customerId', select: 'name phone' }
        })
        .populate('saleId', 'invoiceNumber')
        .populate('medicineId', 'medicineName medicineCode');

      if (doctorName) {
        usages = usages.filter(u => u.prescriptionId && new RegExp(doctorName, 'i').test(u.prescriptionId.doctorName));
      }
      if (customerId) {
        usages = usages.filter(u => u.prescriptionId && u.prescriptionId.customerId && u.prescriptionId.customerId._id.toString() === customerId);
      }

      headers = ['Prescription Number', 'Patient Name', 'Doctor Name', 'Invoice Number', 'Medicine Code', 'Medicine Name', 'Quantity Consumed', 'Date Billed'];
      reportData = usages.map(u => [
        u.prescriptionId ? u.prescriptionId.prescriptionNumber : 'N/A',
        u.prescriptionId ? u.prescriptionId.patientName : 'N/A',
        u.prescriptionId ? u.prescriptionId.doctorName : 'N/A',
        u.saleId ? u.saleId.invoiceNumber : 'N/A',
        u.medicineId.medicineCode,
        u.medicineId.medicineName,
        u.quantityConsumed,
        u.consumedAt.toLocaleDateString()
      ]);

    } else if (reportType === 'Expired') {
      const expQuery = { status: 'Expired', isArchived: false };
      if (startDate || endDate) {
        expQuery.expiryDate = {};
        if (startDate) expQuery.expiryDate.$gte = new Date(startDate);
        if (endDate) expQuery.expiryDate.$lte = new Date(endDate);
      }
      if (customerId) expQuery.customerId = customerId;
      if (doctorName) expQuery.doctorName = { $regex: doctorName, $options: 'i' };


      const expiredList = await Prescription.find(expQuery)
        .populate('customerId', 'name phone');

      headers = ['Prescription Number', 'Customer Name', 'Patient Name', 'Doctor Name', 'Prescription Date', 'Expiry Date', 'Validity Days'];
      reportData = expiredList.map(p => [
        p.prescriptionNumber,
        p.customerId ? p.customerId.name : 'Walk-In',
        p.patientName,
        p.doctorName,
        p.prescriptionDate.toLocaleDateString(),
        p.expiryDate.toLocaleDateString(),
        p.validityDays
      ]);

    } else if (reportType === 'Reminders') {
      const remQuery = { isArchived: false };
      if (startDate || endDate) {
        remQuery.refillDueDate = {};
        if (startDate) remQuery.refillDueDate.$gte = new Date(startDate);
        if (endDate) remQuery.refillDueDate.$lte = new Date(endDate);
      }
      if (customerId) remQuery.customerId = customerId;


      let reminders = await RefillReminder.find(remQuery)
        .populate('customerId', 'name phone')
        .populate('prescriptionId', 'prescriptionNumber')
        .populate('medicineId', 'medicineName medicineCode');

      if (doctorName) {
        reminders = reminders.filter(r => r.prescriptionId && new RegExp(doctorName, 'i').test(r.prescriptionId.doctorName));
      }

      headers = ['Reminder Number', 'Customer Name', 'Prescription Number', 'Medicine Code', 'Medicine Name', 'Refill Due Date', 'Priority', 'Status'];
      reportData = reminders.map(r => [
        r.reminderNumber,
        r.customerId ? r.customerId.name : 'N/A',
        r.prescriptionId ? r.prescriptionId.prescriptionNumber : 'N/A',
        r.medicineId.medicineCode,
        r.medicineId.medicineName,
        r.refillDueDate.toLocaleDateString(),
        r.reminderPriority,
        r.status
      ]);
    }

    if (format === 'excel') {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();
      const wsData = [headers, ...reportData];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}_Report_${Date.now()}.xlsx"`);
      return res.status(200).send(buf);
    }

    if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 30 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}_Report_${Date.now()}.pdf"`);
      doc.pipe(res);
      doc.fontSize(16).text('KASHTBHANJAN PHARMACY - COMPLIANCE REPORT', { align: 'center' });
      doc.fontSize(12).text(`Report Type: ${reportType} Report`, { align: 'center' });
      doc.text(`Generated At: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(1.5);

      reportData.forEach((row, rowIndex) => {
        doc.fontSize(10).text(`Record #${rowIndex + 1}:`, { underline: true });
        headers.forEach((h, colIndex) => {
          doc.fontSize(9).text(`  - ${h}: ${row[colIndex] !== undefined && row[colIndex] !== null ? row[colIndex] : 'N/A'}`);
        });
        doc.moveDown(0.5);
      });
      doc.end();
      return;
    }

    // JSON format output
    res.json({
      success: true,
      reportType,
      headers,
      data: reportData
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getComplianceStats,
  getComplianceReports
};
