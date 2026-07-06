import React, { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';
import { FaCog, FaHashtag, FaGift, FaExclamationTriangle, FaFileInvoiceDollar } from 'react-icons/fa';
import '../styles/SettingsPage.css';

const SettingsPage = () => {
  const [settings, setSettings] = useState([]);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadSettings = async () => {
    try {
      const res = await settingsAPI.getSettings();
      if (res.success) {
        setSettings(res.settings);

        // Populate formData
        const initialForm = {};
        res.settings.forEach(s => {
          initialForm[s.key] = s.value;
        });
        setFormData(initialForm);
      }
    } catch (err) {
      setError('Failed to load global shop configurations settings');
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleInputChange = (key, val) => {
    setFormData({
      ...formData,
      [key]: val
    });
  };

  const handleNestedInputChange = (key, nestedKey, val) => {
    setFormData({
      ...formData,
      [key]: {
        ...formData[key],
        [nestedKey]: Number(val)
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Map formData keys back to bulk update format [{ key, value }]
      const updatesList = Object.keys(formData).map((key) => ({
        key,
        value: formData[key]
      }));

      const res = await settingsAPI.updateSettings(updatesList);
      if (res.success) {
        setSuccess('System configurations saved successfully and applied instantly.');
        loadSettings();
      }
    } catch (err) {
      setError('Failed to update system configurations settings');
    }
  };

  return (
    <form className="settings-page" onSubmit={handleSubmit}>

      {/* Header */}
      <div className="settings-header">
        <div className="settings-header__icon"><FaCog /></div>
        <div>
          <h2>System Operations Configuration</h2>
          <p>Configure prefix formats, loyalty parameters, and limits without code redeployment</p>
        </div>
      </div>

      {error && <div className="settings-alert error">{error}</div>}
      {success && <div className="settings-alert success">{success}</div>}

      <div className="settings-grid">

        {/* Transaction Serial Prefixes */}
        <div className="settings-card">
          <div className="settings-card__title">
            <span className="icon-badge"><FaHashtag /></span>
            Transaction Serial Prefixes
          </div>
          <div className="settings-card__subtitle">Prefix text used when generating serial numbers</div>
          <div className="settings-fields cols-2">
            <div className="settings-field settings-field--prefix">
              <label>Invoice Prefix</label>
              <input
                type="text"
                value={formData['INVOICE_PREFIX'] || ''}
                onChange={(e) => handleInputChange('INVOICE_PREFIX', e.target.value)}
              />
            </div>
            <div className="settings-field settings-field--prefix">
              <label>Return Prefix</label>
              <input
                type="text"
                value={formData['RETURN_PREFIX'] || ''}
                onChange={(e) => handleInputChange('RETURN_PREFIX', e.target.value)}
              />
            </div>
            <div className="settings-field settings-field--prefix">
              <label>Collection Prefix</label>
              <input
                type="text"
                value={formData['PAYMENT_PREFIX'] || ''}
                onChange={(e) => handleInputChange('PAYMENT_PREFIX', e.target.value)}
              />
            </div>
            <div className="settings-field settings-field--prefix">
              <label>Recall Prefix</label>
              <input
                type="text"
                value={formData['RECALL_PREFIX'] || ''}
                onChange={(e) => handleInputChange('RECALL_PREFIX', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Loyalty & Credit Policies */}
        <div className="settings-card">
          <div className="settings-card__title">
            <span className="icon-badge"><FaGift /></span>
            Loyalty &amp; Credit Policies
          </div>
          <div className="settings-card__subtitle">Rules for point earning, redemption, and customer credit</div>
          <div className="settings-fields cols-2">
            <div className="settings-field">
              <label>Loyalty Earn Rate <span className="unit-hint">(₹ spent / pt)</span></label>
              <input
                type="number"
                value={formData['LOYALTY_EARN_RATE'] || ''}
                onChange={(e) => handleInputChange('LOYALTY_EARN_RATE', Number(e.target.value))}
              />
            </div>
            <div className="settings-field">
              <label>Loyalty Value <span className="unit-hint">(₹ / pt)</span></label>
              <input
                type="number"
                value={formData['LOYALTY_REDEMPTION_RATE'] || ''}
                onChange={(e) => handleInputChange('LOYALTY_REDEMPTION_RATE', Number(e.target.value))}
              />
            </div>
            <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
              <label>Default Customer Credit Limit <span className="unit-hint">(₹)</span></label>
              <input
                type="number"
                value={formData['CREDIT_LIMIT_DEFAULT'] || ''}
                onChange={(e) => handleInputChange('CREDIT_LIMIT_DEFAULT', Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Stock Alert Warning Bounds */}
        <div className="settings-card">
          <div className="settings-card__title">
            <span className="icon-badge"><FaExclamationTriangle /></span>
            Stock Alert Warning Bounds
          </div>
          <div className="settings-card__subtitle">Thresholds that trigger low-stock and expiry warnings</div>
          <div className="settings-fields cols-2">
            <div className="settings-field">
              <label>Low Stock Warning Limit <span className="unit-hint">(Units)</span></label>
              <input
                type="number"
                value={formData['LOW_STOCK_THRESHOLD'] || ''}
                onChange={(e) => handleInputChange('LOW_STOCK_THRESHOLD', Number(e.target.value))}
              />
            </div>
            <div className="settings-field">
              <label>Near Expiry Warning Window <span className="unit-hint">(Days)</span></label>
              <input
                type="number"
                value={formData['NEAR_EXPIRY_DAYS'] || ''}
                onChange={(e) => handleInputChange('NEAR_EXPIRY_DAYS', Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Invoice Custom Settings */}
        <div className="settings-card">
          <div className="settings-card__title">
            <span className="icon-badge"><FaFileInvoiceDollar /></span>
            Invoice Custom Settings
          </div>
          <div className="settings-card__subtitle">Tax display mode and printed invoice footer text</div>
          <div className="settings-fields cols-2">
            <div className="settings-field">
              <label>GST Tax Engine Default</label>
              <select
                value={formData['GST_SETTINGS'] || 'inclusive'}
                onChange={(e) => handleInputChange('GST_SETTINGS', e.target.value)}
              >
                <option value="inclusive">GST-Inclusive Calculations</option>
                <option value="exclusive">GST-Exclusive Calculations</option>
              </select>
            </div>
            <div className="settings-field">
              <label>Invoice Footer Terms &amp; Messages</label>
              <input
                type="text"
                value={formData['INVOICE_FOOTER'] || ''}
                onChange={(e) => handleInputChange('INVOICE_FOOTER', e.target.value)}
              />
            </div>
          </div>
        </div>

      </div>

      {/* Sticky action bar */}
      <div className="settings-action-bar">
        <button type="button" className="settings-btn reset" onClick={loadSettings}>
          Reset Changes
        </button>
        <button type="submit" className="settings-btn save">
          Save Configurations
        </button>
      </div>

    </form>
  );
};

export default SettingsPage;
