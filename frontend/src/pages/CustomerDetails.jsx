import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customerAPI, prescriptionAPI } from '../services/api';

const CustomerDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [sales, setSales] = useState([]);
  const [activities, setActivities] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loyalty, setLoyalty] = useState([]);
  const [payments, setPayments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [analytics, setAnalytics] = useState({ totalPurchases: 0, purchaseCount: 0, averageBillValue: 0, lastPurchaseDate: null, topMedicines: [] });

  const [activeTab, setActiveTab] = useState('ledger');

  // Chronic condition form state
  const [newCondition, setNewCondition] = useState({ condition: '', diagnosisDate: '', treatingDoctor: '', notes: '' });

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [refNumber, setRefNumber] = useState('');
  const [remarks, setRemarks] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    try {
      const res = await customerAPI.getCustomerById(id);
      if (res.success) {
        setCustomer(res.customer);
        setSales(res.sales);
        setActivities(res.activities);
      }

      const ledgerRes = await customerAPI.getLedger(id);
      if (ledgerRes.success) setLedger(ledgerRes.ledger);

      const loyaltyRes = await customerAPI.getLoyalty(id);
      if (loyaltyRes.success) setLoyalty(loyaltyRes.loyalty);

      const paymentsRes = await customerAPI.getPayments(id);
      if (paymentsRes.success) setPayments(paymentsRes.payments);

      const analyticsRes = await customerAPI.getAnalytics(id);
      if (analyticsRes.success) setAnalytics(analyticsRes.analytics);

      const rxRes = await prescriptionAPI.getPrescriptions({ customerId: id });
      if (rxRes.success) setPrescriptions(rxRes.prescriptions);

    } catch (err) {
      setError('Failed to load customer dossier details');
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setError('Please enter a valid positive payment amount');
      return;
    }

    try {
      const res = await customerAPI.createPayment(id, {
        amountPaid: Number(paymentAmount),
        paymentMethod,
        referenceNumber: refNumber,
        remarks
      });
      if (res.success) {
        setSuccess(`Successfully posted credit payment receipt for ₹${paymentAmount}`);
        setPaymentAmount('');
        setRefNumber('');
        setRemarks('');
        loadData();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Payment processing failed');
    }
  };

  if (!customer) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
        Loading Customer Dossier...
      </div>
    );
  }

  return (
    <div className="card-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div style={{ display: 'flex', gap: '24px' }}>
        
        {/* Left Profile Panel */}
        <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="form-card" style={{ maxWidth: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', color: '#1e293b' }}>
              Customer Dossier
            </h3>
            
            <div style={{ fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div><strong>Name:</strong> {customer.name}</div>
              <div><strong>Mobile:</strong> {customer.phone}</div>
              <div><strong>Email:</strong> {customer.email || 'N/A'}</div>
              <div><strong>Address:</strong> {customer.address || 'N/A'}</div>
              <div><strong>City:</strong> {customer.city || 'N/A'}, {customer.state || 'N/A'} - {customer.pincode || 'N/A'}</div>
              <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                <strong>Outstanding Balance:</strong> <span style={{ fontSize: '16px', fontWeight: 'bold', color: customer.outstandingBalance > 0 ? '#ef4444' : '#10b981' }}>₹{customer.outstandingBalance.toFixed(2)}</span>
              </div>
              <div><strong>Credit Limit:</strong> ₹{customer.creditLimit || 5000}</div>
              <div><strong>Credit Term:</strong> {customer.creditDays || 30} Days</div>
              <div><strong>Loyalty Point Balance:</strong> <span style={{ color: '#10b981', fontWeight: 600 }}>{customer.loyaltyPoints} points</span></div>
            </div>
          </div>

          {/* Quick Pay Outstanding Form */}
          {customer.outstandingBalance > 0 && (
            <div className="form-card" style={{ maxWidth: '100%', padding: '24px', background: '#f8fafc' }}>
              <h3 style={{ margin: '0 0 14px 0', color: '#1e293b' }}>Record Credit Collection</h3>
              <form onSubmit={handlePaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '11px' }}>Payment Amount (₹)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="Enter collected cash amount..."
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Method</label>
                    <select className="form-input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Card">Card</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Txn Ref Code</label>
                    <input
                      type="text"
                      className="form-input"
                      value={refNumber}
                      onChange={(e) => setRefNumber(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '11px' }}>Remarks</label>
                  <input
                    type="text"
                    className="form-input"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Received outstanding balance"
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ background: '#0d9488', border: 'none', padding: '8px' }}>
                  Post Collection
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right Dashboard Analytics */}
        <div style={{ flex: '2', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Analytics Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div className="form-card" style={{ maxWidth: '100%', padding: '16px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <span style={{ fontSize: '11px', color: '#1e3a8a', textTransform: 'uppercase', fontWeight: 'bold' }}>Lifetime Value</span>
              <h2 style={{ margin: '6px 0 0 0', color: '#1e3a8a' }}>₹{analytics.totalPurchases.toFixed(2)}</h2>
            </div>
            <div className="form-card" style={{ maxWidth: '100%', padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <span style={{ fontSize: '11px', color: '#14532d', textTransform: 'uppercase', fontWeight: 'bold' }}>Purchase Frequency</span>
              <h2 style={{ margin: '6px 0 0 0', color: '#14532d' }}>{analytics.purchaseCount} orders</h2>
            </div>
            <div className="form-card" style={{ maxWidth: '100%', padding: '16px', background: '#fff7ed', border: '1px solid #ffedd5' }}>
              <span style={{ fontSize: '11px', color: '#7c2d12', textTransform: 'uppercase', fontWeight: 'bold' }}>Risk Score</span>
              <h2 style={{ margin: '6px 0 0 0', color: customer.outstandingBalance > customer.creditLimit ? '#ea580c' : '#1e293b' }}>
                {customer.outstandingBalance > customer.creditLimit ? 'HIGH RISK' : 'HEALTHY'}
              </h2>
            </div>
          </div>

          {/* Top Medicines list */}
          <div className="form-card" style={{ maxWidth: '100%', padding: '20px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#475569' }}>Top Purchased Medicines</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {analytics.topMedicines.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '13px' }}>No medicines billed under profile yet.</div>
              ) : (
                analytics.topMedicines.map(med => (
                  <div key={med._id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px' }}>
                    <span>{med.medicineName} ({med.medicineCode})</span>
                    <strong>{med.totalQuantity} units sold</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Details Ledger Console */}
      <div className="form-card" style={{ maxWidth: '100%', padding: '24px' }}>
        {/* Ledger Tabs */}
        <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #cbd5e1', paddingBottom: '10px', marginBottom: '16px' }}>
          {['ledger', 'loyalty', 'sales', 'payments', 'history', 'activities'].map((tab) => (
            <button
              key={tab}
              type="button"
              className="btn"
              style={{
                background: activeTab === tab ? '#0d9488' : 'none',
                color: activeTab === tab ? '#fff' : '#64748b',
                border: 'none',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: activeTab === tab ? 'bold' : 'normal'
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'history' ? 'Patient History' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab 1: Financial Ledger */}
        {activeTab === 'ledger' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Transaction</th>
                  <th style={{ padding: '8px' }}>Reference #</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Debit (+)</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Credit (-)</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Outstanding Balance</th>
                  <th style={{ padding: '8px' }}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No financial ledger transactions posted.</td></tr>
                ) : (
                  ledger.map((row) => (
                    <tr key={row._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px' }}>{new Date(row.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: '8px' }}><strong>{row.transactionType}</strong></td>
                      <td style={{ padding: '8px' }}>{row.referenceNumber}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#b91c1c' }}>{row.debit > 0 ? `₹${row.debit.toFixed(2)}` : '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#15803d' }}>{row.credit > 0 ? `₹${row.credit.toFixed(2)}` : '-'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>₹{row.runningBalance.toFixed(2)}</td>
                      <td style={{ padding: '8px', color: '#475569' }}>{row.remarks}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Loyalty history */}
        {activeTab === 'loyalty' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Action</th>
                  <th style={{ padding: '8px' }}>Reference</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Points Transacted</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Running Balance</th>
                  <th style={{ padding: '8px' }}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {loyalty.length === 0 ? (
                  <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No loyalty points transactions accrued.</td></tr>
                ) : (
                  loyalty.map((row) => (
                    <tr key={row._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px' }}>{new Date(row.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: '8px' }}><strong>{row.transactionType}</strong></td>
                      <td style={{ padding: '8px' }}>{row.referenceNumber}</td>
                      <td style={{ padding: '8px', textAlign: 'center', color: row.points > 0 ? '#15803d' : '#b91c1c', fontWeight: 'bold' }}>
                        {row.points > 0 ? `+${row.points}` : row.points}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{row.runningBalance} pts</td>
                      <td style={{ padding: '8px', color: '#475569' }}>{row.remarks}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Sales invoices lists */}
        {activeTab === 'sales' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Invoice #</th>
                  <th style={{ padding: '8px' }}>Billed Date</th>
                  <th style={{ padding: '8px' }}>Total Amount</th>
                  <th style={{ padding: '8px' }}>Paid</th>
                  <th style={{ padding: '8px' }}>Unpaid Credit</th>
                  <th style={{ padding: '8px' }}>Payment Method</th>
                  <th style={{ padding: '8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No purchases billed under customer profile.</td></tr>
                ) : (
                  sales.map((row) => (
                    <tr key={row._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px' }}>
                        <span style={{ color: '#0d9488', fontWeight: 600 }}>{row.invoiceNumber}</span>
                      </td>
                      <td style={{ padding: '8px' }}>{new Date(row.saleDate).toLocaleDateString()}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>₹{row.grandTotal.toFixed(2)}</td>
                      <td style={{ padding: '8px', color: '#15803d' }}>₹{row.paidAmount.toFixed(2)}</td>
                      <td style={{ padding: '8px', color: '#b91c1c' }}>₹{row.pendingAmount.toFixed(2)}</td>
                      <td style={{ padding: '8px' }}>{row.paymentMethod}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{
                          padding: '3px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          background: row.invoiceStatus === 'Completed' ? '#dcfce7' : '#fee2e2',
                          color: row.invoiceStatus === 'Completed' ? '#15803d' : '#b91c1c'
                        }}>
                          {row.invoiceStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 4: Payments history */}
        {activeTab === 'payments' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Payment Receipt #</th>
                  <th style={{ padding: '8px' }}>Payment Date</th>
                  <th style={{ padding: '8px' }}>Amount Paid</th>
                  <th style={{ padding: '8px' }}>Method</th>
                  <th style={{ padding: '8px' }}>Txn Reference</th>
                  <th style={{ padding: '8px' }}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No payment collection records log found.</td></tr>
                ) : (
                  payments.map((row) => (
                    <tr key={row._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{row.paymentNumber}</td>
                      <td style={{ padding: '8px' }}>{new Date(row.paymentDate).toLocaleDateString()}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold', color: '#15803d' }}>₹{row.amountPaid.toFixed(2)}</td>
                      <td style={{ padding: '8px' }}>{row.paymentMethod}</td>
                      <td style={{ padding: '8px' }}>{row.referenceNumber || 'N/A'}</td>
                      <td style={{ padding: '8px', color: '#475569' }}>{row.remarks}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 5: Activities */}
        {activeTab === 'activities' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Time</th>
                  <th style={{ padding: '8px' }}>Action</th>
                  <th style={{ padding: '8px' }}>Log Detail</th>
                  <th style={{ padding: '8px' }}>Cashier</th>
                </tr>
              </thead>
              <tbody>
                {activities.length === 0 ? (
                  <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No administrative audit events recorded.</td></tr>
                ) : (
                  activities.map((row) => (
                    <tr key={row._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px' }}>{new Date(row.createdAt).toLocaleString()}</td>
                      <td style={{ padding: '8px' }}><strong>{row.action}</strong></td>
                      <td style={{ padding: '8px', color: '#475569' }}>{row.description}</td>
                      <td style={{ padding: '8px' }}>{row.performedBy?.name || 'System'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 6: Digital Patient History */}
        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Chronic Conditions list */}
            <div>
              <h4 style={{ color: '#1e293b', marginBottom: '10px' }}>Chronic Conditions Directory</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h5 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#475569' }}>Log Diagnosis</h5>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newCondition.condition) return;
                    try {
                      const updatedConditions = [...(customer.chronicConditions || []), newCondition];
                      const res = await customerAPI.updateCustomer(id, {
                        ...customer,
                        chronicConditions: updatedConditions
                      });
                      if (res.success) {
                        setSuccess('Chronic condition logged successfully.');
                        setNewCondition({ condition: '', diagnosisDate: '', treatingDoctor: '', notes: '' });
                        loadData();
                      }
                    } catch (err) {
                      setError('Failed to log chronic condition.');
                    }
                  }} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Condition (e.g. Diabetes, Hypertension)"
                      value={newCondition.condition}
                      onChange={(e) => setNewCondition(prev => ({ ...prev, condition: e.target.value }))}
                      required
                      style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                    />
                    <input
                      type="text"
                      placeholder="Treating Doctor"
                      value={newCondition.treatingDoctor}
                      onChange={(e) => setNewCondition(prev => ({ ...prev, treatingDoctor: e.target.value }))}
                      style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                    />
                    <input
                      type="date"
                      value={newCondition.diagnosisDate}
                      onChange={(e) => setNewCondition(prev => ({ ...prev, diagnosisDate: e.target.value }))}
                      style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                    />
                    <textarea
                      placeholder="Notes or dosage requirements..."
                      value={newCondition.notes}
                      onChange={(e) => setNewCondition(prev => ({ ...prev, notes: e.target.value }))}
                      style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', resize: 'vertical', minHeight: '60px' }}
                    />
                    <button type="submit" style={{ padding: '8px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                      Add to Medical Record
                    </button>
                  </form>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(customer.chronicConditions || []).length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '13px', background: '#f8fafc', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                      No chronic conditions registered for patient.
                    </div>
                  ) : (
                    customer.chronicConditions.map((cond, idx) => (
                      <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '14px' }}>{cond.condition}</span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {cond.diagnosisDate ? `Diagnosed: ${new Date(cond.diagnosisDate).toLocaleDateString()}` : 'Date unrecorded'}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569' }}>
                          <strong>Doctor:</strong> {cond.treatingDoctor || 'N/A'}
                        </div>
                        {cond.notes && (
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', fontStyle: 'italic' }}>
                            "{cond.notes}"
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Prescriptions */}
            <div>
              <h4 style={{ color: '#1e293b', marginBottom: '10px' }}>Linked Doctor Prescriptions</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Rx Code</th>
                      <th style={{ padding: '8px' }}>Doctor Name</th>
                      <th style={{ padding: '8px' }}>Rx Date</th>
                      <th style={{ padding: '8px' }}>Expiry Date</th>
                      <th style={{ padding: '8px' }}>Medicines Prescribed</th>
                      <th style={{ padding: '8px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prescriptions.length === 0 ? (
                      <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No prescription files linked to customer profile.</td></tr>
                    ) : (
                      prescriptions.map((rx) => (
                        <tr key={rx._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px', fontWeight: 'bold', color: '#0f172a' }}>{rx.prescriptionNumber}</td>
                          <td style={{ padding: '8px' }}>{rx.doctorName} (Reg: {rx.doctorRegistrationNumber})</td>
                          <td style={{ padding: '8px' }}>{new Date(rx.prescriptionDate).toLocaleDateString()}</td>
                          <td style={{ padding: '8px' }}>{new Date(rx.expiryDate).toLocaleDateString()}</td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {rx.medicines.map((m, i) => (
                                <span key={i} style={{ fontSize: '11px', color: '#475569' }}>
                                  - {m.medicineName} (Allowed: {m.quantityAllowed}, Rem: {m.quantityRemaining})
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '8px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              background: rx.status === 'Approved' ? '#dcfce7' : rx.status === 'Pending' ? '#fef3c7' : '#fee2e2',
                              color: rx.status === 'Approved' ? '#15803d' : rx.status === 'Pending' ? '#b45309' : '#b91c1c'
                            }}>
                              {rx.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default CustomerDetails;
