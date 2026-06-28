const SystemBackup = require('../models/SystemBackup');
const logger = require('./logger');

const getBackupMetrics = async () => {
  try {
    const latest = await SystemBackup.findOne({ status: 'Completed' }).sort({ createdAt: -1 });
    if (!latest) {
      return { status: 'Warning', lastBackupDate: null, message: 'No backups recorded' };
    }

    const ageMs = Date.now() - new Date(latest.createdAt).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    let status = 'Healthy';
    if (ageHours > 48 || latest.healthStatus === 'Failed') {
      status = 'Critical';
    } else if (ageHours > 24) {
      status = 'Warning';
    }

    return {
      status,
      lastBackupDate: latest.createdAt,
      lastBackupAgeHours: Math.round(ageHours * 10) / 10,
      lastBackupSizeMB: Math.round((latest.fileSize / (1024 * 1024)) * 100) / 100,
      healthStatus: latest.healthStatus
    };
  } catch (err) {
    logger.error('Failed to get backup metrics:', err);
    return {
      status: 'Critical',
      message: `Failed to query backup metadata: ${err.message}`
    };
  }
};

module.exports = { getBackupMetrics };
