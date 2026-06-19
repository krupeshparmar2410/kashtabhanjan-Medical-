const crypto = require('crypto');
const logger = require('../config/logger');

const requestLogger = (req, res, next) => {
  req.id = crypto.randomUUID();
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const userId = req.user ? req.user.id : 'Guest';
    const status = res.statusCode;
    
    logger.info(
      `[REQ_ID: ${req.id}] User: ${userId} | ${req.method} ${req.originalUrl} | Status: ${status} | Time: ${duration}ms`
    );
  });

  next();
};

module.exports = requestLogger;
