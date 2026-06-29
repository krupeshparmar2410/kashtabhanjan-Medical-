import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { 
  FiArrowLeft, 
  FiCheckCircle, 
  FiPrinter, 
  FiAlertTriangle, 
  FiEdit3, 
  FiCalendar, 
  FiUser, 
  FiRotateCcw,
  FiBook,
  FiX
} from 'react-icons/fi';
import { purchaseAPI, inventoryAPI } from '../services/api';
import '../styles/PurchaseDetails.css';

const PurchaseDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [purchase, setPurchase] = useState(null);
  const [items, setItems] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [batchesMap, setBatchesMap] = useState({}); // maps purchaseItemId to batch object
  const [loading, setLoading] = useState(true);

  // Return Modal State
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnRemarks, setReturnRemarks] = useState('');
  const [returnItems, setReturnItems] = useState([]); // [{ medicineId, inventoryBatchId, quantity, purchasePrice }]
  const [submittingReturn, setSubmittingReturn] = useState(false);

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const data = await purchaseAPI.getPurchaseById(id);
      if (data.success) {
        setPurchase(data.purchase);
        setItems(data.items || []);
        setLedger(data.ledger || []);

        // If posted, fetch the inventory batches created from this invoice
        if (data.purchase.purchaseStatus === 'Posted') {
          fetchRelatedBatches(data.items);
        }
      }
    } catch (err) {
      console.error('Error fetching details:', err);
      alert('Error fetching invoice details.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedBatches = async (invoiceItems) => {
    try {
      // Find batches for these medicines
      const map = {};
      for (const item of invoiceItems) {
        const medId = item.medicineId._id || item.medicineId;
        const res = await inventoryAPI.getBatches({ medicineId: medId, limit: 50 });
        if (res.success && res.batches) {
          // Find the batch corresponding to this purchase item
          const matchedBatch = res.batches.find(b => b.purchaseItemId === item._id || b.batchNumber === item.batchNumber);
          if (matchedBatch) {
            map[item._id] = matchedBatch;
          }
        }
      }
      setBatchesMap(map);
    } catch (err) {
      console.error('Error loading related batches for return calculations:', err);
    }
  };

  const handlePostInvoice = async () => {
    if (window.confirm('Are you sure you want to Post this invoice? This action will write batch stocks into Inventory and credit the Supplier Ledger. It cannot be reverted.')) {
      try {
        setLoading(true);
        const res = await purchaseAPI.postPurchase(id);
        if (res.success) {
          alert('Purchase invoice posted successfully! Inventory updated.');
          fetchDetails();
        }
      } catch (err) {
        alert(err.response?.data?.message || 'Error posting purchase invoice');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleOpenReturnModal = () => {
    // Initialize return quantities to 0
    const initialReturns = items.map(item => {
      const batch = batchesMap[item._id];
      return {
        purchaseItemId: item._id,
        medicineId: item.medicineId._id || item.medicineId,
        medicineName: item.medicineId.medicineName,
        batchNumber: item.batchNumber,
        inventoryBatchId: batch ? batch._id : '',
        availableQuantity: batch ? batch.availableQuantity : 0,
        purchasePrice: item.purchasePrice,
        returnQty: 0
      };
    });
    setReturnItems(initialReturns);
    setReturnRemarks('');
    setShowReturnModal(true);
  };

  const handleReturnQtyChange = (index, val) => {
    const newReturns = [...returnItems];
    const qty = parseInt(val, 10) || 0;
    const limit = newReturns[index].availableQuantity;
    
    if (qty > limit) {
      alert(`Cannot return more than the currently available batch stock (${limit} units)`);
      newReturns[index].returnQty = limit;
    } else {
      newReturns[index].returnQty = qty;
    }
    setReturnItems(newReturns);
  };

  const handleProcessReturn = async () => {
    const activeReturns = returnItems.filter(item => item.returnQty > 0);
    if (activeReturns.length === 0) {
      alert('Please input return quantity for at least one item');
      return;
    }

    // Double check that all returned items have valid batch IDs mapped
    const invalidItem = activeReturns.find(item => !item.inventoryBatchId);
    if (invalidItem) {
      alert(`Cannot process return for ${invalidItem.medicineName}. Related batch stock code could not be resolved.`);
      return;
    }

    setSubmittingReturn(true);
    try {
      const payload = {
        purchaseId: purchase._id,
        agencyId: purchase.agencyId._id || purchase.agencyId,
        returnDate: new Date(),
        remarks: returnRemarks || `Purchase Return for invoice ${purchase.purchaseNumber}`,
        items: activeReturns.map(item => ({
          medicineId: item.medicineId,
          inventoryBatchId: item.inventoryBatchId,
          quantity: item.returnQty,
          purchasePrice: item.purchasePrice
        }))
      };

      const res = await purchaseAPI.createReturn(payload);
      if (res.success) {
        alert(res.message || 'Purchase return processed successfully!');
        setShowReturnModal(false);
        fetchDetails();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Error processing purchase return');
    } finally {
      setSubmittingReturn(false);
    }
  };

  if (loading && !purchase) {
    return (
      <div style={{ textAlign: 'center', padding: '100px', color: '#64748B' }}>
        <p>Loading invoice details...</p>
      </div>
    );
  }

  if (!purchase) {
    return (
      <div style={{ textAlign: 'center', padding: '100px', color: '#64748B' }}>
        <p>Invoice not found or deleted.</p>
        <Link to="/purchases" className="btn-secondary-action" style={{ display: 'inline-block', marginTop: '16px' }}>
          Back to Purchases
        </Link>
      </div>
    );
  }

  return (
    <div className="purchase-details-container">
      {/* Top Header Actions */}
      <div className="details-actions-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn-secondary-action" onClick={() => navigate('/purchases')} style={{ padding: '8px' }}>
            <FiArrowLeft style={{ fontSize: '18px' }} />
          </button>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: '800' }}>Invoice: {purchase.purchaseNumber}</h3>
            <span style={{ fontSize: '13px', color: '#64748B' }}>
              Status: <strong style={{ color: purchase.purchaseStatus === 'Posted' ? '#16A34A' : '#DC2626' }}>{purchase.purchaseStatus}</strong>
            </span>
          </div>
        </div>

        <div className="details-actions-wrapper">
          <button className="btn-secondary-action" onClick={() => window.print()}>
            <FiPrinter /> Print / Export PDF
          </button>
          
          {purchase.purchaseStatus === 'Draft' && (
            <>
              <button className="btn-secondary-action" onClick={() => navigate(`/purchases/edit/${purchase._id}`)}>
                <FiEdit3 /> Edit Draft
              </button>
              <button className="btn-primary-action" onClick={handlePostInvoice} style={{ backgroundColor: '#16A34A' }}>
                <FiCheckCircle /> Post Invoice
              </button>
            </>
          )}

          {purchase.purchaseStatus === 'Posted' && (
            <button className="btn-primary-action" onClick={handleOpenReturnModal} style={{ backgroundColor: '#DC2626' }}>
              <FiRotateCcw /> Process Return
            </button>
          )}
        </div>
      </div>

      {/* Main Body Grid */}
      <div className="details-card-grid">
        {/* Invoice Layout Page */}
        <div className="details-main-panel">
          <div className="print-invoice-layout">
            {/* Branding Header */}
            <div className="invoice-branding">
              <div className="branding-left">
                <h3>Kashtbhanjan Medical Store</h3>
                <p>Retail & Wholesale Pharmacy Supplies</p>
                <p style={{ fontSize: '12px', marginTop: '4px' }}>Phone: +91 98765 43210 | Email: billing@kashtbhanjan.com</p>
              </div>
              <div className="branding-right">
                <h4 style={{ color: '#64748B' }}>PURCHASE RECEIPT</h4>
                <p style={{ fontWeight: '700', color: '#1E293B' }}>{purchase.purchaseNumber}</p>
                <p>Date: {new Date(purchase.purchaseDate).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Address Grid */}
            <div className="invoice-address-grid">
              <div className="address-block">
                <strong>Supplier / Agency:</strong><br/>
                {purchase.agencyId?.agencyName}<br/>
                Contact: {purchase.agencyId?.contactPerson || 'N/A'}<br/>
                Phone: {purchase.agencyId?.phone}<br/>
                GSTIN: {purchase.agencyId?.gstNumber || 'N/A'}
              </div>
              <div className="address-block" style={{ textAlign: 'right' }}>
                <strong>Bill Reference:</strong><br/>
                Invoice No: {purchase.invoiceNumber}<br/>
                Invoice Date: {new Date(purchase.invoiceDate).toLocaleDateString()}<br/>
                Payment Method: {purchase.paymentMethod}<br/>
                Due Date: {purchase.dueDate ? new Date(purchase.dueDate).toLocaleDateString() : 'N/A'}
              </div>
            </div>

            {/* Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ padding: '10px', fontSize: '12px', color: '#64748B' }}>Medicine Name</th>
                  <th style={{ padding: '10px', fontSize: '12px', color: '#64748B' }}>Batch</th>
                  <th style={{ padding: '10px', fontSize: '12px', color: '#64748B', textAlign: 'center' }}>Expiry</th>
                  <th style={{ padding: '10px', fontSize: '12px', color: '#64748B', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '10px', fontSize: '12px', color: '#64748B', textAlign: 'right' }}>Free</th>
                  <th style={{ padding: '10px', fontSize: '12px', color: '#64748B', textAlign: 'right' }}>Cost (₹)</th>
                  <th style={{ padding: '10px', fontSize: '12px', color: '#64748B', textAlign: 'right' }}>GST %</th>
                  <th style={{ padding: '10px', fontSize: '12px', color: '#64748B', textAlign: 'right' }}>Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item._id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px', fontSize: '13px', fontWeight: '500' }}>{item.medicineId?.medicineName}</td>
                    <td style={{ padding: '10px', fontSize: '13px' }}>{item.batchNumber}</td>
                    <td style={{ padding: '10px', fontSize: '13px', textAlign: 'center' }}>
                      {new Date(item.expiryDate).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '10px', fontSize: '13px', textAlign: 'right' }}>{item.quantity}</td>
                    <td style={{ padding: '10px', fontSize: '13px', textAlign: 'right' }}>{item.freeQuantity}</td>
                    <td style={{ padding: '10px', fontSize: '13px', textAlign: 'right' }}>₹{item.purchasePrice?.toFixed(2)}</td>
                    <td style={{ padding: '10px', fontSize: '13px', textAlign: 'right' }}>{item.gstPercentage}%</td>
                    <td style={{ padding: '10px', fontSize: '13px', fontWeight: '600', textAlign: 'right' }}>
                      ₹{item.lineTotal?.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Invoice Footer Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', marginTop: '20px' }}>
              <div style={{ fontSize: '13px', color: '#64748B', paddingRight: '20px' }}>
                {purchase.remarks && (
                  <p><strong>Remarks:</strong> {purchase.remarks}</p>
                )}
              </div>
              <div>
                <table style={{ width: '100%', fontSize: '13px' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '4px 0' }}>Subtotal Value:</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: '600' }}>₹{purchase.billAmount?.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '4px 0' }}>Total GST Input:</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: '600' }}>₹{purchase.gstAmount?.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '4px 0' }}>Discount:</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: '600' }}>₹{purchase.discountAmount?.toFixed(2)}</td>
                    </tr>
                    <tr style={{ borderTop: '2px solid #E2E8F0', fontSize: '15px' }}>
                      <td style={{ padding: '8px 0', fontWeight: '800' }}>Grand Total:</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '800', color: 'var(--primary-color)' }}>
                        ₹{purchase.grandTotal?.toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '4px 0', color: '#16A34A' }}>Paid Amount:</td>
                      <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: '600', color: '#16A34A' }}>
                        ₹{purchase.paidAmount?.toFixed(2)}
                      </td>
                    </tr>
                    <tr style={{ borderTop: '1px dashed #E2E8F0' }}>
                      <td style={{ padding: '8px 0', fontWeight: '700', color: '#DC2626' }}>Outstanding Owed:</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: '700', color: '#DC2626' }}>
                        ₹{purchase.pendingAmount?.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar panels */}
        <div className="details-sidebar-panel">
          {/* Metadata Card */}
          <div className="sidebar-info-card">
            <h4>Billing Information</h4>
            <div className="meta-info-list">
              <div className="meta-info-item">
                <span className="label"><FiCalendar style={{ marginRight: '6px' }} /> Record Date</span>
                <span className="val">{new Date(purchase.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="meta-info-item">
                <span className="label"><FiUser style={{ marginRight: '6px' }} /> Created By</span>
                <span className="val">{purchase.createdBy?.name || 'System'}</span>
              </div>
              {purchase.approvedBy && (
                <>
                  <div className="meta-info-item">
                    <span className="label"><FiCheckCircle style={{ marginRight: '6px' }} /> Posted By</span>
                    <span className="val">{purchase.approvedBy?.name}</span>
                  </div>
                  <div className="meta-info-item">
                    <span className="label"><FiCalendar style={{ marginRight: '6px' }} /> Posted At</span>
                    <span className="val">{new Date(purchase.approvedAt).toLocaleDateString()}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Supplier Ledger Timeline */}
          <div className="sidebar-info-card">
            <h4>Supplier Ledger Postings</h4>
            {ledger.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#64748B', textAlign: 'center', padding: '10px 0' }}>
                No ledger postings generated yet. Post this invoice to trigger ledger audit logs.
              </p>
            ) : (
              <div className="ledger-timeline">
                {ledger.map(entry => (
                  <div 
                    key={entry._id} 
                    className={`ledger-timeline-item ${entry.transactionType?.toLowerCase().replace(' ', '-')}`}
                  >
                    <div className="ledger-item-title">
                      {entry.transactionType}: {entry.credit > 0 ? `+₹${entry.credit.toFixed(2)}` : `-₹${entry.debit.toFixed(2)}`}
                    </div>
                    <div className="ledger-item-meta">
                      Ref No: {entry.referenceNumber} | Bal: ₹{entry.runningBalance?.toFixed(2)}
                    </div>
                    <div className="ledger-item-meta" style={{ fontSize: '11px', fontStyle: 'italic' }}>
                      {entry.remarks}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Return Items Modal */}
      {showReturnModal && (
        <div className="csv-modal-backdrop" onClick={() => setShowReturnModal(false)}>
          <div className="csv-modal" style={{ maxWidth: '750px' }} onClick={(e) => e.stopPropagation()}>
            <div className="csv-modal-header">
              <h3>Process Purchase Return</h3>
              <button className="csv-modal-close" onClick={() => setShowReturnModal(false)}>
                <FiX />
              </button>
            </div>
            <div className="csv-modal-body">
              <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
                Enter return quantities for the medicines below. Stock batch quantities will adjust automatically, 
                and supplier ledger balances will record debit corrections.
              </p>
              
              <div className="purchase-table-wrapper" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="purchase-table">
                  <thead>
                    <tr>
                      <th>Medicine Name</th>
                      <th>Batch No</th>
                      <th>Batch Stock</th>
                      <th>Price (₹)</th>
                      <th style={{ width: '120px' }}>Return Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnItems.map((item, index) => (
                      <tr key={index}>
                        <td style={{ fontWeight: '600' }}>{item.medicineName}</td>
                        <td><code>{item.batchNumber}</code></td>
                        <td>{item.availableQuantity} units</td>
                        <td>₹{item.purchasePrice?.toFixed(2)}</td>
                        <td>
                          <input 
                            type="number" 
                            min="0"
                            max={item.availableQuantity}
                            value={item.returnQty}
                            onChange={(e) => handleReturnQtyChange(index, e.target.value)}
                            style={{ 
                              height: '34px', 
                              borderRadius: '4px', 
                              border: '1px solid #CBD5E1', 
                              padding: '0 8px',
                              width: '90px'
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="purchase-form-group" style={{ marginTop: '12px' }}>
                <label>Remarks for return *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Expired, damaged stock returned to supplier"
                  value={returnRemarks}
                  onChange={(e) => setReturnRemarks(e.target.value)}
                  style={{ marginTop: '4px' }}
                />
              </div>
            </div>
            <div className="csv-modal-footer">
              <button 
                className="btn-secondary-action" 
                onClick={() => setShowReturnModal(false)}
                disabled={submittingReturn}
              >
                Cancel
              </button>
              <button 
                className="btn-primary-action" 
                style={{ backgroundColor: '#DC2626' }}
                onClick={handleProcessReturn}
                disabled={submittingReturn}
              >
                {submittingReturn ? "Processing..." : "Process Return"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseDetails;
