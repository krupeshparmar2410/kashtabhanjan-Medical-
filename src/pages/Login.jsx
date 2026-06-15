import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdLocalPharmacy, MdEmail, MdLock, MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { authAPI } from '../services/api';

const Login = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();

  // Basic validation rules
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
      
      // Store token and user details in local storage
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      setSuccess('Login successful! Redirecting...');
      
      // Notify parent component to update state
      if (onLoginSuccess) {
        onLoginSuccess(data.user);
      }

      // Redirect to dashboard
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
    <div className="login-container-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-circle">
            <MdLocalPharmacy className="login-logo-icon" />
          </div>
          <h1>Kashtbhanjan Medical</h1>
          <p>Medical Shop Management System</p>
        </div>

        {error && (
          <div className="login-alert alert-error">
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="login-alert alert-success">
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-wrapper">
              <MdEmail className="input-icon" />
              <input
                type="email"
                id="email"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <MdLock className="input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
              >
                {showPassword ? <MdVisibilityOff /> : <MdVisibility />}
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={isLoading}>
            {isLoading ? <div className="spinner"></div> : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p>Secure Administrator & Staff Access Portal</p>
          <div className="demo-credentials">
            <span>Demo: admin@kashtbhanjan.com / admin123</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
