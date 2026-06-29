import React, { useState, useEffect } from 'react';
import { reminderAPI, customerAPI, prescriptionAPI } from '../services/api';
import '../styles/Dashboard.css';
import '../styles/MedicineList.css';

const RemindersAdmin = () => {
  const [reminders, setReminders] = useState([]);
  const [effectiveness, setEffectiveness] = useState({
    totalSent: 0,
    claimedRefills: 0,
    effectivenessRate: 0
  });

  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [medicines, setMedicines] = useState([]);

  // Form states for manual reminders
  const [showFormModal, setShowFormModal] = useState(false);
  const [formData, setFormData] = useState({
    customerId: '',
    prescriptionId: '',
    medicineId: '',
    refillDueDate: '',
    reminderPriority: 'Medium'
  });

  // Filters state
  const [customerIdFilter, setCustomerIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchReminders();
    fetchEffectiveness();
    fetchCustomers();
  }, [page, customerIdFilter, statusFilter]);

  // When customer changes in form modal, load their approved prescriptions
  useEffect(() => {
    if (formData.customerId) {
      fetchCustomerPrescriptions(formData.customerId);
    } else {
      setPrescriptions([]);
      setMedicines([]);
    }
  }, [formData.customerId]);

  // When prescription changes, load its medicines
  useEffect(() => {
    if (formData.prescriptionId) {
      const rx = prescriptions.find(r => r._id === formData.prescriptionId);
      if (rx) {
        setMedicines(rx.medicines || []);
      }
    } else {
      setMedicines([]);
    }
  }, [formData.prescriptionId]);

  const fetchReminders = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        customerId: customerIdFilter,
        status: statusFilter
      };
      const data = await reminderAPI.getReminders(params);
      if (data.success) {
        setReminders(data.reminders);
        setPages(data.pages);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to load reminders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEffectiveness = async () => {
    try {
      const data = await reminderAPI.getEffectiveness();
      if (data.success) {
        setEffectiveness(data.stats);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const data = await customerAPI.getCustomers({ limit: 100 });
      if (data.success) {
        setCustomers(data.customers.filter(c => c.customerType === 'Registered'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomerPrescriptions = async (customerId) => {
    try {
      const data = await prescriptionAPI.getPrescriptions({ customerId, status: 'Approved', limit: 100 });
      if (data.success) {
        setPrescriptions(data.prescriptions);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelReminder = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this refill reminder?')) return;
    try {
      const res = await reminderAPI.cancelReminder(id);
      if (res.success) {
        alert('Reminder cancelled successfully.');
        fetchReminders();
        fetchEffectiveness();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel reminder');
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await reminderAPI.createManualReminder(formData);
      if (res.success) {
        alert('Manual refill reminder created successfully.');
        setShowFormModal(false);
        setFormData({
          customerId: '',
          prescriptionId: '',
          medicineId: '',
          refillDueDate: '',
          reminderPriority: 'Medium'
        });
        fetchReminders();
        fetchEffectiveness();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to schedule reminder');
    }
  };

  return (
    <div className="dashboard-container" style={{ padding: '24px', fontFamily: 'Outfit, sans-serif', color: '#1f2937' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '20px', color: '#1e3a8a' }}>Refill Reminder & Communications Board</h2>

      {/* Effectiveness KPIs */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="stat-card" style={{ padding: '20px', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
          <div className="stat-value" style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e40af' }}>{effectiveness.totalSent}</div>
          <div className="stat-label" style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Reminders Dispatched</div>
        </div>
        <div className="stat-card" style={{ padding: '20px', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
          <div className="stat-value" style={{ fontSize: '28px', fontWeight: 'bold', color: '#15803d' }}>{effectiveness.claimedRefills}</div>
          <div className="stat-label" style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Claimed POS Purchases</div>
        </div>
        <div className="stat-card" style={{ padding: '20px', background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)', borderRadius: '12px', border: '1px solid #e9d5ff' }}>
          <div className="stat-value" style={{ fontSize: '28px', fontWeight: 'bold', color: '#6b21a8' }}>{effectiveness.effectivenessRate}%</div>
          <div className="stat-label" style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Reminder Effectiveness Rate</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={customerIdFilter}
            onChange={(e) => setCustomerIdFilter(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
          >
            <option value="">Filter by Customer</option>
            {customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
          >
            <option value="">Filter by Status</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Sent">Sent</option>
            <option value="Failed">Failed</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Claimed">Claimed</option>
          </select>
          <button onClick={fetchReminders} className="btn-primary" style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Apply</button>
        </div>

        <button
          onClick={() => setShowFormModal(true)}
          style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
        >
          + Create Manual Reminder
        </button>
      </div>

      {/* Grid listing */}
      <div className="table-responsive" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: '12px' }}>Code</th>
              <th style={{ padding: '12px' }}>Customer</th>
              <th style={{ padding: '12px' }}>Rx Code</th>
              <th style={{ padding: '12px' }}>Medicine</th>
              <th style={{ padding: '12px' }}>Due Date</th>
              <th style={{ padding: '12px' }}>Priority</th>
              <th style={{ padding: '12px' }}>Status</th>
              <th style={{ padding: '12px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reminders.map((rem) => (
              <tr key={rem._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontWeight: '600' }}>{rem.reminderNumber}</td>
                <td style={{ padding: '12px' }}>{rem.customerId?.name} ({rem.customerId?.phone})</td>
                <td style={{ padding: '12px' }}>{rem.prescriptionId?.prescriptionNumber}</td>
                <td style={{ padding: '12px' }}>{rem.medicineId?.medicineName}</td>
                <td style={{ padding: '12px' }}>{new Date(rem.refillDueDate).toLocaleDateString()}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    background: rem.reminderPriority === 'High' ? '#fee2e2' : rem.reminderPriority === 'Medium' ? '#fef3c7' : '#eff6ff',
                    color: rem.reminderPriority === 'High' ? '#be123c' : rem.reminderPriority === 'Medium' ? '#b45309' : '#1d4ed8'
                  }}>
                    {rem.reminderPriority}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600',
                    background: rem.status === 'Sent' || rem.status === 'Claimed' ? '#dcfce7' : rem.status === 'Scheduled' ? '#eff6ff' : '#fee2e2',
                    color: rem.status === 'Sent' || rem.status === 'Claimed' ? '#15803d' : rem.status === 'Scheduled' ? '#1d4ed8' : '#b91c1c'
                  }}>
                    {rem.status}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>
                  {rem.status === 'Scheduled' && (
                    <button
                      onClick={() => handleCancelReminder(rem._id)}
                      style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Manual Reminder Creation Modal */}
      {showFormModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '450px' }}>
            <h3 style={{ marginBottom: '16px', color: '#1e3a8a' }}>Schedule Refill Reminder</h3>
            <form onSubmit={handleFormSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600' }}>Registered Customer</label>
                <select name="customerId" value={formData.customerId} onChange={handleFormChange} required style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                  <option value="">Select Customer</option>
                  {customers.map(c => <option key={c._id} value={c._id}>{c.name} ({c.phone})</option>)}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600' }}>Approved Prescription</label>
                <select name="prescriptionId" value={formData.prescriptionId} onChange={handleFormChange} required style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} disabled={prescriptions.length === 0}>
                  <option value="">{prescriptions.length === 0 ? 'No approved Rx found' : 'Select Prescription'}</option>
                  {prescriptions.map(p => <option key={p._id} value={p._id}>{p.prescriptionNumber} (Dr. {p.doctorName})</option>)}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600' }}>Prescribed Medicine</label>
                <select name="medicineId" value={formData.medicineId} onChange={handleFormChange} required style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} disabled={medicines.length === 0}>
                  <option value="">Choose Prescribed Medicine</option>
                  {medicines.map(m => <option key={m.medicineId} value={m.medicineId}>{m.medicineName} (Rem: {m.quantityRemaining})</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600' }}>Refill Due Date</label>
                  <input type="date" name="refillDueDate" value={formData.refillDueDate} onChange={handleFormChange} required style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600' }}>Priority</label>
                  <select name="reminderPriority" value={formData.reminderPriority} onChange={handleFormChange} required style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowFormModal(false)} style={{ padding: '8px 16px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemindersAdmin;
