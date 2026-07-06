import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { customerAPI } from '../services/api';

const CustomersList = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [isDeletedView, setIsDeletedView] = useState(false);

  // Modal states for Add/Edit
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    creditLimit: 5000,
    creditDays: 30
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadCustomers = async () => {
    try {
      const res = await customerAPI.getCustomers({ page, search, isDeleted: isDeletedView });
      if (res.success) {
        setCustomers(res.customers);
        setPages(res.pages);
      }
    } catch (err) {
      setError('Failed to fetch customers list');
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [page, search, isDeletedView]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      creditLimit: 5000,
      creditDays: 30
    });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (cust) => {
    setEditingId(cust._id);
    setFormData({
      name: cust.name,
      phone: cust.phone,
      email: cust.email || '',
      address: cust.address || '',
      city: cust.city || '',
      state: cust.state || '',
      pincode: cust.pincode || '',
      creditLimit: cust.creditLimit || 5000,
      creditDays: cust.creditDays || 30
    });
    setError('');
    setShowModal(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name || !formData.phone) {
      setError('Customer Name and Phone are required.');
      return;
    }

    try {
      if (editingId) {
        // Edit Customer
        const res = await customerAPI.updateCustomer(editingId, formData);
        if (res.success) {
          setSuccess('Customer profile updated successfully.');
          setShowModal(false);
          loadCustomers();
        }
      } else {
        // Add Customer
        const res = await customerAPI.createCustomer(formData);
        if (res.success) {
          setSuccess('Customer profile registered successfully.');
          setShowModal(false);
          loadCustomers();
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Transaction failed');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        const res = await customerAPI.deleteCustomer(id);
        if (res.success) {
          setSuccess('Customer profile soft-deleted.');
          loadCustomers();
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Delete operation failed');
      }
    }
  };

  const handleRestore = async (id) => {
    try {
      const res = await customerAPI.restoreCustomer(id);
      if (res.success) {
        setSuccess('Customer profile restored successfully.');
        loadCustomers();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Restore operation failed');
    }
  };

  return (
    <div className="card-container">
      <div className="form-card" style={{ maxWidth: '100%' }}>
        <div className="form-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, var(--sidebar-bg), var(--sidebar-hover))', padding: '1rem 1.5rem', borderRadius: '8px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#fff' }}>Registered Customer Directory</h2>
            <p style={{ margin: '0.25rem 0 0', color: '#e5e7eb', fontSize: '0.9rem' }}>Maintain loyalty ratios, outstanding credit, and profile audits</p>
          </div>
          <button className="btn btn-primary" style={{ background: '#0d9488', border: 'none' }} onClick={openAddModal}>
            Register Customer
          </button>
        </div>

        {error && <div className="error-message" style={{ margin: '16px' }}>{error}</div>}
        {success && <div className="success-message" style={{ margin: '16px' }}>{success}</div>}

        {/* Directory Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: '300px' }}
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button
            type="button"
            className="btn btn-secondary"
            style={{ background: isDeletedView ? '#fee2e2' : '#fff', color: isDeletedView ? '#b91c1c' : '#475569', border: isDeletedView ? '1px solid #fca5a5' : '1px solid #cbd5e1' }}
            onClick={() => {
              setIsDeletedView(!isDeletedView);
              setPage(1);
            }}
          >
            {isDeletedView ? 'View Active Customers' : 'View Deleted Recovery'}
          </button>
        </div>

        {/* Customers Table */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', overflowX: 'auto', padding: '20px', margin: '20px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--sidebar-bg)', color: '#fff', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Customer Name</th>
                <th style={{ padding: '12px' }}>Phone Number</th>
                <th style={{ padding: '12px' }}>Loyalty Points</th>
                <th style={{ padding: '12px' }}>Outstanding Credit</th>
                <th style={{ padding: '12px' }}>Credit Parameters</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                    No matching customer profiles found.
                  </td>
                </tr>
              ) : (
                customers.map((cust) => (
                  <tr key={cust._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{ color: '#0d9488', fontWeight: 600, cursor: 'pointer' }}
                        onClick={() => navigate(`/customers/${cust._id}`)}
                      >
                        {cust.name}
                      </span>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{cust.email || 'No Email'}</div>
                    </td>
                    <td style={{ padding: '12px' }}>{cust.phone}</td>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#16a34a' }}>{cust.loyaltyPoints} pts</td>
                    <td style={{ padding: '12px', fontWeight: 600, color: cust.outstandingBalance > 0 ? '#b91c1c' : '#1e293b' }}>
                      ₹{cust.outstandingBalance.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px' }}>
                      Limit: ₹{cust.creditLimit || 5000} | Term: {cust.creditDays || 30} days
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {isDeletedView ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ background: '#16a34a', border: 'none', padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => handleRestore(cust._id)}
                        >
                          Restore Profile
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => openEditModal(cust)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '12px', color: '#ef4444', border: '1px solid #fca5a5' }}
                            onClick={() => handleDelete(cust._id)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', padding: '10px' }}>
            <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span style={{ alignSelf: 'center' }}>Page {page} of {pages}</span>
            <button className="btn btn-secondary" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="modal-content" style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '500px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#1e293b' }}>
              {editingId ? 'Edit Customer Profile' : 'Register Customer Profile'}
            </h3>
            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    name="name"
                    className="form-input"
                    value={formData.name}
                    onChange={handleInputChange}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Phone *</label>
                  <input
                    type="text"
                    name="phone"
                    className="form-input"
                    value={formData.phone}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  name="email"
                  className="form-input"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>

              <div>
                <label className="form-label">Street Address</label>
                <input
                  type="text"
                  name="address"
                  className="form-input"
                  value={formData.address}
                  onChange={handleInputChange}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">City</label>
                  <input
                    type="text"
                    name="city"
                    className="form-input"
                    value={formData.city}
                    onChange={handleInputChange}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">State</label>
                  <input
                    type="text"
                    name="state"
                    className="form-input"
                    value={formData.state}
                    onChange={handleInputChange}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Pincode</label>
                  <input
                    type="text"
                    name="pincode"
                    className="form-input"
                    value={formData.pincode}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid #cbd5e1', paddingTop: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Allowed Credit Limit (₹)</label>
                  <input
                    type="number"
                    name="creditLimit"
                    className="form-input"
                    value={formData.creditLimit}
                    onChange={handleInputChange}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Credit Days Term</label>
                  <input
                    type="number"
                    name="creditDays"
                    className="form-input"
                    value={formData.creditDays}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, background: '#0d9488', border: 'none' }}
                >
                  {editingId ? 'Save Changes' : 'Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomersList;
