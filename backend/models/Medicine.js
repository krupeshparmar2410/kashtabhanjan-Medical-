const mongoose = require('mongoose');

// Add custom casting to support legacy database strings ('Yes' / 'No') on Boolean fields
const defaultBooleanCaster = mongoose.Schema.Types.Boolean.cast();
mongoose.Schema.Types.Boolean.cast(v => {
  if (typeof v === 'string') {
    const val = v.toLowerCase();
    if (val === 'yes' || val === 'true' || val === '1') return true;
    if (val === 'no' || val === 'false' || val === '0') return false;
  }
  return defaultBooleanCaster(v);
});

const MedicineSchema = new mongoose.Schema(
  {
    medicineCode: {
      type: String,
      required: [true, 'Medicine code is required'],
      unique: true,
      trim: true
    },
    medicineName: {
      type: String,
      trim: true
    },
    genericName: {
      type: String,
      required: [true, 'Generic name is required'],
      trim: true
    },
    brandName: {
      type: String,
      required: [true, 'Brand name is required'],
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      trim: true
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineCategory',
      default: null
    },
    manufacturer: {
      type: String,
      trim: true
    },
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      required: [true, 'Supplier agency reference is required']
    },
    strength: {
      type: String,
      trim: true
    },
    medicineForm: {
      type: String,
      required: [true, 'Medicine form is required'],
      enum: {
        values: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Ointment', 'Drops', 'Powder', 'Inhaler', 'Lotion', 'Gel', 'Soap', 'Respule', 'Ampule'],
        message: 'Invalid medicine form value'
      }
    },
    purchasePrice: {
      type: Number,
      default: 0,
      min: [0, 'Purchase price cannot be negative']
    },
    sellingPrice: {
      type: Number,
      default: 0,
      min: [0, 'Selling price cannot be negative']
    },
    mrp: {
      type: Number,
      default: 0,
      min: [0, 'MRP cannot be negative']
    },
    gstPercentage: {
      type: Number,
      default: 0,
      min: [0, 'GST percentage cannot be negative']
    },
    discountAllowed: {
      type: Number,
      default: 0,
      min: [0, 'Discount percentage cannot be negative']
    },
    minimumStockLevel: {
      type: Number,
      default: 0,
      min: [0, 'Minimum stock level cannot be negative']
    },
    reorderLevel: {
      type: Number,
      default: 0,
      min: [0, 'Reorder level cannot be negative']
    },
    currentStock: {
      type: Number,
      default: 0,
      min: [0, 'Current stock cannot be negative']
    },
    unitType: {
      type: String,
      required: [true, 'Unit type is required'],
      enum: {
        values: ['Tablet', 'Capsule', 'Bottle', 'Injection', 'Strip', 'Box', 'Tube', 'Packet'],
        message: 'Invalid unit type value'
      },
      default: 'Tablet'
    },
    packSize: {
      type: Number,
      default: 1,
      min: [1, 'Pack size must be at least 1']
    },
    prescriptionRequired: {
      type: Boolean,
      default: false
    },
    scheduleCategory: {
      type: String,
      enum: ['Normal', 'H', 'H1', 'X'],
      default: 'Normal'
    },
    scheduleH: {
      type: Boolean,
      default: false
    },
    scheduleH1: {
      type: Boolean,
      default: false
    },
    scheduleX: {
      type: Boolean,
      default: false
    },
    storageType: {
      type: String,
      enum: {
        values: ['Room Temperature', 'Cool Place', 'Refrigerated', 'Frozen'],
        message: 'Invalid storage type'
      },
      default: 'Room Temperature'
    },
    hsnCode: {
      type: String,
      trim: true
    },
    barcode: {
      type: String,
      trim: true
    },
    expiryAlertDays: {
      type: Number,
      default: 90,
      min: [0, 'Expiry alert days cannot be negative']
    },
    trackBatches: {
      type: Boolean,
      default: true
    },
    allowPurchase: {
      type: Boolean,
      default: true
    },
    allowSale: {
      type: Boolean,
      default: true
    },
    medicineImageUrl: {
      type: String,
      default: null
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    status: {
      type: String,
      enum: {
        values: ['Active', 'Inactive'],
        message: 'Status must be Active or Inactive'
      },
      default: 'Active'
    },
    isBlocked: {
      type: Boolean,
      default: false
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author user reference is required']
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
  }
);

// Performance & search indexing
MedicineSchema.index({ medicineName: 1 });
MedicineSchema.index({ genericName: 1 });
MedicineSchema.index({ barcode: 1 }, { unique: true, sparse: true });
MedicineSchema.index({ category: 1 });

module.exports = mongoose.model('Medicine', MedicineSchema);
