import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

const Layout = ({ children, user, handleLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const getActiveItem = () => {
    const path = location.pathname;
    if (path === '/') return 'dashboard';
    if (path.startsWith('/agencies')) return 'agencies';
    if (path.startsWith('/medicines')) return 'medicines';
    if (path.startsWith('/purchases')) return 'purchases';
    if (path.startsWith('/inventory')) return 'inventory';
    if (path.startsWith('/billing')) return 'billing';
    if (path.startsWith('/customers')) return 'customers';
    if (path.startsWith('/credit')) return 'credit';
    if (path.startsWith('/reports')) return 'reports';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/prescriptions')) return 'prescriptions';
    if (path.startsWith('/reminders')) return 'reminders';
    if (path.startsWith('/recalls')) return 'recalls';
    if (path.startsWith('/cash-closing')) return 'cash-closing';
    if (path.startsWith('/audit-logs')) return 'audit-logs';
    if (path.startsWith('/sales')) return 'sales';
    return 'dashboard';
  };

  const activeItem = getActiveItem();

  const getPageTitle = () => {
    switch (activeItem) {
      case 'dashboard':
        return 'Dashboard Overview';
      case 'agencies':
        return 'Agencies Directory';
      case 'credit':
        return 'Credit Accounts';
      case 'prescriptions':
        return 'Prescriptions';
      case 'reminders':
        return 'Refill Reminders';
      case 'recalls':
        return 'Drug Recalls';
      case 'cash-closing':
        return 'Cash Closing';
      case 'audit-logs':
        return 'Audit Logs';
      case 'maintenance':
        return 'Database Maintenance';
      case 'inventory':
        return 'Inventory Dashboard';
      case 'billing':
        return 'Point of Sale (Billing)';
    case 'sales':
      return 'Invoice Details';
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        handleLogout={handleLogout}
      />
      <div className="main-content">
        <Navbar
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          title={getPageTitle()}
          user={user}
          handleLogout={handleLogout}
        />
        <main className="content-wrapper">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
