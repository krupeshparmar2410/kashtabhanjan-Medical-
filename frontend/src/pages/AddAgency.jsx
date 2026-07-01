import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import { agencyAPI } from '../services/api';

const AddAgency = () => {
  const navigate = useNavigate();

  // Form Fields State
  const [formData, setFormData] = useState({
    agencyName: '',
    contactPerson: '',
    contactPersonDesignation: '',
    phone: '',
    alternatePhone: '',
    email: '',
    gstNumber: '',
    drugLicenseNumber: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    status: 'active',
    agencyCategory: 'Distributor',
    isPreferredSupplier: false,
    isBlocked: false,
    creditDays: 0,
    openingBalance: 0,
    currentBalance: 0, // In MERN shop this is initialized equal to openingBalance
    creditLimit: 0,
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    notes: ''
  });

  // Validation Errors
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast System State
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Show toast notification helper
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 4000);
  };

  // Field change handler
  const handleChange = (e) => {
    const { id, value, type, checked } = e.target;
    
    // Clear validation error on field change
    if (fieldErrors[id]) {
      setFieldErrors(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }

    setFormData(prev => ({
      ...prev,
      [id]: type === 'checkbox' ? checked : value
    }));
  };

  // Perform Form Validations
  const validateForm = () => {
    const errors = {};

    if (!formData.agencyName.trim()) {
      errors.agencyName = 'Agency Name is required';
    }

    if (!formData.phone.trim()) {
      errors.phone = 'Primary phone number is required';
    }

    if (formData.email.trim()) {
      const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
      if (!emailRegex.test(formData.email)) {
        errors.email = 'Please enter a valid email address';
      }
    }

    if (Number(formData.creditDays) < 0) {
      errors.creditDays = 'Credit days cannot be negative';
    }

    if (Number(formData.openingBalance) < 0) {
      errors.openingBalance = 'Opening balance cannot be negative';
    }

    if (Number(formData.creditLimit) < 0) {
      errors.creditLimit = 'Credit limit cannot be negative';
    }

    if (formData.notes.length > 500) {
      errors.notes = 'Notes cannot exceed 500 characters';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle Save Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      showToast('Please fix validation errors before saving.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      // Sync currentBalance with openingBalance on creation
      const requestData = {
        ...formData,
        currentBalance: Number(formData.openingBalance),
        creditDays: Number(formData.creditDays),
        openingBalance: Number(formData.openingBalance),
        creditLimit: Number(formData.creditLimit)
      };

      const data = await agencyAPI.createAgency(requestData);

      if (data.success) {
        showToast('Supplier Agency registered successfully!', 'success');
        setTimeout(() => {
          navigate('/agencies');
        }, 1500);
      }
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.message) {
        showToast(err.response.data.message, 'error');
      } else {
        showToast('Database error. Could not register agency.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="agency-form-container">
      {/* Toast Alert Banner */}
      {toast.show && (
        <div className="toast-container">
          <div className={`toast-message ${toast.type}`}>
            {toast.type === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="form-header-row">
        <h3>Register New Agency</h3>
        <button className="back-btn" onClick={() => navigate('/agencies')}>
          <FaArrowLeft /> Back to List
        </button>
      </div>

      <form onSubmit={handleSubmit} className="form-card">
        {/* Section 1: General Info */}
        <div className="form-section">
          <h5 className="form-section-title">General Information</h5>
          
          <div className="form-grid-3">
            <div className="form-group">
              <label htmlFor="agencyName">Agency Name <span className="required-star">*</span></label>
              <input
                type="text"
                id="agencyName"
                placeholder="e.g. Sun Pharma Distributor"
                value={formData.agencyName}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              {fieldErrors.agencyName && <span className="field-error-msg">{fieldErrors.agencyName}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="agencyCategory">Agency Classification</label>
              <select
                id="agencyCategory"
                value={formData.agencyCategory}
                onChange={handleChange}
                disabled={isSubmitting}
              >
                <option value="Manufacturer">Manufacturer</option>
                <option value="Wholesaler">Wholesaler</option>
                <option value="Distributor">Distributor</option>
                <option value="Local Supplier">Local Supplier</option>
              </select>
            </div>

            <div className="form-group" style={{ display: 'flex', gap: '10px', alignItems: 'center', paddingTop: '28px' }}>
              <label className="form-checkbox-wrapper">
                <input
                  type="checkbox"
                  id="isPreferredSupplier"
                  checked={formData.isPreferredSupplier}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
                <span>Preferred Supplier (⭐)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Section 2: Contact Details */}
        <div className="form-section">
          <h5 className="form-section-title">Contact Information</h5>
          
          <div className="form-grid-3">
            <div className="form-group">
              <label htmlFor="contactPerson">Contact Person</label>
              <input
                type="text"
                id="contactPerson"
                placeholder="e.g. Rajesh Patel"
                value={formData.contactPerson}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="contactPersonDesignation">Designation</label>
              <input
                type="text"
                id="contactPersonDesignation"
                placeholder="e.g. Sales Manager"
                value={formData.contactPersonDesignation}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">Primary Phone <span className="required-star">*</span></label>
              <input
                type="text"
                id="phone"
                placeholder="e.g. 9876543210"
                value={formData.phone}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              {fieldErrors.phone && <span className="field-error-msg">{fieldErrors.phone}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="alternatePhone">Alternate Phone</label>
              <input
                type="text"
                id="alternatePhone"
                placeholder="e.g. 9876543211"
                value={formData.alternatePhone}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                placeholder="e.g. supplier@domain.com"
                value={formData.email}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              {fieldErrors.email && <span className="field-error-msg">{fieldErrors.email}</span>}
            </div>
          </div>
        </div>

        {/* Section 3: Regulatory / Documentation */}
        <div className="form-section">
          <h5 className="form-section-title">Regulatory & Documentation</h5>
          
          <div className="form-grid-3">
            <div className="form-group">
              <label htmlFor="gstNumber">GSTIN / GST Number</label>
              <input
                type="text"
                id="gstNumber"
                placeholder="e.g. GSTSUN001"
                value={formData.gstNumber}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="drugLicenseNumber">Drug License Number</label>
              <input
                type="text"
                id="drugLicenseNumber"
                placeholder="e.g. DL001"
                value={formData.drugLicenseNumber}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="status">Operation Status</label>
              <select
                id="status"
                value={formData.status}
                onChange={handleChange}
                disabled={isSubmitting}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 4: Bank Details */}
        <div className="form-section">
          <h5 className="form-section-title">Bank Account Details (Optional)</h5>
          
          <div className="form-grid-3">
            <div className="form-group">
              <label htmlFor="bankName">Bank Name</label>
              <input
                type="text"
                id="bankName"
                placeholder="e.g. State Bank of India"
                value={formData.bankName}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="accountNumber">Account Number</label>
              <input
                type="text"
                id="accountNumber"
                placeholder="Enter bank account number"
                value={formData.accountNumber}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="ifscCode">IFSC Code</label>
              <input
                type="text"
                id="ifscCode"
                placeholder="e.g. SBIN0001024"
                value={formData.ifscCode}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {/* Section 5: Credit & Balances */}
        <div className="form-section">
          <h5 className="form-section-title">Credit Limits & Financial Balances</h5>
          
          <div className="form-grid-3">
            <div className="form-group">
              <label htmlFor="creditDays">Credit Term (Days)</label>
              <input
                type="number"
                id="creditDays"
                min="0"
                value={formData.creditDays}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              {fieldErrors.creditDays && <span className="field-error-msg">{fieldErrors.creditDays}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="creditLimit">Credit Limit (₹)</label>
              <input
                type="number"
                id="creditLimit"
                min="0"
                placeholder="Max outstanding limit"
                value={formData.creditLimit}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              {fieldErrors.creditLimit && <span className="field-error-msg">{fieldErrors.creditLimit}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="openingBalance">Opening Balance (₹)</label>
              <input
                type="number"
                id="openingBalance"
                min="0"
                placeholder="e.g. 10000"
                value={formData.openingBalance}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              {fieldErrors.openingBalance && <span className="field-error-msg">{fieldErrors.openingBalance}</span>}
            </div>
          </div>
        </div>

        {/* Section 6: Address & Notes */}
        <div className="form-section">
          <h5 className="form-section-title">Address & Additional Notes</h5>
          
          <div className="form-grid-3">
            <div className="form-group form-group-half">
              <label htmlFor="address">Street Address</label>
              <input
                type="text"
                id="address"
                placeholder="Street address detail..."
                value={formData.address}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="city">City</label>
              <input
                type="text"
                id="city"
                placeholder="City"
                value={formData.city}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="state">State</label>
              <input
                type="text"
                id="state"
                placeholder="State"
                value={formData.state}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="pincode">Pincode</label>
              <input
                type="text"
                id="pincode"
                placeholder="Pincode"
                value={formData.pincode}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="form-group form-group-full">
              <label htmlFor="notes">Internal Notes (Maximum 500 characters)</label>
              <textarea
                id="notes"
                rows="4"
                maxLength="500"
                placeholder="Enter internal supplier notes, instructions, etc."
                value={formData.notes}
                onChange={handleChange}
                disabled={isSubmitting}
              ></textarea>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <span>{formData.notes.length}/500 characters</span>
                {fieldErrors.notes && <span className="field-error-msg">{fieldErrors.notes}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Save controls */}
        <div className="form-actions-row">
          <button
            type="button"
            className="back-btn"
            style={{ padding: '12px 24px' }}
            onClick={() => navigate('/agencies')}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="form-submit-btn"
            disabled={isSubmitting}
          >
            <FaSave /> {isSubmitting ? 'Saving...' : 'Register Agency'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddAgency;
