import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FaPills, 
  FaHandshake, 
  FaShoppingCart, 
  FaBoxes, 
  FaReceipt, 
  FaUsers, 
  FaWallet, 
  FaChartLine, 
  FaCog, 
  FaSignOutAlt, 
  FaTimes
} from 'react-icons/fa';
import { MdDashboard, MdLocalPharmacy } from 'react-icons/md';

const Sidebar = ({ isOpen, onClose, handleLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: <MdDashboard />, path: '/' },
    { id: 'agencies', name: 'Agencies', icon: <FaHandshake />, path: '/agencies' },
    { id: 'medicines', name: 'Medicines', icon: <FaPills />, path: '/medicines' },
    { id: 'purchases', name: 'Purchases', icon: <FaShoppingCart />, path: '/purchases' },
    { id: 'inventory', name: 'Inventory', icon: <FaBoxes />, path: '/inventory' },
    { id: 'billing', name: 'Billing', icon: <FaReceipt />, path: '/billing' },
    { id: 'customers', name: 'Customers', icon: <FaUsers />, path: '/customers' },
    { id: 'credit', name: 'Credit Accounts', icon: <FaWallet />, path: '/credit' },
    { id: 'reports', name: 'Reports', icon: <FaChartLine />, path: '/reports' },
    { id: 'settings', name: 'Settings', icon: <FaCog />, path: '/settings' }
  ];

  // Helper to determine if a menu item is active
  const isItemActive = (item) => {
    const pathname = location.pathname;
    if (item.id === 'dashboard') {
      return pathname === '/';
    }
    if (item.id === 'agencies') {
      return pathname.startsWith('/agencies');
    }
    return pathname.startsWith(item.path);
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}

      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-container">
            <MdLocalPharmacy className="pharmacy-icon" />
            <div className="logo-text">
              <h3>Kashtbhanjan</h3>
              <span>MEDICAL PANEL</span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <nav className="sidebar-menu">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`menu-item ${isItemActive(item) ? 'active' : ''}`}
              onClick={() => {
                navigate(item.path);
                onClose(); // Close mobile sidebar on item click
              }}
            >
              <span className="item-icon">{item.icon}</span>
              <span className="item-name">{item.name}</span>
            </button>
          ))}
          
          <button className="menu-item logout-btn" onClick={handleLogout}>
            <span className="item-icon"><FaSignOutAlt /></span>
            <span className="item-name">Logout</span>
          </button>
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
