const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  uploadPrescription,
  approvePrescription,
  rejectPrescription,
  getPrescriptions,
  getPrescriptionById,
  downloadPrescriptionFile,
  updatePrescription,
  archivePrescription,
  restorePrescription,
  deletePrescription
} = require('../controllers/prescriptionController');

const router = express.Router();

// Configure storage destination using PRESCRIPTION_UPLOAD_PATH env var
const uploadPath = path.join(__dirname, '../../uploads/prescriptions');

// Ensure upload folder exists
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPG, JPEG, and PNG are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// Custom Rate Limiter for uploads
const uploadLimiters = new Map();
const rateLimitUpload = (req, res, next) => {
  const ip = req.ip || '127.0.0.1';
  const now = Date.now();
  const limitWindow = 60 * 1000;
  const limitCount = 10;

  if (!uploadLimiters.has(ip)) {
    uploadLimiters.set(ip, []);
  }

  const timestamps = uploadLimiters.get(ip).filter(t => now - t < limitWindow);
  timestamps.push(now);
  uploadLimiters.set(ip, timestamps);

  if (timestamps.length > limitCount) {
    return res.status(429).json({ success: false, message: 'Too many uploads from this IP. Please try again in a minute.' });
  }
  next();
};

// Route registrations
router.route('/')
  .post(protect, authorize('admin', 'pharmacist', 'staff'), rateLimitUpload, upload.single('document'), uploadPrescription)
  .get(protect, authorize('admin', 'pharmacist', 'staff'), getPrescriptions);

router.route('/:id')
  .get(protect, authorize('admin', 'pharmacist', 'staff'), getPrescriptionById)
  .put(protect, authorize('admin', 'pharmacist'), updatePrescription)
  .delete(protect, authorize('admin'), deletePrescription);

router.get('/:id/download', protect, authorize('admin', 'pharmacist', 'staff'), downloadPrescriptionFile);
router.put('/:id/approve', protect, authorize('admin', 'pharmacist'), approvePrescription);
router.put('/:id/reject', protect, authorize('admin', 'pharmacist'), rejectPrescription);
router.put('/:id/archive', protect, authorize('admin', 'pharmacist'), archivePrescription);
router.put('/:id/restore', protect, authorize('admin', 'pharmacist'), restorePrescription);

module.exports = router;
