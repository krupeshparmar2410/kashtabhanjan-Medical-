const crypto = require('crypto');
const logger = require('../config/logger');

const requestLogger = (req, res, next) => {
  req.id = crypto.randomUUID();
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const userId = req.user ? req.user.id : 'Guest';
    const status = res.statusCode;
    const sanitizedUrl = req.originalUrl.replace(/([\?&])(token|Authorization)=[^&]+/gi, '$1$2=[REDACTED]');
    
    logger.info(
      `[REQ_ID: ${req.id}] User: ${userId} | ${req.method} ${sanitizedUrl} | Status: ${status} | Time: ${duration}ms`
    );
  });

  next();
};

module.exports = requestLogger;
