import React, { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';
import { 
  FaDatabase, FaDownload, FaHistory, FaTrash, 
  FaUndo, FaLock, FaCog, FaCheckCircle, FaExclamationTriangle 
} from 'react-icons/fa';

const DatabaseMaintenance = () => {
  const [stats, setStats] = useState({});
  const [backups, setBackups] = useState([]);
  const [archiveStats, setArchiveStats] = useState({});
  
  // Forms states
  const [backupType, setBackupType] = useState('Full');
  const [backupNotes, setBackupNotes] = useState('');
  const [archiveCutoffDate, setArchiveCutoffDate] = useState('');
  const [retentionBackupDays, setRetentionBackupDays] = useState(30);
  const [retentionArchiveDays, setRetentionArchiveDays] = useState(365);
  const [retentionLogDays, setRetentionLogDays] = useState(90);
  const [clearLogsDays, setClearLogsDays] = useState(30);

  // Statuses
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState({ type: '', text: '' });
  const [progressStep, setProgressStep] = useState('');

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const statsRes = await settingsAPI.getStats();
      if (statsRes.success) setStats(statsRes.stats);

      const backupsRes = await settingsAPI.getBackups();
      if (backupsRes.success) setBackups(backupsRes.backups);

      const archiveRes = await settingsAPI.getArchiveStats();
      if (archiveRes.success) setArchiveStats(archiveRes.stats);

      // Load retention policies
      const settingsRes = await settingsAPI.getSettings();
      if (settingsRes.success) {
        const rules = {};
        settingsRes.settings.forEach(s => {
          rules[s.key] = s.value;
        });
        if (rules['BACKUP_RETENTION_DAYS'] !== undefined) setRetentionBackupDays(rules['BACKUP_RETENTION_DAYS']);
        if (rules['ARCHIVE_RETENTION_DAYS'] !== undefined) setRetentionArchiveDays(rules['ARCHIVE_RETENTION_DAYS']);
        if (rules['LOG_RETENTION_DAYS'] !== undefined) setRetentionLogDays(rules['LOG_RETENTION_DAYS']);
      }
    } catch (err) {
      showMessage('error', 'Failed to load database diagnostics and configurations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const showMessage = (type, text) => {
    setActionMessage({ type, text });
    setTimeout(() => {
      setActionMessage({ type: '', text: '' });
    }, 8000);
  };

  const handleCreateBackup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setProgressStep('Step 1/3: Acquiring operation lock...');
    try {
      setTimeout(() => setProgressStep('Step 2/3: Serializing collection documents...'), 1000);
      setTimeout(() => setProgressStep('Step 3/3: Hashing files & saving metadata...'), 2000);

      const res = await settingsAPI.createBackup({ backupType, notes: backupNotes });
      if (res.success) {
        showMessage('success', res.message);
        setBackupNotes('');
        loadDashboardData();
      }
    } catch (err) {
      showMessage('error', err.response?.data?.message || 'Database lock is active or backup failed.');
    } finally {
      setLoading(false);
      setProgressStep('');
    }
  };

  const handleRestore = async (fileName) => {
    if (!window.confirm(`Are you absolutely sure you want to restore database from ${fileName}? Current data will be replaced!`)) {
      return;
    }

    const phrase = window.prompt(`To confirm database restore, type the confirmation phrase exactly: "RESTORE SYSTEM STATE"`);
    if (phrase !== 'RESTORE SYSTEM STATE') {
      alert('Restoration aborted: Confirmation phrase mismatch.');
      return;
    }

    setLoading(true);
    setProgressStep('Step 1/4: Authenticating lock & verifying SHA-256 checksum...');
    try {
      setTimeout(() => setProgressStep('Step 2/4: Backing up active data for safety...'), 1500);
      setTimeout(() => setProgressStep('Step 3/4: Flushing active database & loading tables...'), 3000);
      setTimeout(() => setProgressStep('Step 4/4: Rebuilding references & settings cache...'), 4500);

      const res = await settingsAPI.restoreDatabase(fileName, phrase);
      if (res.success) {
        showMessage('success', res.message);
        loadDashboardData();
      }
    } catch (err) {
      showMessage('error', err.response?.data?.message || 'Lock active or restoration transaction failed. Safe rollback completed.');
    } finally {
      setLoading(false);
      setProgressStep('');
    }
  };

  const handleDeleteBackup = async (id) => {
    if (!window.confirm('Delete this backup file and metadata permanently from disk?')) return;
    try {
      setLoading(true);
      const res = await settingsAPI.deleteBackup(id);
      if (res.success) {
        showMessage('success', res.message);
        loadDashboardData();
      }
    } catch (err) {
      showMessage('error', 'Failed to delete backup.');
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async (e) => {
    e.preventDefault();
    if (!archiveCutoffDate) return;
    setLoading(true);
    try {
      const res = await settingsAPI.archiveRecords(archiveCutoffDate);
      if (res.success) {
        showMessage('success', res.message);
        loadDashboardData();
      }
    } catch (err) {
      showMessage('error', 'Archiving sweep failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreArchive = async (collectionName) => {
    setLoading(true);
    try {
      const res = await settingsAPI.restoreArchive({ collectionName });
      if (res.success) {
        showMessage('success', res.message);
        loadDashboardData();
      }
    } catch (err) {
      showMessage('error', 'Restore archive failed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePurgeArchive = async (collectionName) => {
    if (!window.confirm(`PERMANENTLY PURGE all archived ${collectionName || 'records'}? This cannot be undone!`)) return;
    setLoading(true);
    try {
      const res = await settingsAPI.purgeArchive(collectionName);
      if (res.success) {
        showMessage('success', res.message);
        loadDashboardData();
      }
    } catch (err) {
      showMessage('error', err.response?.data?.message || 'Super Admin access required.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadLogs = async (logType) => {
    try {
      setLoading(true);
      const blob = await settingsAPI.downloadLogs(logType);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${logType}_logs_${Date.now()}.log`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      showMessage('success', `Logs downloaded successfully.`);
    } catch (err) {
      showMessage('error', 'Failed to retrieve server log files.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearLogs = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await settingsAPI.clearLogs(clearLogsDays);
      if (res.success) {
        showMessage('success', res.message);
        loadDashboardData();
      }
    } catch (err) {
      showMessage('error', 'Failed to clear old logs.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRetention = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const updates = [
        { key: 'BACKUP_RETENTION_DAYS', value: Number(retentionBackupDays) },
        { key: 'ARCHIVE_RETENTION_DAYS', value: Number(retentionArchiveDays) },
        { key: 'LOG_RETENTION_DAYS', value: Number(retentionLogDays) }
      ];
      const res = await settingsAPI.updateSettings(updates);
      if (res.success) {
        showMessage('success', 'Retention schedules updated successfully.');
        loadDashboardData();
      }
    } catch (err) {
      showMessage('error', 'Failed to update retention policies.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        padding: '24px',
        borderRadius: '12px',
        color: '#fff',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FaDatabase style={{ color: '#38bdf8' }} /> Database Maintenance Console
          </h2>
          <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>
            Manage operations locks, backup restore points, system logs archiving, and retention sweeps.
          </p>
        </div>
        <div>
          <button className="btn btn-secondary" onClick={loadDashboardData} disabled={loading} style={{ background: '#334155', border: 'none', color: '#fff' }}>
            Refresh Dashboard
          </button>
        </div>
      </div>

      {/* Progress & Alert Messages */}
      {progressStep && (
        <div style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}>
            <div className="spinner-mini" style={{ border: '2px solid #bfdbfe', borderTop: '2px solid #1d4ed8', borderRadius: '50%', width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
            Database Operation Running... Please do not close or reload this page.
          </div>
          <div style={{ fontSize: '13px', color: '#3b82f6' }}>{progressStep}</div>
        </div>
      )}

      {actionMessage.text && (
        <div style={{
          background: actionMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
          color: actionMessage.type === 'success' ? '#065f46' : '#991b1b',
          border: `1px solid ${actionMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          padding: '14px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: '500',
          fontSize: '14px'
        }}>
          {actionMessage.type === 'success' ? <FaCheckCircle /> : <FaExclamationTriangle />}
          {actionMessage.text}
        </div>
      )}

      {/* KPI Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Database Collections</div>
          <div style={{ fontSize: '26px', fontWeight: '800', marginTop: '6px', color: '#1e293b' }}>{stats.totalCollections || 0}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Active schema classes</div>
        </div>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Total Records Count</div>
          <div style={{ fontSize: '26px', fontWeight: '800', marginTop: '6px', color: '#1e293b' }}>{stats.totalRecords || 0}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Combined documents stored</div>
        </div>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Archived Records</div>
          <div style={{ fontSize: '26px', fontWeight: '800', marginTop: '6px', color: '#1e293b' }}>{stats.archivedCount || 0}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Hidden transaction records</div>
        </div>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Failed Transactions</div>
          <div style={{ fontSize: '26px', fontWeight: '800', marginTop: '6px', color: '#1e293b' }}>{stats.failedTransactionCount || 0}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Checkout errors captured</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
        
        {/* Backup Trigger Block */}
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            <FaDatabase style={{ color: '#3b82f6' }} /> Trigger Backup point
          </h3>
          <form onSubmit={handleCreateBackup} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '6px' }}>Backup Type</label>
              <select className="form-input" value={backupType} onChange={(e) => setBackupType(e.target.value)} style={{ width: '100%' }}>
                <option value="Full">Full Database Dump (All Collections)</option>
                <option value="Incremental">Incremental Delta (Updated since last Full backup)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '6px' }}>Notes</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="E.g., Pre-deployment backup" 
                value={backupNotes}
                onChange={(e) => setBackupNotes(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ background: '#3b82f6', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}>
              <FaLock /> Trigger Backup Process
            </button>
          </form>
        </div>

        {/* Archiving Block */}
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            <FaHistory style={{ color: '#f59e0b' }} /> Soft-Archive Old Transactions
          </h3>
          <form onSubmit={handleArchive} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '6px' }}>Cutoff Date</label>
              <input 
                type="date" 
                className="form-input" 
                value={archiveCutoffDate}
                onChange={(e) => setArchiveCutoffDate(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </div>
            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
              Moves Sales, Returns, Payments, and Audit Logs older than cutoff date into archived state.
            </p>
            <button type="submit" className="btn btn-secondary" disabled={loading} style={{ background: '#f59e0b', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}>
              <FaHistory /> Run Archiving Sweep
            </button>
          </form>
        </div>

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
        
        {/* Retention Policy Settings */}
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            <FaCog style={{ color: '#64748b' }} /> Retention Policies
          </h3>
          <form onSubmit={handleSaveRetention} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Backup (Days)</label>
                <input type="number" className="form-input" value={retentionBackupDays} onChange={(e) => setRetentionBackupDays(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Archive (Days)</label>
                <input type="number" className="form-input" value={retentionArchiveDays} onChange={(e) => setRetentionArchiveDays(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Logs (Days)</label>
                <input type="number" className="form-input" value={retentionLogDays} onChange={(e) => setRetentionLogDays(e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>
            <button type="submit" className="btn btn-secondary" disabled={loading} style={{ background: '#475569', border: 'none', color: '#fff', padding: '10px' }}>
              Save Retention Policies
            </button>
          </form>
        </div>

        {/* Server Logs & Clears */}
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            <FaCog style={{ color: '#10b981' }} /> System Logs Maintenance
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => handleDownloadLogs('combined')} className="btn btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px' }}>
                <FaDownload /> Combined Log
              </button>
              <button onClick={() => handleDownloadLogs('error')} className="btn btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', border: '1px solid #fecaca', color: '#dc2626' }}>
                <FaDownload /> Error Log
              </button>
            </div>
            <form onSubmit={handleClearLogs} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Purge Logs Older Than (Days)</label>
                <input type="number" className="form-input" value={clearLogsDays} onChange={(e) => setClearLogsDays(e.target.value)} style={{ width: '100%' }} />
              </div>
              <button type="submit" className="btn btn-secondary" style={{ background: '#ef4444', border: 'none', color: '#fff', height: '38px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FaTrash /> Purge Logs
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* Archive Management Details */}
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#1e293b' }}>Archive Table Controls</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Collection Name</th>
                <th style={{ padding: '12px' }}>Archived Count</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(archiveStats).map(([name, count]) => (
                <tr key={name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontWeight: '600' }}>{name}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ background: count > 0 ? '#fef3c7' : '#f1f5f9', color: count > 0 ? '#b45309' : '#64748b', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '700' }}>
                      {count} records
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button onClick={() => handleRestoreArchive(name)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} disabled={loading || count === 0}>
                      <FaUndo /> Restore
                    </button>
                    <button onClick={() => handlePurgeArchive(name)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }} disabled={loading || count === 0}>
                      <FaTrash /> Purge DB
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backup History & Restore Points */}
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          <FaHistory style={{ color: '#3b82f6' }} /> Database Restore Points (History)
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Backup ID</th>
                <th style={{ padding: '12px' }}>Type</th>
                <th style={{ padding: '12px' }}>Filename</th>
                <th style={{ padding: '12px' }}>Size</th>
                <th style={{ padding: '12px' }}>Created At</th>
                <th style={{ padding: '12px' }}>Notes</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
                    No backup restore points found.
                  </td>
                </tr>
              ) : (
                backups.map((bk) => (
                  <tr key={bk._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px', fontWeight: '700' }}>{bk.backupId}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        background: bk.backupType === 'Full' ? '#dbeafe' : '#f0fdf4',
                        color: bk.backupType === 'Full' ? '#1e40af' : '#166534',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '700'
                      }}>{bk.backupType}</span>
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }} title={bk.fileName}>
                      {bk.fileName.length > 25 ? bk.fileName.slice(0, 25) + '...' : bk.fileName}
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px' }}>{(bk.fileSize / 1024).toFixed(2)} KB</td>
                    <td style={{ padding: '12px', fontSize: '13px' }}>{new Date(bk.createdAt).toLocaleString()}</td>
                    <td style={{ padding: '12px', fontSize: '13px', color: '#64748b' }}>{bk.notes || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button onClick={() => handleRestore(bk.fileName)} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '12px', background: '#10b981', border: 'none', display: 'flex', alignItems: 'center', gap: '4px' }} disabled={loading || !bk.fileExistsOnDisk}>
                        <FaUndo /> Restore
                      </button>
                      <button onClick={() => handleDeleteBackup(bk._id)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c' }} disabled={loading}>
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default DatabaseMaintenance;
