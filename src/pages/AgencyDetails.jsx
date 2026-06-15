import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  FaArrowLeft, 
  FaEdit, 
  FaHandshake, 
  FaStar, 
  FaBan, 
  FaHistory, 
  FaUserCircle, 
  FaCreditCard, 
  FaExclamationTriangle,
  FaFileInvoiceDollar,
  FaClock
} from 'react-icons/fa';
import { agencyAPI } from '../services/api';

const AgencyDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  // State Management
  const [agency, setAgency] = useState(null);
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'financials', 'activities'

  // Fetch Agency details on mount
  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setIsLoading(true);
        const data = await agencyAPI.getAgencyById(id);
        if (data.success) {
          setAgency(data.agency);
        }
      } catch (err) {
        console.error(err);
        alert('Failed to load supplier details.');
        navigate('/agencies');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [id]);

  // Load activities when switching to logs tab
  useEffect(() => {
    if (activeTab === 'activities' && activities.length === 0) {
      const fetchActivities = async () => {
        try {
          setActivitiesLoading(true);
          const data = await agencyAPI.getAgencyActivities(id);
          if (data.success) {
            setActivities(data.activities);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setActivitiesLoading(false);
        }
      };

      fetchActivities();
    }
  }, [activeTab, id]);

  // Format Currency
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  // Format DateTime
  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCategoryClass = (cat) => {
    return cat ? cat.replace(' ', '-').toLowerCase() : '';
  };

  if (isLoading) {
    return (
      <div className="agency-details-container flex-center" style={{ minHeight: '400px', flexDirection: 'column', gap: '16px' }}>
        <div className="spinner" style={{ borderTopColor: '#1976D2', width: '45px', height: '45px', borderWidth: '3px' }}></div>
        <p style={{ color: '#64748B', fontSize: '14px' }}>Loading supplier profile details...</p>
      </div>
    );
  }

  // Check if outstanding balance exceeds limit
  const isOverLimit = agency.creditLimit > 0 && agency.currentBalance > agency.creditLimit;

  return (
    <div className="agency-details-container">
      {/* Warning banner for overlimit credit */}
      {isOverLimit && (
        <div className="limit-warning-banner">
          <FaExclamationTriangle className="limit-warning-icon" />
          <span>
            <strong>Attention:</strong> Outstanding balance ({formatCurrency(agency.currentBalance)}) exceeds the set Credit Limit of {formatCurrency(agency.creditLimit)}.
          </span>
        </div>
      )}

      {/* Warning banner if blocked */}
      {agency.isBlocked && (
        <div className="limit-warning-banner" style={{ backgroundColor: '#FEF3C7', color: '#D97706', borderColor: 'rgba(217, 119, 6, 0.2)' }}>
          <FaBan className="limit-warning-icon" style={{ color: '#D97706' }} />
          <span>
            <strong>Blocked Supplier:</strong> This agency is locked. New purchase invoices are blocked.
          </span>
        </div>
      )}

      {/* Profile Header */}
      <div className="details-header-card">
        <div className="details-header-left">
          <div className="header-avatar-circle">
            <FaHandshake />
          </div>
          <div className="header-meta">
            <h2>{agency.agencyName}</h2>
            <div className="meta-badges">
              <span className="code-badge">{agency.agencyCode}</span>
              <span className="category-badge">{agency.agencyCategory}</span>
              {agency.isPreferredSupplier && (
                <span className="badge-preferred"><FaStar /> Preferred</span>
              )}
              {agency.isBlocked && (
                <span className="badge-blocked">Blocked</span>
              )}
              <span className={`status-badge ${agency.status}`} style={{ margin: 0 }}>
                {agency.status}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="back-btn" onClick={() => navigate('/agencies')}>
            <FaArrowLeft /> Directory
          </button>
          <button className="add-agency-btn" onClick={() => navigate(`/agencies/edit/${agency._id}`)}>
            <FaEdit /> Edit Profile
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="details-tabs-bar">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          General & Contact Details
        </button>
        <button 
          className={`tab-btn ${activeTab === 'financials' ? 'active' : ''}`}
          onClick={() => setActiveTab('financials')}
        >
          Financials & Banking
        </button>
        <button 
          className={`tab-btn ${activeTab === 'activities' ? 'active' : ''}`}
          onClick={() => setActiveTab('activities')}
        >
          Activity Audit Logs
        </button>
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="details-grid">
          {/* Card 1: Core Company details */}
          <div className="details-card">
            <h4>Agency Profile Info</h4>
            <div className="details-fields-list">
              <div className="detail-field-row">
                <span className="field-label">Agency Name</span>
                <span className="field-value">{agency.agencyName}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Agency Code</span>
                <span className="field-value"><code>{agency.agencyCode}</code></span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Classification</span>
                <span className="field-value">{agency.agencyCategory}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">GSTIN Number</span>
                <span className="field-value">{agency.gstNumber || '—'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Drug License Number</span>
                <span className="field-value">{agency.drugLicenseNumber || '—'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Preferred Supplier</span>
                <span className="field-value">{agency.isPreferredSupplier ? 'Yes ⭐' : 'No'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Lock / Blocked</span>
                <span className="field-value" style={{ color: agency.isBlocked ? 'var(--error-color)' : 'inherit', fontWeight: '700' }}>
                  {agency.isBlocked ? 'Blocked 🚫' : 'Normal'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Contact Information */}
          <div className="details-card">
            <h4>Contact Details</h4>
            <div className="details-fields-list">
              <div className="detail-field-row">
                <span className="field-label">Contact Person</span>
                <span className="field-value"><strong>{agency.contactPerson || '—'}</strong></span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Designation</span>
                <span className="field-value">{agency.contactPersonDesignation || '—'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Primary Phone</span>
                <span className="field-value">{agency.phone}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Alternate Phone</span>
                <span className="field-value">{agency.alternatePhone || '—'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Email Address</span>
                <span className="field-value">{agency.email || '—'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Address</span>
                <span className="field-value" style={{ maxWidth: '240px', lineHeight: '1.4' }}>
                  {agency.address ? `${agency.address}, ${agency.city || ''}, ${agency.state || ''} - ${agency.pincode || ''}` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Internal Notes */}
          <div className="details-card" style={{ gridColumn: 'span 2' }}>
            <h4>Internal Administration Notes</h4>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {agency.notes || 'No notes available for this supplier.'}
            </p>
          </div>
        </div>
      )}

      {/* Financials & Banking tab */}
      {activeTab === 'financials' && (
        <div className="details-grid">
          {/* Card 1: Credit details */}
          <div className="details-card">
            <h4>Credit Terms & Balances</h4>
            <div className="details-fields-list">
              <div className="detail-field-row">
                <span className="field-label">Outstanding Balance</span>
                <span className="field-value" style={{ fontSize: '16px', fontWeight: '800', color: isOverLimit ? 'var(--error-color)' : 'inherit' }}>
                  {formatCurrency(agency.currentBalance)}
                </span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Credit Limit Limit</span>
                <span className="field-value">{formatCurrency(agency.creditLimit)}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Opening Balance</span>
                <span className="field-value">{formatCurrency(agency.openingBalance)}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Credit Terms (Days)</span>
                <span className="field-value">{agency.creditDays} days</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Last Purchase Date</span>
                <span className="field-value">{formatDateTime(agency.lastPurchaseDate)}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Bank accounts */}
          <div className="details-card">
            <h4>Bank Account Details</h4>
            <div className="details-fields-list">
              <div className="detail-field-row">
                <span className="field-label">Bank Name</span>
                <span className="field-value">{agency.bankName || '—'}</span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">Account Number</span>
                <span className="field-value">
                  {agency.accountNumber ? <code>{agency.accountNumber}</code> : '—'}
                </span>
              </div>
              <div className="detail-field-row">
                <span className="field-label">IFSC Code</span>
                <span className="field-value">
                  {agency.ifscCode ? <code>{agency.ifscCode}</code> : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Auditing Information */}
          <div className="details-card" style={{ gridColumn: 'span 2' }}>
            <h4>Database Creation & Modification Log</h4>
            <div className="details-fields-list" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="detail-field-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <span className="field-label" style={{ fontSize: '12px' }}>Created By</span>
                <span className="field-value" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <FaUserCircle /> {agency.createdBy?.name || 'System Admin'}
                </span>
                <small style={{ color: 'var(--text-secondary)' }}>on {formatDateTime(agency.createdAt)}</small>
              </div>

              <div className="detail-field-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <span className="field-label" style={{ fontSize: '12px' }}>Last Updated By</span>
                <span className="field-value" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <FaUserCircle /> {agency.updatedBy?.name || 'Not modified'}
                </span>
                <small style={{ color: 'var(--text-secondary)' }}>on {agency.updatedBy ? formatDateTime(agency.updatedAt) : 'Never'}</small>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activities Timeline Log tab */}
      {activeTab === 'activities' && (
        <div className="details-card" style={{ minHeight: '350px' }}>
          <h4>Supplier Audit Trail Log History</h4>
          
          {activitiesLoading ? (
            <div className="flex-center" style={{ minHeight: '200px', flexDirection: 'column', gap: '12px' }}>
              <div className="spinner" style={{ borderTopColor: '#1976D2', width: '30px', height: '30px', borderWidth: '2px' }}></div>
              <p style={{ color: '#64748B', fontSize: '13px' }}>Loading timeline activity logs...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="empty-state" style={{ minHeight: '200px' }}>
              <FaHistory className="empty-icon" />
              <h4>No Audit History Available</h4>
              <p>No logged changes or events found for this agency.</p>
            </div>
          ) : (
            <div className="activities-list">
              {activities.map((act) => (
                <div key={act._id} className={`activity-item ${act.action.toLowerCase().replace(' ', '-')}`}>
                  <div className="activity-icon-bullet">
                    <FaClock />
                  </div>
                  <div className="activity-content">
                    <div className="activity-content-header">
                      <span className="activity-action-text">{act.action}</span>
                      <span className="activity-time">{formatDateTime(act.createdAt)}</span>
                    </div>
                    <p className="activity-desc">{act.description}</p>
                    <span className="activity-user">Performed by: {act.performedBy?.name || 'System Admin'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgencyDetails;
