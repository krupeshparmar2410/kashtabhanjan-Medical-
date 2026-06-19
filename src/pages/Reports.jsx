import React, { useState, useEffect } from 'react';
import { saleAPI, customerAPI, complianceAPI } from '../services/api';

const Reports = () => {
  const [reportType, setReportType] = useState('sales'); // sales, product, customer, gst, profit, returns
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [customersList, setCustomersList] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [counter, setCounter] = useState('');
  
  const [reportsData, setReportsData] = useState([]);
  const [reportHeaders, setReportHeaders] = useState([]);
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    // Load registered customers for report filters
    const loadFilters = async () => {
      try {
        const res = await customerAPI.getCustomers({ limit: 100 });
        if (res.success) setCustomersList(res.customers);
      } catch (err) {
        console.log(err.message);
      }
    };
    loadFilters();
  }, []);

  const handleGenerateReport = async () => {
    setError('');
    setSuccess('');
    try {
      const isComplianceReport = ['ScheduleH', 'ScheduleH1', 'ScheduleX', 'Usage', 'Expired', 'Reminders'].includes(reportType);
      
      if (isComplianceReport) {
        const res = await complianceAPI.getReports({
          reportType,
          startDate,
          endDate,
          customerId: selectedCustomerId
        });
        if (res.success) {
          setReportsData(res.data);
          setReportHeaders(res.headers);
        }
      } else {
        const params = {
          startDate,
          endDate,
          customerId: selectedCustomerId,
          counter
        };
        const res = await saleAPI.getReport(params);
        if (res.success) {
          setReportsData(res.reports);
          setReportHeaders([]);
        }
      }
    } catch (err) {
      setError('Failed to compile report details');
    }
  };

  const handleExportCSV = (formatType = 'csv') => {
    const token = localStorage.getItem('token');
    const isComplianceReport = ['ScheduleH', 'ScheduleH1', 'ScheduleX', 'Usage', 'Expired', 'Reminders'].includes(reportType);
    
    const params = new URLSearchParams({
      startDate,
      endDate,
      customerId: selectedCustomerId,
      reportType,
      format: formatType
    }).toString();
    
    if (isComplianceReport) {
      window.open(`/api/compliance/reports?${params}&Authorization=Bearer ${token}`, '_blank');
    } else {
      window.open(`/api/sales/reports?${params}&Authorization=Bearer ${token}`, '_blank');
    }
    setSuccess(`Export report document download initiated (${formatType.toUpperCase()}).`);
  };

  const printReport = () => {
    window.print();
  };

  // Calculations for report highlights
  const totalSalesVolume = reportsData.reduce((sum, r) => sum + r.grandTotal, 0);
  const totalProfitVolume = reportsData.reduce((sum, r) => sum + (r.calculatedProfit || 0), 0);
  const totalTaxCollected = reportsData.reduce((sum, r) => sum + r.gstAmount, 0);

  return (
    <div className="card-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* Dynamic filters box */}
      <div className="form-card" style={{ maxWidth: '100%', padding: '20px' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Interactive Reports Console</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
          <div>
            <label className="form-label">Report Category</label>
            <select className="form-input" value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="sales">Sales Ledger Journal</option>
              <option value="gst">GST Tax Statement</option>
              <option value="profit">Revenues & Profit Report</option>
              <option value="ScheduleH">Schedule H Sales Report</option>
              <option value="ScheduleH1">Schedule H1 Sales Report</option>
              <option value="ScheduleX">Schedule X Sales Report</option>
              <option value="Usage">Prescription Usage Report</option>
              <option value="Expired">Expired Prescription Report</option>
              <option value="Reminders">Refill Reminder Report</option>
            </select>
          </div>
          <div>
            <label className="form-label">Start Date</label>
            <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="form-label">End Date</label>
            <input type="date" className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Customer Profile</label>
            <select className="form-input" value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
              <option value="">All Profiles</option>
              {customersList.map(c => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Cash Counter</label>
            <select className="form-input" value={counter} onChange={(e) => setCounter(e.target.value)}>
              <option value="">All Counters</option>
              <option value="Counter-1">Counter-1</option>
              <option value="Counter-2">Counter-2</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={printReport}>Print Report</button>
          <button className="btn btn-secondary" style={{ color: '#1d4ed8', border: '1px solid #bfdbfe' }} onClick={() => handleExportCSV('csv')}>Export CSV</button>
          <button className="btn btn-secondary" style={{ color: '#15803d', border: '1px solid #bbf7d0' }} onClick={() => handleExportCSV('excel')}>Export Excel</button>
          <button className="btn btn-secondary" style={{ color: '#b91c1c', border: '1px solid #fecaca' }} onClick={() => handleExportCSV('pdf')}>Export PDF</button>
          <button className="btn btn-primary" style={{ background: '#0d9488', border: 'none' }} onClick={handleGenerateReport}>Compile Data Grid</button>
        </div>
      </div>

      {/* Aggregate metrics for the generated reports */}
      {reportsData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <div className="form-card" style={{ maxWidth: '100%', padding: '16px', background: '#f8fafc' }}>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Period Sales Volume</span>
            <h2 style={{ margin: '6px 0 0 0', color: '#0f172a' }}>₹{totalSalesVolume.toFixed(2)}</h2>
          </div>
          <div className="form-card" style={{ maxWidth: '100%', padding: '16px', background: '#f8fafc' }}>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Acquired Gross Profits</span>
            <h2 style={{ margin: '6px 0 0 0', color: '#0d9488' }}>₹{totalProfitVolume.toFixed(2)}</h2>
          </div>
          <div className="form-card" style={{ maxWidth: '100%', padding: '16px', background: '#f8fafc' }}>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>GST Taxes Accounted</span>
            <h2 style={{ margin: '6px 0 0 0', color: '#6366f1' }}>₹{totalTaxCollected.toFixed(2)}</h2>
          </div>
        </div>
      )}

      {/* Report results grid */}
      <div className="form-card" style={{ maxWidth: '100%', padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>Compiled Reports Statement</h3>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#475569', textAlign: 'left' }}>
                {reportHeaders.length > 0 ? (
                  reportHeaders.map((h, i) => <th key={i} style={{ padding: '10px' }}>{h}</th>)
                ) : (
                  <>
                    <th style={{ padding: '10px' }}>Invoice #</th>
                    <th style={{ padding: '10px' }}>Billing Date</th>
                    <th style={{ padding: '10px' }}>Customer Name</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Subtotal</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>GST Tax</th>
                    {reportType === 'profit' && <th style={{ padding: '10px', textAlign: 'right' }}>Acquisition Cost</th>}
                    <th style={{ padding: '10px', textAlign: 'right' }}>Grand Total</th>
                    {reportType === 'profit' && <th style={{ padding: '10px', textAlign: 'right' }}>Billed Profit</th>}
                    <th style={{ padding: '10px' }}>Payment Mode</th>
                    <th style={{ padding: '10px' }}>Status</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {reportsData.length === 0 ? (
                <tr>
                  <td colSpan={reportHeaders.length > 0 ? reportHeaders.length : (reportType === 'profit' ? 10 : 8)} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                    No report records compiled yet. Select filters and click Compile.
                  </td>
                </tr>
              ) : (
                reportsData.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    {reportHeaders.length > 0 ? (
                      row.map((cell, cIdx) => (
                        <td key={cIdx} style={{ padding: '10px' }}>
                          {String(cell)}
                        </td>
                      ))
                    ) : (
                      <>
                        <td style={{ padding: '10px', fontWeight: 600 }}>{row.invoiceNumber}</td>
                        <td style={{ padding: '10px' }}>{new Date(row.saleDate).toLocaleDateString()}</td>
                        <td style={{ padding: '10px' }}>{row.customerName}</td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>₹{row.subtotal.toFixed(2)}</td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>₹{row.gstAmount.toFixed(2)}</td>
                        {reportType === 'profit' && (
                          <td style={{ padding: '10px', textAlign: 'right', color: '#64748b' }}>
                            ₹{(row.grandTotal - row.calculatedProfit).toFixed(2)}
                          </td>
                        )}
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>₹{row.grandTotal.toFixed(2)}</td>
                        {reportType === 'profit' && (
                          <td style={{ padding: '10px', textAlign: 'right', color: '#0d9488', fontWeight: 'bold' }}>
                            ₹{row.calculatedProfit.toFixed(2)}
                          </td>
                        )}
                        <td style={{ padding: '10px' }}>{row.paymentMethod}</td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            background: row.invoiceStatus === 'Completed' ? '#dcfce7' : '#fee2e2',
                            color: row.invoiceStatus === 'Completed' ? '#15803d' : '#b91c1c'
                          }}>
                            {row.invoiceStatus}
                          </span>
                        </td>
                      </>
                    )}
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

export default Reports;
