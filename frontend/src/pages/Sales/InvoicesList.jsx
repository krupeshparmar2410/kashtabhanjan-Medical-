import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiEye, FiTrash2, FiSearch, FiRefreshCw, FiFileText } from 'react-icons/fi';
import { saleAPI } from '../../services/api';
import '../../styles/PurchaseList.css'; // Reuse existing table styles

const InvoicesList = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 10, search };
      const data = await saleAPI.getSales(params);
      if (data.success) {
        setSales(data.sales || []);
        setPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.totalRecords || 0);
      }
    } catch (err) {
      console.error('Error fetching sales:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [page, search]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchSales();
  };

  const handleDeleteSale = async (id) => {
    if (window.confirm('Are you sure you want to cancel this invoice? Stock and customer balances will be rolled back.')) {
      try {
        const res = await saleAPI.cancelSale(id);
        if (res.success) {
          alert(res.message || 'Invoice cancelled successfully');
          fetchSales();
        }
      } catch (err) {
        alert(err.response?.data?.message || 'Error cancelling invoice');
      }
    }
  };

  return (
    <div className="purchase-list-container">
      <div className="purchase-actions-bar">
        <div className="purchase-title-area">
          <h2>Invoices</h2>
          <p>Manage sales invoices, returns, and reprints.</p>
        </div>
        <div className="purchase-buttons-wrapper">
          <button className="btn-primary-action" onClick={() => navigate('/sales/add')}>
            <FiPlus /> New Invoice
          </button>
        </div>
      </div>

      <form onSubmit={handleSearchSubmit} className="filters-container" style={{ marginTop: '20px' }}>
        <div className="filter-item">
          <label>Search Invoice</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search Invoice # / Customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px', width: '250px' }}
            />
            <FiSearch style={{ position: 'absolute', left: '12px', top: '10px', color: '#94A3B8' }} />
          </div>
        </div>
        <button type="submit" className="btn-primary-action" style={{ height: '38px', marginLeft: '12px' }}>
          Search
        </button>
        <button type="button" className="btn-reset-filters" onClick={() => { setSearch(''); setPage(1); fetchSales(); }} style={{ height: '38px', marginLeft: '8px' }}>
          <FiRefreshCw /> Reset
        </button>
      </form>

      <div className="purchase-table-card" style={{ marginTop: '20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
            <FiRefreshCw className="spin" style={{ fontSize: '24px', marginBottom: '8px' }} />
            <p>Loading invoices...</p>
          </div>
        ) : sales.length === 0 ? (
          <div className="empty-purchase-state">
            <FiFileText className="empty-purchase-icon" />
            <h3>No Invoices Found</h3>
            <p>There are no sales invoices matching your criteria.</p>
          </div>
        ) : (
          <div className="purchase-table-wrapper">
            <table className="purchase-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Grand Total</th>
                  <th>Payment Method</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s._id}>
                    <td style={{ fontWeight: '600' }}>{s.invoiceNumber}</td>
                    <td>{new Date(s.saleDate).toLocaleDateString()}</td>
                    <td>{s.customerId?.name || 'N/A'}</td>
                    <td style={{ fontWeight: '700' }}>₹{s.grandTotal?.toFixed(2)}</td>
                    <td>{s.paymentMethod || 'N/A'}</td>
                    <td><span className={`status-pill ${s.invoiceStatus?.toLowerCase()}`}>{s.invoiceStatus}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn-view-details" title="View / Print Invoice" onClick={() => navigate(`/sales/invoices/${s._id}`)}>
                          <FiEye />
                        </button>
                        {s.invoiceStatus !== 'Cancelled' && (
                          <button className="btn-view-details" title="Cancel Invoice" onClick={() => handleDeleteSale(s._id)} style={{ color: '#DC2626' }}>
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
        )}
      </div>

      <div className="pagination-container" style={{ marginTop: '20px' }}>
        <span className="pagination-info">
          Showing {sales.length} of {total} invoices
        </span>
        <div className="pagination-controls">
          <button className="btn-pagination" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button className="btn-pagination" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoicesList;
