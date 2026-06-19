const logger = require('./logger');

const validateEnvironment = () => {
  const criticalVars = ['MONGO_URI', 'JWT_SECRET', 'BACKUP_ENCRYPTION_KEY'];
  const missing = [];

  criticalVars.forEach((v) => {
    if (!process.env[v]) {
      missing.push(v);
    }
  });

  if (missing.length > 0) {
    logger.error(`CRITICAL ENVIRONMENT CONFIGURATION ERROR: The following variables are missing: [${missing.join(', ')}]. Server boot aborted.`);
    process.exit(1);
  }
  logger.info('Environment validation check: PASSED.');
};

module.exports = { validateEnvironment };
