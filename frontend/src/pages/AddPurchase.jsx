import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiSave, FiX, FiPlus, FiTrash2 } from 'react-icons/fi';
import { purchaseAPI, agencyAPI, medicineAPI } from '../services/api';
import '../styles/AddPurchase.css';

const AddPurchase = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // For edit mode

  const [agencies, setAgencies] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form Fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [agencyId, setAgencyId] = useState('');
  const [creditDays, setCreditDays] = useState(30);
  const [paymentMethod, setPaymentMethod] = useState('Credit');
  const [remarks, setRemarks] = useState('');

  // Invoice Items
  const [items, setItems] = useState([
    {
      medicineId: '',
      batchNumber: '',
      expiryDate: '',
      quantity: '',
      freeQuantity: 0,
      purchasePrice: 0,
      sellingPrice: 0,
      mrp: 0,
      gstPercentage: 12,
      discountPercentage: 0,
      lineTotal: 0
    }
  ]);

  // Billing Totals
  const [billAmount, setBillAmount] = useState(0);
  const [gstAmount, setGstAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);

  useEffect(() => {
    fetchAgencies();
    fetchMedicines();
    if (id) {
      fetchPurchaseDetailsForEdit();
    }
  }, [id]);

  // Recalculate totals whenever items or paidAmount changes
  useEffect(() => {
    calculateTotals();
  }, [items, paidAmount]);

  const fetchAgencies = async () => {
    try {
      const data = await agencyAPI.getAgencies({ limit: 100 });
      if (data.success) {
        setAgencies(data.agencies || []);
      }
    } catch (err) {
      console.error('Error fetching agencies:', err);
    }
  };

  const fetchMedicines = async () => {
    try {
      const data = await medicineAPI.getMedicines({ limit: 200 });
      if (data.success) {
        setMedicines(data.medicines || []);
      }
    } catch (err) {
      console.error('Error fetching medicines:', err);
    }
  };

  const fetchPurchaseDetailsForEdit = async () => {
    setLoading(true);
    try {
      const data = await purchaseAPI.getPurchaseById(id);
      if (data.success && data.purchase) {
        const p = data.purchase;
        if (p.purchaseStatus !== 'Draft') {
          alert('Only Draft invoices can be updated.');
          navigate('/purchases');
          return;
        }
        setInvoiceNumber(p.invoiceNumber);
        setInvoiceDate(new Date(p.invoiceDate).toISOString().split('T')[0]);
        setPurchaseDate(new Date(p.purchaseDate).toISOString().split('T')[0]);
        setAgencyId(p.agencyId._id || p.agencyId);
        setCreditDays(p.creditDays);
        setPaymentMethod(p.paymentMethod);
        setRemarks(p.remarks);
        setPaidAmount(p.paidAmount);

        // Map items
        if (data.items) {
          const mappedItems = data.items.map(item => ({
            medicineId: item.medicineId._id || item.medicineId,
            batchNumber: item.batchNumber,
            expiryDate: new Date(item.expiryDate).toISOString().split('T')[0],
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            purchasePrice: item.purchasePrice,
            sellingPrice: item.sellingPrice,
            mrp: item.mrp,
            gstPercentage: item.gstPercentage,
            discountPercentage: item.discountPercentage,
            lineTotal: item.lineTotal
          }));
          setItems(mappedItems);
        }
      }
    } catch (err) {
      console.error('Error fetching purchase edit details:', err);
      alert('Error fetching invoice details for editing.');
    } finally {
      setLoading(false);
    }
  };

  const handleAgencyChange = (e) => {
    const selectedId = e.target.value;
    setAgencyId(selectedId);
    
    // Autofill creditDays from agency config
    const agencyObj = agencies.find(a => a._id === selectedId);
    if (agencyObj) {
      setCreditDays(agencyObj.creditDays || 0);
      if (agencyObj.creditDays > 0) {
        setPaymentMethod('Credit');
      } else {
        setPaymentMethod('Cash');
      }
    }
  };

  const handleItemMedicineChange = (index, medId) => {
    const newItems = [...items];
    const medObj = medicines.find(m => m._id === medId);
    
    if (medObj) {
      newItems[index] = {
        ...newItems[index],
        medicineId: medId,
        purchasePrice: medObj.purchasePrice || 0,
        sellingPrice: medObj.sellingPrice || 0,
        mrp: medObj.mrp || 0,
        gstPercentage: medObj.gstPercentage || 12
      };
      setItems(newItems);
    } else {
      newItems[index] = {
        ...newItems[index],
        medicineId: '',
        purchasePrice: 0,
        sellingPrice: 0,
        mrp: 0
      };
      setItems(newItems);
    }
  };

  const handleItemFieldChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      [field]: value
    };
    setItems(newItems);
  };

  const calculateTotals = () => {
    let billSub = 0;
    let gstSub = 0;
    let discSub = 0;
    let grandSub = 0;
    let itemsChanged = false;

    const updatedItems = items.map(item => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.purchasePrice) || 0;
      const gstPct = parseFloat(item.gstPercentage) || 0;
      const discPct = parseFloat(item.discountPercentage) || 0;

      const baseVal = qty * price;
      const discVal = baseVal * (discPct / 100);
      const taxableVal = baseVal - discVal;
      const gstVal = taxableVal * (gstPct / 100);
      const itemTotal = taxableVal + gstVal;

      billSub += baseVal;
      discSub += discVal;
      gstSub += gstVal;
      grandSub += itemTotal;

      const newLineTotal = Math.round(itemTotal * 100) / 100;
      if (item.lineTotal !== newLineTotal) {
        itemsChanged = true;
      }

      return {
        ...item,
        lineTotal: newLineTotal
      };
    });

    if (itemsChanged) {
      setItems(updatedItems);
    }

    // We avoid infinite loop because calculateTotals is triggered only when items/paidAmount change, 
    // and we only update state if the rounded grand totals differ or on direct changes.
    // Let's do a deep comparison or set the state variables directly safely.
    setBillAmount(Math.round(billSub * 100) / 100);
    setDiscountAmount(Math.round(discSub * 100) / 100);
    setGstAmount(Math.round(gstSub * 100) / 100);
    setGrandTotal(Math.round(grandSub * 100) / 100);
    
    const paidVal = parseFloat(paidAmount) || 0;
    const pendingVal = grandSub - paidVal;
    setPendingAmount(Math.round(Math.max(0, pendingVal) * 100) / 100);
  };

  const handleAddRow = () => {
    setItems([
      ...items,
      {
        medicineId: '',
        batchNumber: '',
        expiryDate: '',
        quantity: '',
        freeQuantity: 0,
        purchasePrice: 0,
        sellingPrice: 0,
        mrp: 0,
        gstPercentage: 12,
        discountPercentage: 0,
        lineTotal: 0
      }
    ]);
  };

  const handleRemoveRow = (index) => {
    if (items.length === 1) return;
    const newItems = items.filter((_, idx) => idx !== index);
    setItems(newItems);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!agencyId) {
      alert('Please select a supplier agency');
      return;
    }
    if (!invoiceNumber) {
      alert('Invoice number is required');
      return;
    }

    // Validate items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.medicineId) {
        alert(`Please select a medicine at line ${i + 1}`);
        return;
      }
      if (!item.batchNumber) {
        alert(`Please input a batch number at line ${i + 1}`);
        return;
      }
      if (!item.quantity || Number(item.quantity) <= 0) {
        alert(`Quantity must be greater than zero at line ${i + 1}`);
        return;
      }
      if (!item.expiryDate) {
        alert(`Expiry date is required at line ${i + 1}`);
        return;
      }
      if (Number(item.sellingPrice) > Number(item.mrp)) {
        alert(`Selling price cannot exceed MRP at line ${i + 1}`);
        return;
      }
    }

    setLoading(true);
    try {
      const payloadItems = items.map(item => {
        const newItem = { ...item };
        delete newItem.manufacturingDate;
        return newItem;
      });

      const payload = {
        invoiceNumber,
        invoiceDate,
        purchaseDate,
        agencyId,
        billAmount,
        gstAmount,
        discountAmount,
        grandTotal,
        paidAmount,
        creditDays,
        paymentMethod,
        remarks,
        items: payloadItems
      };

      let res;
      if (id) {
        res = await purchaseAPI.updatePurchase(id, payload);
      } else {
        res = await purchaseAPI.createPurchase(payload);
      }

      if (res.success) {
        alert(id ? 'Draft invoice updated successfully!' : 'Purchase draft saved successfully!');
        navigate('/purchases');
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Error saving purchase draft');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-purchase-container">
      <div className="purchase-header-section">
        <div>
          <h2>{id ? "Edit Purchase Draft" : "Record Purchase Invoice"}</h2>
          <p style={{ color: '#64748B', fontSize: '14px' }}>
            {id ? "Modify draft purchase items." : "Enter a supplier invoice bill. Stock will populate in Inventory after posting/approval."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="add-purchase-card">
        {/* Invoice Header Details */}
        <div className="form-grid-4">
          <div className="purchase-form-group">
            <label>Supplier Agency *</label>
            <select value={agencyId} onChange={handleAgencyChange} required>
              <option value="">-- Select Agency --</option>
              {agencies.map(a => (
                <option key={a._id} value={a._id}>{a.agencyName}</option>
              ))}
            </select>
          </div>

          <div className="purchase-form-group">
            <label>Invoice Number *</label>
            <input 
              type="text" 
              placeholder="e.g. INV-1002" 
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              required
            />
          </div>

          <div className="purchase-form-group">
            <label>Invoice Date *</label>
            <input 
              type="date" 
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              required
            />
          </div>

          <div className="purchase-form-group">
            <label>Purchase Date *</label>
            <input 
              type="date" 
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Lines Items Table */}
        <div className="items-table-section">
          <h3>Line Items / Medicine Batches</h3>
          <div className="items-table-wrapper">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: '25%' }}>Medicine Name *</th>
                  <th style={{ width: '12%' }}>Batch No *</th>
                  <th style={{ width: '10%' }}>Exp Date *</th>
                  <th style={{ width: '8%' }}>Qty *</th>
                  <th style={{ width: '6%' }}>Free Qty</th>
                  <th style={{ width: '8%' }}>Cost (₹) *</th>
                  <th style={{ width: '8%' }}>Selling (₹) *</th>
                  <th style={{ width: '8%' }}>MRP (₹) *</th>
                  <th style={{ width: '6%' }}>DISCOUNT %</th>
                  <th style={{ width: '6%' }}>GST %</th>
                  <th style={{ width: '8%' }}>Total (₹)</th>
                  <th style={{ width: '4%' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <select 
                        value={item.medicineId} 
                        onChange={(e) => handleItemMedicineChange(index, e.target.value)}
                        required
                      >
                        <option value="">-- Select --</option>
                        {medicines.map(m => (
                          <option key={m._id} value={m._id}>{m.medicineName}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input 
                        type="text" 
                        placeholder="e.g. B-01" 
                        value={item.batchNumber}
                        onChange={(e) => handleItemFieldChange(index, 'batchNumber', e.target.value)}
                        required
                      />
                    </td>

                    <td>
                      <input 
                        type="date" 
                        value={item.expiryDate}
                        onChange={(e) => handleItemFieldChange(index, 'expiryDate', e.target.value)}
                        required
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        min="0.01"
                        step="0.01"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleItemFieldChange(index, 'quantity', parseFloat(e.target.value))}
                        required
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        min="0"
                        step="0.01"
                        value={item.freeQuantity}
                        onChange={(e) => handleItemFieldChange(index, 'freeQuantity', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0"
                        value={item.purchasePrice}
                        onChange={(e) => handleItemFieldChange(index, 'purchasePrice', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0"
                        value={item.sellingPrice}
                        onChange={(e) => handleItemFieldChange(index, 'sellingPrice', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0"
                        value={item.mrp}
                        onChange={(e) => handleItemFieldChange(index, 'mrp', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={item.discountPercentage}
                        onChange={(e) => handleItemFieldChange(index, 'discountPercentage', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        min="0"
                        value={item.gstPercentage}
                        onChange={(e) => handleItemFieldChange(index, 'gstPercentage', parseInt(e.target.value, 10) || 0)}
                      />
                    </td>
                    <td style={{ fontWeight: '700', fontSize: '13px', textAlign: 'right', paddingRight: '12px' }}>
                      ₹{item.lineTotal?.toFixed(2)}
                    </td>
                    <td>
                      <button 
                        type="button" 
                        className="btn-remove-row"
                        onClick={() => handleRemoveRow(index)}
                        disabled={items.length === 1}
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-add-row" onClick={handleAddRow}>
            <FiPlus /> Add Line Item
          </button>
        </div>

        {/* Form Footer Totals Workspace */}
        <div className="purchase-footer-workspace">
          <div className="additional-info-card">
            <div className="form-grid-4">
              <div className="purchase-form-group">
                <label>Credit Term Days</label>
                <input 
                  type="number" 
                  min="0"
                  value={creditDays}
                  onChange={(e) => setCreditDays(parseInt(e.target.value, 10) || 0)}
                />
              </div>

              <div className="purchase-form-group">
                <label>Payment Method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Credit">Credit</option>
                </select>
              </div>

              <div className="purchase-form-group" style={{ gridColumn: 'span 2' }}>
                <label>Paid Amount (₹)</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  max={grandTotal}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="purchase-form-group">
              <label>Remarks / Notes</label>
              <textarea 
                placeholder="Optional billing details..." 
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>

          <div className="totals-summary-card">
            <div className="total-row">
              <span>Subtotal Amount:</span>
              <span>₹{billAmount?.toFixed(2)}</span>
            </div>
            <div className="total-row">
              <span>Discount Total:</span>
              <span>₹{discountAmount?.toFixed(2)}</span>
            </div>
            <div className="total-row">
              <span>GST Input Tax:</span>
              <span>₹{gstAmount?.toFixed(2)}</span>
            </div>
            <div className="total-row grand-total">
              <span>Grand Total:</span>
              <span>₹{grandTotal?.toFixed(2)}</span>
            </div>
            <div className="total-row outstanding">
              <span>Outstanding Owed:</span>
              <span>₹{pendingAmount?.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Submission Actions */}
        <div className="form-actions-bar">
          <button 
            type="button" 
            className="btn-secondary-action" 
            onClick={() => navigate('/purchases')}
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn-primary-action"
            disabled={loading}
          >
            <FiSave /> {loading ? "Saving..." : (id ? "Save Changes" : "Save Purchase Draft")}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddPurchase;
