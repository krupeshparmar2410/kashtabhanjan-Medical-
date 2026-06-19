import axios from 'axios';

// Create instance
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add a request interceptor to attach JWT token
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle authorization errors (token expired, etc.)
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear storage and redirect if token is invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // If we are not already on the login page, redirect
      if (!window.location.pathname.endsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: async (email, password) => {
    const response = await API.post('/auth/login', { email, password });
    return response.data;
  },
  getProfile: async () => {
    const response = await API.get('/auth/profile');
    return response.data;
  }
};

export const agencyAPI = {
  getStats: async () => {
    const response = await API.get('/agencies/stats');
    return response.data;
  },
  getAgencies: async (params = {}) => {
    const response = await API.get('/agencies', { params });
    return response.data;
  },
  getAgencyById: async (id) => {
    const response = await API.get(`/agencies/${id}`);
    return response.data;
  },
  createAgency: async (agencyData) => {
    const response = await API.post('/agencies', agencyData);
    return response.data;
  },
  updateAgency: async (id, agencyData) => {
    const response = await API.put(`/agencies/${id}`, agencyData);
    return response.data;
  },
  deleteAgency: async (id) => {
    const response = await API.delete(`/agencies/${id}`);
    return response.data;
  },
  getAgencyActivities: async (id) => {
    const response = await API.get(`/agencies/${id}/activities`);
    return response.data;
  }
};

export const medicineAPI = {
  getStats: async () => {
    const response = await API.get('/medicines/stats');
    return response.data;
  },
  getMedicines: async (params = {}) => {
    const response = await API.get('/medicines', { params });
    return response.data;
  },
  getMedicineById: async (id) => {
    const response = await API.get(`/medicines/${id}`);
    return response.data;
  },
  createMedicine: async (medicineData) => {
    const response = await API.post('/medicines', medicineData);
    return response.data;
  },
  updateMedicine: async (id, medicineData) => {
    const response = await API.put(`/medicines/${id}`, medicineData);
    return response.data;
  },
  deleteMedicine: async (id) => {
    const response = await API.delete(`/medicines/${id}`);
    return response.data;
  },
  getActivities: async (id) => {
    const response = await API.get(`/medicines/${id}/activities`);
    return response.data;
  }
};

export const purchaseAPI = {
  getStats: async () => {
    const response = await API.get('/purchases/stats');
    return response.data;
  },
  getPurchases: async (params = {}) => {
    const response = await API.get('/purchases', { params });
    return response.data;
  },
  getPurchaseById: async (id) => {
    const response = await API.get(`/purchases/${id}`);
    return response.data;
  },
  createPurchase: async (purchaseData) => {
    const response = await API.post('/purchases', purchaseData);
    return response.data;
  },
  updatePurchase: async (id, purchaseData) => {
    const response = await API.put(`/purchases/${id}`, purchaseData);
    return response.data;
  },
  deletePurchase: async (id) => {
    const response = await API.delete(`/purchases/${id}`);
    return response.data;
  },
  postPurchase: async (id) => {
    const response = await API.post(`/purchases/${id}/post`);
    return response.data;
  },
  getGSTSummary: async () => {
    const response = await API.get('/purchases/gst-summary');
    return response.data;
  },
  getInvoicePDF: async (id) => {
    const response = await API.get(`/purchases/${id}/pdf`);
    return response.data;
  },
  importExcel: async (importData) => {
    const response = await API.post('/purchases/import', importData);
    return response.data;
  },
  createReturn: async (returnData) => {
    const response = await API.post('/purchases/returns', returnData);
    return response.data;
  },
  getReturns: async () => {
    const response = await API.get('/purchases/returns');
    return response.data;
  },
  createPayment: async (paymentData) => {
    const response = await API.post('/purchases/payments', paymentData);
    return response.data;
  },
  getPayments: async () => {
    const response = await API.get('/purchases/payments');
    return response.data;
  }
};

