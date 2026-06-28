const loginLimiters = new Map();

const rateLimitLogin = (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const limitWindow = 60 * 1000; // 1 minute window
  const limitCount = 5; // Max 5 login requests per minute

  if (!loginLimiters.has(ip)) {
    loginLimiters.set(ip, []);
  }

  // Filter timestamps within the current window
  const timestamps = loginLimiters.get(ip).filter(t => now - t < limitWindow);
  timestamps.push(now);
  loginLimiters.set(ip, timestamps);

  if (timestamps.length > limitCount) {
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts from this IP. Please try again after 60 seconds.'
    });
  }

  next();
};

module.exports = rateLimitLogin;
