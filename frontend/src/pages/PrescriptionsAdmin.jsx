import React, { useState, useEffect } from 'react';
import { prescriptionAPI, complianceAPI, customerAPI, medicineAPI } from '../services/api';
import '../styles/Dashboard.css'; // Leverage common dashboard layouts
import '../styles/MedicineList.css'; // Leverage listing elements

const PrescriptionsAdmin = () => {
  const [stats, setStats] = useState({
    totalPrescriptions: 0,
    pendingPrescriptions: 0,
    approvedPrescriptions: 0,
    expiredPrescriptions: 0,
    rejectedPrescriptions: 0,
    activeRefillReminders: 0,
    complianceViolations: 0,
    scheduleHSales: 0,
    scheduleH1Sales: 0,
    scheduleXSales: 0
  });

  const [prescriptions, setPrescriptions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [selectedRx, setSelectedRx] = useState(null);

  // New Prescription Form state
  const [uploadFile, setUploadFile] = useState(null);
  const [formData, setFormData] = useState({
    customerId: '',
    doctorName: '',
    doctorRegistrationNumber: '',
    patientName: '',
    prescriptionDate: '',
    validityDays: 180,
    medicines: []
  });

  // Medicine adder inside upload
  const [currentMed, setCurrentMed] = useState({ medicineId: '', quantityAllowed: '' });

  useEffect(() => {
    fetchStats();
    fetchPrescriptions();
    fetchCustomers();
    fetchMedicines();
  }, [page, statusFilter, startDate, endDate]);

  const fetchStats = async () => {
    try {
      const data = await complianceAPI.getStats();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load compliance stats:', err);
    }
  };

  const fetchPrescriptions = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        search,
        status: statusFilter,
        startDate,
        endDate
      };
      const data = await prescriptionAPI.getPrescriptions(params);
      if (data.success) {
        setPrescriptions(data.prescriptions);
        setPages(data.pages);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to load prescriptions:', err);
    } finally {
      setLoading(false);
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

  const fetchMedicines = async () => {
    try {
      const data = await medicineAPI.getMedicines({ limit: 100 });
      if (data.success) {
        setMedicines(data.medicines);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUploadFileChange = (e) => {
    setUploadFile(e.target.files[0]);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddMedicine = () => {
    if (!currentMed.medicineId || !currentMed.quantityAllowed) return;
    const selectedMedicine = medicines.find(m => m._id === currentMed.medicineId);
    if (!selectedMedicine) return;

    setFormData(prev => ({
      ...prev,
      medicines: [
        ...prev.medicines,
        {
          medicineId: currentMed.medicineId,
          medicineName: selectedMedicine.medicineName,
          quantityAllowed: parseInt(currentMed.quantityAllowed, 10),
          dosage: '1 tab daily',
          duration: '10 days'
        }
      ]
    }));
    setCurrentMed({ medicineId: '', quantityAllowed: '' });
  };

  const handleRemoveMedicine = (index) => {
    setFormData(prev => ({
      ...prev,
      medicines: prev.medicines.filter((_, i) => i !== index)
    }));
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      alert('Please select a file to upload.');
      return;
    }

    const data = new FormData();
    data.append('document', uploadFile);
    data.append('customerId', formData.customerId);
    data.append('doctorName', formData.doctorName);
    data.append('doctorRegistrationNumber', formData.doctorRegistrationNumber);
    data.append('patientName', formData.patientName);
    data.append('prescriptionDate', formData.prescriptionDate);
    data.append('validityDays', formData.validityDays);
    data.append('medicines', JSON.stringify(formData.medicines));

    try {
      setLoading(true);
      const res = await prescriptionAPI.uploadPrescription(data);
      if (res.success) {
        alert('Prescription uploaded successfully!');
        setShowUploadModal(false);
        setFormData({
          customerId: '',
          doctorName: '',
          doctorRegistrationNumber: '',
          patientName: '',
          prescriptionDate: '',
          validityDays: 180,
          medicines: []
        });
        setUploadFile(null);
        fetchStats();
        fetchPrescriptions();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to upload prescription');
    } finally {
      setLoading(false);
    }
  };

  const openVerifyModal = (rx) => {
    setSelectedRx(rx);
    setShowVerifyModal(true);
  };

  const handleApproveRx = async (id) => {
    const remarks = prompt('Enter approval remarks (optional):') || '';
    try {
      const res = await prescriptionAPI.approvePrescription(id, remarks);
      if (res.success) {
        alert('Prescription approved successfully!');
        setShowVerifyModal(false);
        fetchStats();
        fetchPrescriptions();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Approval failed');
    }
  };

  const handleRejectRx = async (id) => {
    const reason = prompt('Enter rejection reason (required):');
    if (!reason) {
      alert('Rejection reason is mandatory.');
      return;
    }
    try {
      const res = await prescriptionAPI.rejectPrescription(id, reason);
      if (res.success) {
        alert('Prescription rejected.');
        setShowVerifyModal(false);
        fetchStats();
        fetchPrescriptions();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Rejection failed');
    }
  };

  const handleArchiveRx = async (id) => {
    if (!window.confirm('Are you sure you want to archive this prescription?')) return;
    try {
      const res = await prescriptionAPI.archivePrescription(id);
      if (res.success) {
        alert('Prescription soft-archived.');
        fetchStats();
        fetchPrescriptions();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to archive');
    }
  };

  const handleDownloadFile = async (id, filename) => {
    try {
      const blob = await prescriptionAPI.downloadPrescriptionFile(id);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename || 'prescription_file.pdf');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      alert('Failed to download file: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="dashboard-container" style={{ padding: '24px', fontFamily: 'Outfit, sans-serif', color: '#1f2937' }}>
      {/* Dynamic Grid Layout for Stats */}
      <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '20px', color: '#1e3a8a' }}>Prescription & POS Compliance Control Console</h2>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="stat-card" style={{ padding: '16px', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e40af' }}>{stats.totalPrescriptions}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: '#6b7280' }}>Total Prescriptions</div>
        </div>
        <div className="stat-card" style={{ padding: '16px', background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', borderRadius: '12px', border: '1px solid #fde68a' }}>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#b45309' }}>{stats.pendingPrescriptions}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: '#6b7280' }}>Pending Verification</div>
        </div>
        <div className="stat-card" style={{ padding: '16px', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#15803d' }}>{stats.approvedPrescriptions}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: '#6b7280' }}>Approved Prescriptions</div>
        </div>
        <div className="stat-card" style={{ padding: '16px', background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', borderRadius: '12px', border: '1px solid #fecaca' }}>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#b91c1c' }}>{stats.expiredPrescriptions}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: '#6b7280' }}>Expired Prescriptions</div>
        </div>
        <div className="stat-card" style={{ padding: '16px', background: 'linear-gradient(135deg, #f3f4f6, #e5e7eb)', borderRadius: '12px', border: '1px solid #d1d5db' }}>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#374151' }}>{stats.activeRefillReminders}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: '#6b7280' }}>Reminders Due</div>
        </div>
        <div className="stat-card" style={{ padding: '16px', background: 'linear-gradient(135deg, #fff1f2, #ffe4e6)', borderRadius: '12px', border: '1px solid #fecdd3' }}>
          <div className="stat-value" style={{ fontSize: '24px', fontWeight: 'bold', color: '#be123c' }}>{stats.complianceViolations}</div>
          <div className="stat-label" style={{ fontSize: '12px', color: '#6b7280' }}>Compliance Violations</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        {/* Actions panel */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Search prescriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchPrescriptions()}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
          >
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Verified">Verified</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Expired">Expired</option>
          </select>
          <button onClick={fetchPrescriptions} className="btn-primary" style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Apply Filters</button>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
        >
          + Upload Doctor Prescription
        </button>
      </div>

      {/* Table view */}
      <div className="table-responsive" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: '12px' }}>Rx Number</th>
              <th style={{ padding: '12px' }}>Patient Name</th>
              <th style={{ padding: '12px' }}>Doctor Name</th>
              <th style={{ padding: '12px' }}>Upload Date</th>
              <th style={{ padding: '12px' }}>Expiry Date</th>
              <th style={{ padding: '12px' }}>Status</th>
              <th style={{ padding: '12px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {prescriptions.map((rx) => (
              <tr key={rx._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontWeight: '600' }}>{rx.prescriptionNumber}</td>
                <td style={{ padding: '12px' }}>{rx.patientName}</td>
                <td style={{ padding: '12px' }}>{rx.doctorName}</td>
                <td style={{ padding: '12px' }}>{new Date(rx.prescriptionDate).toLocaleDateString()}</td>
                <td style={{ padding: '12px' }}>{new Date(rx.expiryDate).toLocaleDateString()}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600',
                    background: rx.status === 'Approved' ? '#dcfce7' : rx.status === 'Pending' ? '#fef3c7' : '#fee2e2',
                    color: rx.status === 'Approved' ? '#15803d' : rx.status === 'Pending' ? '#b45309' : '#b91c1c'
                  }}>
                    {rx.status}
                  </span>
                </td>
                <td style={{ padding: '12px', display: 'flex', gap: '6px' }}>
                  <button onClick={() => openVerifyModal(rx)} style={{ padding: '4px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Verify</button>
                  <button onClick={() => handleDownloadFile(rx._id, `prescription_${rx.prescriptionNumber}.pdf`)} style={{ padding: '4px 8px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Download</button>
                  <button onClick={() => handleArchiveRx(rx._id)} style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Archive</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '550px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '16px', color: '#1e3a8a' }}>Upload Doctor Prescription</h3>
            <form onSubmit={handleUploadSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600' }}>Customer</label>
                  <select name="customerId" value={formData.customerId} onChange={handleFormChange} required style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                    <option value="">Select Customer</option>
                    {customers.map(c => <option key={c._id} value={c._id}>{c.name} ({c.phone})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600' }}>Patient Name</label>
                  <input type="text" name="patientName" value={formData.patientName} onChange={handleFormChange} required style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600' }}>Doctor Name</label>
                  <input type="text" name="doctorName" value={formData.doctorName} onChange={handleFormChange} required style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600' }}>Doctor Reg No</label>
                  <input type="text" name="doctorRegistrationNumber" value={formData.doctorRegistrationNumber} onChange={handleFormChange} required style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600' }}>Prescription Date</label>
                  <input type="date" name="prescriptionDate" value={formData.prescriptionDate} onChange={handleFormChange} required style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600' }}>Upload Prescription File (PDF/Image)</label>
                  <input type="file" onChange={handleUploadFileChange} required style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                </div>
              </div>

              {/* Medicines segment */}
              <div style={{ border: '1px solid #e5e7eb', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Select Medicines Listed:</h4>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <select
                    value={currentMed.medicineId}
                    onChange={(e) => setCurrentMed(prev => ({ ...prev, medicineId: e.target.value }))}
                    style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  >
                    <option value="">Choose Medicine</option>
                    {medicines.map(m => <option key={m._id} value={m._id}>{m.medicineName}</option>)}
                  </select>
                  <input
                    type="number"
                    placeholder="Qty Allowed"
                    value={currentMed.quantityAllowed}
                    onChange={(e) => setCurrentMed(prev => ({ ...prev, quantityAllowed: e.target.value }))}
                    style={{ width: '100px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                  <button type="button" onClick={handleAddMedicine} style={{ padding: '8px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Add</button>
                </div>

                <ul>
                  {formData.medicines.map((m, index) => (
                    <li key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' }}>
                      <span>{m.medicineName} (Allowed: {m.quantityAllowed})</span>
                      <button type="button" onClick={() => handleRemoveMedicine(index)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowUploadModal(false)} style={{ padding: '8px 16px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Upload & Validate</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Verify Side-by-Side Modal */}
      {showVerifyModal && selectedRx && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '900px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginBottom: '16px', color: '#1e3a8a' }}>Verification Viewport - Prescription {selectedRx.prescriptionNumber}</h3>

            <div style={{ display: 'flex', flex: 1, gap: '20px', minHeight: 0 }}>
              {/* Left pane: File presentation */}
              <div style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f3f4f6' }}>
                <div style={{ textAlign: 'center', color: '#4b5563', padding: '20px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '10px' }}>📄</div>
                  <div>Prescription Document File Linked</div>
                  <button
                    onClick={() => handleDownloadFile(selectedRx._id, `prescription_${selectedRx.prescriptionNumber}.pdf`)}
                    style={{ marginTop: '12px', padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Download & Open File
                  </button>
                </div>
              </div>

              {/* Right pane: OCR data audit verification form */}
              <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>


                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600' }}>Patient Name</label>
                    <input type="text" value={selectedRx.patientName} disabled style={{ width: '100%', padding: '6px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600' }}>Doctor Name</label>
                    <input type="text" value={selectedRx.doctorName} disabled style={{ width: '100%', padding: '6px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600' }}>Doctor Registration Code</label>
                    <input type="text" value={selectedRx.doctorRegistrationNumber} disabled style={{ width: '100%', padding: '6px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600' }}>Prescription Date</label>
                    <input type="text" value={new Date(selectedRx.prescriptionDate).toLocaleDateString()} disabled style={{ width: '100%', padding: '6px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: '120px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>Listed Medicines & Quotas:</h4>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '6px', textAlign: 'left' }}>Medicine</th>
                        <th style={{ padding: '6px', textAlign: 'center' }}>Allowed</th>
                        <th style={{ padding: '6px', textAlign: 'center' }}>Consumed</th>
                        <th style={{ padding: '6px', textAlign: 'center' }}>Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRx.medicines.map((m) => (
                        <tr key={m._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '6px' }}>{m.medicineName}</td>
                          <td style={{ padding: '6px', textAlign: 'center' }}>{m.quantityAllowed}</td>
                          <td style={{ padding: '6px', textAlign: 'center' }}>{m.quantityConsumed}</td>
                          <td style={{ padding: '6px', textAlign: 'center', fontWeight: '700' }}>{m.quantityRemaining}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                  <button onClick={() => setShowVerifyModal(false)} style={{ padding: '8px 16px', background: '#9ca3af', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
                  {selectedRx.status !== 'Approved' && (
                    <>
                      <button onClick={() => handleRejectRx(selectedRx._id)} style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Reject</button>
                      <button onClick={() => handleApproveRx(selectedRx._id)} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Approve Rx</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrescriptionsAdmin;
