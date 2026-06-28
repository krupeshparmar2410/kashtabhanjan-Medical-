const mongoose = require('mongoose');
const logger = require('./logger');

const getSystemHealth = async () => {
  const DiskMonitoringService = require('./DiskMonitoringService');
  const ResourceMonitoringService = require('./ResourceMonitoringService');
  const BackupMonitoringService = require('./BackupMonitoringService');
  const AuditIntegrityMonitoringService = require('./AuditIntegrityMonitoringService');
  
  const mongoConnected = mongoose.connection.readyState === 1;
  const diskHealth = await DiskMonitoringService.checkDiskSpace();
  const resourceHealth = ResourceMonitoringService.getResourceMetrics();
  const backupHealth = await BackupMonitoringService.getBackupMetrics();
  const auditHealth = await AuditIntegrityMonitoringService.checkLastBlocks();

  let overallStatus = 'Healthy';
  if (
    diskHealth.status === 'Critical' || 
    resourceHealth.status === 'Critical' || 
    !mongoConnected || 
    auditHealth.status === 'Critical'
  ) {
    overallStatus = 'Critical';
  } else if (
    diskHealth.status === 'Warning' || 
    resourceHealth.status === 'Warning' || 
    backupHealth.status === 'Warning' ||
    auditHealth.status === 'Warning'
  ) {
    overallStatus = 'Warning';
  }

  return {
    status: overallStatus,
    timestamp: new Date(),
    services: {
      database: {
        status: mongoConnected ? 'Connected' : 'Disconnected',
        host: mongoose.connection.host,
        dbName: mongoose.connection.name
      },
      storage: diskHealth,
      resources: resourceHealth,
      backup: backupHealth,
      audit: auditHealth
    }
  };
};

module.exports = { getSystemHealth };
