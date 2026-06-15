import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AgencyList from './pages/AgencyList';
import AddAgency from './pages/AddAgency';
import EditAgency from './pages/EditAgency';
import AgencyDetails from './pages/AgencyDetails';
import MedicineList from './pages/MedicineList';
import AddMedicine from './pages/AddMedicine';
import EditMedicine from './pages/EditMedicine';
import MedicineDetails from './pages/MedicineDetails';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { authAPI } from './services/api';

// Styles
import './styles/Global.css';
import './styles/Sidebar.css';
import './styles/Navbar.css';
import './styles/Login.css';
import './styles/Dashboard.css';
import './styles/AgencyList.css';
import './styles/AddAgency.css';
import './styles/EditAgency.css';
import './styles/AgencyDetails.css';
import './styles/MedicineList.css';
import './styles/AddMedicine.css';
import './styles/EditMedicine.css';
import './styles/MedicineDetails.css';

function App() {
  const [user, setUser] = useState(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // Restore session on application load
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');

      if (token && savedUser) {
        try {
          const data = await authAPI.getProfile();
          setUser(data.user);
          localStorage.setItem('user', JSON.stringify(data.user));
        } catch (error) {
          console.error('Session restoration failed:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
      setIsRestoringSession(false);
    };

    restoreSession();
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (isRestoringSession) {
    return (
      <div className="flex-center" style={{ height: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div className="spinner" style={{ borderTopColor: '#1976D2', width: '40px', height: '40px', borderWidth: '3px' }}></div>
        <p style={{ color: '#64748B', fontWeight: '500', fontSize: '14px' }}>Restoring Session...</p>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Redirect authenticated users away from login page */}
        <Route 
          path="/login" 
          element={
            user ? <Navigate to="/" replace /> : <Login onLoginSuccess={handleLoginSuccess} />
          } 
        />

        {/* Dashboard Pages guarded by ProtectedRoute and Layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <Dashboard activeItem="dashboard" />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Agencies Routes */}
        <Route
          path="/agencies"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <AgencyList />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/agencies/add"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <AddAgency />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/agencies/edit/:id"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <EditAgency />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/agencies/:id"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <AgencyDetails />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Medicines Routes */}
        <Route
          path="/medicines"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <MedicineList />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/medicines/add"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <AddMedicine />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/medicines/edit/:id"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <EditMedicine />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/medicines/:id"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <MedicineDetails />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Placeholder Routes */}
        {['purchases', 'inventory', 'billing', 'customers', 'credit', 'reports', 'settings'].map((item) => (
          <Route
            key={item}
            path={`/${item}`}
            element={
              <ProtectedRoute>
                <Layout user={user} handleLogout={handleLogout}>
                  <Dashboard activeItem={item} />
                </Layout>
              </ProtectedRoute>
            }
          />
        ))}

        {/* Catch-all Redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
