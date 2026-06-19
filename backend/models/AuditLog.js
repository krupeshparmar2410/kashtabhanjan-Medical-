const mongoose = require('mongoose');
const crypto = require('crypto');

const AuditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action: {
      type: String,
      required: false
    },
    actionType: {
      type: String,
      required: true
    },
    module: {
      type: String,
      required: true
    },
    entityType: {
      type: String,
      required: [true, 'Entity type is required']
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Entity document ID is required']
    },
    oldValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    newValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    userRole: {
      type: String,
      default: 'staff'
    },
    ipAddress: {
      type: String,
      default: ''
    },
    browserInfo: {
      type: String,
      default: ''
    },
    requestMethod: {
      type: String,
      default: ''
    },
    endpoint: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['Success', 'Failed'],
      default: 'Success'
    },
    remarks: {
      type: String,
      default: ''
    },
    hash: {
      type: String,
      required: true,
      unique: true
    },
    previousHash: {
      type: String,
      required: true
    },
    isArchived: {
      type: Boolean,
      default: false
    },
    archivedAt: {
      type: Date,
      default: null
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Pre-save hook to synchronize legacy fields and generate hashing chain automatically
AuditLogSchema.pre('validate', async function (next) {
  // Synchronize legacy fields
  if (this.performedBy && !this.user) {
    this.user = this.performedBy;
  }
  if (this.user && !this.performedBy) {
    this.performedBy = this.user;
  }
  if (this.actionType && !this.action) {
    this.action = this.actionType;
  }
  if (this.action && !this.actionType) {
    this.actionType = this.action;
  }
  if (!this.module) {
    this.module = 'General';
  }

  // Auto-generate hash and previousHash if missing
  if (!this.hash || !this.previousHash) {
    try {
      const AuditLog = mongoose.model('AuditLog');
      const lastLog = await AuditLog.findOne({}, {}, { sort: { createdAt: -1 } });
      this.previousHash = lastLog ? lastLog.hash : '0000000000000000000000000000000000000000000000000000000000000000';
      
      const entityIdStr = this.entityId ? this.entityId.toString() : '';
      const performedByStr = this.performedBy ? this.performedBy.toString() : '';
      const newValuesStr = this.newValues ? JSON.stringify(this.newValues) : '';
      
      const data = this.previousHash + this.actionType + this.module + entityIdStr + newValuesStr + performedByStr;
      this.hash = crypto.createHash('sha256').update(data).digest('hex');
    } catch (err) {
      console.error('Failed in pre-validate hash hook:', err);
    }
  }
  next();
});

// Indexes for audit searches and chaining validation
AuditLogSchema.index({ entityType: 1, entityId: 1 });
AuditLogSchema.index({ user: 1 });
AuditLogSchema.index({ performedBy: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
