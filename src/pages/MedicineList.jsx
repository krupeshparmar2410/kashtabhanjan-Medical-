import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaPlus, 
  FaSearch, 
  FaEye, 
  FaEdit, 
  FaTrash, 
  FaPills, 
  FaToggleOn, 
  FaBan, 
  FaExclamationTriangle,
  FaFileAlt
} from 'react-icons/fa';
import { medicineAPI, agencyAPI } from '../services/api';

const MedicineList = () => {
  const navigate = useNavigate();

  // State Management
  const [medicines, setMedicines] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [stats, setStats] = useState({
    totalMedicines: 0,
    activeMedicines: 0,
    inactiveMedicines: 0,
    prescriptionMedicines: 0,
    nonPrescriptionMedicines: 0,
    blockedMedicines: 0,
    lowStockMedicines: 0
  });

  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & Query State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '', 'Active', 'Inactive'
  const [categoryFilter, setCategoryFilter] = useState(''); // '' or string
  const [prescriptionFilter, setPrescriptionFilter] = useState(''); // '', 'Yes', 'No'
  const [blockedFilter, setBlockedFilter] = useState(''); // '', 'true', 'false'
  const [agencyFilter, setAgencyFilter] = useState(''); // '' or agency ObjectId
  const [lowStockFilter, setLowStockFilter] = useState(''); // '', 'true'
  const [sortBy, setSortBy] = useState('latest');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Soft Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [medicineToDelete, setMedicineToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Categories list - can define categories list for filter dropdown
  const categoriesList = [
    'Analgesics', 'Antibiotics', 'Antacids', 'Antihistamines', 
    'Supplements', 'Vitamins', 'Cardiovascular', 'Antidiabetics', 
    'Respiratory', 'Antiseptics', 'Cough Preparations', 'Otology'
  ];

  // Fetch Stats
  const fetchStats = async () => {
    try {
      setStatsLoading(true);
      const data = await medicineAPI.getStats();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching medicine stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch Agencies list for filters
  const fetchAgencies = async () => {
    try {
      const data = await agencyAPI.getAgencies({ limit: 100 });
      if (data.success) {
        setAgencies(data.agencies);
      }
    } catch (err) {
      console.error('Error fetching agencies list:', err);
    }
  };

  // Fetch Medicines list
  const fetchMedicines = async () => {
    try {
      setLoading(true);
      setError('');

      const params = {
        page,
        limit: 10,
        search,
        status: statusFilter,
        category: categoryFilter,
        prescriptionRequired: prescriptionFilter,
        blocked: blockedFilter,
        agencyId: agencyFilter,
        lowStock: lowStockFilter,
        sort: sortBy
      };

      const data = await medicineAPI.getMedicines(params);
      if (data.success) {
        setMedicines(data.medicines);
        setPages(data.pages);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Error fetching medicines:', err);
      setError('Failed to load medicines. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  // Trigger loading list on filter changes
  useEffect(() => {
    fetchMedicines();
  }, [page, statusFilter, categoryFilter, prescriptionFilter, blockedFilter, agencyFilter, lowStockFilter, sortBy]);

  // Trigger search with delay
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setPage(1);
      fetchMedicines();
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [search]);

  // Run on mount
  useEffect(() => {
    fetchStats();
    fetchAgencies();
  }, []);

  // Handle Deletion Execution
  const handleDeleteConfirm = async () => {
    if (!medicineToDelete) return;
    setIsDeleting(true);

    try {
      const data = await medicineAPI.deleteMedicine(medicineToDelete._id);
      if (data.success) {
        fetchMedicines();
        fetchStats();
        setDeleteModalOpen(false);
        setMedicineToDelete(null);
      }
    } catch (err) {
      console.error('Error deleting medicine:', err);
      alert('Error deleting medicine. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const openDeleteModal = (medicine) => {
    setMedicineToDelete(medicine);
    setDeleteModalOpen(true);
  };

  // Format Currency
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(val);
  };

  return (
    <div className="medicine-list-container">
      {/* Statistics dashboard cards */}
      <div className="medicine-stats-grid">
        <div className="medicine-stat-card stat-med-total">
          <div className="stat-info">
            <span className="stat-label">Total Medicines</span>
            <span className="stat-number">
              {statsLoading ? '...' : stats.totalMedicines}
            </span>
          </div>
          <div className="stat-icon"><FaPills /></div>
        </div>

        <div className="medicine-stat-card stat-med-active">
          <div className="stat-info">
            <span className="stat-label">Active Medicines</span>
            <span className="stat-number">
              {statsLoading ? '...' : stats.activeMedicines}
            </span>
          </div>
          <div className="stat-icon"><FaToggleOn /></div>
        </div>

        <div className="medicine-stat-card stat-med-low">
          <div className="stat-info">
            <span className="stat-label">Low Stock Alerts</span>
            <span className="stat-number" style={{ color: stats.lowStockMedicines > 0 ? 'var(--error-color)' : 'inherit' }}>
              {statsLoading ? '...' : stats.lowStockMedicines}
            </span>
          </div>
          <div className="stat-icon" style={{ color: 'var(--error-color)', backgroundColor: 'var(--error-bg)' }}><FaExclamationTriangle /></div>
        </div>

        <div className="medicine-stat-card stat-med-rx">
          <div className="stat-info">
            <span className="stat-label">Prescription (Rx)</span>
            <span className="stat-number">
              {statsLoading ? '...' : stats.prescriptionMedicines}
            </span>
          </div>
          <div className="stat-icon"><FaFileAlt /></div>
        </div>

        <div className="medicine-stat-card stat-med-blocked">
          <div className="stat-info">
            <span className="stat-label">Blocked Drugs</span>
            <span className="stat-number" style={{ color: stats.blockedMedicines > 0 ? '#E11D48' : 'inherit' }}>
              {statsLoading ? '...' : stats.blockedMedicines}
            </span>
          </div>
          <div className="stat-icon" style={{ color: '#E11D48', backgroundColor: '#FFE4E6' }}><FaBan /></div>
        </div>
      </div>

      {/* Control panel (Filters + Add button) */}
      <div className="medicine-controls-panel">
        <div className="controls-top">
          <h3>Manage Medicine Database</h3>
          <button className="add-med-btn" onClick={() => navigate('/medicines/add')}>
            <FaPlus /> Add New Medicine
          </button>
        </div>

        <div className="filters-row">
          {/* Search bar */}
          <div className="search-input-wrapper">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search by code, name, generic name, barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Supplier Agency Filter */}
          <select
            className="filter-select"
            value={agencyFilter}
            onChange={(e) => {
              setAgencyFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Suppliers</option>
            {agencies.map((agency) => (
              <option key={agency._id} value={agency._id}>{agency.agencyName}</option>
            ))}
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
            {categoriesList.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Rx Filter */}
          <select
            className="filter-select"
            value={prescriptionFilter}
            onChange={(e) => {
              setPrescriptionFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Rx Status</option>
            <option value="Yes">Prescription (Rx) Required</option>
            <option value="No">No Prescription Required</option>
          </select>

          {/* Stock Level Filter */}
          <select
            className="filter-select"
            value={lowStockFilter}
            onChange={(e) => {
              setLowStockFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Stock Levels</option>
            <option value="true">Low Stock Alerts</option>
          </select>

          {/* Blocked Status Filter */}
          <select
            className="filter-select"
            value={blockedFilter}
            onChange={(e) => {
              setBlockedFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Status Blocked</option>
            <option value="true">Blocked Medicines</option>
            <option value="false">Unblocked Medicines</option>
          </select>

          {/* Status Filter */}
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          {/* Sorting */}
          <select
            className="filter-select"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
          >
            <option value="latest">Latest Added</option>
            <option value="oldest">Oldest Added</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="name_desc">Name (Z-A)</option>
            <option value="stock_asc">Stock (Low to High)</option>
            <option value="stock_desc">Stock (High to Low)</option>
          </select>
        </div>
      </div>

      {/* Main Table view / Cards list */}
      <div className="medicine-table-card">
        {loading ? (
          <div className="flex-center" style={{ padding: '60px 0', flexDirection: 'column', gap: '16px' }}>
            <div className="spinner" style={{ borderTopColor: '#1976D2', width: '40px', height: '40px', borderWidth: '3px' }}></div>
            <p style={{ color: '#64748B', fontSize: '14px' }}>Loading medicines data...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <p className="text-danger" style={{ fontWeight: '600' }}>{error}</p>
            <button className="page-btn" style={{ marginTop: '12px' }} onClick={fetchMedicines}>Try Again</button>
          </div>
        ) : medicines.length === 0 ? (
          <div className="empty-state">
            <FaPills className="empty-icon" />
            <h4>No Medicines Found</h4>
            <p>Try modifying your search query or filters.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Medicine Name</th>
                  <th>Generic Name</th>
                  <th>Category</th>
                  <th>Supplier Agency</th>
                  <th>Price Details</th>
                  <th>Current Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {medicines.map((med) => {
                  const isLowStock = med.currentStock <= med.minimumStockLevel;
                  return (
                    <tr key={med._id} style={{ opacity: med.isBlocked ? 0.75 : 1 }}>
                      <td><code>{med.medicineCode}</code></td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <strong style={{ color: med.isBlocked ? '#64748B' : 'var(--text-primary)' }}>
                            {med.medicineName} {med.strength && <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)' }}>({med.strength})</span>}
                          </strong>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span className="category-badge" style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#F1F5F9', color: '#475569', borderRadius: '4px' }}>{med.medicineForm}</span>
                            {med.prescriptionRequired === 'Yes' && (
                              <span className="badge-rx">Rx Required</span>
                            )}
                            {med.isBlocked && (
                              <span className="badge-blocked-pill">Blocked</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontStyle: med.genericName ? 'normal' : 'italic' }}>
                        {med.genericName || 'No Generic Name'}
                      </td>
                      <td>{med.category || '—'}</td>
                      <td>
                        <span style={{ fontWeight: '500' }}>
                          {med.agencyId?.agencyName || 'Deleted Agency'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '12px' }}>
                          <span>MRP: <strong>{formatCurrency(med.mrp)}</strong></span>
                          <span style={{ color: 'var(--text-secondary)' }}>Sale: {formatCurrency(med.sellingPrice)}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <strong style={{ color: isLowStock ? 'var(--error-color)' : 'inherit' }}>
                            {med.currentStock} {med.unitType}s
                          </strong>
                          {isLowStock && (
                            <span className="badge-low-stock">
                              <FaExclamationTriangle /> Low Stock (Min: {med.minimumStockLevel})
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${med.status.toLowerCase() === 'active' ? 'active' : 'inactive'}`} style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '700',
                          backgroundColor: med.status.toLowerCase() === 'active' ? 'var(--success-bg)' : '#F1F5F9',
                          color: med.status.toLowerCase() === 'active' ? 'var(--success-color)' : '#64748B'
                        }}>
                          {med.status}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            className="action-btn view" 
                            onClick={() => navigate(`/medicines/${med._id}`)}
                            title="View Details"
                          >
                            <FaEye />
                          </button>
                          <button 
                            className="action-btn edit" 
                            onClick={() => navigate(`/medicines/edit/${med._id}`)}
                            title="Edit Medicine"
                          >
                            <FaEdit />
                          </button>
                          <button 
                            className="action-btn delete" 
                            onClick={() => openDeleteModal(med)}
                            title="Delete Medicine"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile Responsive Cards list */}
            <div className="medicine-cards-grid">
              {medicines.map((med) => {
                const isLowStock = med.currentStock <= med.minimumStockLevel;
                return (
                  <div key={med._id} className="medicine-mobile-card" style={{ opacity: med.isBlocked ? 0.8 : 1 }}>
                    <div className="card-header-row">
                      <div className="card-title-group">
                        <h4>{med.medicineName} {med.strength && `(${med.strength})`}</h4>
                        <code>{med.medicineCode}</code>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                          <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#F1F5F9', color: '#475569', borderRadius: '4px' }}>{med.medicineForm}</span>
                          {med.prescriptionRequired === 'Yes' && (
                            <span className="badge-rx">Rx</span>
                          )}
                          {med.isBlocked && (
                            <span className="badge-blocked-pill">Blocked</span>
                          )}
                        </div>
                      </div>
                      <span className={`status-badge ${med.status.toLowerCase() === 'active' ? 'active' : 'inactive'}`} style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: '700',
                        backgroundColor: med.status.toLowerCase() === 'active' ? 'var(--success-bg)' : '#F1F5F9',
                        color: med.status.toLowerCase() === 'active' ? 'var(--success-color)' : '#64748B'
                      }}>
                        {med.status}
                      </span>
                    </div>
                    
                    <div className="card-body-row">
                      <div className="body-item">
                        <span className="body-item-label">Generic Name</span>
                        <span className="body-item-value" style={{ fontSize: '12px' }}>{med.genericName || '—'}</span>
                      </div>
                      <div className="body-item">
                        <span className="body-item-label">Category</span>
                        <span className="body-item-value">{med.category || '—'}</span>
                      </div>
                      <div className="body-item">
                        <span className="body-item-label">Supplier Agency</span>
                        <span className="body-item-value" style={{ fontSize: '12px' }}>{med.agencyId?.agencyName || 'Deleted'}</span>
                      </div>
                      <div className="body-item">
                        <span className="body-item-label">Stock Status</span>
                        <span className="body-item-value" style={{ color: isLowStock ? 'var(--error-color)' : 'inherit' }}>
                          {med.currentStock} {med.unitType}s
                          {isLowStock && ' (Low)'}
                        </span>
                      </div>
                      <div className="body-item">
                        <span className="body-item-label">MRP</span>
                        <span className="body-item-value">{formatCurrency(med.mrp)}</span>
                      </div>
                      <div className="body-item">
                        <span className="body-item-label">Sale Price</span>
                        <span className="body-item-value">{formatCurrency(med.sellingPrice)}</span>
                      </div>
                    </div>

                    <div className="card-actions-row">
                      <button className="card-action-btn view" onClick={() => navigate(`/medicines/${med._id}`)}>
                        <FaEye /> View
                      </button>
                      <button className="card-action-btn edit" onClick={() => navigate(`/medicines/edit/${med._id}`)}>
                        <FaEdit /> Edit
                      </button>
                      <button className="card-action-btn delete" onClick={() => openDeleteModal(med)}>
                        <FaTrash /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Table Pagination controls */}
            <div className="table-pagination-footer">
              <span className="pagination-info">
                Showing Page <strong>{page}</strong> of <strong>{pages}</strong> ({total} total medicines)
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
            <h3>Remove Medicine Record</h3>
            <p>
              Are you sure you want to delete <strong>{medicineToDelete?.medicineName}</strong>? 
              This will perform a soft-delete to retain logs and historical transaction indexes.
            </p>
            <div className="modal-buttons">
              <button 
                className="modal-btn cancel" 
                onClick={() => {
                  setDeleteModalOpen(false);
                  setMedicineToDelete(null);
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

export default MedicineList;
