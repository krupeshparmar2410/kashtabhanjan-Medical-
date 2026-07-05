import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdLocalPharmacy, MdEmail, MdLock, MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { authAPI } from '../services/api';
import '../styles/Login.css';

const Login = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();

  const validateForm = () => {
    if (!email) {
      setError('Email is required');
      return false;
    }
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }
    if (!password) {
      setError('Password is required');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const data = await authAPI.login(email, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      setSuccess('Login successful! Redirecting...');

      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }

      setTimeout(() => {
        navigate('/');
      }, 1000);
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.message) {
        setError(err.response.data.message);
      } else {
        setError('Connection failed. Please check backend server.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-brand">
          <div className="login-brand-icon">
            <MdLocalPharmacy />
          </div>
          <h1>Kashtbhanjan Medical</h1>
          <p>Medical Shop Management System</p>
        </div>

        {error && <div className="login-msg login-msg-error">{error}</div>}
        {success && <div className="login-msg login-msg-success">{success}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label htmlFor="email">Email Address</label>
            <div className="field-box">
              <span className="field-icon"><MdEmail /></span>
              <input
                type="email"
                id="email"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="field-box">
              <span className="field-icon"><MdLock /></span>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="field-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                tabIndex={-1}
              >
                {showPassword ? <MdVisibilityOff /> : <MdVisibility />}
              </button>
            </div>
          </div>

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? <span className="login-spinner"></span> : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <div className="login-divider"><span>Secure Administrator & Staff Access Portal</span></div>
          <div className="login-demo">Demo: admin@kashtbhanjan.com / Admin@123</div>
        </div>
      </div>
    </div>
  );
};

export default Login;