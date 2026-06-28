const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validateSessionActivity } = require('../config/SecurityService');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.Authorization && req.query.Authorization.startsWith('Bearer')) {
    token = req.query.Authorization.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (token) {
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
      }

      // Block disabled accounts from accessing routes
      if (!req.user.isActive) {
        return res.status(403).json({ success: false, message: 'Not authorized, account is disabled' });
      }

      // Enforce needsPasswordReset gate
      if (req.user.needsPasswordReset && 
          !req.originalUrl.includes('/auth/reset-password') && 
          !req.originalUrl.includes('/auth/logout')) {
        return res.status(403).json({
          success: false,
          needsPasswordReset: true,
          message: 'Password reset is required before accessing system features.'
        });
      }

      // Enforce tokenVersion mismatch check
      if (decoded.tokenVersion !== req.user.tokenVersion) {
        return res.status(401).json({ success: false, message: 'Not authorized, session expired or revoked' });
      }

      // Validate active session status
      const isSessionActive = await validateSessionActivity(token, req);
      if (!isSessionActive) {
        return res.status(401).json({ success: false, message: 'Not authorized, session expired or revoked' });
      }

      return next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
    }
  }

  return res.status(401).json({ success: false, message: 'Not authorized, no token' });
};

module.exports = { protect };
