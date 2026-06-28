const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env parameters
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const { forceLogoutAllUserSessions } = require('../config/SecurityService');
const { logSystemAction } = require('../config/AuditService');

const resetAdmin = async () => {
  const args = process.argv.slice(2);
  const passwordIndex = args.indexOf('--password');

  if (passwordIndex === -1) {
    console.error('Usage: node resetAdmin.js --password <new-password>');
    process.exit(1);
  }

  const newPassword = args[passwordIndex + 1];

  if (!newPassword) {
    console.error('Invalid arguments. Password is required.');
    process.exit(1);
  }

  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/medical_shop';
    await mongoose.connect(mongoURI);
    console.log('Connected to database successfully.');

    // Query authoritatively by isPrimaryAdmin: true
    const user = await User.findOne({ isPrimaryAdmin: true });
    if (!user) {
      console.error('Primary administrator account not found in database.');
      process.exit(1);
    }

    // Reset password, unlock, clear lockouts, force password reset state
    user.password = newPassword; // Pre-save hooks will encrypt this
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.needsPasswordReset = true; // Force reset password state
    user.tokenVersion += 1; // Increment version to invalidate existing JWTs
    await user.save();

    console.log('Admin account password updated, lockout reset, needsPasswordReset set to true, and tokenVersion incremented successfully.');

    // Force terminate active sessions
    await forceLogoutAllUserSessions(user._id, 'CLI Admin Reset Recovery');
    console.log('All active sessions for this admin user have been force logged out.');

    // Log security reset audit trace
    await logSystemAction(null, {
      actionType: 'CLI Admin Reset Recovery',
      module: 'Security',
      entityType: 'User',
      entityId: user._id,
      remarks: `Admin password reset, lockouts cleared, needsPasswordReset forced, and sessions revoked manually via command-line utility for ${user.email}.`
    });

    console.log('CLI reset event logged in Audit Trail. Reset Complete.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to reset administrator profile:', err);
    process.exit(1);
  }
};

resetAdmin();
