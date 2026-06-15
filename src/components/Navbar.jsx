import React from 'react';
import { FaBars, FaUserCircle, FaSignOutAlt } from 'react-icons/fa';

const Navbar = ({ onMenuToggle, title, user, handleLogout }) => {
  // Format role name for display (e.g. admin -> Admin, staff -> Staff)
  const formatRole = (role) => {
    if (!role) return '';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  return (
    <header className="navbar">
      <div className="navbar-left">
        <button className="menu-toggle-btn" onClick={onMenuToggle}>
          <FaBars />
        </button>
        <h2 className="page-title">{title}</h2>
      </div>

      <div className="navbar-right">
        <div className="user-profile">
          <div className="avatar-wrapper">
            <FaUserCircle className="user-avatar" />
          </div>
          <div className="user-info">
            <span className="user-name">{user?.name || 'User'}</span>
            <span className={`user-role ${user?.role || 'staff'}`}>
              {formatRole(user?.role)}
            </span>
          </div>
        </div>

        <button className="nav-logout-btn" onClick={handleLogout} title="Log Out">
          <FaSignOutAlt />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Navbar;
