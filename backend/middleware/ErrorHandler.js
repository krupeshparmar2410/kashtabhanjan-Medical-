const FailedTransaction = require('../models/FailedTransaction');
const logger = require('../config/logger');

const globalErrorHandler = async (err, req, res, next) => {
  logger.error('API Error Intercepted:', err);

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  // If this error occurred during a POS or customer checkout attempt, log the raw payload parameters
  if (req.user && (req.path.includes('/sales') || req.path.includes('/customers')) && req.method === 'POST') {
    try {
      await FailedTransaction.create({
        user: req.user._id,
        payload: req.body || {},
        errorMessage: message,
        stackTrace: err.stack || '',
        ipAddress: req.ip || req.connection.remoteAddress || ''
      });
    } catch (logErr) {
      console.error('Failed to log transaction error to database:', logErr);
    }
  }

  res.status(status).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

module.exports = {
  globalErrorHandler
};
