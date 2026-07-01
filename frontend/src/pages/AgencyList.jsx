import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaPlus, 
  FaSearch, 
  FaEye, 
  FaEdit, 
  FaTrash, 
  FaHandshake, 
  FaToggleOn, 
  FaToggleOff,
  FaStar,
  FaBan,
  FaFileAlt
} from 'react-icons/fa';
import { agencyAPI } from '../services/api';

const AgencyList = () => {
  const navigate = useNavigate();

  // State Management
  const [agencies, setAgencies] = useState([]);
  const [stats, setStats] = useState({
    totalAgencies: 0,
    activeAgencies: 0,
    inactiveAgencies: 0,
    blockedAgencies: 0,
    preferredAgencies: 0,
    totalOutstandingBalance: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters & Query State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '', 'active', 'inactive'
  const [categoryFilter, setCategoryFilter] = useState(''); // '', 'Manufacturer', etc.
  const [typeFilter, setTypeFilter] = useState(''); // '', 'preferred', 'normal'
  const [blockedFilter, setBlockedFilter] = useState(''); // '', 'true', 'false'
  const [sortBy, setSortBy] = useState('latest');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Soft Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [agencyToDelete, setAgencyToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load Statistics
  const fetchStats = async () => {
    try {
      setStatsLoading(true);
      const data = await agencyAPI.getStats();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching statistics:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Load Agencies List
  const fetchAgencies = async () => {
    try {
      setLoading(true);
      setError('');

      const params = {
        page,
        limit: 8,
        search,
        status: statusFilter,
        category: categoryFilter,
        type: typeFilter,
        blocked: blockedFilter,
        sort: sortBy
      };

      const data = await agencyAPI.getAgencies(params);
      if (data.success) {
        setAgencies(data.agencies);
        setPages(data.pages);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Error fetching agencies:', err);
      setError('Failed to load agencies. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  // Trigger loading list on filter changes
  useEffect(() => {
    fetchAgencies();
  }, [page, statusFilter, categoryFilter, typeFilter, blockedFilter, sortBy]);

  // Trigger search with delay
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setPage(1);
      fetchAgencies();
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [search]);

  // Run on mount
  useEffect(() => {
    fetchStats();
  }, []);

  // Export handler
  const handleExport = (format) => {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams({
      search,
      status: statusFilter,
      category: categoryFilter,
      type: typeFilter,
      blocked: blockedFilter,
      sort: sortBy
    }).toString();
    
    window.open(`/api/agencies/export/${format}?${params}&Authorization=Bearer ${token}`, '_blank');
  };

  // Handle deletion execution
  const handleDeleteConfirm = async () => {
    if (!agencyToDelete) return;
    setIsDeleting(true);

    try {
      const data = await agencyAPI.deleteAgency(agencyToDelete._id);
      if (data.success) {
        // Refresh listings
        fetchAgencies();
        fetchStats();
        setDeleteModalOpen(false);
        setAgencyToDelete(null);
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting agency. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const openDeleteModal = (agency) => {
    setAgencyToDelete(agency);
    setDeleteModalOpen(true);
  };

  // Format Currency
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="agency-list-container">
      {/* Statistics dashboard cards */}
      <div className="agency-stats-grid">
        <div className="agency-stat-card stat-total">
          <div className="stat-info">
            <span className="stat-label">Total Agencies</span>
            <span className="stat-number">
              {statsLoading ? '...' : stats.totalAgencies}
            </span>
          </div>
          <div className="stat-icon"><FaHandshake /></div>
        </div>

        <div className="agency-stat-card stat-active">
          <div className="stat-info">
            <span className="stat-label">Active Suppliers</span>
            <span className="stat-number">
              {statsLoading ? '...' : stats.activeAgencies}
            </span>
          </div>
          <div className="stat-icon"><FaToggleOn /></div>
        </div>

        <div className="agency-stat-card stat-inactive">
          <div className="stat-info">
            <span className="stat-label">Blocked Suppliers</span>
            <span className="stat-number">
              {statsLoading ? '...' : stats.blockedAgencies}
            </span>
          </div>
          <div className="stat-icon" style={{ color: '#DC2626', backgroundColor: '#FEE2E2' }}><FaBan /></div>
        </div>

        <div className="agency-stat-card stat-balance">
          <div className="stat-info">
            <span className="stat-label">Total Debt / Balance</span>
            <span className="stat-number">
              {statsLoading ? '...' : formatCurrency(stats.totalOutstandingBalance)}
            </span>
          </div>
          <div className="stat-icon"><FaFileAlt /></div>
        </div>
      </div>

      {/* Control panel (Filters + Add button) */}
      <div className="agency-controls-panel">
        <div className="controls-top">
          <h3>Manage Medicine Suppliers</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="page-btn" style={{ color: '#1d4ed8', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => handleExport('excel')}>
              Export Excel
            </button>
            <button className="page-btn" style={{ color: '#b91c1c', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => handleExport('pdf')}>
              Export PDF
            </button>
            <button className="add-agency-btn" onClick={() => navigate('/agencies/add')}>
              <FaPlus /> Add New Agency
            </button>
          </div>
        </div>

        <div className="filters-row">
          {/* Search bar */}
          <div className="search-input-wrapper">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Status/Type Selector */}
          <select 
            className="filter-select"
            value={statusFilter || typeFilter || blockedFilter ? (statusFilter ? `status-${statusFilter}` : (typeFilter ? `type-${typeFilter}` : `blocked-${blockedFilter}`)) : ''}
            onChange={(e) => {
              const val = e.target.value;
              setStatusFilter('');
              setTypeFilter('');
              setBlockedFilter('');
              setPage(1);

              if (val.startsWith('status-')) {
                setStatusFilter(val.replace('status-', ''));
              } else if (val.startsWith('type-')) {
                setTypeFilter(val.replace('type-', ''));
              } else if (val.startsWith('blocked-')) {
                setBlockedFilter(val.replace('blocked-', ''));
              }
            }}
          >
            <option value="">All Agency Statuses</option>
            <option value="status-active">Active Agencies</option>
            <option value="status-inactive">Inactive Agencies</option>
            <option value="blocked-true">Blocked Agencies</option>
            <option value="type-preferred">Preferred Suppliers (⭐)</option>
            <option value="type-normal">Normal Suppliers</option>
          </select>

          {/* Category Filter */}
          <select
            className="filter-select"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Categories</option>
            <option value="Manufacturer">Manufacturer</option>
            <option value="Wholesaler">Wholesaler</option>
            <option value="Distributor">Distributor</option>
            <option value="Local Supplier">Local Supplier</option>
          </select>

          {/* Sorting Selector */}
          <select
            className="filter-select"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
          >
            <option value="latest">Latest Created</option>
            <option value="oldest">Oldest Created</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="name_desc">Name (Z-A)</option>
            <option value="balance_desc">Highest Outstanding</option>
          </select>
        </div>
      </div>

      {/* Main Table view / Cards list */}
      <div className="agency-table-card">
        {loading ? (
          <div className="flex-center" style={{ padding: '60px 0', flexDirection: 'column', gap: '16px' }}>
            <div className="spinner" style={{ borderTopColor: '#1976D2', width: '40px', height: '40px', borderWidth: '3px' }}></div>
            <p style={{ color: '#64748B', fontSize: '14px' }}>Loading agencies data...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <p className="text-danger" style={{ fontWeight: '600' }}>{error}</p>
            <button className="page-btn" style={{ marginTop: '12px' }} onClick={fetchAgencies}>Try Again</button>
          </div>
        ) : agencies.length === 0 ? (
          <div className="empty-state">
            <FaHandshake className="empty-icon" />
            <h4>No Agencies Found</h4>
            <p>Try modifying your search query or filters.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table view */}
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Agency Name</th>
                  <th>Contact Person</th>
                  <th>Phone</th>
                  <th>Credit Limit</th>
                  <th>Current Balance</th>
                  <th>Classification</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agencies.map((agency) => (
                  <tr key={agency._id} style={{ opacity: agency.isBlocked ? 0.75 : 1 }}>
                    <td><code>{agency.agencyCode}</code></td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <strong style={{ color: agency.isBlocked ? '#64748B' : 'var(--text-primary)' }}>
                          {agency.agencyName}
                        </strong>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {agency.isPreferredSupplier && (
                            <span className="badge-preferred"><FaStar /> Preferred</span>
                          )}
                          {agency.isBlocked && (
                            <span className="badge-blocked">Blocked</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{agency.contactPerson || '—'}</span>
                        <small style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {agency.contactPersonDesignation || '—'}
                        </small>
                      </div>
                    </td>
                    <td>{agency.phone}</td>
                    <td>{formatCurrency(agency.creditLimit)}</td>
                    <td style={{ color: agency.currentBalance > agency.creditLimit && agency.creditLimit > 0 ? 'var(--error-color)' : 'inherit' }}>
                      <strong>{formatCurrency(agency.currentBalance)}</strong>
                      {agency.currentBalance > agency.creditLimit && agency.creditLimit > 0 && (
                        <span style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: 'var(--error-color)' }}>
                          EXCEEDS LIMIT
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="category-badge">{agency.agencyCategory}</span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button 
                          className="action-btn view" 
                          onClick={() => navigate(`/agencies/${agency._id}`)}
                          title="View Details"
                        >
                          <FaEye />
                        </button>
                        <button 
                          className="action-btn edit" 
                          onClick={() => navigate(`/agencies/edit/${agency._id}`)}
                          title="Edit Agency"
                        >
                          <FaEdit />
                        </button>
                        <button 
                          className="action-btn delete" 
                          onClick={() => openDeleteModal(agency)}
                          title="Delete Agency"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Responsive Cards list */}
            <div className="agency-cards-grid">
              {agencies.map((agency) => (
                <div key={agency._id} className="agency-mobile-card" style={{ opacity: agency.isBlocked ? 0.8 : 1 }}>
                  <div className="card-header-row">
                    <div className="card-title-group">
                      <h4>{agency.agencyName}</h4>
                      <code>{agency.agencyCode}</code>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                      {agency.isPreferredSupplier && (
                        <span className="badge-preferred"><FaStar /> Preferred</span>
                      )}
                      {agency.isBlocked && (
                        <span className="badge-blocked">Blocked</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="card-body-row">
                    <div className="body-item">
                      <span className="body-item-label">Contact Person</span>
                      <span className="body-item-value">{agency.contactPerson || '—'}</span>
                    </div>
                    <div className="body-item">
                      <span className="body-item-label">Phone</span>
                      <span className="body-item-value">{agency.phone}</span>
                    </div>
                    <div className="body-item">
                      <span className="body-item-label">Current Balance</span>
                      <span className="body-item-value">{formatCurrency(agency.currentBalance)}</span>
                    </div>
                    <div className="body-item">
                      <span className="body-item-label">Category</span>
                      <span className="category-badge" style={{ alignSelf: 'flex-start', margin: '4px 0 0' }}>
                        {agency.agencyCategory}
                      </span>
                    </div>
                  </div>

                  <div className="card-actions-row">
                    <button className="card-action-btn view" onClick={() => navigate(`/agencies/${agency._id}`)}>
                      <FaEye /> View
                    </button>
                    <button className="card-action-btn edit" onClick={() => navigate(`/agencies/edit/${agency._id}`)}>
                      <FaEdit /> Edit
                    </button>
                    <button className="card-action-btn delete" onClick={() => openDeleteModal(agency)}>
                      <FaTrash /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Table Pagination controls */}
            <div className="table-pagination-footer">
              <span className="pagination-info">
                Showing Page <strong>{page}</strong> of <strong>{pages}</strong> ({total} total suppliers)
              </span>
              <div className="pagination-buttons">
                <button
                  className="page-btn"
                  onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                {Array.from({ length: pages }).map((_, i) => (
                  <button
                    key={i}
                    className={`page-btn ${page === i + 1 ? 'active' : ''}`}
                    onClick={() => setPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  className="page-btn"
                  onClick={() => setPage(prev => Math.min(prev + 1, pages))}
                  disabled={page === pages}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Confirmation Modal */}
      {deleteModalOpen && (
        <div className="modal-overlay">
          <div className="confirm-modal">
            <div className="warn-icon-wrapper">
              <FaBan />
            </div>
            <h3>Remove Supplier Agency</h3>
            <p>
              Are you sure you want to delete <strong>{agencyToDelete?.agencyName}</strong>? 
              This will perform a soft-delete so that history records and purchase reports remain intact.
            </p>
            <div className="modal-buttons">
              <button 
                className="modal-btn cancel" 
                onClick={() => {
                  setDeleteModalOpen(false);
                  setAgencyToDelete(null);
                }}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                className="modal-btn danger" 
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgencyList;
