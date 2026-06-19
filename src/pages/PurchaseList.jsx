import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FiPlus, 
  FiFileText, 
  FiAlertCircle, 
  FiCalendar, 
  FiDollarSign, 
  FiSearch, 
  FiRefreshCw, 
  FiEye, 
  FiTrash2, 
  FiUploadCloud, 
  FiDownload, 
  FiX 
} from 'react-icons/fi';
import { purchaseAPI, agencyAPI } from '../services/api';
import '../styles/PurchaseList.css';

const PurchaseList = () => {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [stats, setStats] = useState({
    totalOutstanding: 0,
    overdueBills: 0,
    billsDueThisWeek: 0,
    totalAgencyBalance: 0
  });
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  // CSV Modal State
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvError, setCsvError] = useState('');
  const [csvTargetAgency, setCsvTargetAgency] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchAgencies();
    fetchStats();
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [page, status, agencyId]);

  const fetchAgencies = async () => {
    try {
      const data = await agencyAPI.getAgencies({ limit: 100 });
      if (data.success) {
        setAgencies(data.agencies || []);
      }
    } catch (err) {
      console.error('Error fetching agencies list:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await purchaseAPI.getStats();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        search,
        status,
        agencyId
      };
      const data = await purchaseAPI.getPurchases(params);
      if (data.success) {
        setPurchases(data.purchases || []);
        setPages(data.pages || 1);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Error fetching purchases:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchPurchases();
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatus('');
    setAgencyId('');
    setPage(1);
    // Directly fetch because useEffect triggers depend on status/agencyId
    // If they were already empty, fetch manually
    if (!status && !agencyId && !search) {
      fetchPurchases();
    }
  };

  const handleDeletePurchase = async (id) => {
    if (window.confirm('Are you sure you want to delete/cancel this purchase invoice? Posted inventory quantities will be rolled back.')) {
      try {
        const res = await purchaseAPI.deletePurchase(id);
        if (res.success) {
          alert(res.message || 'Purchase deleted successfully');
          fetchPurchases();
          fetchStats();
        }
      } catch (err) {
        alert(err.response?.data?.message || 'Error deleting purchase invoice');
      }
    }
  };

  // CSV Import parser
  const handleCsvFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        setCsvError('Please select a valid CSV file');
        setCsvFile(null);
        return;
      }
      setCsvFile(file);
      setCsvError('');
    }
  };

  const handleCsvImportSubmit = async () => {
    if (!csvTargetAgency) {
      setCsvError('Please select a supplier agency for the imported bill');
      return;
    }
    if (!csvFile) {
      setCsvError('Please select a CSV file to import');
      return;
    }

    setImporting(true);
    setCsvError('');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        // Simple manual CSV parser
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length < 2) {
          throw new Error('CSV file must contain a header row and at least one item row');
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        const items = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
          if (values.length < headers.length) continue;

          const item = {};
          headers.forEach((header, index) => {
            item[header] = values[index];
          });
          items.push(item);
        }

        // Validate items structure
        const requiredFields = ['medicineName', 'batchNumber', 'quantity', 'purchasePrice', 'gstPercentage'];
        const firstItem = items[0];
        const missing = requiredFields.filter(field => !(field in firstItem));
        if (missing.length > 0) {
          throw new Error(`Invalid CSV template headers. Missing fields: ${missing.join(', ')}`);
        }

        // Send payload to backend
        const importPayload = {
          agencyId: csvTargetAgency,
          invoiceNumber: `IMP-${Date.now().toString().slice(-6)}`,
          invoiceDate: new Date(),
          purchaseDate: new Date(),
          items
        };

        const res = await purchaseAPI.importExcel(importPayload);
        if (res.success) {
          alert('Purchase draft imported successfully!');
          setShowCsvModal(false);
          setCsvFile(null);
          setCsvTargetAgency('');
          fetchPurchases();
          fetchStats();
        }
      } catch (err) {
        console.error(err);
        setCsvError(err.message || err.response?.data?.message || 'Failed to parse and import CSV file');
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(csvFile);
  };

  return (
    <div className="purchase-list-container">
      {/* Title Header */}
      <div className="purchase-actions-bar">
        <div className="purchase-title-area">
          <h2>Purchase Management</h2>
          <p>Manage supplier invoices, purchase returns, supplier payments, and batch intakes.</p>
        </div>
        <div className="purchase-buttons-wrapper">
          <button className="btn-secondary-action" onClick={() => setShowCsvModal(true)}>
            <FiUploadCloud /> Import CSV Draft
          </button>
          <button className="btn-primary-action" onClick={() => navigate('/purchases/add')}>
            <FiPlus /> New Purchase Bill
          </button>
        </div>
      </div>

      {/* Credit stats dashboard cards */}
      <div className="purchase-stats-grid">
        <div className="purchase-stat-card card-outstanding">
          <div className="stat-details">
            <span className="stat-label">Total Outstanding</span>
            <span className="stat-num">₹{stats.totalOutstanding?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="stat-icon">
            <FiDollarSign />
          </div>
        </div>

        <div className="purchase-stat-card card-overdue">
          <div className="stat-details">
            <span className="stat-label">Overdue Bills</span>
            <span className="stat-num">₹{stats.overdueBills?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="stat-icon">
            <FiAlertCircle />
          </div>
        </div>

        <div className="purchase-stat-card card-due-week">
          <div className="stat-details">
            <span className="stat-label">Due This Week</span>
            <span className="stat-num">₹{stats.billsDueThisWeek?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="stat-icon">
            <FiCalendar />
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <form onSubmit={handleSearchSubmit} className="filters-container">
        <div className="filter-item">
          <label>Search Invoice</label>
          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              placeholder="Search Pur No / Inv No..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px', width: '100%' }}
            />
            <FiSearch style={{ position: 'absolute', left: '12px', top: '14px', color: '#94A3B8' }} />
          </div>
        </div>

        <div className="filter-item">
          <label>Supplier Agency</label>
          <select value={agencyId} onChange={(e) => setAgencyId(e.target.value)}>
            <option value="">All Agencies</option>
            {agencies.map(a => (
              <option key={a._id} value={a._id}>{a.agencyName}</option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Posted">Posted</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button type="submit" className="btn-primary-action" style={{ justifyContent: 'center', height: '42px' }}>
            Search
          </button>
          <button type="button" onClick={handleResetFilters} className="btn-reset-filters">
            <FiRefreshCw /> Reset
          </button>
        </div>
      </form>

      {/* Purchase Table Card */}
      <div className="purchase-table-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
            <FiRefreshCw className="spin" style={{ fontSize: '24px', marginBottom: '8px' }} />
            <p>Loading purchase invoices...</p>
          </div>
        ) : purchases.length === 0 ? (
          <div className="empty-purchase-state">
            <FiFileText className="empty-purchase-icon" />
            <h3>No Purchases Found</h3>
            <p>There are no purchase invoices matching your search parameters. Click below to add one.</p>
            <button className="btn-primary-action" onClick={() => navigate('/purchases/add')}>
              <FiPlus /> Record First Purchase
            </button>
          </div>
        ) : (
          <>
            <div className="purchase-table-wrapper">
              <table className="purchase-table">
                <thead>
                  <tr>
                    <th>Pur No</th>
                    <th>Inv No</th>
                    <th>Date</th>
                    <th>Supplier Agency</th>
                    <th>Grand Total</th>
                    <th>Paid Amount</th>
                    <th>Pending</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p._id}>
                      <td style={{ fontWeight: '600' }}>{p.purchaseNumber}</td>
                      <td>{p.invoiceNumber}</td>
                      <td>{new Date(p.purchaseDate).toLocaleDateString()}</td>
                      <td style={{ fontWeight: '500' }}>{p.agencyId?.agencyName || 'N/A'}</td>
                      <td style={{ fontWeight: '700' }}>₹{p.grandTotal?.toFixed(2)}</td>
                      <td style={{ color: '#16A34A', fontWeight: '600' }}>₹{p.paidAmount?.toFixed(2)}</td>
                      <td style={{ color: p.pendingAmount > 0 ? '#DC2626' : '#16A34A', fontWeight: '600' }}>
                        ₹{p.pendingAmount?.toFixed(2)}
                      </td>
                      <td>
                        <span className={`status-pill ${p.purchaseStatus?.toLowerCase()}`}>
                          {p.purchaseStatus}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            className="btn-view-details" 
                            title="View / Post Purchase"
                            onClick={() => navigate(`/purchases/${p._id}`)}
                          >
                            <FiEye />
                          </button>
                          {p.purchaseStatus !== 'Cancelled' && (
                            <button 
                              className="btn-view-details" 
                              title="Delete/Revert Invoice"
                              onClick={() => handleDeletePurchase(p._id)}
                              style={{ color: '#DC2626' }}
                            >
                              <FiTrash2 />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pagination-container">
              <span className="pagination-info">
                Showing {purchases.length} of {total} purchase invoices
              </span>
              <div className="pagination-controls">
                <button 
                  className="btn-pagination" 
                  disabled={page === 1}
                  onClick={() => setPage(prev => prev - 1)}
                >
                  Previous
                </button>
                <button 
                  className="btn-pagination" 
                  disabled={page === pages}
                  onClick={() => setPage(prev => prev + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* CSV Template Modal */}
      {showCsvModal && (
        <div className="csv-modal-backdrop" onClick={() => setShowCsvModal(false)}>
          <div className="csv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="csv-modal-header">
              <h3>Bulk Import Draft Purchase Bill</h3>
              <button className="csv-modal-close" onClick={() => setShowCsvModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="csv-modal-body">
              <p style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.5' }}>
                Upload a structured CSV file containing medicine items to populate a draft purchase invoice instantly. 
                Matches medicines by name.
              </p>

              <div className="filter-item">
                <label>Select Supplier Agency *</label>
                <select 
                  value={csvTargetAgency} 
                  onChange={(e) => setCsvTargetAgency(e.target.value)}
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  <option value="">-- Choose Agency --</option>
                  {agencies.map(a => (
                    <option key={a._id} value={a._id}>{a.agencyName}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748B' }}>CSV File *</span>
                <a 
                  href="#" 
                  className="csv-template-link"
                  onClick={(e) => {
                    e.preventDefault();
                    // Download sample CSV template
                    const templateContent = "medicineName,batchNumber,manufacturingDate,expiryDate,quantity,freeQuantity,purchasePrice,sellingPrice,mrp,gstPercentage\nParacetamol 500mg,BAT-TEMPL-01,2026-01-01,2027-12-31,100,10,12.50,15.00,18.00,12\nOkacet,BAT-TEMPL-02,2026-02-15,2028-02-15,50,0,15.00,18.00,22.00,12";
                    const blob = new Blob([templateContent], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'purchase_import_template.csv';
                    link.click();
                  }}
                >
                  <FiDownload /> Download CSV Template
                </a>
              </div>

              <label className="csv-dropzone">
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleCsvFileChange} 
                  style={{ display: 'none' }}
                />
                <FiUploadCloud className="csv-dropzone-icon" />
                <span className="csv-dropzone-text">
                  {csvFile ? csvFile.name : "Click to browse and upload CSV file"}
                </span>
              </label>

              {csvFile && (
                <div className="csv-file-selected">
                  <span>Selected file: <strong>{csvFile.name}</strong> ({(csvFile.size / 1024).toFixed(2)} KB)</span>
                </div>
              )}

              {csvError && (
                <div style={{ color: '#DC2626', fontSize: '13px', fontWeight: '600' }}>
                  {csvError}
                </div>
              )}
            </div>
            <div className="csv-modal-footer">
              <button 
                className="btn-secondary-action" 
                onClick={() => setShowCsvModal(false)}
                disabled={importing}
              >
                Cancel
              </button>
              <button 
                className="btn-primary-action" 
                onClick={handleCsvImportSubmit}
                disabled={importing || !csvFile || !csvTargetAgency}
              >
                {importing ? "Importing..." : "Process Bulk Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseList;
