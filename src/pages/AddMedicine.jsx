import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import { medicineAPI, agencyAPI } from '../services/api';

const AddMedicine = () => {
  const navigate = useNavigate();

  // Agencies state for dropdown selection
  const [agencies, setAgencies] = useState([]);
  const [agenciesLoading, setAgenciesLoading] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    medicineName: '',
    genericName: '',
    brandName: '',
    description: '',
    category: '',
    manufacturer: '',
    agencyId: '',
    strength: '',
    medicineForm: 'Tablet',
    purchasePrice: 0,
    sellingPrice: 0,
    mrp: 0,
    gstPercentage: 12,
    discountAllowed: 0,
    minimumStockLevel: 10,
    reorderLevel: 20,
    currentStock: 0,
    unitType: 'Tablet',
    packSize: 1,
    prescriptionRequired: 'No',
    storageType: 'Room Temperature',
    hsnCode: '',
    barcode: '',
    expiryAlertDays: 90,
    trackBatches: true,
    allowPurchase: true,
    allowSale: true,
    notes: ''
  });

  // Validation Errors State
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState(null);

  // Load active agencies on mount
  useEffect(() => {
    const fetchActiveAgencies = async () => {
      try {
        setAgenciesLoading(true);
        const data = await agencyAPI.getAgencies({ limit: 100 });
        if (data.success) {
          // Filter to show active/unblocked agencies
          const activeList = data.agencies.filter(a => a.status === 'active' && !a.isBlocked);
          setAgencies(activeList);
        }
      } catch (err) {
        console.error('Error fetching agencies:', err);
        showToast('Failed to load agencies list', 'error');
      } finally {
        setAgenciesLoading(false);
      }
    };
    fetchActiveAgencies();
  }, []);

  // Show Toast Helper
  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Handle Input Changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Parse numerical inputs
    const numFields = [
      'purchasePrice', 'sellingPrice', 'mrp', 'gstPercentage', 
      'discountAllowed', 'minimumStockLevel', 'reorderLevel', 
      'currentStock', 'packSize', 'expiryAlertDays'
    ];

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' 
        ? checked 
        : numFields.includes(name) 
          ? (value === '' ? '' : Number(value)) 
          : value
    }));

    // Clear validation error when editing field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Form Validation
  const validateForm = () => {
    const tempErrors = {};

    if (!formData.medicineName.trim()) {
      tempErrors.medicineName = 'Medicine Name is required';
    }

    if (!formData.medicineForm) {
      tempErrors.medicineForm = 'Medicine Form is required';
    }

    if (!formData.agencyId) {
      tempErrors.agencyId = 'Please select a supplier agency';
    }

    // Number boundaries check
    if (formData.purchasePrice < 0) {
      tempErrors.purchasePrice = 'Purchase price cannot be negative';
    }

    if (formData.sellingPrice < 0) {
      tempErrors.sellingPrice = 'Selling price cannot be negative';
    }

    if (formData.mrp < 0) {
      tempErrors.mrp = 'Maximum Retail Price (MRP) cannot be negative';
    }

    if (formData.sellingPrice > formData.mrp) {
      tempErrors.sellingPrice = 'Selling price cannot exceed Maximum Retail Price (MRP)';
    }

    if (formData.gstPercentage < 0) {
      tempErrors.gstPercentage = 'GST percentage cannot be negative';
    }

    if (formData.discountAllowed < 0 || formData.discountAllowed > 100) {
      tempErrors.discountAllowed = 'Discount must be between 0% and 100%';
    }

    if (formData.currentStock < 0) {
      tempErrors.currentStock = 'Current stock cannot be negative';
    }

    if (formData.minimumStockLevel < 0) {
      tempErrors.minimumStockLevel = 'Minimum stock level cannot be negative';
    }

    if (formData.reorderLevel < 0) {
      tempErrors.reorderLevel = 'Reorder level cannot be negative';
    }

    if (formData.packSize < 1) {
      tempErrors.packSize = 'Pack size must be at least 1';
    }

    if (formData.expiryAlertDays < 0) {
      tempErrors.expiryAlertDays = 'Expiry alert days cannot be negative';
    }

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  // Form Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast('Please correct validation errors', 'error');
      return;
    }

    setSubmitting(true);

    try {
      const data = await medicineAPI.createMedicine(formData);
      if (data.success) {
        showToast('Medicine record created successfully!', 'success');
        // Redirect with delay to show toast
        setTimeout(() => {
          navigate('/medicines');
        }, 1500);
      }
    } catch (err) {
      console.error('Submission failed:', err);
      const serverMsg = err.response?.data?.message || 'Server error creating medicine record';
      showToast(serverMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="medicine-form-container">
      {/* Toast Alert */}
      {toast && (
        <div className="toast-container">
          <div className={`toast-message ${toast.type}`}>
            {toast.type === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="form-header-row">
        <h3>Add New Medicine Master</h3>
        <button className="back-btn" onClick={() => navigate('/medicines')}>
          <FaArrowLeft /> Back to List
        </button>
      </div>

      {/* Card Form container */}
      <form className="form-card" onSubmit={handleSubmit}>
        
        {/* Section 1: Basic Information */}
        <div className="form-section">
          <h4 className="form-section-title">Basic Information</h4>
          <div className="form-grid-3">
            
            <div className="form-group form-group-half">
              <label>Medicine Name<span className="required-star">*</span></label>
              <input
                type="text"
                name="medicineName"
                placeholder="e.g. Paracetamol 500mg"
                value={formData.medicineName}
                onChange={handleChange}
              />
              {errors.medicineName && <span className="field-error-msg">{errors.medicineName}</span>}
            </div>

            <div className="form-group">
              <label>Strength / Dosage</label>
              <input
                type="text"
                name="strength"
                placeholder="e.g. 500mg, 5ml"
                value={formData.strength}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>Generic Chemical Name</label>
              <input
                type="text"
                name="genericName"
                placeholder="e.g. Acetaminophen"
                value={formData.genericName}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>Brand Name</label>
              <input
                type="text"
                name="brandName"
                placeholder="e.g. Crocin"
                value={formData.brandName}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>Manufacturer</label>
              <input
                type="text"
                name="manufacturer"
                placeholder="e.g. GSK Healthcare"
                value={formData.manufacturer}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>Supplier Agency<span className="required-star">*</span></label>
              {agenciesLoading ? (
                <select disabled><option>Loading suppliers...</option></select>
              ) : (
                <select name="agencyId" value={formData.agencyId} onChange={handleChange}>
                  <option value="">-- Select Agency --</option>
                  {agencies.map((agency) => (
                    <option key={agency._id} value={agency._id}>{agency.agencyName}</option>
                  ))}
                </select>
              )}
              {errors.agencyId && <span className="field-error-msg">{errors.agencyId}</span>}
            </div>

            <div className="form-group">
              <label>Medicine Classification Form<span className="required-star">*</span></label>
              <select name="medicineForm" value={formData.medicineForm} onChange={handleChange}>
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Syrup">Syrup</option>
                <option value="Injection">Injection</option>
                <option value="Cream">Cream</option>
                <option value="Ointment">Ointment</option>
                <option value="Drops">Drops</option>
                <option value="Powder">Powder</option>
                <option value="Inhaler">Inhaler</option>
              </select>
              {errors.medicineForm && <span className="field-error-msg">{errors.medicineForm}</span>}
            </div>

            <div className="form-group">
              <label>Category / Class</label>
              <input
                type="text"
                name="category"
                placeholder="e.g. Analgesic, Antibiotic"
                value={formData.category}
                onChange={handleChange}
              />
            </div>

            <div className="form-group form-group-full">
              <label>Product Description</label>
              <textarea
                name="description"
                placeholder="Describe therapeutic effects, usage instructions, etc."
                rows="3"
                value={formData.description}
                onChange={handleChange}
              ></textarea>
            </div>
            
          </div>
        </div>

        {/* Section 2: Pricing Details */}
        <div className="form-section">
          <h4 className="form-section-title">Pricing Details</h4>
          <div className="form-grid-3">
            
            <div className="form-group">
              <label>Purchase Price (₹)<span className="required-star">*</span></label>
              <input
                type="number"
                name="purchasePrice"
                step="0.01"
                min="0"
                value={formData.purchasePrice}
                onChange={handleChange}
              />
              {errors.purchasePrice && <span className="field-error-msg">{errors.purchasePrice}</span>}
            </div>

            <div className="form-group">
              <label>Selling Price (₹)<span className="required-star">*</span></label>
              <input
                type="number"
                name="sellingPrice"
                step="0.01"
                min="0"
                value={formData.sellingPrice}
                onChange={handleChange}
              />
              {errors.sellingPrice && <span className="field-error-msg">{errors.sellingPrice}</span>}
            </div>

            <div className="form-group">
              <label>Maximum Retail Price (MRP ₹)<span className="required-star">*</span></label>
              <input
                type="number"
                name="mrp"
                step="0.01"
                min="0"
                value={formData.mrp}
                onChange={handleChange}
              />
              {errors.mrp && <span className="field-error-msg">{errors.mrp}</span>}
            </div>

            <div className="form-group">
              <label>GST Tax rate (%)</label>
              <input
                type="number"
                name="gstPercentage"
                min="0"
                value={formData.gstPercentage}
                onChange={handleChange}
              />
              {errors.gstPercentage && <span className="field-error-msg">{errors.gstPercentage}</span>}
            </div>

            <div className="form-group">
              <label>Discount Allowed (%)</label>
              <input
                type="number"
                name="discountAllowed"
                min="0"
                max="100"
                value={formData.discountAllowed}
                onChange={handleChange}
              />
              {errors.discountAllowed && <span className="field-error-msg">{errors.discountAllowed}</span>}
            </div>

          </div>
        </div>

        {/* Section 3: Stock Management */}
        <div className="form-section">
          <h4 className="form-section-title">Stock Management & Packaging</h4>
          <div className="form-grid-3">
            
            <div className="form-group">
              <label>Unit type / Packing type<span className="required-star">*</span></label>
              <select name="unitType" value={formData.unitType} onChange={handleChange}>
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Bottle">Bottle</option>
                <option value="Injection">Injection</option>
                <option value="Strip">Strip</option>
                <option value="Box">Box</option>
                <option value="Tube">Tube</option>
                <option value="Packet">Packet</option>
              </select>
            </div>

            <div className="form-group">
              <label>Pack Size (units inside packet)<span className="required-star">*</span></label>
              <input
                type="number"
                name="packSize"
                min="1"
                value={formData.packSize}
                onChange={handleChange}
              />
              {errors.packSize && <span className="field-error-msg">{errors.packSize}</span>}
            </div>

            <div className="form-group">
              <label>Initial Current Stock</label>
              <input
                type="number"
                name="currentStock"
                min="0"
                value={formData.currentStock}
                onChange={handleChange}
              />
              {errors.currentStock && <span className="field-error-msg">{errors.currentStock}</span>}
            </div>

            <div className="form-group">
              <label>Minimum stock level warning limit</label>
              <input
                type="number"
                name="minimumStockLevel"
                min="0"
                value={formData.minimumStockLevel}
                onChange={handleChange}
              />
              {errors.minimumStockLevel && <span className="field-error-msg">{errors.minimumStockLevel}</span>}
            </div>

            <div className="form-group">
              <label>Reorder Stock limit</label>
              <input
                type="number"
                name="reorderLevel"
                min="0"
                value={formData.reorderLevel}
                onChange={handleChange}
              />
              {errors.reorderLevel && <span className="field-error-msg">{errors.reorderLevel}</span>}
            </div>

          </div>
        </div>

        {/* Section 4: Medical Rules & Control */}
        <div className="form-section">
          <h4 className="form-section-title">Medical Information & Storage</h4>
          <div className="form-grid-3">
            
            <div className="form-group">
              <label>Prescription (Rx) Required?</label>
              <select name="prescriptionRequired" value={formData.prescriptionRequired} onChange={handleChange}>
                <option value="No">No - Over The Counter (OTC)</option>
                <option value="Yes">Yes - Rx Prescription Required</option>
              </select>
            </div>

            <div className="form-group">
              <label>Storage Environment Condition</label>
              <select name="storageType" value={formData.storageType} onChange={handleChange}>
                <option value="Room Temperature">Room Temperature (Below 30°C)</option>
                <option value="Cool Place">Cool Place (8°C to 25°C)</option>
                <option value="Refrigerated">Refrigerated (2°C to 8°C)</option>
                <option value="Frozen">Frozen (Below 0°C)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Expiry Alert Lead Time (Days)</label>
              <input
                type="number"
                name="expiryAlertDays"
                min="0"
                value={formData.expiryAlertDays}
                onChange={handleChange}
              />
              {errors.expiryAlertDays && <span className="field-error-msg">{errors.expiryAlertDays}</span>}
            </div>

          </div>
        </div>

        {/* Section 5: Taxation, Barcode & Internal Control */}
        <div className="form-section">
          <h4 className="form-section-title">Taxation, Scanning & Controls</h4>
          <div className="form-grid-3">
            
            <div className="form-group">
              <label>GST HSN Code</label>
              <input
                type="text"
                name="hsnCode"
                placeholder="e.g. 300490"
                value={formData.hsnCode}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>UPC Barcode / Scanner Code</label>
              <input
                type="text"
                name="barcode"
                placeholder="e.g. 8901234567890"
                value={formData.barcode}
                onChange={handleChange}
              />
            </div>

            <div className="form-group" style={{ justifyContent: 'center' }}>
              <div className="checkbox-row" style={{ marginTop: '22px' }}>
                <label className="form-checkbox-wrapper">
                  <input
                    type="checkbox"
                    name="trackBatches"
                    checked={formData.trackBatches}
                    onChange={handleChange}
                  />
                  <span>Track Batches</span>
                </label>
              </div>
            </div>

            <div className="form-group form-group-full">
              <div className="checkbox-row">
                <label className="form-checkbox-wrapper">
                  <input
                    type="checkbox"
                    name="allowPurchase"
                    checked={formData.allowPurchase}
                    onChange={handleChange}
                  />
                  <span>Allow Purchase Transactions</span>
                </label>

                <label className="form-checkbox-wrapper">
                  <input
                    type="checkbox"
                    name="allowSale"
                    checked={formData.allowSale}
                    onChange={handleChange}
                  />
                  <span>Allow Sale / Billing Transactions</span>
                </label>
              </div>
            </div>

            <div className="form-group form-group-full">
              <label>Internal Notes & Pharmacy Remarks</label>
              <textarea
                name="notes"
                placeholder="Add special instructions, safety notifications, dosage logs, seasonal demand level, etc."
                rows="2"
                value={formData.notes}
                onChange={handleChange}
              ></textarea>
            </div>

          </div>
        </div>

        {/* Form Actions */}
        <div className="form-actions-row">
          <button 
            type="button" 
            className="back-btn" 
            onClick={() => navigate('/medicines')}
            disabled={submitting}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="form-submit-btn" 
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Save Medicine Record'}
          </button>
        </div>

      </form>
    </div>
  );
};

export default AddMedicine;
