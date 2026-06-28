const { getSystemMode, getMaintenanceReason } = require('../config/MaintenanceModeService');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    const mode = await getSystemMode();
    if (mode === 'DEGRADED') {
      const method = req.method;
      const path = req.path;

      if (path.startsWith('/api')) {
        const isWrite = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
        const isAuth = path === '/api/auth/login' || path === '/api/auth/logout';

        if (isWrite && !isAuth) {
          return res.status(503).json({
            success: false,
            message: 'System is running in degraded read-only recovery mode. Database modifications are disabled. Please contact an administrator.'
          });
        }
      }
      return next();
    }

    if (mode === 'HEALTHY') {
      return next();
    }

    // Always allow frontend static routes to load the Recovery Panel UI
    if (!req.path.startsWith('/api')) {
      return next();
    }

    const method = req.method;
    const path = req.path;

    // Strict allowlist: No wildcards allowed
    let isAllowed = false;
    if (method === 'GET' && path === '/api/health') isAllowed = true;
    else if (method === 'POST' && path === '/api/auth/login') isAllowed = true;
    else if (method === 'POST' && path === '/api/auth/logout') isAllowed = true;
    else if (method === 'GET' && path === '/api/compliance/recovery/incidents') isAllowed = true;
    else if (method === 'POST' && /^\/api\/compliance\/recovery\/incidents\/[a-f\d]{24}\/resolve$/.test(path)) isAllowed = true;
    else if (method === 'GET' && path === '/api/backups') isAllowed = true;
    else if (method === 'POST' && path === '/api/backups/create') isAllowed = true;
    else if (method === 'POST' && path === '/api/backups/restore') isAllowed = true;

    if (isAllowed) {
      if (path === '/api/backups/restore' || path === '/api/backups/create' || path.startsWith('/api/compliance/recovery/incidents')) {
        let isAdmin = false;
        let token = null;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
          token = req.headers.authorization.split(' ')[1];
        } else if (req.query.token) {
          token = req.query.token;
        }

        if (token) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('role isActive');
            if (user && user.role === 'admin' && user.isActive) {
              isAdmin = true;
            }
          } catch (err) {
            // Token verification failed
          }
        }

        // Allow backup key bypass (Emergency Recovery console validation)
        if (!isAdmin) {
          const authHeader = req.headers['x-recovery-key'];
          if (authHeader && authHeader === process.env.BACKUP_ENCRYPTION_KEY) {
            isAdmin = true;
          }
        }

        if (!isAdmin) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Admin authorization required in recovery mode.'
          });
        }
      }
      return next();
    }

    const reason = await getMaintenanceReason();
    return res.status(503).json({
      success: false,
      maintenance: true,
      systemMode: mode,
      message: 'System running in restricted recovery mode.',
      reason: reason
    });
  } catch (error) {
    next(error);
  }
};
