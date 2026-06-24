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
import PurchaseList from './pages/PurchaseList';
import AddPurchase from './pages/AddPurchase';
import PurchaseDetails from './pages/PurchaseDetails';
import InventoryDashboard from './pages/InventoryDashboard';
import Billing from './pages/Billing';
import SalesReturns from './pages/SalesReturns';
import CustomersList from './pages/CustomersList';
import CustomerDetails from './pages/CustomerDetails';
import CreditAccounts from './pages/CreditAccounts';
import Reports from './pages/Reports';
import Recalls from './pages/Recalls';
import CashClosingPage from './pages/CashClosingPage';
import SettingsPage from './pages/SettingsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import DatabaseMaintenance from './pages/DatabaseMaintenance';
import PrescriptionsAdmin from './pages/PrescriptionsAdmin';
import RemindersAdmin from './pages/RemindersAdmin';
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
import './styles/PurchaseList.css';
import './styles/AddPurchase.css';
import './styles/PurchaseDetails.css';
import './styles/InventoryDashboard.css';
import './styles/SalesReturns.css';

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

        {/* Purchases Routes */}
        <Route
          path="/purchases"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <PurchaseList />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/purchases/add"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <AddPurchase />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/purchases/edit/:id"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <AddPurchase />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/purchases/:id"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <PurchaseDetails />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Inventory Routes */}
        <Route
          path="/inventory"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <InventoryDashboard />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Billing Point of Sale */}
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <Billing />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Sales Returns */}
        <Route
          path="/sales-returns"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <SalesReturns />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Customer Directory */}
        <Route
          path="/customers"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <CustomersList />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/customers/:id"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <CustomerDetails />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Prescriptions Admin */}
        <Route
          path="/prescriptions"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <PrescriptionsAdmin />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Reminders Board */}
        <Route
          path="/reminders"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <RemindersAdmin />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Credit Accounts Ledger */}
        <Route
          path="/credit"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <CreditAccounts />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Reports & BI Widgets */}
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <Reports />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Recalls and Blocked Stocks */}
        <Route
          path="/recalls"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <Recalls />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Counter Cash closing sessions */}
        <Route
          path="/cash-closing"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <CashClosingPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Settings Administration */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <SettingsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Audit logging viewer */}
        <Route
          path="/audit-logs"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <AuditLogsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Database Maintenance Dashboard */}
        <Route
          path="/maintenance"
          element={
            <ProtectedRoute>
              <Layout user={user} handleLogout={handleLogout}>
                <DatabaseMaintenance />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Catch-all Redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
