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
  const emailIndex = args.indexOf('--email');
  const passwordIndex = args.indexOf('--password');

  if (emailIndex === -1 || passwordIndex === -1) {
    console.error('Usage: node resetAdmin.js --email <admin-email> --password <new-password>');
    process.exit(1);
  }

  const email = args[emailIndex + 1];
  const newPassword = args[passwordIndex + 1];

  if (!email || !newPassword) {
    console.error('Invalid arguments. Email and Password are required.');
    process.exit(1);
  }

  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/medical_shop';
    await mongoose.connect(mongoURI);
    console.log('Connected to database successfully.');

    const user = await User.findOne({ email });
    if (!user) {
      console.error(`User profile with email ${email} not found.`);
      process.exit(1);
    }

    if (user.role !== 'admin') {
      console.error(`User profile ${email} is not classified as admin.`);
      process.exit(1);
    }

    // Reset password, unlock, clear lockouts
    user.password = newPassword; // Pre-save hooks will encrypt this
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    console.log('Admin account password updated and profile lockouts reset successfully.');

    // Force terminate active sessions
    await forceLogoutAllUserSessions(user._id, 'CLI Admin Reset Recovery');
    console.log('All active sessions for this admin user have been force logged out.');

    // Log security reset audit trace
    await logSystemAction(null, {
      actionType: 'CLI Admin Reset Recovery',
      module: 'Security',
      entityType: 'User',
      entityId: user._id,
      remarks: `Admin password reset and lockouts cleared manually via command-line utility for ${email}.`
    });

    console.log('CLI reset event logged in Audit Trail. Reset Complete.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to reset administrator profile:', err);
    process.exit(1);
  }
};

resetAdmin();
