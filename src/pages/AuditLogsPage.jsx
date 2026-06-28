import React, { useState, useEffect } from 'react';
import { saleAPI } from '../services/api';

const AuditLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [error, setError] = useState('');

  const loadLogs = async () => {
    try {
      const res = await saleAPI.getAuditLogs();
      if (res.success) setLogs(res.logs);
    } catch (err) {
      setError('Failed to fetch system audit logs dossier');
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleVerify = async () => {
    try {
      setError('');
      const res = await saleAPI.verifyAuditChain();
      if (res.success) {
        alert('Cryptographic Chain Verification: PASSED.\nReport Hash: ' + res.signatureDetails.reportHash + '\nHMAC Signature: ' + res.signatureDetails.signature);
      } else {
        setError('Integrity Check Failed: ' + res.message);
      }
    } catch (err) {
      setError('Failed to run chain integrity validation check');
    }
  };

  const handleExport = async (format) => {
    try {
      setError('');
      const blob = await saleAPI.exportAuditLogs(format);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Audit_Report_${Date.now()}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      setError('Export failed');
    }
  };

  return (
    <div className="card-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {error && <div className="error-message">{error}</div>}
 
      <div className="form-card" style={{ maxWidth: '100%', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#1e293b' }}>Centralized System Audit Trail</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
              Real-time tracking of critical operations, state diffs, and security bypasses
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={handleVerify} style={{ background: '#10b981', color: '#fff', border: 'none' }}>
              Verify Integrity Chain
            </button>
            <button className="btn btn-secondary" onClick={() => handleExport('excel')} style={{ background: '#475569', color: '#fff', border: 'none' }}>
              Export Excel
            </button>
            <button className="btn btn-secondary" onClick={() => handleExport('pdf')} style={{ background: '#f43f5e', color: '#fff', border: 'none' }}>
              Export PDF
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#475569', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Timestamp</th>
                <th style={{ padding: '12px' }}>Performed By</th>
                <th style={{ padding: '12px' }}>Action</th>
                <th style={{ padding: '12px' }}>Entity Type</th>
                <th style={{ padding: '12px' }}>IP Address</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                    No audit log records compiled yet.
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr key={row._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px' }}>{new Date(row.createdAt).toLocaleString()}</td>
                    <td style={{ padding: '12px' }}><strong>{row.performedBy?.name || row.user?.name || 'Deleted User'}</strong></td>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{row.action}</td>
                    <td style={{ padding: '12px' }}>{row.entityType}</td>
                    <td style={{ padding: '12px' }}>{row.ipAddress || '127.0.0.1'}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                        onClick={() => setSelectedLog(row)}
                      >
                        Inspect Diff
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* JSON Inspector Modal */}
      {selectedLog && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="modal-content" style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '600px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
            <h3 style={{ color: '#1e293b', margin: '0 0 10px 0' }}>Audit State Inspection</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              Action: <strong>{selectedLog.action}</strong> | ID: {selectedLog.entityId}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <strong style={{ fontSize: '12px', color: '#ef4444', textTransform: 'uppercase' }}>Before Mutation State:</strong>
                <pre style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '11px', overflowX: 'auto', border: '1px solid #e2e8f0', marginTop: '4px' }}>
                  {JSON.stringify(selectedLog.oldValues || {}, null, 2)}
                </pre>
              </div>
              <div>
                <strong style={{ fontSize: '12px', color: '#10b981', textTransform: 'uppercase' }}>After Mutation State:</strong>
                <pre style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '11px', overflowX: 'auto', border: '1px solid #e2e8f0', marginTop: '4px' }}>
                  {JSON.stringify(selectedLog.newValues || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedLog(null)}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogsPage;
