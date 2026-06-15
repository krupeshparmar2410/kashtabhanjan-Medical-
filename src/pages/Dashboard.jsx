import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaPills, 
  FaHandshake, 
  FaCoins, 
  FaExclamationTriangle, 
  FaPlus, 
  FaSearch, 
  FaFileInvoiceDollar, 
  FaUserPlus 
} from 'react-icons/fa';

const Dashboard = ({ activeItem }) => {
  const navigate = useNavigate();

  // If activeItem is not 'dashboard', show the placeholder construction page for that menu item.
  if (activeItem !== 'dashboard') {
    const formatName = (id) => {
      if (id === 'credit') return 'Credit Accounts';
      return id.charAt(0).toUpperCase() + id.slice(1);
    };

    return (
      <div className="placeholder-container">
        <div className="placeholder-card">
          <div className="construction-icon-wrapper">
            <FaExclamationTriangle className="construction-icon" />
          </div>
          <h2>{formatName(activeItem)} Module</h2>
          <p>This module is scheduled for implementation in Phase 2 of the Kashtbhanjan Medical Shop Management System.</p>
          <div className="placeholder-badge">Planned for Phase 2 Development</div>
          
          <div className="placeholder-preview-grid">
            <div className="preview-item">
              <h4>Expected Features</h4>
              <ul>
                <li>Full CRUD Operations</li>
                <li>Search & Filtering capabilities</li>
                <li>Audit Logs & History tracking</li>
                <li>Automated reporting integration</li>
              </ul>
            </div>
            <div className="preview-item">
              <h4>Database Relations</h4>
              <ul>
                <li>MongoDB Collection schema ready</li>
                <li>Connected with Auth Middleware</li>
                <li>Role-based access permissions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Else, show the dashboard overview
  const stats = [
    {
      title: 'Total Medicines',
      value: '1,200',
      change: '+14 new today',
      icon: <FaPills />,
      colorClass: 'card-medicines'
    },
    {
      title: 'Total Agencies',
      value: '25',
      change: 'Active suppliers',
      icon: <FaHandshake />,
      colorClass: 'card-agencies'
    },
    {
      title: "Today's Sales",
      value: '₹12,500',
      change: '11 transactions',
      icon: <FaCoins />,
      colorClass: 'card-sales'
    },
    {
      title: 'Low Stock Alerts',
      value: '8',
      change: 'Action required',
      icon: <FaExclamationTriangle />,
      colorClass: 'card-alerts'
    }
  ];

  const lowStockMedicines = [
    { id: 1, name: 'Paracetamol 650mg', batch: 'PR23091', stock: 4, reorder: 15, supplier: 'Aurobindo Pharma' },
    { id: 2, name: 'Amoxicillin 500mg', batch: 'AM44203', stock: 2, reorder: 10, supplier: 'Cipla Ltd' },
    { id: 3, name: 'Atorvastatin 10mg', batch: 'AT89112', stock: 5, reorder: 20, supplier: 'Sun Pharma' },
    { id: 4, name: 'Metformin 500mg', batch: 'MT10243', stock: 0, reorder: 30, supplier: 'Dr. Reddys' }
  ];

  const recentTransactions = [
    { id: 'TXN-9021', customer: 'Walk-in Customer', time: '10:32 AM', items: 3, total: '₹450', status: 'Paid' },
    { id: 'TXN-9020', customer: 'Ramesh Patel', time: '10:15 AM', items: 1, total: '₹1,200', status: 'Paid' },
    { id: 'TXN-9019', customer: 'Suresh Shah (Credit)', time: '09:45 AM', items: 5, total: '₹890', status: 'Credit' },
    { id: 'TXN-9018', customer: 'Kiran Mehta', time: '09:20 AM', items: 2, total: '₹120', status: 'Paid' }
  ];

  return (
    <div className="dashboard-content">
      {/* Welcome banner */}
      <div className="welcome-banner">
        <div>
          <h3>Overview Dashboard</h3>
          <p>Monitor metrics, inventory updates, and billing activity in real-time.</p>
        </div>
        <div className="current-date">
          <span>June 15, 2026</span>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="stats-grid">
        {stats.map((stat, i) => (
          <div key={i} className={`stat-card ${stat.colorClass}`}>
            <div className="stat-card-left">
              <span className="stat-title">{stat.title}</span>
              <span className="stat-value">{stat.value}</span>
              <span className="stat-change">{stat.change}</span>
            </div>
            <div className="stat-icon-wrapper">
              {stat.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="quick-actions-section">
        <h3>Quick Operations</h3>
        <div className="quick-actions-grid">
          <button className="quick-action-btn" onClick={() => navigate('/medicines/add')}>
            <FaPlus className="btn-icon" />
            <span>Add Medicine</span>
          </button>
          <button className="quick-action-btn" onClick={() => navigate('/billing')}>
            <FaFileInvoiceDollar className="btn-icon" />
            <span>New Invoice / Bill</span>
          </button>
          <button className="quick-action-btn" onClick={() => navigate('/agencies/add')}>
            <FaUserPlus className="btn-icon" />
            <span>Add Supplier Agency</span>
          </button>
          <button className="quick-action-btn" onClick={() => navigate('/inventory')}>
            <FaSearch className="btn-icon" />
            <span>Lookup Inventory</span>
          </button>
        </div>
      </div>

      {/* Tables Grid Layout */}
      <div className="tables-grid">
        {/* Low Stock Alerts */}
        <div className="table-card">
          <div className="table-card-header">
            <h4>Critical Low Stock Alerts</h4>
            <span className="badge-danger">Action Needed</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch</th>
                  <th>Stock</th>
                  <th>Min Qty</th>
                  <th>Supplier</th>
                </tr>
              </thead>
              <tbody>
                {lowStockMedicines.map((med) => (
                  <tr key={med.id}>
                    <td><strong>{med.name}</strong></td>
                    <td><code>{med.batch}</code></td>
                    <td>
                      <span className={`stock-level ${med.stock === 0 ? 'out-of-stock' : 'low-stock'}`}>
                        {med.stock} units
                      </span>
                    </td>
                    <td>{med.reorder} units</td>
                    <td>{med.supplier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="table-card">
          <div className="table-card-header">
            <h4>Recent Billings</h4>
            <span className="badge-info">Today</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Customer</th>
                  <th>Time</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((txn) => (
                  <tr key={txn.id}>
                    <td><code>{txn.id}</code></td>
                    <td>{txn.customer}</td>
                    <td>{txn.time}</td>
                    <td>{txn.items} items</td>
                    <td><strong>{txn.total}</strong></td>
                    <td>
                      <span className={`status-badge ${txn.status.toLowerCase()}`}>
                        {txn.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
