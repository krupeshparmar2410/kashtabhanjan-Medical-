import React, { useState, useEffect, useRef } from 'react';
import { medicineAPI, customerAPI, saleAPI, prescriptionAPI, inventoryAPI } from '../services/api';
import '../styles/AddAgency.css'; // Reuse form card stylings

const Billing = () => {
  // Billing form states
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  const [barcode, setBarcode] = useState('');
  const [medQuery, setMedQuery] = useState('');
  const [medSuggestions, setMedSuggestions] = useState([]);
  
  const [cart, setCart] = useState([]);
  const [isGstInclusive, setIsGstInclusive] = useState(true);
  const [discountType, setDiscountType] = useState('None');
  const [discountValue, setDiscountValue] = useState(0);
  
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentDetails, setPaymentDetails] = useState({ cashAmount: 0, upiAmount: 0, cardAmount: 0, creditAmount: 0 });
  const [redeemLoyalty, setRedeemLoyalty] = useState(false);
  const [creditDays, setCreditDays] = useState(30);
  const [remarks, setRemarks] = useState('');
  
  const [prescriptionNumber, setPrescriptionNumber] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorLicense, setDoctorLicense] = useState('');
  const [customerPrescriptions, setCustomerPrescriptions] = useState([]);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState('');

  // UI status states
  const [substitutes, setSubstitutes] = useState([]);
  const [selectedMedicineForSubs, setSelectedMedicineForSubs] = useState(null);
  const [selectedBatchesModal, setSelectedBatchesModal] = useState(null); // { itemIndex, batchList }
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [adminBypassModal, setAdminBypassModal] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const barcodeInputRef = useRef(null);

  // Load default Walk-In customer on load
  useEffect(() => {
    const loadDefaultCustomer = async () => {
      try {
        const res = await customerAPI.searchCustomers('');
        if (res.success && res.customers.length > 0) {
          const walkin = res.customers.find(c => c.customerType === 'Walk-In');
          if (walkin) {
            setSelectedCustomer(walkin);
            setCustomerQuery(walkin.name);
          }
        }
      } catch (err) {
        console.error('Failed to load default customer:', err);
      }
    };
    loadDefaultCustomer();
  }, []);

  // Fetch customer approved prescriptions when customer is selected
  useEffect(() => {
    if (selectedCustomer && selectedCustomer.customerType === 'Registered') {
      prescriptionAPI.getPrescriptions({ customerId: selectedCustomer._id, status: 'Approved' })
        .then(res => {
          if (res.success) {
            setCustomerPrescriptions(res.prescriptions);
          }
        })
        .catch(err => console.error(err));
    } else {
      setCustomerPrescriptions([]);
      setSelectedPrescriptionId('');
    }
  }, [selectedCustomer]);

  // Search customers
  const handleCustomerSearch = async (val) => {
    setCustomerQuery(val);
    if (!val.trim()) {
      setCustomerSuggestions([]);
      return;
    }
    try {
      const res = await customerAPI.searchCustomers(val);
      if (res.success) {
        setCustomerSuggestions(res.customers);
      }
    } catch (err) {
      console.log(err.message);
    }
  };

  const selectCustomer = (cust) => {
    setSelectedCustomer(cust);
    setCustomerQuery(cust.name);
    setCustomerSuggestions([]);
    setError('');
  };

  // Search medicines
  const handleMedicineSearch = async (val) => {
    setMedQuery(val);
    if (!val.trim()) {
      setMedSuggestions([]);
      return;
    }
    try {
      const res = await medicineAPI.getMedicines({ search: val, limit: 8 });
      if (res.success) {
        setMedSuggestions(res.medicines);
      }
    } catch (err) {
      console.log(err.message);
    }
  };

  // Barcode barcode scan handler
  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    try {
      const res = await medicineAPI.getMedicines({ search: barcode });
      if (res.success && res.medicines.length > 0) {
        addMedicineToCart(res.medicines[0]);
        setBarcode('');
        setSuccess('Item scanned successfully');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        setError(`No medicine found matching barcode ${barcode}`);
      }
    } catch (err) {
      setError('Barcode search failed');
    }
  };

  // Add medicine line to POS cart
  const addMedicineToCart = async (med) => {
    setMedQuery('');
    setMedSuggestions([]);

    // Check if already in cart
    const exists = cart.findIndex(c => c.medicineId === med._id);
    if (exists > -1) {
      setError(`"${med.medicineName}" is already added to cart. Adjust quantity directly.`);
      return;
    }

    try {
      // Get batches using FEFO allocation list
      const batchRes = await medicineAPI.getMedicineById(med._id);
      if (batchRes.success) {
        // Fetch batches via inventory FEFO API
        const data = await inventoryAPI.getFEFO(med._id);
        
        if (!data.success || data.batches.length === 0) {
          setSelectedMedicineForSubs(med);
          // Load substitution generic matches
          const subRes = await saleAPI.getSubstitutes(med._id);
          if (subRes.success) {
            setSubstitutes(subRes.substitutes);
          }
          setError(`No active stock batches found for "${med.medicineName}". Alternate suggestions loaded.`);
          return;
        }

        // Add item to cart with default qty 1
        const initialItem = {
          medicineId: med._id,
          medicineName: med.medicineName,
          medicineCode: med.medicineCode,
          hsnCode: med.hsnCode || '',
          unitType: med.unitType || 'Strip',
          quantity: 1,
          sellingPrice: med.sellingPrice,
          mrp: med.mrp,
          gstPercentage: med.gstPercentage || 12,
          discountPercentage: med.discountAllowed || 0,
          prescriptionRequired: med.prescriptionRequired === 'Yes',
          scheduleH: med.scheduleH || false,
          scheduleH1: med.scheduleH1 || false,
          scheduleX: med.scheduleX || false,
          availableBatches: data.batches
        };

        setCart([...cart, initialItem]);
        setError('');
      }
    } catch (err) {
      setError('Failed to fetch medicine batch stock data');
    }
  };

  const updateCartQty = (idx, qty) => {
    const newCart = [...cart];
    newCart[idx].quantity = Number(qty);
    setCart(newCart);
  };

  const updateCartDiscount = (idx, disc) => {
    const newCart = [...cart];
    newCart[idx].discountPercentage = Number(disc);
    setCart(newCart);
  };

  const removeCartItem = (idx) => {
    const newCart = [...cart];
    newCart.splice(idx, 1);
    setCart(newCart);
  };

  // Math Calculations
  const calculateCartDetails = () => {
    let subtotal = 0;
    let gstTotal = 0;
    let itemDiscounts = 0;
    let totalLinePrice = 0;

    cart.forEach((item) => {
      const originalLineTotal = item.quantity * item.sellingPrice;
      const discount = originalLineTotal * (item.discountPercentage / 100);
      const afterDiscount = originalLineTotal - discount;

      let lineSubtotal = 0;
      let lineGst = 0;

      if (isGstInclusive) {
        const taxable = afterDiscount / (1 + (item.gstPercentage / 100));
        lineGst = afterDiscount - taxable;
        lineSubtotal = taxable;
        totalLinePrice += afterDiscount;
      } else {
        lineSubtotal = afterDiscount;
        lineGst = afterDiscount * (item.gstPercentage / 100);
        totalLinePrice += afterDiscount + lineGst;
      }

      subtotal += lineSubtotal;
      gstTotal += lineGst;
      itemDiscounts += discount;
    });

    let billTotal = isGstInclusive ? totalLinePrice : subtotal + gstTotal;
    let overallDiscount = 0;

    if (discountType === 'Percentage') {
      overallDiscount = billTotal * (discountValue / 100);
    } else if (discountType === 'Fixed') {
      overallDiscount = discountValue;
    }

    let grandTotal = Math.max(0, billTotal - overallDiscount);

    // Apply loyalty discount estimation
    let loyaltyDiscount = 0;
    if (redeemLoyalty && selectedCustomer && selectedCustomer.customerType === 'Registered') {
      const maxVal = selectedCustomer.loyaltyPoints * 1; // 1 point = ₹1
      loyaltyDiscount = Math.min(grandTotal, maxVal);
      grandTotal = Math.max(0, grandTotal - loyaltyDiscount);
    }

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      gstAmount: Math.round(gstTotal * 100) / 100,
      itemDiscounts: Math.round(itemDiscounts * 100) / 100,
      overallDiscount: Math.round(overallDiscount * 100) / 100,
      loyaltyDiscount: Math.round(loyaltyDiscount * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100
    };
  };

  const totals = calculateCartDetails();

  // Validate Schedule requirements
  const checkRestrictedSchedules = () => {
    return cart.some(item => item.prescriptionRequired || item.scheduleH || item.scheduleH1 || item.scheduleX);
  };

  // Submit POS checkout
  const handleCheckout = async (bypass = false) => {
    setError('');
    setSuccess('');

    if (cart.length === 0) {
      setError('Your billing cart is empty.');
      return;
    }

    if (checkRestrictedSchedules() && !prescriptionNumber) {
      setError('Invoice contains Schedule H / H1 / X restricted medicines. Please enter Doctor prescription reference number.');
      return;
    }

    // Mix payments checks
    if (paymentMethod === 'Mixed') {
      const paid = Number(paymentDetails.cashAmount || 0) + Number(paymentDetails.upiAmount || 0) + Number(paymentDetails.cardAmount || 0);
      const mixedTotal = paid + Number(paymentDetails.creditAmount || 0);
      if (Math.abs(mixedTotal - totals.grandTotal) > 0.05) {
        setError(`Mixed payment split amounts (₹${mixedTotal}) must sum up exactly to grand total: ₹${totals.grandTotal}`);
        return;
      }
    }

    // Check outstanding limits
    if (paymentMethod === 'Credit' && selectedCustomer && selectedCustomer.customerType === 'Registered') {
      const newOutstanding = selectedCustomer.outstandingBalance + totals.grandTotal;
      if (newOutstanding > selectedCustomer.creditLimit && !bypass) {
        setAdminBypassModal(true);
        return;
      }
    }

    try {
      const invoiceData = {
        customerId: selectedCustomer ? selectedCustomer._id : null,
        prescriptionId: selectedPrescriptionId || null,
        isGstInclusive,
        discountType,
        discountValue,
        paymentMethod,
        paymentDetails: paymentMethod === 'Mixed' ? paymentDetails : {
          cashAmount: paymentMethod === 'Cash' ? totals.grandTotal : 0,
          upiAmount: paymentMethod === 'UPI' ? totals.grandTotal : 0,
          cardAmount: paymentMethod === 'Card' ? totals.grandTotal : 0,
          creditAmount: paymentMethod === 'Credit' ? totals.grandTotal : 0
        },
        creditDays,
        remarks: remarks + (bypass ? ` (Admin Overridden: ${adminOverrideReason})` : ''),
        prescriptionNumber,
        prescriptionDocumentUrl: doctorName ? `Dr. ${doctorName} (Reg: ${doctorLicense})` : '',
        items: cart.map(item => ({
          medicineId: item.medicineId,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice,
          mrp: item.mrp,
          discountPercentage: item.discountPercentage
        })),
        redeemLoyalty,
        adminOverrideUsed: bypass,
        adminOverrideReason: bypass ? adminOverrideReason : '',
        idempotencyKey: `idemp-${Date.now()}`
      };

      const res = await saleAPI.createSale(invoiceData);
      if (res.success) {
        setSuccess(`Invoice #${res.sale.invoiceNumber} checkout completed successfully.`);
        setCheckoutResult(res.sale);
        // Reset POS state
        setCart([]);
        setRemarks('');
        setPrescriptionNumber('');
        setDoctorName('');
        setDoctorLicense('');
        setSelectedPrescriptionId('');
        setRedeemLoyalty(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Server error during POS checkout');
    }
  };

  const handleAdminBypassSubmit = async (e) => {
    e.preventDefault();
    if (!adminUsername || !adminPassword) {
      setError('Please provide administrative credentials.');
      return;
    }
    // Mock admin credentials bypass
    if (adminUsername === 'admin@kashtbhanjan.com' && adminPassword === 'admin123') {
      setAdminBypassModal(false);
      setAdminUsername('');
      setAdminPassword('');
      // Run POS create with bypass flag
      handleCheckout(true);
    } else {
      setError('Invalid admin credentials. Outstanding credit override rejected.');
    }
  };

  const printInvoice = () => {
    if (!checkoutResult) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Invoice #${checkoutResult.invoiceNumber}</title>
          <style>
            @media print {
              body { padding: 0; margin: 0; }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div id="pdf-view"></div>
        </body>
      </html>
    `);
    
    // Fetch HTML directly from api
    saleAPI.getInvoicePDF(checkoutResult._id).then(res => {
      printWindow.document.getElementById('pdf-view').innerHTML = res.pdfHtml;
    });
  };

  const adminOverrideReason = `Credit limit bypass override authorized for ${selectedCustomer?.name}`;

  return (
    <div className="card-container">
      <div className="form-card" style={{ maxWidth: '100%' }}>
        <div className="form-header" style={{ background: 'linear-gradient(135deg, #0d9488 0%, #115e59 100%)' }}>
          <h2>Point of Sale (POS) Billing Counter</h2>
          <p>Real-time GST compliance, FEFO allocations, and loyalty ledger entries</p>
        </div>

        {error && <div className="error-message" style={{ margin: '16px' }}>{error}</div>}
        {success && <div className="success-message" style={{ margin: '16px' }}>{success}</div>}

        <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr', padding: '20px', gap: '24px' }}>
          
          {/* Cart Details Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Search customer & barcode */}
            <div style={{ display: 'flex', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '10px' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <label className="form-label">Search Customer (Walk-In or Name/Phone)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Type customer name or mobile number..."
                  value={customerQuery}
                  onChange={(e) => handleCustomerSearch(e.target.value)}
                />
                {customerSuggestions.length > 0 && (
                  <div className="autocomplete-dropdown" style={{ position: 'absolute', zIndex: 10, width: '100%', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', top: '70px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                    {customerSuggestions.map((cust) => (
                      <div
                        key={cust._id}
                        className="suggestion-item"
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                        onClick={() => selectCustomer(cust)}
                      >
                        <strong>{cust.name}</strong> - {cust.phone} {cust.customerType === 'Walk-In' ? '(Cash Counter)' : `(Points: ${cust.loyaltyPoints})`}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ flex: 1 }}>
                <form onSubmit={handleBarcodeSubmit}>
                  <label className="form-label">Scan Barcode</label>
                  <input
                    type="text"
                    ref={barcodeInputRef}
                    className="form-input"
                    placeholder="Place cursor and scan medicine barcode..."
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                  />
                </form>
              </div>
            </div>

            {/* Medicine item Search and suggestions */}
            <div style={{ position: 'relative' }}>
              <label className="form-label">Add Medicine to Invoice</label>
              <input
                type="text"
                className="form-input"
                placeholder="Type generic name, brand, or code..."
                value={medQuery}
                onChange={(e) => handleMedicineSearch(e.target.value)}
              />
              {medSuggestions.length > 0 && (
                <div className="autocomplete-dropdown" style={{ position: 'absolute', zIndex: 10, width: '100%', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', top: '70px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                  {medSuggestions.map((med) => (
                    <div
                      key={med._id}
                      className="suggestion-item"
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}
                      onClick={() => addMedicineToCart(med)}
                    >
                      <div>
                        <strong>{med.medicineName}</strong> - {med.strength} ({med.brandName})<br />
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Generic: {med.genericName} | Pack: {med.packSize} {med.unitType}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ color: '#0d9488', fontWeight: 600 }}>Stock: {med.currentStock}</span><br />
                        <span style={{ fontSize: '11px', color: '#64748b' }}>MRP: ₹{med.mrp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Substitution suggestion list */}
            {substitutes.length > 0 && (
              <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', padding: '14px', borderRadius: '8px' }}>
                <strong style={{ color: '#92400e' }}>Alternate Substitutes for "{selectedMedicineForSubs?.medicineName}":</strong>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  {substitutes.map(sub => (
                    <button
                      key={sub._id}
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 12px', background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1' }}
                      onClick={() => {
                        addMedicineToCart(sub);
                        setSubstitutes([]);
                      }}
                    >
                      {sub.medicineName} (Stock: {sub.currentStock})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Invoice Line Cart Grid */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#475569' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Medicine Name</th>
                    <th style={{ padding: '10px', textAlign: 'center', width: '15%' }}>FEFO Batch</th>
                    <th style={{ padding: '10px', textAlign: 'center', width: '12%' }}>Quantity</th>
                    <th style={{ padding: '10px', textAlign: 'right', width: '12%' }}>Price</th>
                    <th style={{ padding: '10px', textAlign: 'center', width: '10%' }}>Disc%</th>
                    <th style={{ padding: '10px', textAlign: 'center', width: '8%' }}>GST</th>
                    <th style={{ padding: '10px', textAlign: 'right', width: '14%' }}>Total</th>
                    <th style={{ padding: '10px', textAlign: 'center', width: '8%' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                        No items added to billing cart yet. Search medicines or scan barcode.
                      </td>
                    </tr>
                  ) : (
                    cart.map((item, idx) => {
                      const orig = item.quantity * item.sellingPrice;
                      const disc = orig * (item.discountPercentage / 100);
                      const finalVal = isGstInclusive ? orig - disc : (orig - disc) * (1 + (item.gstPercentage / 100));

                      // Highlight nearest expiry date
                      const nextBatch = item.availableBatches[0];
                      const expiryWarning = nextBatch && (new Date(nextBatch.expiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '10px 0' }}>
                            <strong>{item.medicineName}</strong><br />
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                              HSN: {item.hsnCode} | {item.unitType}
                              {item.prescriptionRequired && <span style={{ background: '#fecaca', color: '#b91c1c', padding: '2px 4px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', marginLeft: '6px' }}>Rx Required</span>}
                            </span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: expiryWarning ? '#b91c1c' : '#1e293b' }}>
                              {nextBatch ? `${nextBatch.batchNumber}` : 'N/A'}
                            </span>
                            {expiryWarning && <div style={{ fontSize: '9px', color: '#b91c1c', fontWeight: 'bold' }}>Near Expiry!</div>}
                          </td>
                          <td style={{ padding: '10px' }}>
                            <input
                              type="number"
                              min="1"
                              className="form-input"
                              style={{ padding: '6px', textAlign: 'center' }}
                              value={item.quantity}
                              onChange={(e) => updateCartQty(idx, e.target.value)}
                            />
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            ₹{item.sellingPrice}
                          </td>
                          <td style={{ padding: '10px' }}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              className="form-input"
                              style={{ padding: '6px', textAlign: 'center' }}
                              value={item.discountPercentage}
                              onChange={(e) => updateCartDiscount(idx, e.target.value)}
                            />
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            {item.gstPercentage}%
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>
                            ₹{finalVal.toFixed(2)}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', color: '#ef4444', border: '1px solid #fca5a5' }}
                              onClick={() => removeCartItem(idx)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* compliance prescription fields */}
            {checkRestrictedSchedules() && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '16px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <strong style={{ color: '#1d4ed8', fontSize: '14px' }}>Pharmacy Compliance Fields (Rx Validation Required)</strong>
                
                {selectedCustomer && selectedCustomer.customerType === 'Registered' && (
                  <div style={{ marginBottom: '4px' }}>
                    <label className="form-label">Link Approved Doctor Prescription</label>
                    <select
                      className="form-input"
                      value={selectedPrescriptionId}
                      onChange={(e) => {
                        setSelectedPrescriptionId(e.target.value);
                        const selectedRx = customerPrescriptions.find(r => r._id === e.target.value);
                        if (selectedRx) {
                          setPrescriptionNumber(selectedRx.prescriptionNumber);
                          setDoctorName(selectedRx.doctorName);
                          setDoctorLicense(selectedRx.doctorRegistrationNumber);
                        }
                      }}
                      required
                    >
                      <option value="">Choose Approved Prescription</option>
                      {customerPrescriptions.map(p => (
                        <option key={p._id} value={p._id}>
                          {p.prescriptionNumber} (Dr. {p.doctorName} - Expiry: {new Date(p.expiryDate).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Prescription No.</label>
                    <input
                      type="text"
                      className="form-input"
                      value={prescriptionNumber}
                      onChange={(e) => setPrescriptionNumber(e.target.value)}
                      placeholder="e.g. Rx/98234"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Doctor Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                      placeholder="e.g. Dr. Rajesh Patel"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Reg License No.</label>
                    <input
                      type="text"
                      className="form-input"
                      value={doctorLicense}
                      onChange={(e) => setDoctorLicense(e.target.value)}
                      placeholder="e.g. G-23423"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Checkout Controls Column */}
          <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px', alignSelf: 'start' }}>
            <h3 style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', margin: 0, color: '#1e293b' }}>Summary & Payments</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Tax Configuration:</span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={() => setIsGstInclusive(!isGstInclusive)}
              >
                {isGstInclusive ? 'GST-Inclusive' : 'GST-Exclusive'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between' }}>
                <span>Subtotal (Base):</span>
                <span>₹{totals.subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between' }}>
                <span>GST Tax:</span>
                <span>₹{totals.gstAmount.toFixed(2)}</span>
              </div>
              {totals.itemDiscounts > 0 && (
                <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', color: '#0d9488' }}>
                  <span>Item Discounts:</span>
                  <span>-₹{totals.itemDiscounts.toFixed(2)}</span>
                </div>
              )}
              {totals.overallDiscount > 0 && (
                <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', color: '#0d9488' }}>
                  <span>Overall Discount:</span>
                  <span>-₹{totals.overallDiscount.toFixed(2)}</span>
                </div>
              )}
              {totals.loyaltyDiscount > 0 && (
                <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', color: '#16a34a' }}>
                  <span>Loyalty Discount:</span>
                  <span>-₹{totals.loyaltyDiscount.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
              <span>Total Payable:</span>
              <span style={{ color: '#0d9488' }}>₹{totals.grandTotal.toFixed(2)}</span>
            </div>

            {/* Loyalty details */}
            {selectedCustomer && selectedCustomer.customerType === 'Registered' && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
                <span style={{ color: '#166534', fontWeight: 600 }}>Loyalty Summary:</span><br />
                Available Points: {selectedCustomer.loyaltyPoints}<br />
                Estimated Earn: {Math.floor(totals.grandTotal / 100)} Points
                
                {selectedCustomer.loyaltyPoints > 0 && (
                  <div style={{ marginTop: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={redeemLoyalty}
                        onChange={(e) => setRedeemLoyalty(e.target.checked)}
                      />
                      Redeem Points (-₹{selectedCustomer.loyaltyPoints * 1})
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Overall Discount selection */}
            <div>
              <label className="form-label">Apply Overall Discount</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  className="form-input"
                  style={{ width: '40%' }}
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value)}
                >
                  <option value="None">None</option>
                  <option value="Percentage">Pct %</option>
                  <option value="Fixed">Flat ₹</option>
                </select>
                <input
                  type="number"
                  className="form-input"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  disabled={discountType === 'None'}
                />
              </div>
            </div>

            {/* Payment selections */}
            <div>
              <label className="form-label">Payment Method</label>
              <select
                className="form-input"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Credit">Customer Credit</option>
                <option value="Mixed">Mixed Payment Mode</option>
              </select>
            </div>

            {paymentMethod === 'Mixed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '11px' }}>Cash Amount</label>
                  <input
                    type="number"
                    className="form-input"
                    value={paymentDetails.cashAmount}
                    onChange={(e) => setPaymentDetails({ ...paymentDetails, cashAmount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '11px' }}>UPI Amount</label>
                  <input
                    type="number"
                    className="form-input"
                    value={paymentDetails.upiAmount}
                    onChange={(e) => setPaymentDetails({ ...paymentDetails, upiAmount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '11px' }}>Card Amount</label>
                  <input
                    type="number"
                    className="form-input"
                    value={paymentDetails.cardAmount}
                    onChange={(e) => setPaymentDetails({ ...paymentDetails, cardAmount: Number(e.target.value) })}
                  />
                </div>
                {selectedCustomer?.customerType === 'Registered' && (
                  <div>
                    <label className="form-label" style={{ fontSize: '11px' }}>Credit Amount</label>
                    <input
                      type="number"
                      className="form-input"
                      value={paymentDetails.creditAmount}
                      onChange={(e) => setPaymentDetails({ ...paymentDetails, creditAmount: Number(e.target.value) })}
                    />
                  </div>
                )}
              </div>
            )}

            {paymentMethod === 'Credit' && selectedCustomer && (
              <div>
                <label className="form-label">Due Credit Period (Days)</label>
                <input
                  type="number"
                  className="form-input"
                  value={creditDays}
                  onChange={(e) => setCreditDays(Number(e.target.value))}
                />
              </div>
            )}

            <div>
              <label className="form-label">Remarks</label>
              <textarea
                className="form-input"
                style={{ height: '60px' }}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Billing notes..."
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', border: 'none', padding: '12px' }}
              onClick={() => handleCheckout()}
            >
              Checkout & Print Invoice
            </button>
            
            {checkoutResult && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', color: '#0d9488', border: '1px solid #0d9488' }}
                onClick={printInvoice}
              >
                Re-print Receipt #{checkoutResult.invoiceNumber}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Admin Credit Bypass Modal */}
      {adminBypassModal && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="modal-content" style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
            <h3 style={{ color: '#ef4444', margin: '0 0 10px 0' }}>Outstanding Limit Exceeded</h3>
            <p style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.5', marginBottom: '20px' }}>
              Customer <strong>{selectedCustomer?.name}</strong> has exceeded their configured outstanding credit limit. Checkout requires an administrative override bypass credentials.
            </p>
            <form onSubmit={handleAdminBypassSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label">Admin Email</label>
                <input
                  type="text"
                  className="form-input"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="admin@kashtbhanjan.com"
                />
              </div>
              <div>
                <label className="form-label">Admin Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setAdminBypassModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, background: '#ef4444', border: 'none' }}
                >
                  Authorize Bypass
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
