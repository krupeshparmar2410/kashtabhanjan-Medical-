const logger = require('./logger');

const validateEnvironment = () => {
  const criticalVars = ['MONGO_URI', 'JWT_SECRET', 'BACKUP_ENCRYPTION_KEY'];
  const missing = [];

  criticalVars.forEach((v) => {
    if (!process.env[v] || process.env[v].trim() === '') {
      missing.push(v);
    }
  });

  if (missing.length > 0) {
    logger.error(`CRITICAL ENVIRONMENT CONFIGURATION ERROR: The following variables are missing or empty: [${missing.join(', ')}]. Server boot aborted.`);
    process.exit(1);
  }

  // 1. Validate PORT
  if (process.env.PORT) {
    const portNum = parseInt(process.env.PORT, 10);
    if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
      logger.error(`CRITICAL ENVIRONMENT CONFIGURATION ERROR: PORT "${process.env.PORT}" is invalid. Must be a number between 1 and 65535.`);
      process.exit(1);
    }
  }

  // 2. Validate NODE_ENV
  if (process.env.NODE_ENV) {
    const validEnvs = ['development', 'production', 'test'];
    if (!validEnvs.includes(process.env.NODE_ENV)) {
      logger.error(`CRITICAL ENVIRONMENT CONFIGURATION ERROR: NODE_ENV "${process.env.NODE_ENV}" is invalid. Must be one of: ${validEnvs.join(', ')}.`);
      process.exit(1);
    }
  }

  // 3. Validate JWT_EXPIRE format (basic check)
  if (process.env.JWT_EXPIRE) {
    const expireStr = process.env.JWT_EXPIRE.trim();
    if (expireStr.length === 0 || !/^\d+[smhdwqy]$|^\d+$/.test(expireStr)) {
      logger.error(`CRITICAL ENVIRONMENT CONFIGURATION ERROR: JWT_EXPIRE "${process.env.JWT_EXPIRE}" is invalid. Must be a number followed by s, m, h, d, w, q, y (e.g. "24h").`);
      process.exit(1);
    }
  }

  logger.info('Environment validation check: PASSED.');
};

module.exports = { validateEnvironment };

