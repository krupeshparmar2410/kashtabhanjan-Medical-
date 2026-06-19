const fs = require('fs');
const path = require('path');
const SystemBackup = require('../models/SystemBackup');
const { createFullBackup, restoreFromBackup } = require('../config/BackupService');
const { logSystemAction } = require('../config/AuditService');
const logger = require('../config/logger');

// @desc    Get all completed backups
// @route   GET /api/backups
// @access  Private/Admin
const getBackups = async (req, res, next) => {
  try {
    const backups = await SystemBackup.find({ isArchived: false })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // Verify disk storage existence
    const storageRoot = path.join(__dirname, '../../storage');
    const checked = backups.map(b => {
      const exists = fs.existsSync(path.join(storageRoot, b.filePath));
      return { ...b, fileExistsOnDisk: exists };
    });

    res.json({ success: true, backups: checked });
  } catch (error) {
    next(error);
  }
};

// @desc    Create manual database backup (Full only)
// @route   POST /api/backups/create
// @access  Private/Admin
const triggerBackup = async (req, res, next) => {
  try {
    const { notes = '' } = req.body;
    const backup = await createFullBackup(req.user.id, notes, 'backups/daily');

    await logSystemAction(req, {
      actionType: 'Database Backup Created',
      module: 'Backups',
      entityType: 'SystemBackup',
      entityId: backup._id,
      newValues: { backupNumber: backup.backupNumber, fileName: backup.fileName, size: backup.fileSize },
      remarks: `Manual backup triggered. Note: ${notes}`
    });

    res.status(201).json({
      success: true,
      message: `Database backup ${backup.backupNumber} created successfully.`,
      backup
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Download backup ZIP file
// @route   GET /api/backups/download/:id
// @access  Private/Admin
const downloadBackup = async (req, res, next) => {
  try {
    const backup = await SystemBackup.findById(req.params.id);
    if (!backup) {
      return res.status(404).json({ success: false, message: 'Backup record not found.' });
    }

    const storageRoot = path.join(__dirname, '../../storage');
    const absoluteFilePath = path.join(storageRoot, backup.filePath);

    if (!fs.existsSync(absoluteFilePath)) {
      return res.status(404).json({ success: false, message: 'Backup ZIP archive file not found on disk.' });
    }

    // Log download event before streaming the file to audit-protect downloads
    await logSystemAction(req, {
      actionType: 'Database Backup Downloaded',
      module: 'Backups',
      entityType: 'SystemBackup',
      entityId: backup._id,
      newValues: { backupNumber: backup.backupNumber, fileName: backup.fileName },
      remarks: `Backup archive file BKP-${backup.backupNumber} downloaded by operator.`
    });

    res.download(absoluteFilePath);
  } catch (error) {
    next(error);
  }
};

// @desc    Restore database from backup point
// @route   POST /api/backups/restore
// @access  Private/Admin
const restoreBackup = async (req, res, next) => {
  try {
    const { fileName, confirmationPhrase } = req.body;
    
    if (!fileName) {
      return res.status(400).json({ success: false, message: 'Backup filename is required.' });
    }

    if (confirmationPhrase !== 'RESTORE SYSTEM STATE') {
      return res.status(400).json({ success: false, message: 'Invalid confirmation phrase. Type RESTORE SYSTEM STATE to confirm.' });
    }

    // Restore will execute safe temp swaps, compat checks, operator log, rollback
    const result = await restoreFromBackup(req.user.id, fileName, confirmationPhrase);

    await logSystemAction(req, {
      actionType: 'Database Restored',
      module: 'Restore',
      entityType: 'SystemBackup',
      entityId: req.user.id, // Log against current user performing restore
      newValues: { fileName },
      remarks: `System successfully restored to backup point ${fileName}.`
    });

    res.json(result);
  } catch (error) {
    logger.error('Restore operation route failed:', error);
    res.status(500).json({ success: false, message: error.message || 'Restoration transaction failed. Safe recovery rollback completed.' });
  }
};

// @desc    Logic Archive backup point (No physical delete)
// @route   DELETE /api/backups/:id
// @access  Private/Admin
const archiveBackup = async (req, res, next) => {
  try {
    const backup = await SystemBackup.findById(req.params.id);
    if (!backup) {
      return res.status(404).json({ success: false, message: 'Backup record not found.' });
    }

    backup.isArchived = true;
    await backup.save();

    await logSystemAction(req, {
      actionType: 'Database Backup Archived',
      module: 'Backups',
      entityType: 'SystemBackup',
      entityId: backup._id,
      newValues: { backupNumber: backup.backupNumber },
      remarks: `Backup record BKP-${backup.backupNumber} moved to logical archive (no files deleted).`
    });

    res.json({ success: true, message: 'Backup metadata moved to logical archive successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBackups,
  triggerBackup,
  downloadBackup,
  restoreBackup,
  archiveBackup
};
