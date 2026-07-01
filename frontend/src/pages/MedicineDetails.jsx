import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  FaArrowLeft, 
  FaEdit, 
  FaPills, 
  FaExclamationTriangle, 
  FaHistory, 
  FaBan, 
  FaCalendarAlt, 
  FaInfoCircle,
  FaFileInvoiceDollar
} from 'react-icons/fa';
import { medicineAPI } from '../services/api';

const MedicineDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // State Management
  const [medicine, setMedicine] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Navigation Tabs state
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'activities'

  // Fetch Medicine Data
  useEffect(() => {
    const fetchAllDetails = async () => {
      try {
        setLoading(true);
        setError('');

        const medData = await medicineAPI.getMedicineById(id);
        if (medData.success) {
          setMedicine(medData.medicine);
        }

        const actData = await medicineAPI.getActivities(id);
        if (actData.success) {
          setActivities(actData.activities);
        }
      } catch (err) {
        console.error('Error loading details:', err);
        setError('Failed to load medicine record details. It may have been deleted.');
      } finally {
        setLoading(false);
      }
    };
    fetchAllDetails();
  }, [id]);

  // Format Currency
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(val);
  };

  // Format Date
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '60vh', flexDirection: 'column', gap: '16px' }}>
        <div className="spinner" style={{ borderTopColor: '#1976D2', width: '40px', height: '40px', borderWidth: '3px' }}></div>
        <p style={{ color: '#64748B', fontSize: '14px' }}>Loading medicine profile...</p>
      </div>
    );
  }

  if (error || !medicine) {
    return (
      <div className="empty-state" style={{ minHeight: '50vh' }}>
        <FaExclamationTriangle className="empty-icon" style={{ color: 'var(--error-color)' }} />
        <h4>Failed to Load Medicine Profile</h4>
        <p>{error || 'Medicine record not found.'}</p>
        <button className="back-btn" style={{ marginTop: '16px' }} onClick={() => navigate('/medicines')}>
          <FaArrowLeft /> Back to Medicines
        </button>
      </div>
    );
  }

  const isLowStock = medicine.currentStock <= medicine.minimumStockLevel;

  return (
    <div className="medicine-details-container">
      {/* Header Panel */}
      <div className="form-header-row">
        <button className="back-btn" onClick={() => navigate('/medicines')}>
          <FaArrowLeft /> Back to List
        </button>
        <button className="add-med-btn" style={{ backgroundColor: 'var(--warning-color)', boxShadow: 'none' }} onClick={() => navigate(`/medicines/edit/${medicine._id}`)}>
          <FaEdit /> Edit Record
        </button>
      </div>

      {/* Main Profile Summary Header Card */}
      <div className="details-header-card">
        <div className="details-header-left">
          <div className="header-avatar-circle" style={{ backgroundColor: medicine.isBlocked ? '#FFE4E6' : 'rgba(25, 118, 210, 0.1)', color: medicine.isBlocked ? '#E11D48' : 'var(--primary-color)' }}>
            <FaPills />
          </div>
          <div className="header-meta">
            <h2>{medicine.medicineName} {medicine.strength && <span style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>({medicine.strength})</span>}</h2>
            <div className="meta-badges">
              <span className="code-badge">{medicine.medicineCode}</span>
              <span className="category-badge">{medicine.category || 'NO CATEGORY'}</span>
              <span className="category-badge" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{medicine.medicineForm}</span>
              {medicine.prescriptionRequired === 'Yes' && (
                <span className="badge-rx">Rx Required</span>
              )}
              {medicine.isBlocked && (
                <span className="badge-blocked-pill">Blocked</span>
              )}
            </div>
          </div>
        </div>
        
        {/* Right side stats values */}
        <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Current Stock</span>
            <span style={{ fontSize: '20px', fontWeight: '800', color: isLowStock ? 'var(--error-color)' : 'var(--success-color)' }}>
              {medicine.currentStock} {medicine.unitType}s
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Market Price (MRP)</span>
            <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)' }}>
              {formatCurrency(medicine.mrp)}
            </span>
          </div>
        </div>
      </div>

      {/* Critical Warnings banners */}
      {medicine.isBlocked && (
        <div className="limit-warning-banner" style={{ backgroundColor: '#FFE4E6', color: '#E11D48', borderColor: 'rgba(225, 29, 72, 0.2)' }}>
          <FaBan className="limit-warning-icon" />
          <span><strong>WARNING:</strong> This medicine record is BLOCKED. It cannot be parsed in purchase invoices or customer billing transactions.</span>
        </div>
      )}

      {isLowStock && (
        <div className="limit-warning-banner">
          <FaExclamationTriangle className="limit-warning-icon" />
          <span><strong>LOW STOCK ALERT:</strong> Current inventory stock ({medicine.currentStock}) is at or below the warning limit ({medicine.minimumStockLevel} {medicine.unitType}s). Please issue a reorder request.</span>
        </div>
      )}

      {/* Details Tabs Menu */}
      <div className="details-tabs-bar">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <FaInfoCircle style={{ marginRight: '6px' }} /> Overview Details
        </button>
        <button 
          className={`tab-btn ${activeTab === 'activities' ? 'active' : ''}`}
          onClick={() => setActiveTab('activities')}
        >
          <FaHistory style={{ marginRight: '6px' }} /> Audit Logs ({activities.length})
        </button>
      </div>

      {/* Tab Contents: Overview */}
      {activeTab === 'overview' && (
        <div className="details-grid">
          
          {/* Card 1: Core details */}
          <div className="details-card">
            <h4>Basic Specifications</h4>
            <div className="details-fields-list">
              <div className="detail-field-row">
                <span className="field-label">Generic Name</span>
                <span className="field-value" style={{ fontStyle: medicine.genericName ? 'normal' : 'italic' }}>
                  {medicine.genericName || 'No Generic Name'}
                </span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Brand Name</span>
                <span className="field-value">{medicine.brandName || '—'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Strength Dosage</span>
                <span className="field-value">{medicine.strength || '—'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Medicine Form</span>
                <span className="field-value">{medicine.medicineForm}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Category Class</span>
                <span className="field-value">{medicine.category || '—'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Manufacturer</span>
                <span className="field-value">{medicine.manufacturer || '—'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Supplier Agency</span>
                <span className="field-value" style={{ color: 'var(--primary-color)' }}>
                  {medicine.agencyId?.agencyName || 'Deleted Agency'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Pricing details */}
          <div className="details-card">
            <h4>Pricing & Taxation</h4>
            <div className="details-fields-list">
              <div className="detail-field-row">
                <span className="field-label">Purchase Price</span>
                <span className="field-value">{formatCurrency(medicine.purchasePrice)}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Selling Price</span>
                <span className="field-value">{formatCurrency(medicine.sellingPrice)}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Maximum Retail Price (MRP)</span>
                <span className="field-value">{formatCurrency(medicine.mrp)}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">GST Tax Rate</span>
                <span className="field-value">{medicine.gstPercentage}%</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">GST HSN Code</span>
                <span className="field-value">{medicine.hsnCode || '—'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Max Discount Allowed</span>
                <span className="field-value">{medicine.discountAllowed}%</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Barcode UPC</span>
                <span className="field-value" style={{ fontFamily: 'monospace' }}>{medicine.barcode || '—'}</span>
              </div>
            </div>
          </div>

          {/* Card 3: Stock rules */}
          <div className="details-card">
            <h4>Stock & Packing Rules</h4>
            <div className="details-fields-list">
              <div className="detail-field-row">
                <span className="field-label">Current Inventory Stock</span>
                <span className="field-value" style={{ color: isLowStock ? 'var(--error-color)' : 'var(--success-color)' }}>
                  {medicine.currentStock} {medicine.unitType}s
                </span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Minimum Level Limit</span>
                <span className="field-value">{medicine.minimumStockLevel} {medicine.unitType}s</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Reorder Level Limit</span>
                <span className="field-value">{medicine.reorderLevel} {medicine.unitType}s</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Packing Unit Type</span>
                <span className="field-value">{medicine.unitType}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Pack Size Quantity</span>
                <span className="field-value">{medicine.packSize} units per {medicine.unitType}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Batch Tracking Enabled?</span>
                <span className="field-value">{medicine.trackBatches ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Medical Storage, Transaction Controls & Audit */}
          <div className="details-card">
            <h4>Controls & Medical Info</h4>
            <div className="details-fields-list">
              <div className="detail-field-row">
                <span className="field-label">Prescription (Rx) Required?</span>
                <span className="field-value" style={{ color: medicine.prescriptionRequired === 'Yes' ? 'var(--warning-color)' : 'inherit' }}>
                  {medicine.prescriptionRequired}
                </span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Storage Environment</span>
                <span className="field-value">{medicine.storageType}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Expiry Alert Period</span>
                <span className="field-value">{medicine.expiryAlertDays} Days</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Allow Purchase?</span>
                <span className="field-value">{medicine.allowPurchase ? 'Yes' : 'No'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Allow Sale / Billing?</span>
                <span className="field-value">{medicine.allowSale ? 'Yes' : 'No'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">System Record Status</span>
                <span className="field-value" style={{ color: medicine.status === 'Active' ? 'var(--success-color)' : 'var(--text-secondary)' }}>
                  {medicine.status}
                </span>
              </div>
            </div>
          </div>

          {/* Card 5: Remarks / Notes */}
          <div className="details-card" style={{ gridColumn: 'span 2' }}>
            <h4>Internal Notes & Pharmacy Remarks</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-wrap', fontStyle: medicine.notes ? 'normal' : 'italic' }}>
              {medicine.notes || 'No remarks logged for this medicine master record.'}
            </p>
          </div>

          {/* Card 6: Audit trail details */}
          <div className="details-card" style={{ gridColumn: 'span 2' }}>
            <h4>Record Audits</h4>
            <div className="form-grid-3">
              <div className="detail-field-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <span className="field-label">Registered By</span>
                <span className="field-value" style={{ textAlign: 'left' }}>{medicine.createdBy?.name || 'System / Seed'}</span>
              </div>
              <div className="detail-field-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <span className="field-label">Last Updated By</span>
                <span className="field-value" style={{ textAlign: 'left' }}>{medicine.updatedBy?.name || 'No updates logged'}</span>
              </div>
              <div className="detail-field-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <span className="field-label">Audit Registration Time</span>
                <span className="field-value" style={{ textAlign: 'left', fontSize: '12px' }}>{formatDate(medicine.createdAt)}</span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Tab Contents: Activity logs */}
      {activeTab === 'activities' && (
        <div className="details-card">
          <h4>Medicine Activity Timeline Log</h4>
          {activities.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <FaHistory className="empty-icon" />
              <h4>No Activities Logged</h4>
              <p>This medicine record has no audit log actions recorded.</p>
            </div>
          ) : (
            <div className="activities-list">
              {activities.map((act) => {
                let actionClass = 'updated';
                if (act.action === 'Medicine Created') actionClass = 'created';
                if (act.action === 'Medicine Deleted') actionClass = 'deleted';
                if (act.action.includes('Blocked')) actionClass = 'blocked';

                return (
                  <div key={act._id} className={`activity-item ${actionClass}`}>
                    <div className="activity-icon-bullet">
                      <FaHistory />
                    </div>
                    <div className="activity-content">
                      <div className="activity-content-header">
                        <span className="activity-action-text">{act.action}</span>
                        <span className="activity-time">{formatDate(act.createdAt)}</span>
                      </div>
                      <p className="activity-desc">{act.description}</p>
                      <span className="activity-user">Actioned by: {act.performedBy?.name || 'System / Unknown'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MedicineDetails;
