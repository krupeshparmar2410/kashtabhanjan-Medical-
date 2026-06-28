import React, { useState, useEffect } from 'react';
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
  FaTimes,
  FaBan,
  FaCashRegister,
  FaHistory,
  FaDatabase,
  FaFileMedical,
  FaBell,
  FaUndo,
  FaHeartbeat
} from 'react-icons/fa';
import { MdDashboard, MdLocalPharmacy } from 'react-icons/md';
import { inventoryAPI } from '../services/api';
const Sidebar = ({ isOpen, onClose, handleLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    const fetchAlertsCount = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await inventoryAPI.getReports();
        if (res.success && res.counts) {
          const total = (res.counts.lowStock || 0) + (res.counts.nearExpiry || 0) + (res.counts.expired || 0);
          setAlertCount(total);
        }
      } catch (err) {
        console.log('Sidebar alerts fetch skipped:', err.message);
      }
    };

    fetchAlertsCount();
  }, [location.pathname]);

  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: <MdDashboard />, path: '/' },
    { id: 'agencies', name: 'Agencies', icon: <FaHandshake />, path: '/agencies' },
    { id: 'medicines', name: 'Medicines', icon: <FaPills />, path: '/medicines' },
    { id: 'purchases', name: 'Purchases', icon: <FaShoppingCart />, path: '/purchases' },
    { id: 'inventory', name: 'Inventory', icon: <FaBoxes />, path: '/inventory' },
    { id: 'billing', name: 'Billing', icon: <FaReceipt />, path: '/billing' },
    { id: 'sales-returns', name: 'Sales Returns', icon: <FaUndo />, path: '/sales-returns' },
    { id: 'prescriptions', name: 'Prescriptions', icon: <FaFileMedical />, path: '/prescriptions' },
    { id: 'reminders', name: 'Refill Reminders', icon: <FaBell />, path: '/reminders' },
    { id: 'customers', name: 'Customers', icon: <FaUsers />, path: '/customers' },
    { id: 'credit', name: 'Credit Accounts', icon: <FaWallet />, path: '/credit' },
    { id: 'reports', name: 'Reports', icon: <FaChartLine />, path: '/reports' },
    { id: 'recalls', name: 'Drug Recalls', icon: <FaBan />, path: '/recalls' },
    { id: 'cash-closing', name: 'Cash Closing', icon: <FaCashRegister />, path: '/cash-closing' },
    { id: 'audit-logs', name: 'Audit Logs', icon: <FaHistory />, path: '/audit-logs' },
    { id: 'settings', name: 'Settings', icon: <FaCog />, path: '/settings' },
    { id: 'maintenance', name: 'Maintenance', icon: <FaDatabase />, path: '/maintenance' },
    { id: 'diagnostics', name: 'Diagnostics', icon: <FaHeartbeat />, path: '/diagnostics' }
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
              style={{ display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left' }}
            >
              <span className="item-icon">{item.icon}</span>
              <span className="item-name" style={{ flexGrow: 1 }}>{item.name}</span>
              {item.id === 'inventory' && alertCount > 0 && (
                <span className="sidebar-badge" style={{
                  backgroundColor: 'var(--error-color)',
                  color: '#ffffff',
                  borderRadius: '10px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: '700',
                  lineHeight: '1.2'
                }}>
                  {alertCount}
                </span>
              )}
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
