import React, { useState, useEffect } from 'react';
import { saleAPI } from '../services/api';

const CashClosingPage = () => {
  const [closings, setClosings] = useState([]);
  const [billingCounter, setBillingCounter] = useState('Counter-1');
  const [openingCash, setOpeningCash] = useState(2000);
  const [actualCashInDrawer, setActualCashInDrawer] = useState('');
  const [notes, setNotes] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadClosings = async () => {
    try {
      const res = await saleAPI.getCashClosings();
      if (res.success) setClosings(res.closings);
    } catch (err) {
      setError('Failed to load closing registers history');
    }
  };

  useEffect(() => {
    loadClosings();
  }, []);

  const handleClosingSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (openingCash === '' || actualCashInDrawer === '') {
      setError('Opening Cash and Actual drawer cash values are required.');
      return;
    }

    try {
      const res = await saleAPI.createCashClosing({
        billingCounter,
        openingCash: Number(openingCash),
        actualCashInDrawer: Number(actualCashInDrawer),
        notes
      });

      if (res.success) {
        setSuccess('Counter cash closing session logged successfully.');
        setActualCashInDrawer('');
        setNotes('');
        loadClosings();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit counter closing register');
    }
  };

  return (
    <div className="card-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      
      {/* Left panel: Log session closing */}
      <div className="form-card" style={{ maxWidth: '100%', padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Close Counter Cash Drawer</h3>
        
        {error && <div className="error-message" style={{ marginBottom: '14px' }}>{error}</div>}
        {success && <div className="success-message" style={{ marginBottom: '14px' }}>{success}</div>}

        <form onSubmit={handleClosingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="form-label">Billing Counter Counter *</label>
            <select className="form-input" value={billingCounter} onChange={(e) => setBillingCounter(e.target.value)}>
              <option value="Counter-1">Counter-1</option>
              <option value="Counter-2">Counter-2</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Opening Cash Float (₹) *</label>
              <input
                type="number"
                className="form-input"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Actual Cash in Drawer (₹) *</label>
              <input
                type="number"
                className="form-input"
                value={actualCashInDrawer}
                onChange={(e) => setActualCashInDrawer(e.target.value)}
                placeholder="Physical count..."
              />
            </div>
          </div>

          <div>
            <label className="form-label">Notes / Discrepancy Reasons</label>
            <textarea
              className="form-input"
              style={{ height: '80px' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Tally matches perfectly, or reason for cash variance..."
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ background: '#0d9488', border: 'none', padding: '10px' }}>
            File counter Cash Reconcile
          </button>
        </form>
      </div>

      {/* Right panel: Reconciled History list */}
      <div className="form-card" style={{ maxWidth: '100%', padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Drawer Reconciliations History</h3>
        
        <div style={{ overflowY: 'auto', maxHeight: '450px' }}>
          {closings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No closing session logs registered.</div>
          ) : (
            closings.map((row) => {
              const hasDiff = row.difference !== 0;
              return (
                <div key={row._id} style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 0', background: hasDiff ? '#fffbeb' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <strong>{row.billingCounter}</strong>
                    <span style={{ color: '#64748b' }}>{new Date(row.closingDate).toLocaleDateString()}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '12px', margin: '6px 0' }}>
                    <div>Opening: ₹{row.openingCash}</div>
                    <div>Expected: ₹{row.closingCash}</div>
                    <div>Actual Drawer: ₹{row.actualCashInDrawer}</div>
                  </div>
                  <div style={{ fontSize: '13px', color: hasDiff ? '#b45309' : '#15803d', fontWeight: 'bold' }}>
                    Drawer Variance: ₹{row.difference >= 0 ? '+' : ''}{row.difference}
                  </div>
                  {row.notes && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Notes: {row.notes}</div>}
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Cashier: {row.performedBy?.name}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
};

export default CashClosingPage;
