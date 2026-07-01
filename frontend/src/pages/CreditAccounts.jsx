import React, { useState, useEffect } from 'react';
import { customerAPI } from '../services/api';

const CreditAccounts = () => {
  const [debtors, setDebtors] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All'); // All, Overdue, DueThisWeek

  // Payment modal state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [refNumber, setRefNumber] = useState('');
  const [remarks, setRemarks] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadDebtors = async () => {
    try {
      // Load all registered customers with outstanding balance > 0
      const res = await customerAPI.getCustomers({ limit: 100, isDeleted: false });
      if (res.success) {
        // Find customers with outstanding balance > 0
        const activeDebtors = res.customers.filter(c => c.outstandingBalance > 0);
        setDebtors(activeDebtors);
      }
    } catch (err) {
      setError('Failed to fetch credit accounts');
    }
  };

  useEffect(() => {
    loadDebtors();
  }, []);

  const handleCollectPaymentSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setError('Please provide a valid payment amount');
      return;
    }

    try {
      const res = await customerAPI.createPayment(selectedCustomer._id, {
        amountPaid: Number(paymentAmount),
        paymentMethod,
        referenceNumber: refNumber,
        remarks: remarks || 'Credit payment recorded via Accounts page'
      });

      if (res.success) {
        setSuccess(`Outstanding payment of ₹${paymentAmount} logged for customer ${selectedCustomer.name}`);
        setSelectedCustomer(null);
        setPaymentAmount('');
        setRefNumber('');
        setRemarks('');
        loadDebtors();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Payment collection failed');
    }
  };

  // Calculations for stats
  const totalReceivables = debtors.reduce((sum, d) => sum + d.outstandingBalance, 0);
  const highRiskOutstandingCount = debtors.filter(d => d.outstandingBalance > d.creditLimit).length;
  const repeatOutstandingCount = debtors.length;

  const filteredDebtors = debtors.filter((d) => {
    const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase()) || d.phone.includes(search);
    if (!matchesSearch) return false;

    if (filterType === 'Overdue') {
      // Simple risk assessment or overdue flag
      return d.outstandingBalance > d.creditLimit;
    }
    return true;
  });

  return (
    <div className="card-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <div className="form-card" style={{ maxWidth: '100%', padding: '20px', background: '#fef2f2', border: '1px solid #fca5a5' }}>
          <span style={{ fontSize: '11px', color: '#991b1b', textTransform: 'uppercase', fontWeight: 'bold' }}>Outstanding Receivables</span>
          <h2 style={{ margin: '6px 0 0 0', color: '#991b1b' }}>₹{totalReceivables.toFixed(2)}</h2>
        </div>
        <div className="form-card" style={{ maxWidth: '100%', padding: '20px', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <span style={{ fontSize: '11px', color: '#92400e', textTransform: 'uppercase', fontWeight: 'bold' }}>Overdue Customer Accounts</span>
          <h2 style={{ margin: '6px 0 0 0', color: '#92400e' }}>{highRiskOutstandingCount} profiles</h2>
        </div>
        <div className="form-card" style={{ maxWidth: '100%', padding: '20px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <span style={{ fontSize: '11px', color: '#1e40af', textTransform: 'uppercase', fontWeight: 'bold' }}>Active Credit Accounts</span>
          <h2 style={{ margin: '6px 0 0 0', color: '#1e40af' }}>{repeatOutstandingCount} accounts</h2>
        </div>
      </div>

      <div className="form-card" style={{ maxWidth: '100%', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: '#1e293b' }}>Outstanding Receivables Accounts</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              className="form-input"
              style={{ width: '250px' }}
              placeholder="Search debtor name/phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="form-input"
              style={{ width: '150px' }}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="All">All Credit lines</option>
              <option value="Overdue">Limit Overdue</option>
            </select>
          </div>
        </div>

        {/* Credit Accounts Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#475569', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Customer Details</th>
                <th style={{ padding: '12px' }}>Contact Phone</th>
                <th style={{ padding: '12px' }}>Outstanding Credit</th>
                <th style={{ padding: '12px' }}>Credit Limit Limit</th>
                <th style={{ padding: '12px' }}>Credit Terms Period</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredDebtors.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                    No debtor accounts matches the current filter settings.
                  </td>
                </tr>
              ) : (
                filteredDebtors.map((row) => {
                  const limitBreached = row.outstandingBalance > row.creditLimit;
                  return (
                    <tr key={row._id} style={{ borderBottom: '1px solid #e2e8f0', background: limitBreached ? '#fff5f5' : 'none' }}>
                      <td style={{ padding: '12px' }}>
                        <strong>{row.name}</strong>
                        {limitBreached && <span style={{ background: '#fee2e2', color: '#ef4444', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>LIMIT EXCEEDED</span>}
                      </td>
                      <td style={{ padding: '12px' }}>{row.phone}</td>
                      <td style={{ padding: '12px', fontWeight: 'bold', color: '#ef4444' }}>₹{row.outstandingBalance.toFixed(2)}</td>
                      <td style={{ padding: '12px' }}>₹{row.creditLimit}</td>
                      <td style={{ padding: '12px' }}>{row.creditDays} days</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ background: '#0d9488', border: 'none', padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => setSelectedCustomer(row)}
                        >
                          Collect Payment
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collect Credit Payment modal */}
      {selectedCustomer && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="modal-content" style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '450px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
            <h3 style={{ color: '#1e293b', margin: '0 0 10px 0' }}>Record Credit Collection</h3>
            <p style={{ fontSize: '13px', color: '#4b5563', marginBottom: '20px' }}>
              Recording credit collections for customer: <strong>{selectedCustomer.name}</strong><br />
              Outstanding debt to settle: <strong style={{ color: '#ef4444' }}>₹{selectedCustomer.outstandingBalance.toFixed(2)}</strong>
            </p>
            <form onSubmit={handleCollectPaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label">Payment Amount Collected (₹) *</label>
                <input
                  type="number"
                  className="form-input"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="e.g. 1500"
                  max={selectedCustomer.outstandingBalance}
                  min="0.01"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Method</label>
                  <select className="form-input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Receipt reference</label>
                  <input
                    type="text"
                    className="form-input"
                    value={refNumber}
                    onChange={(e) => setRefNumber(e.target.value)}
                    placeholder="Ref ID / Txn ID"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Remarks</label>
                <input
                  type="text"
                  className="form-input"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Payment receipt to settle ledger credits"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setSelectedCustomer(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, background: '#0d9488', border: 'none' }}
                >
                  Confirm Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditAccounts;
