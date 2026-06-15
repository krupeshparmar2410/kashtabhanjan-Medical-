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
      default:
        return activeItem.charAt(0).toUpperCase() + activeItem.slice(1);
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
