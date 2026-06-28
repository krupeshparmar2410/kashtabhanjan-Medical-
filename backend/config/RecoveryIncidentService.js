const mongoose = require('mongoose');
const RecoveryIncident = require('../models/RecoveryIncident');
const logger = require('./logger');

const detectIncompleteRestore = async () => {
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const names = collections.map(c => c.name);

  const affected = [];
  for (const name of names) {
    if (name.startsWith('temp_')) {
      const activeName = name.substring('temp_'.length);
      if (names.includes(activeName)) {
        affected.push(activeName);
      }
    }
  }
  return affected;
};

const createIncident = async (type, affected) => {
  // Prevent duplicate open incidents for the same problem
  const existing = await RecoveryIncident.findOne({ incidentType: type, status: 'Pending' });
  if (existing) return existing;

  const incident = new RecoveryIncident({
    incidentType: type,
    affectedCollections: affected
  });
  await incident.save();
  logger.error(`Recovery Incident Registered: [${type}] affecting collections: [${affected.join(', ')}]`);
  return incident;
};

const resolveIncident = async (incidentId, adminUserId, action, remarks) => {
  const incident = await RecoveryIncident.findById(incidentId);
  if (!incident || incident.status === 'Resolved') {
    throw new Error('Incident not found or already resolved.');
  }

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const names = collections.map(c => c.name);

  if (action === 'FORCE_SWAP_TEMP') {
    // Safe double-rename swap
    for (const activeName of incident.affectedCollections) {
      const tempName = `temp_${activeName}`;
      const backupName = `backup_${activeName}`;
      
      if (names.includes(tempName)) {
        // Step 1: Backup active target collection
        await db.renameCollection(activeName, backupName).catch(() => {});
        try {
          // Step 2: Swap temp collection into active place
          await db.renameCollection(tempName, activeName);
          // Step 3: Success, drop backup
          await db.dropCollection(backupName).catch(() => {});
        } catch (renameErr) {
          // Rollback to original backup in case of rename failures
          await db.renameCollection(backupName, activeName).catch(() => {});
          throw renameErr;
        }
      }
    }
  } else if (action === 'PURGE_TEMP_ROLLBACK') {
    // Drop temp collections and keep original
    for (const activeName of incident.affectedCollections) {
      const tempName = `temp_${activeName}`;
      if (names.includes(tempName)) {
        await db.dropCollection(tempName);
      }
    }
  } else {
    throw new Error(`Unknown recovery action: ${action}`);
  }

  incident.status = 'Resolved';
  incident.resolutionNotes = remarks || `Resolved via Recovery Action: ${action}`;
  incident.resolvedAt = new Date();
  incident.resolvedBy = adminUserId;
  await incident.save();
  
  return incident;
};

module.exports = {
  detectIncompleteRestore,
  createIncident,
  resolveIncident
};
