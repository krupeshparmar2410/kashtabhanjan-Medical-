const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = path.join(__dirname, '../logs');

// 1. Validate Log Directory Before Logger Starts
const ensureLogsFolder = () => {
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (err) {
      console.error(`CRITICAL: Failed to create logs folder at ${logDir}: ${err.message}`);
      process.exit(1);
    }
  }
};
ensureLogsFolder();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'medical-shop-backend' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      handleExceptions: true,
      handleRejections: true
    }),
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      handleExceptions: true,
      handleRejections: true
    })
  ]
});

// Configure Console transport in all environments (essential for PM2 logs capture)
const isProduction = process.env.NODE_ENV === 'production';
logger.add(new winston.transports.Console({
  format: isProduction 
    ? winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info => `[${info.timestamp}] ${info.level.toUpperCase()}: ${info.message} ${info.stack ? '\n' + info.stack : ''}`)
      )
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
  handleExceptions: true,
  handleRejections: true
}));

module.exports = logger;
