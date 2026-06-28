import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/SystemDiagnostics.css';

const SystemDiagnostics = () => {
  const [healthData, setHealthData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState(null);
  const [remarks, setRemarks] = useState({});

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const healthRes = await axios.get('/api/compliance/health', { headers });
      const alertsRes = await axios.get('/api/compliance/alerts', { headers });
      const forecastRes = await axios.get('/api/compliance/forecast', { headers });
      const incidentsRes = await axios.get('/api/compliance/recovery/incidents', { headers });
      const archivedRes = await axios.get('/api/compliance/alerts/archived-summary', { headers });

      setHealthData(healthRes.data.health);
      setAlerts(alertsRes.data.alerts);
      setForecast(forecastRes.data.forecast);
      setIncidents(incidentsRes.data.incidents);
      setArchivedCount(archivedRes.data.archivedCount);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching health stats:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // 60-Second Polling
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleResolveIncident = async (incidentId, action) => {
    const incidentRemarks = remarks[incidentId] || `Resolved via Diagnostics dashboard: ${action}`;
    setResolvingId(incidentId);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/compliance/recovery/incidents/${incidentId}/resolve`,
        { action, remarks: incidentRemarks },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchData();
    } catch (err) {
      alert(`Resolution failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setResolvingId(null);
    }
  };

  const handleRunRetention = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/compliance/alerts/retention-sweep', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (e) {
      alert('Retention sweep execution failed.');
    }
  };

  const handleRemarksChange = (incidentId, value) => {
    setRemarks(prev => ({ ...prev, [incidentId]: value }));
  };

  if (loading) return <div className="diagnostics-loader">Loading system health and diagnostic telemetry...</div>;

  const pendingIncidents = incidents.filter(i => i.status === 'Pending');

  return (
    <div className="diagnostics-container">
      <h2>Diagnostics, Predictive Maintenance & Recovery Control</h2>

      {/* Recovery Incident Banner */}
      {pendingIncidents.length > 0 && (
        <div className="critical-recovery-banner">
          <h3>⚠️ System Recovery Attention Required ({pendingIncidents.length})</h3>
          {pendingIncidents.map(inc => (
            <div key={inc._id} className="incident-card">
              <p><strong>Incident Type:</strong> {inc.incidentType}</p>
              <p><strong>Affected Collections:</strong> {inc.affectedCollections.join(', ')}</p>
              <p><strong>Detected At:</strong> {new Date(inc.detectedAt).toLocaleString()}</p>
              
              <div className="resolution-input-group">
                <input 
                  type="text" 
                  placeholder="Enter resolution remarks..." 
                  value={remarks[inc._id] || ''} 
                  onChange={(e) => handleRemarksChange(inc._id, e.target.value)} 
                />
              </div>

              <div className="recovery-actions">
                <button 
                  className="btn btn-force-swap"
                  disabled={resolvingId === inc._id}
                  onClick={() => handleResolveIncident(inc._id, 'FORCE_SWAP_TEMP')}
                >
                  Force Swapping (Complete Restore)
                </button>
                <button 
                  className="btn btn-purge-rollback"
                  disabled={resolvingId === inc._id}
                  onClick={() => handleResolveIncident(inc._id, 'PURGE_TEMP_ROLLBACK')}
                >
                  Discard Restoring (Keep Current Data)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Diagnostics Info Grid */}
      <div className="health-grid">
        <div className={`card status-${healthData?.status}`}>
          <h3>Overall Status: {healthData?.status}</h3>
          <p className="timestamp-badge">System Time: {new Date(healthData?.timestamp).toLocaleTimeString()}</p>
          <div className="telemetry-details">
            <p>Database: <strong>{healthData?.services?.database?.status}</strong></p>
            <p>DB Host: <code>{healthData?.services?.database?.host}</code></p>
            <p>DB Name: <code>{healthData?.services?.database?.dbName}</code></p>
          </div>
        </div>

        <div className="card">
          <h3>Storage Capacity Projections</h3>
          {forecast && forecast.forecastOk ? (
            <div className="forecast-details">
              <p>Current DB Size: <strong>{forecast.currentDbSizeMB} MB</strong></p>
              <p>Available Free Space: <strong>{forecast.freeDiskSpaceMB} MB</strong></p>
              <p>Avg Growth Rate: <strong>{forecast.avgDailyGrowthMB} MB/day</strong></p>
              <p>Estimated Exhaustion: <strong className={forecast.riskSeverity === 'Critical' ? 'text-danger' : 'text-success'}>{forecast.estimatedDaysToDiskExhaustion} days</strong></p>
              <p>Projected 30-Day Growth: <strong>{forecast.estimatedGrowthNext30Days} MB</strong></p>
              <span className={`badge risk-${forecast.riskSeverity}`}>{forecast.riskSeverity} Risk Level</span>
            </div>
          ) : (
            <p className="loading-trend">Waiting for more database metrics snapshot logs to forecast trends...</p>
          )}
        </div>

        <div className="card">
          <h3>System Alerts Lifecycle</h3>
          <p>Active Unresolved Alerts: <strong>{alerts.length}</strong></p>
          <p>Archived Historic Alerts: <strong>{archivedCount}</strong></p>
          <button onClick={handleRunRetention} className="btn-retention">
            Trigger Archival & Retention Sweep
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemDiagnostics;
