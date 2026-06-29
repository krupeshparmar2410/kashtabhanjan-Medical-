import React, { useState, useEffect } from 'react';
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
import { medicineAPI, agencyAPI, inventoryAPI, purchaseAPI, saleAPI } from '../services/api';

const Dashboard = ({ activeItem }) => {
  const navigate = useNavigate();

  const [totalMeds, setTotalMeds] = useState(0);
  const [totalAgencies, setTotalAgencies] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [lowStockList, setLowStockList] = useState([]);
  const [outstanding, setOutstanding] = useState(0);
  const [recentBills, setRecentBills] = useState([]);
  const [loading, setLoading] = useState(true);

  // Phase 5 states
  const [salesKpis, setSalesKpis] = useState({ todaySales: 0, weeklySales: 0, monthlySales: 0, totalRevenue: 0, todayProfit: 0, monthlyProfit: 0, averageBillValue: 0 });
  const [notifications, setNotifications] = useState([]);
  const [systemHealth, setSystemHealth] = useState({ databaseStatus: 'Connected', apiStatus: 'Healthy', lastBackupTime: 'N/A' });

  useEffect(() => {
    if (activeItem !== 'dashboard') return;

    const loadDashboardData = async () => {
      try {
        const medStatsRes = await medicineAPI.getStats();
        if (medStatsRes.success) {
          setTotalMeds(medStatsRes.stats.totalMedicines);
        }

        const agencyRes = await agencyAPI.getAgencies({ limit: 1 });
        if (agencyRes.success) {
          setTotalAgencies(agencyRes.total);
        }

        const inventoryReportsRes = await inventoryAPI.getReports();
        if (inventoryReportsRes.success) {
          setLowStockCount(inventoryReportsRes.counts.lowStock);
          setLowStockList(inventoryReportsRes.lists.lowStock || []);
        }

        const purchaseStatsRes = await purchaseAPI.getStats();
        if (purchaseStatsRes.success) {
          setOutstanding(purchaseStatsRes.stats.totalOutstanding);
        }

        const purchaseRes = await purchaseAPI.getPurchases({ limit: 5 });
        if (purchaseRes.success) {
          setRecentBills(purchaseRes.purchases || []);
        }

        // Fetch sales dashboard KPIs
        const salesRes = await saleAPI.getDashboard();
        if (salesRes.success) {
          setSalesKpis(salesRes.kpis);
        }

        // Fetch notifications
        const notifRes = await saleAPI.getRecentNotifications();
        if (notifRes.success) {
          setNotifications(notifRes.notifications);
        }

        // Fetch health status
        const healthRes = await saleAPI.getHealth();
        if (healthRes.success) {
          setSystemHealth(healthRes.health);
        }

      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [activeItem]);

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
          <p>This module is scheduled for implementation in Phase 5 of the Kashtbhanjan Medical Shop Management System.</p>
          <div className="placeholder-badge">Planned for Future Development</div>
          
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

  const stats = [
    {
      title: 'Total Medicines',
      value: totalMeds,
      change: 'Active catalog items',
      icon: <FaPills />,
      colorClass: 'card-medicines'
    },
    {
      title: 'Monthly Sales Revenue',
      value: `₹${(salesKpis.monthlySales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: 'Calculated this month',
      icon: <FaCoins />,
      colorClass: 'card-agencies'
    },
    {
      title: 'Monthly Gross Profits',
      value: `₹${(salesKpis.monthlyProfit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: 'Original snapshot acquisition',
      icon: <FaFileInvoiceDollar />,
      colorClass: 'card-sales'
    },
    {
      title: 'Low Stock Alerts',
      value: lowStockCount,
      change: 'Action required',
      icon: <FaExclamationTriangle />,
      colorClass: 'card-alerts'
    }
  ];

  return (
    <div className="dashboard-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Welcome banner */}
      <div className="welcome-banner">
        <div>
          <h3>Overview Dashboard Console</h3>
          <p>Monitor metrics, inventory updates, sales profits, and billing counters in real-time.</p>
        </div>
        <div className="current-date">
          <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#64748B' }}>
          <p>Loading dashboard metrics...</p>
        </div>
      ) : (
        <>
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

          {/* Warnings & Notifications Feed banner */}
          {notifications.length > 0 && (
            <div className="form-card" style={{ maxWidth: '100%', padding: '16px', background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontWeight: 'bold', color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FaExclamationTriangle /> Critical Dashboard Alerts Feed
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {notifications.slice(0, 3).map((n) => (
                  <div key={n._id} style={{ fontSize: '13px', color: '#78350f', display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between' }}>
                    <span>• <strong>{n.title}</strong>: {n.message}</span>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#b45309', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                      onClick={async () => {
                        await saleAPI.markNotificationRead(n._id);
                        // Reload notifications
                        const r = await saleAPI.getRecentNotifications();
                        if (r.success) setNotifications(r.notifications);
                      }}
                    >
                      Dismiss Alert
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="quick-actions-section">
            <h3>Quick Operations</h3>
            <div className="quick-actions-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <button className="quick-action-btn" onClick={() => navigate('/billing')} style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', color: '#fff' }}>
                <FaFileInvoiceDollar className="btn-icon" />
                <span>POS Billing Screen</span>
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/medicines/add')}>
                <FaPlus className="btn-icon" />
                <span>Add Medicine</span>
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/purchases/add')}>
                <FaPlus className="btn-icon" />
                <span>New Purchase Bill</span>
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/customers')}>
                <FaUserPlus className="btn-icon" />
                <span>Register Customer</span>
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
                {lowStockList.length === 0 ? (
                  <p style={{ padding: '24px', color: '#64748B', textAlign: 'center' }}>No critical low stock alerts.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Medicine</th>
                        <th>Current Stock</th>
                        <th>Min Qty</th>
                        <th>Supplier Agency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockList.slice(0, 5).map((med) => (
                        <tr key={med._id}>
                          <td><strong>{med.medicineName}</strong></td>
                          <td>
                            <span className={`stock-level ${med.currentStock === 0 ? 'out-of-stock' : 'low-stock'}`}>
                              {med.currentStock} {med.unitType || 'units'}
                            </span>
                          </td>
                          <td>{med.minimumStockLevel} units</td>
                          <td>{med.agencyId?.agencyName || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* System Health */}
            <div className="table-card">
              <div className="table-card-header">
                <h4>System Health Monitor</h4>
                <span className="badge-info" style={{ backgroundColor: '#10b981' }}>Active</span>
              </div>
              <div className="table-wrapper" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                    <span>Database Status:</span>
                    <strong style={{ color: systemHealth.databaseStatus === 'Connected' ? '#10b981' : '#ef4444' }}>{systemHealth.databaseStatus}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                    <span>API Core Engine:</span>
                    <strong style={{ color: '#10b981' }}>Healthy</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                    <span>System Uptime:</span>
                    <strong>{systemHealth.uptime || 'N/A'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                    <span>Last Backups:</span>
                    <strong>{systemHealth.lastBackupTime}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Failed API Txns:</span>
                    <strong style={{ color: systemHealth.failedTransactionsCount > 0 ? '#ef4444' : '#1e293b' }}>
                      {systemHealth.failedTransactionsCount || 0}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
