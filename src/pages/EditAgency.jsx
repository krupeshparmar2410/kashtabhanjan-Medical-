import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import { agencyAPI } from '../services/api';

const EditAgency = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  // Form Fields State
  const [formData, setFormData] = useState({
    agencyCode: '',
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
    currentBalance: 0,
    creditLimit: 0,
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    notes: ''
  });

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Load existing agency details
  useEffect(() => {
    const fetchAgencyDetails = async () => {
      try {
        setIsLoading(true);
        const data = await agencyAPI.getAgencyById(id);
        if (data.success) {
          const a = data.agency;
          setFormData({
            agencyCode: a.agencyCode || '',
            agencyName: a.agencyName || '',
            contactPerson: a.contactPerson || '',
            contactPersonDesignation: a.contactPersonDesignation || '',
            phone: a.phone || '',
            alternatePhone: a.alternatePhone || '',
            email: a.email || '',
            gstNumber: a.gstNumber || '',
            drugLicenseNumber: a.drugLicenseNumber || '',
            address: a.address || '',
            city: a.city || '',
            state: a.state || '',
            pincode: a.pincode || '',
            status: a.status || 'active',
            agencyCategory: a.agencyCategory || 'Distributor',
            isPreferredSupplier: a.isPreferredSupplier || false,
            isBlocked: a.isBlocked || false,
            creditDays: a.creditDays || 0,
            openingBalance: a.openingBalance || 0,
            currentBalance: a.currentBalance || 0,
            creditLimit: a.creditLimit || 0,
            bankName: a.bankName || '',
            accountNumber: a.accountNumber || '',
            ifscCode: a.ifscCode || '',
            notes: a.notes || ''
          });
        }
      } catch (err) {
        console.error('Error fetching agency details:', err);
        showToast('Error loading agency details. Redirecting...', 'error');
        setTimeout(() => {
          navigate('/agencies');
        }, 2000);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgencyDetails();
  }, [id]);

  // Show toast helper
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 4000);
  };

  // Form field change handler
  const handleChange = (e) => {
    const { id, value, type, checked } = e.target;
    
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

  // Validation
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

  // Form submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      showToast('Please fix form validation errors.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const requestData = {
        ...formData,
        creditDays: Number(formData.creditDays),
        openingBalance: Number(formData.openingBalance),
        currentBalance: Number(formData.currentBalance),
        creditLimit: Number(formData.creditLimit)
      };

      const data = await agencyAPI.updateAgency(id, requestData);

      if (data.success) {
        showToast('Supplier details updated successfully!', 'success');
        setTimeout(() => {
          navigate('/agencies');
        }, 1500);
      }
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.message) {
        showToast(err.response.data.message, 'error');
      } else {
        showToast('Database error. Could not update supplier details.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="agency-form-container">
      {/* Toast Banner */}
      {toast.show && (
        <div className="toast-container">
          <div className={`toast-message ${toast.type}`}>
            {toast.type === 'success' ? <FaCheckCircle /> : <FaExclamationCircle />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="form-header-row">
        <h3>Edit Supplier Details</h3>
        <button className="back-btn" onClick={() => navigate('/agencies')}>
          <FaArrowLeft /> Back to List
        </button>
      </div>

      {isLoading ? (
        <div className="form-card flex-center" style={{ minHeight: '350px', flexDirection: 'column', gap: '16px' }}>
          <div className="spinner" style={{ borderTopColor: '#1976D2', width: '45px', height: '45px', borderWidth: '3px' }}></div>
          <p style={{ color: '#64748B', fontSize: '14px' }}>Loading supplier record...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="form-card">
          {/* Section 1: General Info */}
          <div className="form-section">
            <h5 className="form-section-title">General Information</h5>
            
            <div className="form-grid-3">
              <div className="form-group">
                <label>Agency Code (Read-Only)</label>
                <input
                  type="text"
                  value={formData.agencyCode}
                  disabled
                />
              </div>

              <div className="form-group">
                <label htmlFor="agencyName">Agency Name <span className="required-star">*</span></label>
                <input
                  type="text"
                  id="agencyName"
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
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
                {fieldErrors.email && <span className="field-error-msg">{fieldErrors.email}</span>}
              </div>
            </div>
          </div>

          {/* Section 3: Regulatory / Status */}
          <div className="form-section">
            <h5 className="form-section-title">Regulatory & Lock Status</h5>
            
            <div className="form-grid-3">
              <div className="form-group">
                <label htmlFor="gstNumber">GSTIN / GST Number</label>
                <input
                  type="text"
                  id="gstNumber"
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

              <div className="form-group" style={{ display: 'flex', gap: '10px', alignItems: 'center', paddingTop: '28px' }}>
                <label className="form-checkbox-wrapper" style={{ borderColor: formData.isBlocked ? 'var(--error-color)' : 'var(--border-color)', backgroundColor: formData.isBlocked ? 'var(--error-bg)' : 'transparent' }}>
                  <input
                    type="checkbox"
                    id="isBlocked"
                    checked={formData.isBlocked}
                    onChange={handleChange}
                    disabled={isSubmitting}
                  />
                  <span style={{ color: formData.isBlocked ? 'var(--error-color)' : 'var(--text-primary)' }}>
                    Block Supplier (Disputes/Unreliable)
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Section 4: Bank Account Details */}
          <div className="form-section">
            <h5 className="form-section-title">Bank Account Details</h5>
            
            <div className="form-grid-3">
              <div className="form-group">
                <label htmlFor="bankName">Bank Name</label>
                <input
                  type="text"
                  id="bankName"
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
                  value={formData.ifscCode}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* Section 5: Balances & Credit */}
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
                  value={formData.openingBalance}
                  onChange={handleChange}
                  disabled
                />
              </div>

              <div className="form-group">
                <label htmlFor="currentBalance">Current Balance (₹)</label>
                <input
                  type="number"
                  id="currentBalance"
                  min="0"
                  value={formData.currentBalance}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
                {fieldErrors.currentBalance && <span className="field-error-msg">{fieldErrors.currentBalance}</span>}
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

          {/* Save buttons */}
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
              <FaSave /> {isSubmitting ? 'Updating...' : 'Save Updates'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default EditAgency;
