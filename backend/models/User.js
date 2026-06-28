const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    default: 'admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  needsPasswordReset: {
    type: Boolean,
    default: true
  },
  isPrimaryAdmin: {
    type: Boolean,
    default: true
  },
  tokenVersion: {
    type: Number,
    default: 1
  },
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

UserSchema.index({ role: 1 });

// Encrypt password, check cardinality
UserSchema.pre('save', async function (next) {
  // 1. Cardinality Check
  if (this.isNew && this.role === 'admin') {
    try {
      const count = await mongoose.models.User.countDocuments({ role: 'admin' });
      if (count >= 1) {
        return next(new Error('Single Admin Integrity Violation: Cannot create secondary administrator accounts.'));
      }
    } catch (err) {
      return next(err);
    }
  }

  // 2. Encrypt Password
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Prevent Admin deletion
UserSchema.pre('remove', function (next) {
  if (this.isPrimaryAdmin === true) {
    return next(new Error('Single Admin Integrity Violation: Cannot delete the primary administrator.'));
  }
  next();
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