export const inventoryAPI = {
  getBatches: async (params = {}) => {
    const response = await API.get('/inventory/batches', { params });
    return response.data;
  },
  toggleLock: async (id, lockData) => {
    const response = await API.put(`/inventory/batches/${id}/lock`, lockData);
    return response.data;
  },
  getFEFO: async (medicineId) => {
    const response = await API.get(`/inventory/fefo/${medicineId}`);
    return response.data;
  },
  getValuation: async () => {
    const response = await API.get('/inventory/valuation');
    return response.data;
  },
  getSnapshots: async () => {
    const response = await API.get('/inventory/snapshots');
    return response.data;
  },
  takeSnapshot: async () => {
    const response = await API.post('/inventory/snapshots');
    return response.data;
  },
  disposeStock: async (disposalData) => {
    const response = await API.post('/inventory/dispose', disposalData);
    return response.data;
  },
  adjustStock: async (adjustmentData) => {
    const response = await API.post('/inventory/adjust', adjustmentData);
    return response.data;
  },
  getActivities: async (params = {}) => {
    const response = await API.get('/inventory/activities', { params });
    return response.data;
  },
  getReports: async () => {
    const response = await API.get('/inventory/reports');
    return response.data;
  }
};

export const customerAPI = {
  getCustomers: async (params = {}) => {
    const response = await API.get('/customers', { params });
    return response.data;
  },
  searchCustomers: async (query = '') => {
    const response = await API.get(`/customers/search?query=${query}`);
    return response.data;
  },
  getCustomerById: async (id) => {
    const response = await API.get(`/customers/${id}`);
    return response.data;
  },
  createCustomer: async (data) => {
    const response = await API.post('/customers', data);
    return response.data;
  },
  updateCustomer: async (id, data) => {
    const response = await API.put(`/customers/${id}`, data);
    return response.data;
  },
  deleteCustomer: async (id) => {
    const response = await API.delete(`/customers/${id}`);
    return response.data;
  },
  restoreCustomer: async (id) => {
    const response = await API.post(`/customers/${id}/restore`);
    return response.data;
  },
  getLedger: async (id) => {
    const response = await API.get(`/customers/${id}/ledger`);
    return response.data;
  },
  getLoyalty: async (id) => {
    const response = await API.get(`/customers/${id}/loyalty`);
    return response.data;
  },
  getPayments: async (id) => {
    const response = await API.get(`/customers/${id}/payments`);
    return response.data;
  },
  createPayment: async (id, data) => {
    const response = await API.post(`/customers/${id}/payments`, data);
    return response.data;
  },
  getAnalytics: async (id) => {
    const response = await API.get(`/customers/${id}/analytics`);
    return response.data;
  }
};

export const saleAPI = {
  getSales: async (params = {}) => {
    const response = await API.get('/sales', { params });
    return response.data;
  },
  getSaleById: async (id) => {
    const response = await API.get(`/sales/${id}`);
    return response.data;
  },
  createSale: async (data) => {
    const response = await API.post('/sales', data);
    return response.data;
  },
  cancelSale: async (id, data) => {
    const response = await API.post(`/sales/${id}/cancel`, data);
    return response.data;
  },
  getInvoicePDF: async (id) => {
    const response = await API.get(`/sales/${id}/pdf`);
    return response.data;
  },
  createReturn: async (data) => {
    const response = await API.post('/sales/returns', data);
    return response.data;
  },
  getReturns: async () => {
    const response = await API.get('/sales/returns');
    return response.data;
  },
  getSubstitutes: async (medicineId) => {
    const response = await API.get(`/sales/substitutes/${medicineId}`);
    return response.data;
  },
  getDashboard: async () => {
    const response = await API.get('/sales/dashboard');
    return response.data;
  },
  getAuditLogs: async () => {
    const response = await API.get('/audits');
    return response.data;
  },
  verifyAuditChain: async () => {
    const response = await API.get('/audits/verify');
    return response.data;
  },
  exportAuditLogs: async (format = 'excel', params = {}) => {
    const response = await API.get(`/audits/export?format=${format}`, { params, responseType: 'blob' });
    return response.data;
  },
  getActivity: async () => {
    const response = await API.get('/sales/activities');
    return response.data;
  },
  getReport: async (params = {}) => {
    const response = await API.get('/sales/reports', { params });
    return response.data;
  },
  getHealth: async () => {
    const response = await API.get('/sales/health');
    return response.data;
  },
  getRecalls: async () => {
    const response = await API.get('/sales/recalls');
    return response.data;
  },
  createRecall: async (data) => {
    const response = await API.post('/sales/recalls', data);
    return response.data;
  },
  getRecentNotifications: async () => {
    const response = await API.get('/sales/notifications');
    return response.data;
  },
  markNotificationRead: async (id) => {
    const response = await API.put(`/sales/notifications/${id}`);
    return response.data;
  },
  getCashClosings: async () => {
    const response = await API.get('/sales/cash-closings');
    return response.data;
  },
  createCashClosing: async (data) => {
    const response = await API.post('/sales/cash-closings', data);
    return response.data;
  }
};

