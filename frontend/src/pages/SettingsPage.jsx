import React, { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';

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
    <div className="card-container">
      <div className="form-card" style={{ maxWidth: '800px', margin: 'auto' }}>
        <div className="form-header" style={{ background: 'linear-gradient(135deg, #475569 0%, #1e293b 100%)' }}>
          <h2>System Operations Configuration</h2>
          <p>Configure prefix formats, loyalty parameters, and limits without code redeployment</p>
        </div>

        {error && <div className="error-message" style={{ margin: '16px' }}>{error}</div>}
        {success && <div className="success-message" style={{ margin: '16px' }}>{success}</div>}

        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', color: '#475569' }}>Transaction Serial Prefixes</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div>
              <label className="form-label">Invoice Prefix</label>
              <input
                type="text"
                className="form-input"
                value={formData['INVOICE_PREFIX'] || ''}
                onChange={(e) => handleInputChange('INVOICE_PREFIX', e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Return Prefix</label>
              <input
                type="text"
                className="form-input"
                value={formData['RETURN_PREFIX'] || ''}
                onChange={(e) => handleInputChange('RETURN_PREFIX', e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Collection Prefix</label>
              <input
                type="text"
                className="form-input"
                value={formData['PAYMENT_PREFIX'] || ''}
                onChange={(e) => handleInputChange('PAYMENT_PREFIX', e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Recall Prefix</label>
              <input
                type="text"
                className="form-input"
                value={formData['RECALL_PREFIX'] || ''}
                onChange={(e) => handleInputChange('RECALL_PREFIX', e.target.value)}
              />
            </div>
          </div>

          <h4 style={{ margin: '10px 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', color: '#475569' }}>Loyalty & Credit Policies</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div>
              <label className="form-label">Loyalty Earn Rate (₹ spent / pt)</label>
              <input
                type="number"
                className="form-input"
                value={formData['LOYALTY_EARN_RATE'] || ''}
                onChange={(e) => handleInputChange('LOYALTY_EARN_RATE', Number(e.target.value))}
              />
            </div>
            <div>
              <label className="form-label">Loyalty Value (₹ / pt)</label>
              <input
                type="number"
                className="form-input"
                value={formData['LOYALTY_REDEMPTION_RATE'] || ''}
                onChange={(e) => handleInputChange('LOYALTY_REDEMPTION_RATE', Number(e.target.value))}
              />
            </div>
            <div>
              <label className="form-label">Default Customer Credit Limit (₹)</label>
              <input
                type="number"
                className="form-input"
                value={formData['CREDIT_LIMIT_DEFAULT'] || ''}
                onChange={(e) => handleInputChange('CREDIT_LIMIT_DEFAULT', Number(e.target.value))}
              />
            </div>
          </div>

          <h4 style={{ margin: '10px 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', color: '#475569' }}>Stock Alert Warning Bounds</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            <div>
              <label className="form-label">Low Stock Warning Limit (Units)</label>
              <input
                type="number"
                className="form-input"
                value={formData['LOW_STOCK_THRESHOLD'] || ''}
                onChange={(e) => handleInputChange('LOW_STOCK_THRESHOLD', Number(e.target.value))}
              />
            </div>
            <div>
              <label className="form-label">Near Expiry Warning Window (Days)</label>
              <input
                type="number"
                className="form-input"
                value={formData['NEAR_EXPIRY_DAYS'] || ''}
                onChange={(e) => handleInputChange('NEAR_EXPIRY_DAYS', Number(e.target.value))}
              />
            </div>
          </div>

          <h4 style={{ margin: '10px 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', color: '#475569' }}>Invoice Custom Settings</h4>
          <div>
            <label className="form-label">GST Tax Engine default</label>
            <select
              className="form-input"
              value={formData['GST_SETTINGS'] || 'inclusive'}
              onChange={(e) => handleInputChange('GST_SETTINGS', e.target.value)}
            >
              <option value="inclusive">GST-Inclusive Calculations</option>
              <option value="exclusive">GST-Exclusive Calculations</option>
            </select>
          </div>
          <div>
            <label className="form-label">Invoice Footer terms & messages</label>
            <input
              type="text"
              className="form-input"
              value={formData['INVOICE_FOOTER'] || ''}
              onChange={(e) => handleInputChange('INVOICE_FOOTER', e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={loadSettings}
            >
              Reset Changes
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1, background: '#475569', border: 'none' }}
            >
              Save Configurations
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default SettingsPage;
