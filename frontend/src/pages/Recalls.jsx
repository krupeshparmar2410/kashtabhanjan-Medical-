import React, { useState, useEffect } from 'react';
import { saleAPI, medicineAPI } from '../services/api';

const Recalls = () => {
  const [recalls, setRecalls] = useState([]);
  const [searchMed, setSearchMed] = useState('');
  const [medSuggestions, setMedSuggestions] = useState([]);
  const [selectedMedicine, setSelectedMedicine] = useState(null);
  
  const [batchesList, setBatchesList] = useState([]);
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [reason, setReason] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadRecalls = async () => {
    try {
      const res = await saleAPI.getRecalls();
      if (res.success) setRecalls(res.recalls);
    } catch (err) {
      setError('Failed to fetch drug recall register');
    }
  };

  useEffect(() => {
    loadRecalls();
  }, []);

  const handleMedSearch = async (val) => {
    setSearchMed(val);
    if (!val.trim()) {
      setMedSuggestions([]);
      return;
    }
    try {
      const res = await medicineAPI.getMedicines({ search: val });
      if (res.success) setMedSuggestions(res.medicines);
    } catch (err) {
      console.log(err.message);
    }
  };

  const selectMedicine = async (med) => {
    setSelectedMedicine(med);
    setSearchMed(med.medicineName);
    setMedSuggestions([]);
    
    // Load active batches for this medicine
    try {
      const response = await fetch(`/api/inventory/batches?medicineId=${med._id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success) {
        setBatchesList(data.batches);
      }
    } catch (err) {
      setError('Failed to load batch lists for medicine');
    }
  };

  const handleBatchCheckbox = (batchId) => {
    if (selectedBatches.includes(batchId)) {
      setSelectedBatches(selectedBatches.filter(id => id !== batchId));
    } else {
      setSelectedBatches([...selectedBatches, batchId]);
    }
  };

  const handleRecallSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedMedicine || selectedBatches.length === 0 || !reason) {
      setError('Medicine selection, at least one batch check, and recall reason are required.');
      return;
    }

    try {
      const res = await saleAPI.createRecall({
        medicineId: selectedMedicine._id,
        affectedBatches: selectedBatches,
        recallReason: reason
      });

      if (res.success) {
        setSuccess(`Drug recall filed successfully for ${selectedMedicine.medicineName}.`);
        setSelectedMedicine(null);
        setSearchMed('');
        setBatchesList([]);
        setSelectedBatches([]);
        setReason('');
        loadRecalls();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit drug recall registry');
    }
  };

  return (
    <div className="card-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      
      {/* Left panel: Log recall */}
      <div className="form-card" style={{ maxWidth: '100%', padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>File Drug Batch Recall Alert</h3>
        
        {error && <div className="error-message" style={{ marginBottom: '14px' }}>{error}</div>}
        {success && <div className="success-message" style={{ marginBottom: '14px' }}>{success}</div>}

        <form onSubmit={handleRecallSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ position: 'relative' }}>
            <label className="form-label">Search Medicine *</label>
            <input
              type="text"
              className="form-input"
              value={searchMed}
              onChange={(e) => handleMedSearch(e.target.value)}
              placeholder="Type medicine name or code..."
            />
            {medSuggestions.length > 0 && (
              <div className="autocomplete-dropdown" style={{ position: 'absolute', zIndex: 10, width: '100%', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', top: '70px' }}>
                {medSuggestions.map(med => (
                  <div
                    key={med._id}
                    className="suggestion-item"
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                    onClick={() => selectMedicine(med)}
                  >
                    <strong>{med.medicineName}</strong> ({med.medicineCode})
                  </div>
                ))}
              </div>
            )}
          </div>

          {batchesList.length > 0 && (
            <div>
              <label className="form-label">Check Affected Batches *</label>
              <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '6px', background: '#f8fafc' }}>
                {batchesList.map(b => (
                  <div key={b._id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                    <input
                      type="checkbox"
                      id={`chk-${b._id}`}
                      checked={selectedBatches.includes(b._id)}
                      onChange={() => handleBatchCheckbox(b._id)}
                    />
                    <label htmlFor={`chk-${b._id}`} style={{ cursor: 'pointer', fontSize: '13px' }}>
                      Batch: <strong>{b.batchNumber}</strong> | Expiry: {new Date(b.expiryDate).toLocaleDateString()} | Stock: {b.availableQuantity}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="form-label">Recall Reason *</label>
            <textarea
              className="form-input"
              style={{ height: '80px' }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Manufacturer quality recall alert, packaging damage..."
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ background: '#ef4444', border: 'none', padding: '10px' }}>
            Flag & Lock Recalled Batches
          </button>
        </form>
      </div>

      {/* Right panel: History list */}
      <div className="form-card" style={{ maxWidth: '100%', padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Recalls Registry Logs</h3>
        
        <div style={{ overflowY: 'auto', maxHeight: '450px' }}>
          {recalls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No drug recall logs filed.</div>
          ) : (
            recalls.map((row) => (
              <div key={row._id} style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <strong style={{ color: '#ef4444' }}>{row.recallNumber}</strong>
                  <span style={{ color: '#64748b' }}>{new Date(row.recallDate).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: '14px', margin: '4px 0' }}>
                  Medicine: <strong>{row.medicineId?.medicineName}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#4b5563', lineBreak: 'anywhere' }}>
                  <strong>Reason:</strong> {row.recallReason}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  Filed By: {row.createdBy?.name} | Affected Batches Count: {row.affectedBatches.length}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};

export default Recalls;
