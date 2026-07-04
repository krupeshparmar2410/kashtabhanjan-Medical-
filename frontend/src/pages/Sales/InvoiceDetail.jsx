import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { saleAPI } from '../../services/api';
import '../../styles/InvoiceDetail.css';
import { FiPrinter, FiTrash2, FiArrowLeft } from 'react-icons/fi';
import shopInfo from '../../config/shopInfo';

const InvoiceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const detailRef = useRef(null);

  const [sale, setSale] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch invoice data
  useEffect(() => {
    const fetchSale = async () => {
      try {
        const res = await saleAPI.getSaleById(id);
        if (res.success) {
          setSale(res.sale);

          setItems(res.items || []);
        } else {
          setError(res.message || 'Failed to load invoice');
        }
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Server error');
      } finally {
        setLoading(false);
      }
    };
    fetchSale();
  }, [id]);

  const handlePrint = () => {
    if (!detailRef.current) return;
    const printWindow = window.open('', '_blank');
    // Clone content and strip out the action buttons
    const clone = document.createElement('div');
    clone.innerHTML = detailRef.current.innerHTML;
    const actions = clone.querySelector('.invoice-actions');
    if (actions) actions.remove();
    // Move date into shop-header and remove invoice-header row
    const dateElem = clone.querySelector('.invoice-header-right p');
    const dateText = dateElem ? dateElem.textContent.trim() : '';
    // Remove the whole invoice-header row
    const invoiceHeader = clone.querySelector('.invoice-header');
    if (invoiceHeader) invoiceHeader.remove();
    // Reformat shop-header: wrap existing content in a center div and append date div
    const shopHeader = clone.querySelector('.shop-header');
    if (shopHeader) {
      const centerDiv = document.createElement('div');
      centerDiv.className = 'shop-header-center';
      // move all existing children into centerDiv
      while (shopHeader.firstChild) {
        centerDiv.appendChild(shopHeader.firstChild);
      }
      shopHeader.appendChild(centerDiv);
      if (dateText) {
        const dateDiv = document.createElement('div');
        dateDiv.className = 'shop-header-date';
        dateDiv.textContent = dateText;
        shopHeader.appendChild(dateDiv);
      }
    }
    const printableContent = clone.innerHTML;
    printWindow.document.write(`
      <html>
        <head>
          <title>${shopInfo.name} - Invoice #${sale?.invoiceNumber ?? ''}</title>
          <style>
            @media print { body { padding: 0; margin: 0; } }
            body { font-family: 'Inter', sans-serif; background: #fff; color: #000; }
            .shop-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
.shop-header-center { flex: 1; text-align: center; }
.shop-header-date { font-size: 13px; color: #555; white-space: nowrap; }
            .invoice-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .invoice-table th, .invoice-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .invoice-table th { background: #f2f2f2; }
            .summary-card { border: 1px solid #ddd; padding: 10px; margin-top: 10px; }
            .summary-card p { margin: 4px 0; }
            .status-pill.draft { background: #fff3cd; color: #856404; }
            .status-pill.completed { background: #d4edda; color: #155724; }
            .status-pill.cancelled { background: #f8d7da; color: #721c24; }
            .status-pill.returned { background: #f8d7da; color: #721c24; }
            .status-pill { display:inline-block; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:600; }
          .invoice-header { display: flex; align-items: flex-start; border-bottom: 1px solid #000; padding-bottom: 16px; }
.invoice-header-left { display: flex; flex-direction: column; gap: 6px; }
.invoice-header-right { text-align: right; margin-left: auto; }

</style>
        </head>
        <body onload="window.print(); window.close();">
          ${printableContent}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this invoice? This will revert stock and balances.')) return;
    try {
      const res = await saleAPI.cancelSale(id);
      if (res.success) {
        alert(res.message || 'Invoice cancelled');
        navigate('/sales/invoices');
      } else {
        alert(res.message || 'Failed to cancel');
      }
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Server error');
    }
  };

  if (loading) {
    return <div className="invoice-detail-container"><p>Loading invoice...</p></div>;
  }

  if (error) {
    return <div className="invoice-detail-container"><p className="text-danger">{error}</p></div>;
  }

  if (!sale) {
    return <div className="invoice-detail-container"><p>No invoice data.</p></div>;
  }

  const {
    invoiceNumber,
    saleDate,
    invoiceStatus,
    customerId,
    subtotal,
    gstAmount,
    discountAmount,
    loyaltyPointsRedeemed,
    grandTotal,
    paymentMethod,
    remarks,
    prescriptionNumber,
  } = sale;
  // Compute item level discounts sum
  const itemDiscounts = items?.reduce((sum, it) => sum + (it.discountAmount || 0), 0);
  const overallDiscount = discountAmount;
  const loyaltyDiscount = loyaltyPointsRedeemed;
  const redeemLoyalty = loyaltyPointsRedeemed > 0;

  return (
    <div className="invoice-detail-container" ref={detailRef}>
      <div className="shop-header">
        <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>{shopInfo.name}</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{shopInfo.address}</p>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{shopInfo.contact}</p>
      </div>
      <div className="invoice-header">
        <div className="invoice-header-left">
          <h1>Invoice #{invoiceNumber}</h1>
          <span className={`status-pill ${invoiceStatus?.toLowerCase()}`}>{invoiceStatus}</span>
        </div>
        <div className="invoice-header-right">
          <p>{new Date(saleDate).toLocaleDateString()}</p>
        </div>
      </div>
      <div className="invoice-actions">
        <button className="btn-action" onClick={() => navigate('/sales/invoices')} title="Back to List">
          <FiArrowLeft /> Back
        </button>
        <button className="btn-action" onClick={handlePrint} title="Print Invoice">
          <FiPrinter /> Print
        </button>
        {invoiceStatus !== 'Cancelled' && (
          <button className="btn-action" onClick={handleCancel} title="Cancel Invoice" style={{ color: 'var(--error-color)' }}>
            <FiTrash2 /> Cancel
          </button>
        )}
      </div>

      <section className="customer-section">
        <h2>Customer</h2>
        <p><strong>Name:</strong> {customerId?.name || 'N/A'}</p>
        <p><strong>Phone:</strong> {customerId?.phone || 'N/A'}</p>
        {customerId?.loyaltyPoints !== undefined && (
          <p><strong>Loyalty Points:</strong> {customerId.loyaltyPoints}</p>
        )}
      </section>

      <section className="items-section">
        <h2>Items</h2>
        <table className="invoice-table">
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Batch</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Discount %</th>
              <th>GST %</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items?.length > 0 ? items.map((item, idx) => (
              <tr key={idx}>
                <td>{item.medicineName || item.medicineId}</td>
                <td>{item.batchNumber || '—'}</td>
                <td>{item.quantity}</td>
                <td>₹{item.sellingPrice?.toFixed(2)}</td>
                <td>{item.discountPercentage ?? 0}%</td>
                <td>{item.gstPercentage ?? 0}%</td>
                <td>₹{(item.quantity * item.sellingPrice * (1 - (item.discountPercentage || 0) / 100) * (1 + (item.gstPercentage || 0) / 100)).toFixed(2)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center' }}>No items found</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="summary-section">
        <h2>Summary</h2>
        <div className="summary-card">
          <p><strong>Subtotal:</strong> ₹{subtotal?.toFixed(2)}</p>
          <p><strong>Item Discounts:</strong> -₹{itemDiscounts?.toFixed(2)}</p>
          <p><strong>GST:</strong> +₹{gstAmount?.toFixed(2)}</p>
          <p><strong>Overall Discount:</strong> -₹{overallDiscount?.toFixed(2)}</p>
          {redeemLoyalty && <p><strong>Loyalty Discount:</strong> -₹{loyaltyDiscount?.toFixed(2)}</p>}
          <hr />
          <p className="grand-total"><strong>Grand Total:</strong> ₹{grandTotal?.toFixed(2)}</p>
          <p><strong>Payment Method:</strong> {paymentMethod}</p>
          {remarks && <p><strong>Remarks:</strong> {remarks}</p>}
          {prescriptionNumber && <p><strong>Prescription #:</strong> {prescriptionNumber}</p>}
        </div>
      </section>
    </div>
  );
};

export default InvoiceDetail;
