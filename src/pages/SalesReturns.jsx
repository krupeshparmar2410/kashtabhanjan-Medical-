import React, { useState, useEffect } from 'react';
import { 
  FiSearch, 
  FiCornerUpLeft, 
  FiRefreshCw, 
  FiAlertCircle, 
  FiCheckCircle, 
  FiFileText, 
  FiCalendar, 
  FiDollarSign, 
  FiUser 
} from 'react-icons/fi';
import { saleAPI } from '../services/api';
import '../styles/SalesReturns.css';

const SalesReturns = () => {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sale, setSale] = useState(null);
  const [saleItems, setSaleItems] = useState([]);
  const [returnQtys, setReturnQtys] = useState({}); // { medicineId: qty }
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recentReturns, setRecentReturns] = useState([]);
  const [recentReturnsLoading, setRecentReturnsLoading] = useState(false);

  useEffect(() => {
    fetchRecentReturns();
  }, []);

  const fetchRecentReturns = async () => {
    setRecentReturnsLoading(true);
    try {
      const data = await saleAPI.getReturns();
      if (data.success) {
        setRecentReturns(data.returns || []);
      }
    } catch (err) {
      console.error('Error fetching recent returns:', err);
    } finally {
      setRecentReturnsLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!invoiceNo.trim()) return;

    setLoading(true);
    setError('');
    setSuccess('');
    setSale(null);
    setSaleItems([]);
    setReturnQtys({});

    try {
      const searchRes = await saleAPI.getSales({ search: invoiceNo.trim() });
      if (searchRes.success && searchRes.sales && searchRes.sales.length > 0) {
        // Find exact match or take first
        const matchedSale = searchRes.sales.find(
          s => s.invoiceNumber.toLowerCase() === invoiceNo.trim().toLowerCase()
        ) || searchRes.sales[0];

        // Fetch full sale details with items
        const detailsRes = await saleAPI.getSaleById(matchedSale._id);
        if (detailsRes.success) {
          setSale(detailsRes.sale);
          setSaleItems(detailsRes.items || []);
          
          // Initialize return quantities to 0
          const initialQtys = {};
          detailsRes.items.forEach(item => {
            initialQtys[item.medicineId._id || item.medicineId] = 0;
          });
          setReturnQtys(initialQtys);
        } else {
          setError('Failed to fetch detailed sale invoice data.');
        }
      } else {
        setError('No invoice found matching that number.');
      }
    } catch (err) {
      console.error('Error searching invoice:', err);
      setError(err.response?.data?.message || 'Error occurred while searching for the invoice.');
    } finally {
      setLoading(false);
    }
  };

  const handleQtyChange = (medicineId, maxQty, val) => {
    const qty = parseInt(val, 10) || 0;
    if (qty < 0) return;
    if (qty > maxQty) {
      setError(`Return quantity cannot exceed sold quantity of ${maxQty}`);
      return;
    }
    setError('');
    setReturnQtys(prev => ({
      ...prev,
      [medicineId]: qty
    }));
  };

  // Calculations
  const calculateRefundSummary = () => {
    let subtotal = 0;
    let gstAmount = 0;
    let refundTotal = 0;

    saleItems.forEach(item => {
      const medId = item.medicineId._id || item.medicineId;
      const qty = returnQtys[medId] || 0;
      if (qty > 0) {
        const itemTotal = qty * item.sellingPrice;
        const itemSubtotal = itemTotal / (1 + (item.gstPercentage / 100));
        const itemGst = itemTotal - itemSubtotal;

        subtotal += itemSubtotal;
        gstAmount += itemGst;
        refundTotal += itemTotal;
      }
    });

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      gstAmount: Math.round(gstAmount * 100) / 100,
      refundTotal: Math.round(refundTotal * 100) / 100
    };
  };

  const summary = calculateRefundSummary();

  const handleSubmitReturn = async () => {
    // Collect non-zero return items
    const itemsToReturn = Object.entries(returnQtys)
      .map(([medicineId, quantity]) => ({ medicineId, quantity }))
      .filter(item => item.quantity > 0);

    if (itemsToReturn.length === 0) {
      setError('Please select at least one item and set a return quantity greater than 0.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        saleId: sale._id,
        returnDate: new Date(),
        remarks: remarks || 'Customer sales return',
        items: itemsToReturn
      };

      const res = await saleAPI.createReturn(payload);
      if (res.success) {
        setSuccess(`Sales Return processed successfully! Refund Amount: ₹${summary.refundTotal}`);
        setSale(null);
        setSaleItems([]);
        setReturnQtys({});
        setRemarks('');
        setInvoiceNo('');
        fetchRecentReturns();
      } else {
        setError(res.message || 'Failed to submit sales return.');
      }
    } catch (err) {
      console.error('Error submitting return:', err);
      setError(err.response?.data?.message || 'Error occurred while processing sales return.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sales-returns-container">
      <div className="returns-header-section">
        <h2>Sales Returns & Refunds</h2>
      </div>

      {error && (
        <div className="alert-message alert-error">
          <FiAlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert-message alert-success">
          <FiCheckCircle size={18} />
          <span>{success}</span>
        </div>
      )}

      {/* Invoice Search Card */}
      <div className="search-card">
        <form onSubmit={handleSearch}>
          <div className="purchase-form-group">
            <label htmlFor="invoice-search">Search Invoice Number</label>
            <div className="search-input-group">
              <input
                id="invoice-search"
                type="text"
                placeholder="e.g. INV-000001 or original Invoice Number"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                disabled={loading || submitting}
              />
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={loading || !invoiceNo.trim()}
              >
                {loading ? <FiRefreshCw className="spinner" /> : <FiSearch />}
                Search
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Invoice Details & Return Action Grid */}
      {sale && (
        <div className="details-grid">
          {/* Main Return Form */}
          <div className="returns-card">
            <h3>Invoice details & Select items to return</h3>

            {/* Metadata Info */}
            <div className="metadata-grid">
              <div className="meta-item">
                <span>Invoice Number</span>
                <span>{sale.invoiceNumber}</span>
              </div>
              <div className="meta-item">
                <span>Customer</span>
                <span>
                  <FiUser style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  {sale.customerId?.name || 'Walk-in Customer'}
                </span>
              </div>
              <div className="meta-item">
                <span>Sale Date</span>
                <span>
                  <FiCalendar style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  {new Date(sale.saleDate).toLocaleDateString()}
                </span>
              </div>
              <div className="meta-item">
                <span>Payment Method</span>
                <span>
                  <span className={`badge badge-warning`}>
                    {sale.paymentMethod}
                  </span>
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="returns-table-wrapper">
              <table className="returns-table">
                <thead>
                  <tr>
                    <th>Medicine / Item</th>
                    <th>Sold Qty</th>
                    <th>Price</th>
                    <th>GST%</th>
                    <th>Return Qty</th>
                    <th>Refund Total</th>
                  </tr>
                </thead>
                <tbody>
                  {saleItems.map((item) => {
                    const medId = item.medicineId._id || item.medicineId;
                    const returnQty = returnQtys[medId] || 0;
                    return (
                      <tr key={item._id}>
                        <td style={{ fontWeight: '600' }}>
                          {item.medicineId?.name || 'Unknown Medicine'}
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '400', marginTop: '2px' }}>
                            Generic: {item.medicineId?.genericName || 'N/A'}
                          </div>
                        </td>
                        <td>{item.quantity} units</td>
                        <td>₹{item.sellingPrice.toFixed(2)}</td>
                        <td>{item.gstPercentage}%</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={returnQty}
                            onChange={(e) => handleQtyChange(medId, item.quantity, e.target.value)}
                            className="return-qty-input"
                            disabled={submitting}
                          />
                        </td>
                        <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>
                          ₹{(returnQty * item.sellingPrice).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Remarks Input */}
            <div className="purchase-form-group">
              <label htmlFor="return-remarks">Return Remarks</label>
              <textarea
                id="return-remarks"
                placeholder="Reason for return, customer feedback..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={submitting}
                style={{
                  height: '80px',
                  padding: '10px 12px',
                  borderRadius: 'var(--border-radius-sm)',
                  border: '1px solid var(--border-color)',
                  resize: 'vertical',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Right Side Summary */}
          <div className="returns-card refund-summary-card">
            <h3>Refund Summary</h3>
            
            <div className="summary-row">
              <span>Return Subtotal</span>
              <span>₹{summary.subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>GST Refund</span>
              <span>₹{summary.gstAmount.toFixed(2)}</span>
            </div>
            <div className="summary-row total">
              <span>Total Refund</span>
              <span>₹{summary.refundTotal.toFixed(2)}</span>
            </div>

            <div className="form-actions" style={{ marginTop: '12px', width: '100%' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSale(null)}
                disabled={submitting}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSubmitReturn}
                disabled={submitting || summary.refundTotal <= 0}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {submitting ? (
                  <>
                    <FiRefreshCw className="spinner" /> Processing...
                  </>
                ) : (
                  <>
                    <FiCornerUpLeft /> Submit Return
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Returns Table */}
      <div className="returns-card recent-returns-section">
        <h3>Recent Returns Processed</h3>
        
        {recentReturnsLoading ? (
          <div className="flex-center" style={{ padding: '24px' }}>
            <FiRefreshCw className="spinner" size={24} />
          </div>
        ) : recentReturns.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '16px' }}>
            No sales returns processed yet.
          </p>
        ) : (
          <div className="returns-table-wrapper">
            <table className="returns-table">
              <thead>
                <tr>
                  <th>Return ID</th>
                  <th>Original Invoice</th>
                  <th>Customer</th>
                  <th>Return Date</th>
                  <th>Refund Amount</th>
                  <th>Processed By</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {recentReturns.map((ret) => (
                  <tr key={ret._id}>
                    <td style={{ fontWeight: '600' }}>{ret.returnNumber}</td>
                    <td>{ret.saleId?.invoiceNumber || 'N/A'}</td>
                    <td>{ret.customerId?.name || 'Walk-in'}</td>
                    <td>
                      <FiCalendar style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      {new Date(ret.returnDate).toLocaleDateString()}
                    </td>
                    <td style={{ fontWeight: '700', color: 'var(--success-color)' }}>
                      ₹{ret.refundAmount.toFixed(2)}
                    </td>
                    <td>{ret.createdBy?.name || 'System'}</td>
                    <td>{ret.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesReturns;