export const settingsAPI = {
  getSettings: async () => {
    const response = await API.get('/settings');
    return response.data;
  },
  updateSettings: async (data) => {
    const response = await API.put('/settings', data);
    return response.data;
  },
  getStats: async () => {
    const response = await API.get('/settings/stats');
    return response.data;
  },
  getBackups: async () => {
    const response = await API.get('/backups');
    return response.data;
  },
  createBackup: async (backupData) => {
    const response = await API.post('/backups/create', backupData);
    return response.data;
  },
  deleteBackup: async (id) => {
    const response = await API.delete(`/backups/${id}`);
    return response.data;
  },
  restoreDatabase: async (fileName, confirmationPhrase = 'RESTORE SYSTEM STATE') => {
    const response = await API.post('/backups/restore', { fileName, confirmationPhrase });
    return response.data;
  },
  getArchiveStats: async () => {
    const response = await API.get('/settings/archive');
    return response.data;
  },
  archiveRecords: async (cutoffDate) => {
    const response = await API.post('/settings/archive', { cutoffDate });
    return response.data;
  },
  restoreArchive: async (archiveData) => {
    const response = await API.post('/settings/archive/restore', archiveData);
    return response.data;
  },
  purgeArchive: async (collectionName) => {
    const response = await API.delete('/settings/archive/purge', { data: { collectionName } });
    return response.data;
  },
  downloadLogs: async (logType) => {
    const response = await API.get(`/settings/logs/download?logType=${logType}`, { responseType: 'blob' });
    return response.data;
  },
  clearLogs: async (days) => {
    const response = await API.post('/settings/logs/clear', { days });
    return response.data;
  },
  getSettingsHistory: async () => {
    const response = await API.get('/settings/history');
    return response.data;
  },
  rollbackSettings: async (versionNumber) => {
    const response = await API.post('/settings/rollback', { versionNumber });
    return response.data;
  },
  rotateKey: async (newEncryptionKey) => {
    const response = await API.post('/settings/key-rotation', { newEncryptionKey });
    return response.data;
  }
};

export const prescriptionAPI = {
  getPrescriptions: async (params = {}) => {
    const response = await API.get('/prescriptions', { params });
    return response.data;
  },
  getPrescriptionById: async (id) => {
    const response = await API.get(`/prescriptions/${id}`);
    return response.data;
  },
  uploadPrescription: async (formData) => {
    const response = await API.post('/prescriptions', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },
  approvePrescription: async (id, remarks) => {
    const response = await API.put(`/prescriptions/${id}/approve`, { remarks });
    return response.data;
  },
  rejectPrescription: async (id, rejectionReason) => {
    const response = await API.put(`/prescriptions/${id}/reject`, { rejectionReason });
    return response.data;
  },
  downloadPrescriptionFile: async (id) => {
    const response = await API.get(`/prescriptions/${id}/download`, { responseType: 'blob' });
    return response.data;
  },
  updatePrescription: async (id, data) => {
    const response = await API.put(`/prescriptions/${id}`, data);
    return response.data;
  },
  archivePrescription: async (id) => {
    const response = await API.put(`/prescriptions/${id}/archive`);
    return response.data;
  },
  restorePrescription: async (id) => {
    const response = await API.put(`/prescriptions/${id}/restore`);
    return response.data;
  },
  deletePrescription: async (id) => {
    const response = await API.delete(`/prescriptions/${id}`);
    return response.data;
  }
};

export const reminderAPI = {
  getReminders: async (params = {}) => {
    const response = await API.get('/reminders', { params });
    return response.data;
  },
  createManualReminder: async (data) => {
    const response = await API.post('/reminders', data);
    return response.data;
  },
  cancelReminder: async (id) => {
    const response = await API.put(`/reminders/${id}/cancel`);
    return response.data;
  },
  updateReminderStatus: async (id, status) => {
    const response = await API.put(`/reminders/${id}/status`, { status });
    return response.data;
  },
  getEffectiveness: async () => {
    const response = await API.get('/reminders/reports/effectiveness');
    return response.data;
  }
};

export const complianceAPI = {
  getStats: async () => {
    const response = await API.get('/compliance/stats');
    return response.data;
  },
  getReports: async (params = {}) => {
    const response = await API.get('/compliance/reports', { params });
    return response.data;
  }
};

export default API;
