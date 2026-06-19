import React, { useState, useEffect } from 'react';
import { 
  FiAlertTriangle, 
  FiTrendingUp, 
  FiDatabase, 
  FiLock, 
  FiUnlock, 
  FiActivity, 
  FiDollarSign, 
  FiRefreshCw, 
  FiPercent, 
  FiFileText, 
  FiEdit, 
  FiTrash2, 
  FiCheckCircle, 
  FiSearch,
  FiX 
} from 'react-icons/fi';
import { inventoryAPI, purchaseAPI } from '../services/api';
import '../styles/InventoryDashboard.css';
import '../styles/PurchaseList.css'; // Reuse button and filters css styling

const InventoryDashboard = () => {
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory', 'low-stock', 'expiry', 'gst', 'activities', 'valuation'
  const [batches, setBatches] = useState([]);
  const [activities, setActivities] = useState([]);
  const [valuation, setValuation] = useState({ summary: null, details: [] });
  const [gstSummary, setGstSummary] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [alerts, setAlerts] = useState({
    counts: { lowStock: 0, nearExpiry: 0, expired: 0 },
    lists: { lowStock: [], nearExpiry: [], expired: [] }
  });

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLockedFilter, setIsLockedFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [totalBatches, setTotalBatches] = useState(0);

  // Sub tab for Expiry Alert view
  const [expirySubTab, setExpirySubTab] = useState('expired'); // 'expired', 'near-expiry'

  // Modal Dialogs
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showDisposeModal, setShowDisposeModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  
  const [selectedBatch, setSelectedBatch] = useState(null);
  
  // Form values
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('Physical Count Difference');
  const [adjustNotes, setAdjustNotes] = useState('');
  
  const [disposeQty, setDisposeQty] = useState('');
  const [disposeReason, setDisposeReason] = useState('Damaged');
  const [disposeNotes, setDisposeNotes] = useState('');
  
  const [lockState, setLockState] = useState(false);
  const [lockReasonText, setLockReasonText] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAlertsData();
  }, []);

  useEffect(() => {
    if (activeTab === 'inventory') {
      fetchBatches();
    } else if (activeTab === 'activities') {
      fetchActivities();
    } else if (activeTab === 'valuation') {
      fetchValuationData();
      fetchSnapshots();
    } else if (activeTab === 'gst') {
      fetchGSTSummary();
    }
  }, [activeTab, page, statusFilter, isLockedFilter]);

  const fetchAlertsData = async () => {
    try {
      const data = await inventoryAPI.getReports();
      if (data.success) {
        setAlerts(data);
      }
    } catch (err) {
      console.error('Error fetching alerts counts:', err);
    }
  };

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        search,
        status: statusFilter
      };
      if (isLockedFilter !== '') {
        params.isLocked = isLockedFilter;
      }
      const data = await inventoryAPI.getBatches(params);
      if (data.success) {
        setBatches(data.batches || []);
        setPages(data.pages || 1);
        setTotalBatches(data.total || 0);
      }
    } catch (err) {
      console.error('Error fetching batches:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const data = await inventoryAPI.getActivities();
      if (data.success) {
        setActivities(data.activities || []);
      }
    } catch (err) {
      console.error('Error loading activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchValuationData = async () => {
    try {
      const data = await inventoryAPI.getValuation();
      if (data.success) {
        setValuation(data);
      }
    } catch (err) {
      console.error('Error calculating valuations:', err);
    }
  };

  const fetchSnapshots = async () => {
    try {
      const data = await inventoryAPI.getSnapshots();
      if (data.success) {
        setSnapshots(data.snapshots || []);
      }
    } catch (err) {
      console.error('Error loading snapshots:', err);
    }
  };

  const fetchGSTSummary = async () => {
    try {
      const data = await purchaseAPI.getGSTSummary();
      if (data.success) {
        setGstSummary(data.summary || []);
      }
    } catch (err) {
      console.error('Error loading GST summary:', err);
    }
  };

  const handleTakeSnapshot = async () => {
    try {
      const res = await inventoryAPI.takeSnapshot();
      if (res.success) {
        alert('Daily inventory valuation snapshot taken successfully!');
        fetchSnapshots();
        fetchValuationData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Daily snapshot already recorded for today');
    }
  };

  // Lock toggler modal opening
  const handleOpenLockModal = (batch) => {
    setSelectedBatch(batch);
    setLockState(!batch.isLocked);
    setLockReasonText(batch.lockReason || '');
    setShowLockModal(true);
  };

  const handleProcessLockToggle = async () => {
    if (lockState && !lockReasonText) {
      alert('Please provide a reason for locking this batch');
      return;
    }

    try {
      const res = await inventoryAPI.toggleLock(selectedBatch._id, {
        isLocked: lockState,
        lockReason: lockState ? lockReasonText : ''
      });
      if (res.success) {
        alert(lockState ? 'Batch locked successfully!' : 'Batch unlocked successfully!');
        setShowLockModal(false);
        fetchBatches();
        fetchAlertsData();
      }
    } catch (err) {
      alert('Error updating batch lock status');
    }
  };

  // Adjustments modal opening
  const handleOpenAdjustModal = (batch) => {
    setSelectedBatch(batch);
    setAdjustQty(batch.availableQuantity);
    setAdjustReason('Physical Count Difference');
    setAdjustNotes('');
    setShowAdjustModal(true);
  };

  const handleProcessAdjustment = async () => {
    if (adjustQty === '' || Number(adjustQty) < 0) {
      alert('Please enter a valid stock quantity');
      return;
    }

    try {
      const res = await inventoryAPI.adjustStock({
        inventoryBatchId: selectedBatch._id,
        newQuantity: parseInt(adjustQty, 10),
        reason: adjustReason,
        notes: adjustNotes
      });
      if (res.success) {
        alert(res.message || 'Stock adjusted successfully');
        setShowAdjustModal(false);
        fetchBatches();
        fetchAlertsData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Error processing adjustment');
    }
  };

  // Disposals modal opening
  const handleOpenDisposeModal = (batch) => {
    setSelectedBatch(batch);
    setDisposeQty('');
    setDisposeReason('Damaged');
    setDisposeNotes('');
    setShowDisposeModal(true);
  };

  const handleProcessDisposal = async () => {
    const qty = parseInt(disposeQty, 10) || 0;
    if (qty <= 0) {
      alert('Please enter a valid disposal quantity');
      return;
    }
    if (qty > selectedBatch.availableQuantity) {
      alert(`Cannot dispose more than the available batch stock (${selectedBatch.availableQuantity} units)`);
      return;
    }

    try {
      const res = await inventoryAPI.disposeStock({
        inventoryBatchId: selectedBatch._id,
        quantity: qty,
        reason: disposeReason,
        notes: disposeNotes
      });
      if (res.success) {
        alert('Stock write-off disposal processed successfully');
        setShowDisposeModal(false);
        fetchBatches();
        fetchAlertsData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Error processing write-off');
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchBatches();
  };

  return (
    <div className="inventory-dashboard-container">
      {/* Title Header */}
      <div className="inventory-header">
        <div>
          <h2>Inventory & Expiry Control</h2>
          <p>Physical batch adjustments, smart FEFO monitoring, stock write-offs, and valuation audits.</p>
        </div>
        <div>
          {activeTab === 'valuation' && (
            <button className="btn-primary-action" onClick={handleTakeSnapshot}>
              <FiTrendingUp /> Take Valuation Snapshot
            </button>
          )}
        </div>
      </div>

      {/* Tabs list */}
      <div className="inventory-tabs-bar">
        <button 
          className={`inventory-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => { setActiveTab('inventory'); setPage(1); }}
        >
          <FiDatabase style={{ marginRight: '6px' }} /> Master Batches
        </button>
        <button 
          className={`inventory-tab-btn ${activeTab === 'low-stock' ? 'active' : ''}`}
          onClick={() => setActiveTab('low-stock')}
        >
          <FiAlertTriangle style={{ marginRight: '6px' }} /> Low Stock Limits
          {alerts.counts?.lowStock > 0 && (
            <span className="alert-badge warning">{alerts.counts.lowStock}</span>
          )}
        </button>
        <button 
          className={`inventory-tab-btn ${activeTab === 'expiry' ? 'active' : ''}`}
          onClick={() => setActiveTab('expiry')}
        >
          <FiAlertTriangle style={{ marginRight: '6px' }} /> Expiry Warnings
          {alerts.counts?.expired + alerts.counts?.nearExpiry > 0 && (
            <span className="alert-badge">{alerts.counts.expired + alerts.counts.nearExpiry}</span>
          )}
        </button>
        <button 
          className={`inventory-tab-btn ${activeTab === 'gst' ? 'active' : ''}`}
          onClick={() => setActiveTab('gst')}
        >
          <FiPercent style={{ marginRight: '6px' }} /> GST ITC Summaries
        </button>
        <button 
          className={`inventory-tab-btn ${activeTab === 'activities' ? 'active' : ''}`}
          onClick={() => setActiveTab('activities')}
        >
          <FiActivity style={{ marginRight: '6px' }} /> Audits Activities
        </button>
        <button 
          className={`inventory-tab-btn ${activeTab === 'valuation' ? 'active' : ''}`}
          onClick={() => setActiveTab('valuation')}
        >
          <FiDollarSign style={{ marginRight: '6px' }} /> Valuation Trends
        </button>
      </div>

      {/* Tab Panels */}
      
      {/* 1. Master Inventory Batches */}
      {activeTab === 'inventory' && (
        <div className="inventory-tab-content">
          <form onSubmit={handleSearchSubmit} className="filters-container" style={{ padding: 0, border: 'none', boxShadow: 'none' }}>
            <div className="filter-item">
              <label>Search Batch</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="text" 
                  placeholder="Search Batch No / Medicine..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: '36px', width: '100%' }}
                />
                <FiSearch style={{ position: 'absolute', left: '12px', top: '14px', color: '#94A3B8' }} />
              </div>
            </div>

            <div className="filter-item">
              <label>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Batches</option>
                <option value="Active">Active</option>
                <option value="Near Expiry">Near Expiry</option>
                <option value="Expired">Expired</option>
                <option value="Sold Out">Sold Out</option>
              </select>
            </div>

            <div className="filter-item">
              <label>Sale Lock State</label>
              <select value={isLockedFilter} onChange={(e) => setIsLockedFilter(e.target.value)}>
                <option value="">All States</option>
                <option value="true">Locked</option>
                <option value="false">Unlocked</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button type="submit" className="btn-primary-action" style={{ justifyContent: 'center', height: '42px' }}>
                Search
              </button>
              <button 
                type="button" 
                onClick={() => { setSearch(''); setStatusFilter(''); setIsLockedFilter(''); setPage(1); fetchBatches(); }} 
                className="btn-reset-filters"
              >
                <FiRefreshCw /> Reset
              </button>
            </div>
          </form>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
              <p>Loading master batches inventory...</p>
            </div>
          ) : batches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
              <p>No batches found matching filter criteria.</p>
            </div>
          ) : (
            <>
              <div className="purchase-table-wrapper">
                <table className="purchase-table">
                  <thead>
                    <tr>
                      <th>Batch Code</th>
                      <th>Medicine Name</th>
                      <th>Batch No</th>
                      <th>Mfg Date</th>
                      <th>Expiry Date</th>
                      <th>Stock Status</th>
                      <th>Available</th>
                      <th>Valuation MRP</th>
                      <th>Billing Lock</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map(b => (
                      <tr key={b._id} style={{ opacity: b.isLocked ? 0.75 : 1 }}>
                        <td style={{ fontWeight: '700' }}><code>{b.batchCode}</code></td>
                        <td style={{ fontWeight: '600' }}>{b.medicineId?.medicineName}</td>
                        <td><code>{b.batchNumber}</code></td>
                        <td>{new Date(b.manufacturingDate).toLocaleDateString()}</td>
                        <td style={{ fontWeight: '500' }}>
                          {new Date(b.expiryDate).toLocaleDateString()}
                        </td>
                        <td>
                          <span className={`status-pill ${b.status?.toLowerCase().replace(' ', '-')}`}>
                            {b.status}
                          </span>
                        </td>
                        <td style={{ fontWeight: '700' }}>
                          {b.availableQuantity} units 
                          {b.reservedQuantity > 0 && (
                            <span style={{ fontSize: '11px', color: '#8B5CF6', display: 'block', fontWeight: '500' }}>
                              ({b.reservedQuantity} Reserved)
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: '600' }}>₹{(b.availableQuantity * b.mrp).toFixed(2)}</td>
                        <td>
                          <button 
                            className={`btn-view-details`}
                            style={{ color: b.isLocked ? '#DC2626' : '#16A34A' }}
                            title={b.isLocked ? "Unlock Batch" : "Lock Batch for Sales"}
                            onClick={() => handleOpenLockModal(b)}
                          >
                            {b.isLocked ? <FiLock /> : <FiUnlock />}
                          </button>
                          {b.isLocked && (
                            <div className="lock-reason-tooltip">Reason: {b.lockReason || 'Locked'}</div>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button 
                              className="btn-view-details" 
                              title="Audit Adjust Qty"
                              onClick={() => handleOpenAdjustModal(b)}
                            >
                              <FiEdit />
                            </button>
                            {b.availableQuantity > 0 && (
                              <button 
                                className="btn-view-details" 
                                title="Write-off / Dispose Stock"
                                onClick={() => handleOpenDisposeModal(b)}
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
              <div className="pagination-container" style={{ border: 'none', padding: '10px 0 0 0' }}>
                <span className="pagination-info">Showing {batches.length} of {totalBatches} inventory batches</span>
                <div className="pagination-controls">
                  <button className="btn-pagination" disabled={page === 1} onClick={() => setPage(prev => prev - 1)}>Previous</button>
                  <button className="btn-pagination" disabled={page === pages} onClick={() => setPage(prev => prev + 1)}>Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 2. Low Stock Alerts */}
      {activeTab === 'low-stock' && (
        <div className="inventory-tab-content">
          <div className="purchase-title-area" style={{ marginBottom: '12px' }}>
            <h3>Medicines Running Below Safety Threshold</h3>
            <p>Ensure these items are reordered from suppliers to prevent stockout disruptions.</p>
          </div>

          {alerts.lists?.lowStock?.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#16A34A', fontWeight: '600' }}>
              <FiCheckCircle style={{ fontSize: '30px', marginBottom: '8px' }} />
              <p>All safety stock levels are currently compliant! No low stock warnings.</p>
            </div>
          ) : (
            <div className="purchase-table-wrapper">
              <table className="purchase-table">
                <thead>
                  <tr>
                    <th>Medicine Code</th>
                    <th>Medicine Name</th>
                    <th>Supplier Agency</th>
                    <th>Threshold Limit</th>
                    <th>Current Total Stock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.lists.lowStock.map(m => (
                    <tr key={m._id}>
                      <td style={{ fontWeight: '700' }}>{m.medicineCode}</td>
                      <td style={{ fontWeight: '600' }}>{m.medicineName}</td>
                      <td>{m.agencyId?.agencyName || 'N/A'}</td>
                      <td style={{ fontWeight: '500' }}>{m.minimumStockLevel} units</td>
                      <td style={{ color: '#DC2626', fontWeight: '700' }}>{m.currentStock} units</td>
                      <td>
                        <span className="status-pill cancelled">
                          {m.currentStock === 0 ? "Out of Stock" : "Low Stock Alert"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. Expiry Warnings */}
      {activeTab === 'expiry' && (
        <div className="inventory-tab-content">
          {/* Sub Tab Controls */}
          <div className="sub-tabs-bar">
            <button 
              className={`sub-tab-btn ${expirySubTab === 'expired' ? 'active' : ''}`}
              onClick={() => setExpirySubTab('expired')}
            >
              Expired Stock ({alerts.counts?.expired || 0})
            </button>
            <button 
              className={`sub-tab-btn ${expirySubTab === 'near-expiry' ? 'active' : ''}`}
              onClick={() => setExpirySubTab('near-expiry')}
            >
              Near Expiry Stock ({alerts.counts?.nearExpiry || 0})
            </button>
          </div>

          {expirySubTab === 'expired' ? (
            <>
              <div className="purchase-title-area" style={{ marginBottom: '10px' }}>
                <h3>Expired Batches (Blocked from Selling)</h3>
                <p>These batches have expired and are permanently locked. Dispose of them using the write-off controls.</p>
              </div>

              {alerts.lists?.expired?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#16A34A', fontWeight: '600' }}>
                  <FiCheckCircle style={{ fontSize: '30px', marginBottom: '8px' }} />
                  <p>Great! There is no expired medicine batch in the inventory.</p>
                </div>
              ) : (
                <div className="purchase-table-wrapper">
                  <table className="purchase-table">
                    <thead>
                      <tr>
                        <th>Batch Code</th>
                        <th>Medicine Name</th>
                        <th>Batch Number</th>
                        <th>Expiry Date</th>
                        <th>Expired Stock</th>
                        <th>Valuation Loss</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.lists.expired.map(b => (
                        <tr key={b._id}>
                          <td style={{ fontWeight: '700' }}><code>{b.batchCode}</code></td>
                          <td style={{ fontWeight: '600' }}>{b.medicineId?.medicineName}</td>
                          <td><code>{b.batchNumber}</code></td>
                          <td style={{ color: '#DC2626', fontWeight: '600' }}>
                            {new Date(b.expiryDate).toLocaleDateString()}
                          </td>
                          <td style={{ fontWeight: '700' }}>{b.availableQuantity} units</td>
                          <td style={{ fontWeight: '700', color: '#DC2626' }}>₹{(b.availableQuantity * b.purchasePrice).toFixed(2)}</td>
                          <td>
                            <button 
                              className="btn-primary-action"
                              style={{ backgroundColor: '#DC2626', padding: '6px 12px', fontSize: '12px' }}
                              onClick={() => handleOpenDisposeModal(b)}
                            >
                              Write-off
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="purchase-title-area" style={{ marginBottom: '10px' }}>
                <h3>Batches Nearing Expiry (Within Safety Limits)</h3>
                <p>These medicines will expire soon. Consider promoting sales or returning them to suppliers.</p>
              </div>

              {alerts.lists?.nearExpiry?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#16A34A', fontWeight: '600' }}>
                  <FiCheckCircle style={{ fontSize: '30px', marginBottom: '8px' }} />
                  <p>All active stock batches have safe expiry horizons!</p>
                </div>
              ) : (
                <div className="purchase-table-wrapper">
                  <table className="purchase-table">
                    <thead>
                      <tr>
                        <th>Batch Code</th>
                        <th>Medicine Name</th>
                        <th>Batch Number</th>
                        <th>Expiry Date</th>
                        <th>Stock Available</th>
                        <th>Valuation MRP</th>
                        <th>Alert Classification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.lists.nearExpiry.map(b => {
                        const days = Math.round((new Date(b.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                        let classification = "Safe";
                        let pillClass = "posted";
                        if (days <= 30) {
                          classification = "Critical (0-30 days)";
                          pillClass = "cancelled";
                        } else if (days <= 90) {
                          classification = "Warning (31-90 days)";
                          pillClass = "draft";
                        }
                        
                        return (
                          <tr key={b._id}>
                            <td style={{ fontWeight: '700' }}><code>{b.batchCode}</code></td>
                            <td style={{ fontWeight: '600' }}>{b.medicineId?.medicineName}</td>
                            <td><code>{b.batchNumber}</code></td>
                            <td style={{ fontWeight: '600' }}>
                              {new Date(b.expiryDate).toLocaleDateString()}
                            </td>
                            <td style={{ fontWeight: '700' }}>{b.availableQuantity} units</td>
                            <td style={{ fontWeight: '600' }}>₹{(b.availableQuantity * b.mrp).toFixed(2)}</td>
                            <td>
                              <span className={`status-pill ${pillClass}`}>
                                {classification}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 4. GST Summaries */}
      {activeTab === 'gst' && (
        <div className="inventory-tab-content">
          <div className="purchase-title-area" style={{ marginBottom: '12px' }}>
            <h3>GST Input Tax Credit (ITC) Summaries</h3>
            <p>Slab-wise aggregation of purchased goods tax details based on posted supplier bills.</p>
          </div>

          {gstSummary.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
              <p>No tax summary records found in ledger databases.</p>
            </div>
          ) : (
            <div className="purchase-table-wrapper">
              <table className="purchase-table">
                <thead>
                  <tr>
                    <th>GST Slab Rate</th>
                    <th>Number of Invoiced Items</th>
                    <th>Taxable Purchased Value</th>
                    <th>Input Tax Credit (ITC) Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {gstSummary.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: '700', fontSize: '15px' }}>{item.gstRate}%</td>
                      <td>{item.itemCount} line items</td>
                      <td style={{ fontWeight: '600' }}>₹{item.taxableValue?.toFixed(2)}</td>
                      <td style={{ color: '#16A34A', fontWeight: '700', fontSize: '15px' }}>
                        ₹{item.gstAmount?.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 5. Activities Logs Audits */}
      {activeTab === 'activities' && (
        <div className="inventory-tab-content">
          <div className="purchase-title-area" style={{ marginBottom: '12px' }}>
            <h3>Central Stock Auditing Timeline</h3>
            <p>Chronological audit log showing every physical addition, subtraction, return, or lock of medicine stock.</p>
          </div>

          {activities.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>No activity records found.</p>
          ) : (
            <div className="audit-logs-timeline">
              {activities.map(act => (
                <div key={act._id} className="audit-log-row">
                  <div className="audit-log-time">
                    {new Date(act.createdAt).toLocaleString()}
                  </div>
                  <div className="audit-log-details">
                    <div className="audit-log-action">
                      <span className={`status-pill ${
                        act.action === 'Purchase Receipt' ? 'posted' : 
                        act.action === 'Stock Adjustment' ? 'approved' :
                        act.action === 'Disposal' || act.action === 'Return' ? 'cancelled' : 'draft'
                      }`} style={{ marginRight: '8px' }}>
                        {act.action}
                      </span>
                      <span>Batch: <code>{act.inventoryBatchId?.batchNumber || 'N/A'}</code> ({act.inventoryBatchId?.medicineId?.medicineName})</span>
                    </div>
                    <div className="audit-log-desc">
                      {act.description}
                      {act.adjustmentReason && (
                        <span style={{ fontWeight: '700', color: '#D97706', marginLeft: '6px' }}>
                          [Reason: {act.adjustmentReason}]
                        </span>
                      )}
                    </div>
                    <div className="audit-log-actor">
                      <FiActivity /> Audited By: {act.performedBy?.name || 'System'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. Valuation Trends */}
      {activeTab === 'valuation' && (
        <div className="inventory-tab-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '12px' }}>
            <div className="purchase-title-area">
              <h3>Inventory Weighted Average Valuations</h3>
              <p>Daily audit trends of total items, physical stock units, and financial cost value of remaining warehouse stock.</p>
            </div>
          </div>

          {valuation.summary && (
            <div className="purchase-stats-grid" style={{ marginBottom: '20px' }}>
              <div className="purchase-stat-card card-outstanding">
                <div className="stat-details">
                  <span className="stat-label">Total Unique Batches</span>
                  <span className="stat-num">{valuation.summary.totalItems}</span>
                </div>
              </div>
              <div className="purchase-stat-card card-due-week">
                <div className="stat-details">
                  <span className="stat-label">Total Physical Stock Units</span>
                  <span className="stat-num">{valuation.summary.totalPhysicalStock}</span>
                </div>
              </div>
              <div className="purchase-stat-card card-posted" style={{ borderLeft: '4px solid #16A34A' }}>
                <div className="stat-details">
                  <span className="stat-label">Valuation Purchase Cost</span>
                  <span className="stat-num" style={{ color: '#16A34A' }}>₹{valuation.summary.totalPurchaseValue?.toFixed(2)}</span>
                </div>
              </div>
              <div className="purchase-stat-card card-approved">
                <div className="stat-details">
                  <span className="stat-label">Valuation Selling Value</span>
                  <span className="stat-num" style={{ color: 'var(--primary-color)' }}>₹{valuation.summary.totalSellingValue?.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Historical Trends List */}
          <div className="purchase-title-area" style={{ marginTop: '10px', marginBottom: '10px' }}>
            <h4>Valuation Snapshots Log</h4>
          </div>
          {snapshots.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#64748B' }}>No historical snapshot records. Click the "Take Valuation Snapshot" button at the top to initialize.</p>
          ) : (
            <div className="purchase-table-wrapper">
              <table className="purchase-table">
                <thead>
                  <tr>
                    <th>Snapshot Date</th>
                    <th>Unique Batches</th>
                    <th>Valuation Purchase Value</th>
                    <th>Valuation Selling Value</th>
                    <th>Valuation MRP Value</th>
                    <th>Auditor</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map(snap => (
                    <tr key={snap._id}>
                      <td style={{ fontWeight: '700' }}>{new Date(snap.snapshotDate).toLocaleDateString()}</td>
                      <td>{snap.totalItems} items</td>
                      <td style={{ fontWeight: '600' }}>₹{snap.totalPurchaseValue?.toFixed(2)}</td>
                      <td style={{ color: 'var(--primary-color)', fontWeight: '600' }}>₹{snap.totalSellingValue?.toFixed(2)}</td>
                      <td style={{ fontWeight: '700' }}>₹{snap.totalMrpValue?.toFixed(2)}</td>
                      <td>{snap.createdBy?.name || 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Adjust Stock Qty Modal */}
      {showAdjustModal && (
        <div className="csv-modal-backdrop" onClick={() => setShowAdjustModal(false)}>
          <div className="csv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="csv-modal-header">
              <h3>Audited Stock Quantity Adjustment</h3>
              <button className="csv-modal-close" onClick={() => setShowAdjustModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="csv-modal-body">
              <p style={{ fontSize: '13px', color: '#64748B' }}>
                Modify the physical count for batch <strong>{selectedBatch?.batchNumber}</strong> ({selectedBatch?.medicineId?.medicineName}). 
                This action writes an audit trace.
              </p>

              <div className="purchase-form-group">
                <label>Current Quantity in Batch</label>
                <input type="text" value={`${selectedBatch?.availableQuantity} units`} disabled />
              </div>

              <div className="purchase-form-group">
                <label>New Audited Stock Quantity *</label>
                <input 
                  type="number" 
                  min="0"
                  placeholder="e.g. 95" 
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                />
              </div>

              <div className="purchase-form-group">
                <label>Adjustment Reason *</label>
                <select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)}>
                  <option value="Physical Count Difference">Physical Count Difference</option>
                  <option value="Damage">Damage</option>
                  <option value="Expiry">Expiry</option>
                  <option value="Theft">Theft</option>
                  <option value="Sample Given">Sample Given</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="purchase-form-group">
                <label>Auditor Notes *</label>
                <input 
                  type="text" 
                  placeholder="Provide detailed explanation..."
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="csv-modal-footer">
              <button className="btn-secondary-action" onClick={() => setShowAdjustModal(false)}>Cancel</button>
              <button className="btn-primary-action" onClick={handleProcessAdjustment}>Adjust Stock</button>
            </div>
          </div>
        </div>
      )}

      {/* Dispose Stock Modal */}
      {showDisposeModal && (
        <div className="csv-modal-backdrop" onClick={() => setShowDisposeModal(false)}>
          <div className="csv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="csv-modal-header">
              <h3>Dispose / Write-off Stock</h3>
              <button className="csv-modal-close" onClick={() => setShowDisposeModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="csv-modal-body">
              <p style={{ fontSize: '13px', color: '#64748B' }}>
                Dispose of broken, lost, or expired medicine from batch <strong>{selectedBatch?.batchNumber}</strong>. 
                This will deduct units permanently.
              </p>

              <div className="purchase-form-group">
                <label>Available Stock</label>
                <input type="text" value={`${selectedBatch?.availableQuantity} units`} disabled />
              </div>

              <div className="purchase-form-group">
                <label>Quantity to Dispose *</label>
                <input 
                  type="number" 
                  min="1" 
                  max={selectedBatch?.availableQuantity} 
                  placeholder="e.g. 5"
                  value={disposeQty}
                  onChange={(e) => setDisposeQty(e.target.value)}
                />
              </div>

              <div className="purchase-form-group">
                <label>Disposal Reason *</label>
                <select value={disposeReason} onChange={(e) => setDisposeReason(e.target.value)}>
                  <option value="Expired">Expired</option>
                  <option value="Damaged">Damaged</option>
                  <option value="Lost">Lost</option>
                  <option value="Theft">Theft</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="purchase-form-group">
                <label>Disposal Notes *</label>
                <input 
                  type="text" 
                  placeholder="Explain write-off details..."
                  value={disposeNotes}
                  onChange={(e) => setDisposeNotes(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="csv-modal-footer">
              <button className="btn-secondary-action" onClick={() => setShowDisposeModal(false)}>Cancel</button>
              <button className="btn-primary-action" style={{ backgroundColor: '#DC2626' }} onClick={handleProcessDisposal}>
                Dispose Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Lock Modal */}
      {showLockModal && (
        <div className="csv-modal-backdrop" onClick={() => setShowLockModal(false)}>
          <div className="csv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="csv-modal-header">
              <h3>{lockState ? "Lock Batch Billing" : "Unlock Batch Billing"}</h3>
              <button className="csv-modal-close" onClick={() => setShowLockModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="csv-modal-body">
              <p style={{ fontSize: '13px', color: '#64748B' }}>
                {lockState 
                  ? `Locking batch ${selectedBatch?.batchNumber} prevents it from being consumed in sales bills (e.g. recall, quality hold).` 
                  : `Releasing lock for batch ${selectedBatch?.batchNumber} restores its availability for sales.`}
              </p>

              {lockState && (
                <div className="purchase-form-group">
                  <label>Lock Reason Description *</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Quality alert from manufacturer, drug recall"
                    value={lockReasonText}
                    onChange={(e) => setLockReasonText(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="csv-modal-footer">
              <button className="btn-secondary-action" onClick={() => setShowLockModal(false)}>Cancel</button>
              <button 
                className="btn-primary-action" 
                style={{ backgroundColor: lockState ? '#DC2626' : '#16A34A' }} 
                onClick={handleProcessLockToggle}
              >
                {lockState ? "Confirm Lock" : "Release Lock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryDashboard;
