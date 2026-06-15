import axios from 'axios';

// Create instance
const API = axios.create({
  baseURL: '/api',
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

export default API;
