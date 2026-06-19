const User = require('../models/User');
const ActiveSession = require('../models/ActiveSession');
const LoginHistory = require('../models/LoginHistory');
const { logSystemAction } = require('./AuditService');
const { getSetting } = require('./SettingsService');
const logger = require('./logger');

// Lockout duration: 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

/**
 * Validate password complexity: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
 */
const validatePasswordStrength = (password) => {
  const policyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return policyRegex.test(password);
};

/**
 * Check if user account is currently locked out
 */
const isAccountLocked = async (user) => {
  if (user.lockUntil && user.lockUntil > Date.now()) {
    return true;
  }
  // Clear expired lockout
  if (user.lockUntil && user.lockUntil <= Date.now()) {
    user.lockUntil = null;
    user.failedLoginAttempts = 0;
    await user.save();
  }
  return false;
};

/**
 * Handles failed login attempt and locks account if count reaches threshold
 */
const handleFailedLogin = async (email, ipAddress, userAgent) => {
  const user = await User.findOne({ email });
  
  if (user) {
    user.failedLoginAttempts += 1;
    let loginStatus = 'Failed';

    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCKOUT_MS);
      loginStatus = 'Locked';
      logger.warn(`User account locked out for 15 minutes: ${email}`);
    }

    await user.save();
    
    // Log history
    await LoginHistory.create({
      userId: user._id,
      emailAttempted: email,
      loginStatus,
      ipAddress,
      browser: userAgent
    });

    return loginStatus;
  } else {
    // Log non-existing user attempt
    await LoginHistory.create({
      userId: null,
      emailAttempted: email,
      loginStatus: 'Failed',
      ipAddress,
      browser: userAgent
    });
    return 'Failed';
  }
};

/**
 * Resets failed login counters upon successful authentication
 */
const handleSuccessfulLogin = async (user, ipAddress, userAgent, token) => {
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  // Log to history
  await LoginHistory.create({
    userId: user._id,
    emailAttempted: user.email,
    loginStatus: 'Success',
    ipAddress,
    browser: userAgent
  });

  // Enforce session timeout limits (default 24h)
  const sessionTimeoutHours = parseInt(getSetting('SESSION_TIMEOUT_HOURS', 24), 10);
  const expiresAt = new Date(Date.now() + sessionTimeoutHours * 60 * 60 * 1000);

  // Enforce Concurrent Session Limit: Maximum 3 active sessions per user
  const maxConcurrent = 3;
  const activeSessions = await ActiveSession.find({ userId: user._id, isRevoked: false }).sort({ loginTime: 1 });
  
  if (activeSessions.length >= maxConcurrent) {
    // Revoke oldest session(s)
    const revokeCount = activeSessions.length - maxConcurrent + 1;
    for (let i = 0; i < revokeCount; i++) {
      const oldSession = activeSessions[i];
      oldSession.isRevoked = true;
      await oldSession.save();
      
      // Log session force revocation
      await logSystemAction(null, {
        actionType: 'User Session Revoked',
        module: 'Security',
        entityType: 'ActiveSession',
        entityId: oldSession._id,
        remarks: `Concurrency limit reached. Force logged out session token starting with ${oldSession.sessionToken.slice(0, 10)}...`
      });
    }
  }

  // Parse userAgent for browser/OS info
  const browser = userAgent.split(' ')[0] || 'Unknown';
  
  // Register ActiveSession
  const session = await ActiveSession.create({
    userId: user._id,
    sessionToken: token,
    expiresAt,
    deviceInfo: {
      ipAddress,
      browser,
      operatingSystem: 'Windows' // System is run locally on Windows shop terminal
    }
  });

  return session;
};

/**
 * Force logout all active sessions for a user ID (e.g. after password reset / role changes)
 */
const forceLogoutAllUserSessions = async (userId, reason = 'Credential modification') => {
  const result = await ActiveSession.updateMany(
    { userId, isRevoked: false },
    { $set: { isRevoked: true } }
  );

  if (result.modifiedCount > 0) {
    logger.info(`Force logged out ${result.modifiedCount} active sessions for User: ${userId}`);
    await logSystemAction(null, {
      actionType: 'User Sessions Terminated Forcefully',
      module: 'Security',
      entityType: 'User',
      entityId: userId,
      remarks: `Reason: ${reason}. Terminated all active sessions.`
    });
  }
};

/**
 * Validates request session token (checks isRevoked, timeout, inactivity)
 */
const validateSessionActivity = async (token) => {
  const session = await ActiveSession.findOne({ sessionToken: token, isRevoked: false });
  if (!session) {
    return false;
  }

  // Check absolute expiration (expiresAt)
  if (session.expiresAt && session.expiresAt <= new Date()) {
    session.isRevoked = true;
    await session.save();
    return false;
  }

  // Check inactivity timeout (default 30 minutes)
  const inactivityLimitMins = parseInt(getSetting('SESSION_INACTIVITY_MINUTES', 30), 10);
  const cutoffTime = new Date(Date.now() - inactivityLimitMins * 60 * 1000);
  
  if (session.lastActivityAt < cutoffTime) {
    session.isRevoked = true;
    await session.save();
    return false;
  }

  // Session is active. Update lastActivityAt
  session.lastActivityAt = new Date();
  await session.save();
  return true;
};

module.exports = {
  validatePasswordStrength,
  isAccountLocked,
  handleFailedLogin,
  handleSuccessfulLogin,
  forceLogoutAllUserSessions,
  validateSessionActivity
};
