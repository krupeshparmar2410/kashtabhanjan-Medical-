const AuditLog = require('../models/AuditLog');
const { verifyChainIntegrity } = require('../config/AuditService');
const logger = require('../config/logger');

// @desc    Get paginated and filtered audit logs
// @route   GET /api/audits
// @access  Private/Admin
const getAudits = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      module: logModule,
      actionType,
      performedBy,
      status,
      startDate,
      endDate
    } = req.query;

    const query = { isArchived: { $ne: true } };

    if (logModule) query.module = logModule;
    if (actionType) query.actionType = { $regex: actionType, $options: 'i' };
    if (performedBy) query.performedBy = performedBy;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('performedBy', 'name email role')
      .lean();

    res.json({
      success: true,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      totalRecords: total,
      logs
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Run cryptographic audit logs chain integrity validation
// @route   GET /api/audits/verify
// @access  Private/Admin
const runAuditChainVerification = async (req, res, next) => {
  try {
    const result = await verifyChainIntegrity(req.user.id);
    res.json({
      success: result.success,
      verifiedCount: result.verifiedCount,
      message: result.message || 'Audit trail is fully verified and consistent.',
      signatureDetails: result.success ? {
        reportHash: result.reportHash,
        signature: result.signature
      } : null
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export audit log history (PDF/Excel)
// @route   GET /api/audits/export
// @access  Private/Admin
const exportAuditsReport = async (req, res, next) => {
  try {
    const { format = 'excel', module: logModule, startDate, endDate } = req.query;

    const query = {};
    if (logModule) query.module = logModule;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .populate('performedBy', 'name email role')
      .lean();

    const headers = [
      'Timestamp',
      'Action Type',
      'Module',
      'Entity Type',
      'Performed By',
      'Role',
      'IP Address',
      'Response Status',
      'Remarks'
    ];

    const reportData = logs.map(l => [
      new Date(l.createdAt).toLocaleString(),
      l.actionType || l.action || 'N/A',
      l.module || 'N/A',
      l.entityType || 'N/A',
      l.performedBy ? l.performedBy.name : 'System/CLI',
      l.userRole || l.performedBy?.role || 'System',
      l.ipAddress || '127.0.0.1',
      l.status || 'Success',
      l.remarks || ''
    ]);

    const title = 'System Compliance Audit Logs Trail Report';

    if (format === 'excel') {
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();
      const wsData = [headers, ...reportData];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs');
      
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="System_Audit_Log_Report_${Date.now()}.xlsx"`);
      return res.status(200).send(buf);
    }

    if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 30 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="System_Audit_Log_Report_${Date.now()}.pdf"`);
      doc.pipe(res);

      doc.fontSize(16).text('KASHTBHANJAN PHARMACY - SYSTEM AUDIT TRAIL', { align: 'center' });
      doc.fontSize(10).text(`Generated At: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.text(`RPO Objective: 24h | RTO Objective: 1h`, { align: 'center' });
      doc.moveDown(1.5);

      reportData.forEach((row, index) => {
        doc.fontSize(10).text(`Event #${index + 1}: ${row[1]}`, { underline: true });
        doc.fontSize(9)
          .text(`  - Date: ${row[0]}`)
          .text(`  - Module: ${row[2]} | Entity: ${row[3]}`)
          .text(`  - User: ${row[4]} (${row[5]})`)
          .text(`  - Origin: ${row[6]} | Status: ${row[7]}`)
          .text(`  - Details: ${row[8]}`);
        doc.moveDown(0.5);
      });

      doc.end();
      return;
    }

    res.status(400).json({ success: false, message: 'Invalid export format parameter.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAudits,
  runAuditChainVerification,
  exportAuditsReport
};
