const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const logger = require('./config/logger');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const agencyRoutes = require('./routes/agencyRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const saleRoutes = require('./routes/saleRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const complianceRoutes = require('./routes/complianceRoutes');
const auditRoutes = require('./routes/auditRoutes');
const backupRoutes = require('./routes/backupRoutes');
const requestLogger = require('./middleware/RequestLoggerMiddleware');
const { globalErrorHandler } = require('./middleware/ErrorHandler');
const { initializeSettings } = require('./config/SettingsService');
const { runMigrations } = require('./config/MigrationService');
const { startBackgroundJobs } = require('./config/SchedulerService');
const User = require('./models/User');
const Agency = require('./models/Agency');
const Medicine = require('./models/Medicine');

// Load environment variables
dotenv.config();

// Validate critical variables
const { validateEnvironment } = require('./config/EnvironmentValidationService');
validateEnvironment();

const app = express();

// Middleware
// CORS configuration – allow only the Vercel frontend in production
const allowedOrigins = [
  'https://kashtabhanjan-medical.vercel.app',
  'http://localhost:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
const mongoSanitize = require('./middleware/MongoSanitizeMiddleware');
app.use(mongoSanitize);
app.use(requestLogger);
const maintenanceModeMiddleware = require('./middleware/maintenanceModeMiddleware');
app.use(maintenanceModeMiddleware);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount Swagger UI documentation
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger.json');
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: Math.round(process.uptime())
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/agencies', agencyRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/audits', auditRoutes);
app.use('/api/backups', backupRoutes);

// Global Error Handler for API Routes
app.use(globalErrorHandler);

// Serve frontend static assets (React app) on the same port
const distPath = fs.existsSync(path.join(__dirname, "../frontend/dist"))
  ? path.join(__dirname, "../frontend/dist")
  : path.join(__dirname, "../dist");

app.use(express.static(distPath));

app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({
      success: false,
      message: "API route not found"
    });
  }
  if (fs.existsSync(path.join(distPath, "index.html"))) {
    res.sendFile(path.join(distPath, "index.html"));
  } else {
    res.send('Kashtbhanjan Medical Shop Management System API is running... (Run "npm run build" to serve the frontend on this port)');
  }
});

// Seed Initial Admin User if they don't exist
const seedUsers = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('No users found. Seeding initial Admin user...');

      // Create Admin
      const admin = await User.create({
        name: 'Krupesh Admin',
        email: 'admin@kashtbhanjan.com',
        password: 'Admin@123', // Will be hashed via pre-save hook
        role: 'admin',
        isActive: true,
        isPrimaryAdmin: true,
        needsPasswordReset: true,
        tokenVersion: 1
      });

      console.log('Seeding completed successfully!');
      console.log('Admin credentials: admin@kashtbhanjan.com / Admin@123');

      // Write to chained audit logs
      const { logSystemAction } = require('./config/AuditService');
      await logSystemAction(null, {
        actionType: 'User Seeded',
        module: 'Security',
        entityType: 'User',
        entityId: admin._id,
        remarks: 'Admin user account seeded successfully on database initialization.'
      });
    }
  } catch (error) {
    console.error(`Error seeding users: ${error.message}`);
  }
};

// Seed Initial Agencies if they don't exist
const seedAgencies = async () => {
  try {
    const count = await Agency.countDocuments();
    if (count === 0) {
      console.log('No agencies found. Seeding 10 dummy agencies...');

      // Find an admin user to link as creator
      const adminUser = await User.findOne({ role: 'admin' });
      const creatorId = adminUser ? adminUser._id : null;

      if (!creatorId) {
        console.error('Cannot seed agencies: No admin user found to associate as creator.');
        return;
      }

      const dummyAgencies = [
        {
          agencyCode: 'AGN001',
          agencyName: 'Sun Pharma Distributor',
          contactPerson: 'Rajesh Patel',
          contactPersonDesignation: 'Sales Manager',
          phone: '9876543210',
          email: 'rajesh@sunpharma.com',
          gstNumber: 'GSTSUN001',
          drugLicenseNumber: 'DL001',
          address: '402, GIDC Phase 3',
          city: 'Ahmedabad',
          state: 'Gujarat',
          pincode: '380015',
          status: 'active',
          agencyCategory: 'Manufacturer',
          isPreferredSupplier: true,
          isBlocked: false,
          creditDays: 30,
          openingBalance: 10000,
          currentBalance: 10000,
          creditLimit: 100000,
          bankName: 'State Bank of India',
          accountNumber: '32190823412',
          ifscCode: 'SBIN0001024',
          createdBy: creatorId
        },
        {
          agencyCode: 'AGN002',
          agencyName: 'Cipla Healthcare Supplies',
          contactPerson: 'Amit Shah',
          contactPersonDesignation: 'Area Manager',
          phone: '9876543211',
          email: 'amit@cipla.com',
          gstNumber: 'GSTCIP002',
          drugLicenseNumber: 'DL002',
          address: 'Building B, Industrial Estate',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400011',
          status: 'active',
          agencyCategory: 'Wholesaler',
          isPreferredSupplier: true,
          isBlocked: false,
          creditDays: 15,
          openingBalance: 5000,
          currentBalance: 5000,
          creditLimit: 50000,
          bankName: 'HDFC Bank',
          accountNumber: '5010029381239',
          ifscCode: 'HDFC0000120',
          createdBy: creatorId
        },
        {
          agencyCode: 'AGN003',
          agencyName: 'Zydus Medical Agency',
          contactPerson: 'Mehul Desai',
          contactPersonDesignation: 'Owner',
          phone: '9876543212',
          email: 'mehul@zydus.com',
          gstNumber: 'GSTZYD003',
          drugLicenseNumber: 'DL003',
          address: 'Plot 12, Commercial Hub',
          city: 'Vadodara',
          state: 'Gujarat',
          pincode: '390007',
          status: 'active',
          agencyCategory: 'Distributor',
          isPreferredSupplier: true,
          isBlocked: false,
          creditDays: 45,
          openingBalance: 20000,
          currentBalance: 20000,
          creditLimit: 150000,
          bankName: 'Bank of Baroda',
          accountNumber: '08210200003412',
          ifscCode: 'BARB0VADODR',
          createdBy: creatorId
        },
        {
          agencyCode: 'AGN004',
          agencyName: 'Torrent Pharma Supplier',
          contactPerson: 'Priya Mehta',
          contactPersonDesignation: 'Representative',
          phone: '9876543213',
          email: 'priya@torrent.com',
          gstNumber: 'GSTTOR004',
          drugLicenseNumber: 'DL004',
          address: '10, Silver Arcade',
          city: 'Surat',
          state: 'Gujarat',
          pincode: '395009',
          status: 'inactive',
          agencyCategory: 'Local Supplier',
          isPreferredSupplier: false,
          isBlocked: false,
          creditDays: 30,
          openingBalance: 15000,
          currentBalance: 15000,
          creditLimit: 75000,
          bankName: 'ICICI Bank',
          accountNumber: '629010293812',
          ifscCode: 'ICIC0000045',
          createdBy: creatorId
        },
        {
          agencyCode: 'AGN005',
          agencyName: 'Apollo Medicine Wholesale',
          contactPerson: 'Kiran Joshi',
          contactPersonDesignation: 'Sales Manager',
          phone: '9876543214',
          email: 'kiran@apollo.com',
          gstNumber: 'GSTAPL005',
          drugLicenseNumber: 'DL005',
          address: 'Apollo Towers, Ring Road',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500001',
          status: 'inactive',
          agencyCategory: 'Wholesaler',
          isPreferredSupplier: false,
          isBlocked: false,
          creditDays: 0,
          openingBalance: 0,
          currentBalance: 0,
          creditLimit: 200000,
          bankName: 'Axis Bank',
          accountNumber: '912010034120938',
          ifscCode: 'UTIB0000081',
          createdBy: creatorId
        },
        {
          agencyCode: 'AGN006',
          agencyName: 'Lupin Pharmaceuticals Dist',
          contactPerson: 'Anil Sharma',
          contactPersonDesignation: 'Area Manager',
          phone: '9876543215',
          email: 'anil@lupin.com',
          gstNumber: 'GSTLUP006',
          drugLicenseNumber: 'DL006',
          address: 'Flat 501, Lupin Heights',
          city: 'Indore',
          state: 'Madhya Pradesh',
          pincode: '452001',
          status: 'active',
          agencyCategory: 'Manufacturer',
          isPreferredSupplier: false,
          isBlocked: false,
          creditDays: 30,
          openingBalance: 12000,
          currentBalance: 12000,
          creditLimit: 120000,
          bankName: 'Punjab National Bank',
          accountNumber: '0341002100092381',
          ifscCode: 'PUNB0034100',
          createdBy: creatorId
        },
        {
          agencyCode: 'AGN007',
          agencyName: 'Mankind Life Sciences',
          contactPerson: 'Deepa Nair',
          contactPersonDesignation: 'Representative',
          phone: '9876543216',
          email: 'deepa@mankind.com',
          gstNumber: 'GSTMAN007',
          drugLicenseNumber: 'DL007',
          address: 'Mankind Plaza, Okhla Phase 1',
          city: 'New Delhi',
          state: 'Delhi',
          pincode: '110020',
          status: 'inactive',
          agencyCategory: 'Distributor',
          isPreferredSupplier: false,
          isBlocked: false,
          creditDays: 15,
          openingBalance: 8000,
          currentBalance: 8000,
          creditLimit: 60000,
          bankName: 'Canara Bank',
          accountNumber: '1092101004123',
          ifscCode: 'CNRB0001092',
          createdBy: creatorId
        },
        {
          agencyCode: 'AGN008',
          agencyName: 'Alkem Pharma Distributors',
          contactPerson: 'Sunil Verma',
          contactPersonDesignation: 'Manager',
          phone: '9876543217',
          email: 'sunil@alkem.com',
          gstNumber: 'GSTALK008',
          drugLicenseNumber: 'DL008',
          address: 'Alkem House, Senapati Bapat Marg',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400013',
          status: 'active',
          agencyCategory: 'Wholesaler',
          isPreferredSupplier: false,
          isBlocked: false,
          creditDays: 60,
          openingBalance: 25000,
          currentBalance: 25000,
          creditLimit: 300000,
          bankName: 'Kotak Mahindra Bank',
          accountNumber: '392010293812',
          ifscCode: 'KKBK0000958',
          createdBy: creatorId
        },
        {
          agencyCode: 'AGN009',
          agencyName: 'Glenmark Medicals',
          contactPerson: 'Meera Sen',
          contactPersonDesignation: 'Representative',
          phone: '9876543218',
          email: 'meera@glenmark.com',
          gstNumber: 'GSTGLE009',
          drugLicenseNumber: 'DL009',
          address: 'Sector 5, Salt Lake',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700091',
          status: 'inactive',
          agencyCategory: 'Local Supplier',
          isPreferredSupplier: false,
          isBlocked: false,
          creditDays: 0,
          openingBalance: 3000,
          currentBalance: 3000,
          creditLimit: 30000,
          bankName: 'United Bank of India',
          accountNumber: '091201029381',
          ifscCode: 'UTBI0091203',
          createdBy: creatorId
        },
        {
          agencyCode: 'AGN010',
          agencyName: 'Dr. Reddys Distributors',
          contactPerson: 'Vivek Rao',
          contactPersonDesignation: 'Owner',
          phone: '9876543219',
          email: 'vivek@drreddys.com',
          gstNumber: 'GSTRED010',
          drugLicenseNumber: 'DL010',
          address: 'Banjara Hills Road No 3',
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500034',
          status: 'active',
          agencyCategory: 'Manufacturer',
          isPreferredSupplier: false,
          isBlocked: true,
          creditDays: 45,
          openingBalance: 35000,
          currentBalance: 35000,
          creditLimit: 250000,
          bankName: 'Union Bank of India',
          accountNumber: '52010100293812',
          ifscCode: 'UBIN0552011',
          createdBy: creatorId
        }
      ];

      await Agency.create(dummyAgencies);
      console.log('Seeded 10 dummy agencies successfully!');
    }
  } catch (error) {
    console.error(`Error seeding agencies: ${error.message}`);
  }
};

// Seed Initial Medicines if they don't exist
const seedMedicines = async () => {
  try {
    const count = await Medicine.countDocuments();
    if (count === 0) {
      console.log('No medicines found. Seeding 25 dummy medicines...');

      const adminUser = await User.findOne({ role: 'admin' });
      const creatorId = adminUser ? adminUser._id : null;

      const agencies = await Agency.find({ isDeleted: false });
      if (agencies.length === 0 || !creatorId) {
        console.error('Cannot seed medicines: Ensure admin user and agencies are seeded first.');
        return;
      }

      const dummyMedicines = [
        {
          medicineCode: 'MED0001',
          medicineName: 'Paracetamol 500mg',
          genericName: 'Paracetamol',
          brandName: 'Crocin',
          description: 'Common analgesic and antipyretic for pain and fever relief.',
          category: 'Analgesics',
          manufacturer: 'GSK Healthcare',
          agencyId: agencies[0]._id,
          strength: '500mg',
          medicineForm: 'Tablet',
          purchasePrice: 10,
          sellingPrice: 15,
          mrp: 20,
          gstPercentage: 12,
          discountAllowed: 5,
          minimumStockLevel: 50,
          reorderLevel: 100,
          currentStock: 120,
          unitType: 'Strip',
          packSize: 10,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '30049001',
          barcode: '8901234000012',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Fast moving medicine. Keep in high stock.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0002',
          medicineName: 'Dolo 650',
          genericName: 'Paracetamol',
          brandName: 'Dolo',
          description: 'Fever reducer and pain killer widely prescribed for high fever.',
          category: 'Analgesics',
          manufacturer: 'Micro Labs Ltd',
          agencyId: agencies[1 % agencies.length]._id,
          strength: '650mg',
          medicineForm: 'Tablet',
          purchasePrice: 18,
          sellingPrice: 26,
          mrp: 30,
          gstPercentage: 12,
          discountAllowed: 5,
          minimumStockLevel: 100,
          reorderLevel: 200,
          currentStock: 300,
          unitType: 'Strip',
          packSize: 15,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '30049002',
          barcode: '8901234000029',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Extremely popular during seasonal flu.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0003',
          medicineName: 'Azithromycin 500mg',
          genericName: 'Azithromycin',
          brandName: 'Azee',
          description: 'Broad-spectrum macrolide antibiotic used for respiratory tract infections.',
          category: 'Antibiotics',
          manufacturer: 'Cipla Ltd',
          agencyId: agencies[2 % agencies.length]._id,
          strength: '500mg',
          medicineForm: 'Tablet',
          purchasePrice: 65,
          sellingPrice: 105,
          mrp: 120,
          gstPercentage: 12,
          discountAllowed: 10,
          minimumStockLevel: 20,
          reorderLevel: 40,
          currentStock: 15,
          unitType: 'Strip',
          packSize: 5,
          prescriptionRequired: 'Yes',
          storageType: 'Room Temperature',
          hsnCode: '30042013',
          barcode: '8901234000036',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Must verify prescription before billing.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0004',
          medicineName: 'Amoxicillin 250mg',
          genericName: 'Amoxicillin',
          brandName: 'Novamox',
          description: 'Penicillin-class antibiotic for bacterial infections.',
          category: 'Antibiotics',
          manufacturer: 'Alkem Laboratories',
          agencyId: agencies[3 % agencies.length]._id,
          strength: '250mg',
          medicineForm: 'Capsule',
          purchasePrice: 42,
          sellingPrice: 62,
          mrp: 72,
          gstPercentage: 12,
          discountAllowed: 8,
          minimumStockLevel: 30,
          reorderLevel: 60,
          currentStock: 80,
          unitType: 'Strip',
          packSize: 10,
          prescriptionRequired: 'Yes',
          storageType: 'Room Temperature',
          hsnCode: '30042014',
          barcode: '8901234000043',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Sensitive to moisture. Keep in dry place.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0005',
          medicineName: 'Pantoprazole 40mg',
          genericName: 'Pantoprazole',
          brandName: 'Pan 40',
          description: 'Proton pump inhibitor that decreases stomach acid production.',
          category: 'Antacids',
          manufacturer: 'Alkem Laboratories',
          agencyId: agencies[0]._id,
          strength: '40mg',
          medicineForm: 'Tablet',
          purchasePrice: 90,
          sellingPrice: 135,
          mrp: 155,
          gstPercentage: 12,
          discountAllowed: 10,
          minimumStockLevel: 40,
          reorderLevel: 80,
          currentStock: 110,
          unitType: 'Strip',
          packSize: 15,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '30049033',
          barcode: '8901234000050',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Take early morning on empty stomach.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0006',
          medicineName: 'Cetirizine 10mg',
          genericName: 'Cetirizine Hydrochloride',
          brandName: 'Okacet',
          description: 'Antihistamine used to treat cold symptoms, runny nose, and allergies.',
          category: 'Antihistamines',
          manufacturer: 'Cipla Ltd',
          agencyId: agencies[1 % agencies.length]._id,
          strength: '10mg',
          medicineForm: 'Tablet',
          purchasePrice: 12,
          sellingPrice: 18,
          mrp: 22,
          gstPercentage: 12,
          discountAllowed: 5,
          minimumStockLevel: 50,
          reorderLevel: 100,
          currentStock: 140,
          unitType: 'Strip',
          packSize: 10,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '30049035',
          barcode: '8901234000067',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Causes mild drowsiness. Advise customer.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0007',
          medicineName: 'ORS Powder 21.8g',
          genericName: 'Oral Rehydration Salts',
          brandName: 'Electral',
          description: 'WHO-recommended formulation for rehydration and electrolyte balance.',
          category: 'Supplements',
          manufacturer: 'FDC Limited',
          agencyId: agencies[2 % agencies.length]._id,
          strength: '21.8g',
          medicineForm: 'Powder',
          purchasePrice: 15,
          sellingPrice: 20,
          mrp: 22,
          gstPercentage: 5,
          discountAllowed: 0,
          minimumStockLevel: 100,
          reorderLevel: 200,
          currentStock: 250,
          unitType: 'Packet',
          packSize: 1,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '21069099',
          barcode: '8901234000074',
          expiryAlertDays: 90,
          trackBatches: false,
          allowPurchase: true,
          allowSale: true,
          notes: 'High seasonal summer demand.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0008',
          medicineName: 'Limcee Vitamin C',
          genericName: 'Ascorbic Acid (Vitamin C)',
          brandName: 'Limcee',
          description: 'Chewable tablets to treat Vitamin C deficiency and support immunity.',
          category: 'Vitamins',
          manufacturer: 'Abbott India',
          agencyId: agencies[3 % agencies.length]._id,
          strength: '500mg',
          medicineForm: 'Tablet',
          purchasePrice: 20,
          sellingPrice: 28,
          mrp: 32,
          gstPercentage: 12,
          discountAllowed: 5,
          minimumStockLevel: 50,
          reorderLevel: 100,
          currentStock: 0,
          unitType: 'Strip',
          packSize: 15,
          prescriptionRequired: 'No',
          storageType: 'Cool Place',
          hsnCode: '29362700',
          barcode: '8901234000081',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Chewable orange flavor. High demand.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0009',
          medicineName: 'Zinc 50mg',
          genericName: 'Zinc Sulfate',
          brandName: 'Zinconia',
          description: 'Mineral supplement for immune support and gastrointestinal health.',
          category: 'Vitamins',
          manufacturer: 'Apex Labs',
          agencyId: agencies[0]._id,
          strength: '50mg',
          medicineForm: 'Tablet',
          purchasePrice: 38,
          sellingPrice: 52,
          mrp: 60,
          gstPercentage: 12,
          discountAllowed: 8,
          minimumStockLevel: 30,
          reorderLevel: 60,
          currentStock: 45,
          unitType: 'Strip',
          packSize: 10,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '30049099',
          barcode: '8901234000098',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Prescribed alongside ORS for pediatric diarrhea.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0010',
          medicineName: 'Aspirin 75mg',
          genericName: 'Aspirin',
          brandName: 'Ecosprin 75',
          description: 'Antiplatelet agent to prevent heart attacks, stroke, and cardiovascular events.',
          category: 'Cardiovascular',
          manufacturer: 'USV Biotech',
          agencyId: agencies[1 % agencies.length]._id,
          strength: '75mg',
          medicineForm: 'Tablet',
          purchasePrice: 4.5,
          sellingPrice: 6.8,
          mrp: 8,
          gstPercentage: 12,
          discountAllowed: 2,
          minimumStockLevel: 150,
          reorderLevel: 300,
          currentStock: 400,
          unitType: 'Strip',
          packSize: 14,
          prescriptionRequired: 'Yes',
          storageType: 'Room Temperature',
          hsnCode: '30049011',
          barcode: '8901234000104',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Vital cardiac drug. Always maintain high stock.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0011',
          medicineName: 'Ibuprofen 400mg',
          genericName: 'Ibuprofen',
          brandName: 'Brufen 400',
          description: 'NSAID pain reliever and anti-inflammatory drug.',
          category: 'Analgesics',
          manufacturer: 'Abbott India',
          agencyId: agencies[2 % agencies.length]._id,
          strength: '400mg',
          medicineForm: 'Tablet',
          purchasePrice: 11,
          sellingPrice: 16,
          mrp: 19,
          gstPercentage: 12,
          discountAllowed: 5,
          minimumStockLevel: 50,
          reorderLevel: 100,
          currentStock: 120,
          unitType: 'Strip',
          packSize: 15,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '30049012',
          barcode: '8901234000111',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Advise customer to take with food to prevent gastric irritation.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0012',
          medicineName: 'Metformin 500mg',
          genericName: 'Metformin Hydrochloride',
          brandName: 'Glycomet 500',
          description: 'Oral antidiabetic medication for Type-2 Diabetes management.',
          category: 'Antidiabetics',
          manufacturer: 'USV Biotech',
          agencyId: agencies[3 % agencies.length]._id,
          strength: '500mg',
          medicineForm: 'Tablet',
          purchasePrice: 15,
          sellingPrice: 22,
          mrp: 26,
          gstPercentage: 12,
          discountAllowed: 5,
          minimumStockLevel: 80,
          reorderLevel: 150,
          currentStock: 190,
          unitType: 'Strip',
          packSize: 10,
          prescriptionRequired: 'Yes',
          storageType: 'Room Temperature',
          hsnCode: '30049022',
          barcode: '8901234000128',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Chronic patient drug. Highly recurring sales.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0013',
          medicineName: 'Atorvastatin 10mg',
          genericName: 'Atorvastatin Calcium',
          brandName: 'Lipvas 10',
          description: 'HMG-CoA reductase inhibitor (statin) to lower high cholesterol levels.',
          category: 'Cardiovascular',
          manufacturer: 'Cipla Ltd',
          agencyId: agencies[0]._id,
          strength: '10mg',
          medicineForm: 'Tablet',
          purchasePrice: 40,
          sellingPrice: 65,
          mrp: 75,
          gstPercentage: 12,
          discountAllowed: 10,
          minimumStockLevel: 40,
          reorderLevel: 80,
          currentStock: 95,
          unitType: 'Strip',
          packSize: 10,
          prescriptionRequired: 'Yes',
          storageType: 'Room Temperature',
          hsnCode: '30049024',
          barcode: '8901234000135',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Prescribed for hypercholesterolemia.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0014',
          medicineName: 'Amlodipine 5mg',
          genericName: 'Amlodipine Besylate',
          brandName: 'Amlong 5',
          description: 'Calcium channel blocker to treat high blood pressure and chest pain (angina).',
          category: 'Cardiovascular',
          manufacturer: 'Micro Labs Ltd',
          agencyId: agencies[1 % agencies.length]._id,
          strength: '5mg',
          medicineForm: 'Tablet',
          purchasePrice: 10,
          sellingPrice: 15,
          mrp: 18,
          gstPercentage: 12,
          discountAllowed: 5,
          minimumStockLevel: 60,
          reorderLevel: 120,
          currentStock: 140,
          unitType: 'Strip',
          packSize: 15,
          prescriptionRequired: 'Yes',
          storageType: 'Room Temperature',
          hsnCode: '30049025',
          barcode: '8901234000142',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Keep away from direct sunlight.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0015',
          medicineName: 'Omeprazole 20mg',
          genericName: 'Omeprazole',
          brandName: 'Omez 20',
          description: 'Proton-pump inhibitor for acid reflux, ulcers, and GERD relief.',
          category: 'Antacids',
          manufacturer: 'Dr. Reddys',
          agencyId: agencies[2 % agencies.length]._id,
          strength: '20mg',
          medicineForm: 'Capsule',
          purchasePrice: 28,
          sellingPrice: 42,
          mrp: 48,
          gstPercentage: 12,
          discountAllowed: 5,
          minimumStockLevel: 50,
          reorderLevel: 100,
          currentStock: 120,
          unitType: 'Strip',
          packSize: 15,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '30049033',
          barcode: '8901234000159',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Fast selling antacid.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0016',
          medicineName: 'Montelukast 10mg',
          genericName: 'Montelukast Sodium',
          brandName: 'Montair 10',
          description: 'Leukotriene receptor antagonist for asthma and allergic rhinitis.',
          category: 'Respiratory',
          manufacturer: 'Cipla Ltd',
          agencyId: agencies[3 % agencies.length]._id,
          strength: '10mg',
          medicineForm: 'Tablet',
          purchasePrice: 120,
          sellingPrice: 180,
          mrp: 200,
          gstPercentage: 12,
          discountAllowed: 10,
          minimumStockLevel: 25,
          reorderLevel: 50,
          currentStock: 60,
          unitType: 'Strip',
          packSize: 15,
          prescriptionRequired: 'Yes',
          storageType: 'Room Temperature',
          hsnCode: '30049037',
          barcode: '8901234000166',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Preferably taken in the evening.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0017',
          medicineName: 'Diclofenac Gel 1%',
          genericName: 'Diclofenac Diethylamine',
          brandName: 'Voveran Gel',
          description: 'Topical nonsteroidal anti-inflammatory gel for muscle and joint pain.',
          category: 'Analgesics',
          manufacturer: 'Novartis India',
          agencyId: agencies[0]._id,
          strength: '1%',
          medicineForm: 'Ointment',
          purchasePrice: 45,
          sellingPrice: 75,
          mrp: 85,
          gstPercentage: 12,
          discountAllowed: 8,
          minimumStockLevel: 20,
          reorderLevel: 40,
          currentStock: 35,
          unitType: 'Tube',
          packSize: 1,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '30049042',
          barcode: '8901234000173',
          expiryAlertDays: 90,
          trackBatches: false,
          allowPurchase: true,
          allowSale: true,
          notes: 'For external use only.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0018',
          medicineName: 'Betadine Ointment 5%',
          genericName: 'Povidone-Iodine',
          brandName: 'Betadine',
          description: 'Antiseptic ointment for treatment of minor cuts, wounds, and burns.',
          category: 'Antiseptics',
          manufacturer: 'Win-Medicare',
          agencyId: agencies[1 % agencies.length]._id,
          strength: '5%',
          medicineForm: 'Ointment',
          purchasePrice: 55,
          sellingPrice: 90,
          mrp: 102,
          gstPercentage: 12,
          discountAllowed: 5,
          minimumStockLevel: 25,
          reorderLevel: 50,
          currentStock: 48,
          unitType: 'Tube',
          packSize: 1,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '30049045',
          barcode: '8901234000180',
          expiryAlertDays: 90,
          trackBatches: false,
          allowPurchase: true,
          allowSale: true,
          notes: 'Standard first-aid ointment.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0019',
          medicineName: 'Salbutamol Inhaler 100mcg',
          genericName: 'Salbutamol Sulfate',
          brandName: 'Asthalin Inhaler',
          description: 'Fast-acting bronchodilator for quick relief of asthma and COPD bronchospasm.',
          category: 'Respiratory',
          manufacturer: 'Cipla Ltd',
          agencyId: agencies[2 % agencies.length]._id,
          strength: '100mcg',
          medicineForm: 'Inhaler',
          purchasePrice: 98,
          sellingPrice: 138,
          mrp: 150,
          gstPercentage: 12,
          discountAllowed: 10,
          minimumStockLevel: 15,
          reorderLevel: 30,
          currentStock: 25,
          unitType: 'Box',
          packSize: 1,
          prescriptionRequired: 'Yes',
          storageType: 'Cool Place',
          hsnCode: '30049089',
          barcode: '8901234000197',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Store below 25°C. Pressurized canister.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0020',
          medicineName: 'Insulin Glargine 100 IU/ml',
          genericName: 'Insulin Glargine (rDNA origin)',
          brandName: 'Lantus SoloStar',
          description: 'Long-acting basal insulin analogue for blood glucose level management.',
          category: 'Antidiabetics',
          manufacturer: 'Sanofi India',
          agencyId: agencies[3 % agencies.length]._id,
          strength: '100 IU/ml',
          medicineForm: 'Injection',
          purchasePrice: 480,
          sellingPrice: 620,
          mrp: 690,
          gstPercentage: 5,
          discountAllowed: 5,
          minimumStockLevel: 10,
          reorderLevel: 20,
          currentStock: 12,
          unitType: 'Bottle',
          packSize: 1,
          prescriptionRequired: 'Yes',
          storageType: 'Refrigerated',
          hsnCode: '30043110',
          barcode: '8901234000203',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'CRITICAL: Keep refrigerated (2°C - 8°C). Do not freeze.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0021',
          medicineName: 'Cough Syrup 100ml',
          genericName: 'Dextromethorphan + Chlorpheniramine',
          brandName: 'Benadryl DR',
          description: 'Cough suppressant and antihistamine liquid for dry cough relief.',
          category: 'Cough Preparations',
          manufacturer: 'J&J Consumer Health',
          agencyId: agencies[0]._id,
          strength: '100ml',
          medicineForm: 'Syrup',
          purchasePrice: 70,
          sellingPrice: 105,
          mrp: 115,
          gstPercentage: 12,
          discountAllowed: 5,
          minimumStockLevel: 30,
          reorderLevel: 60,
          currentStock: 80,
          unitType: 'Bottle',
          packSize: 1,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '30049091',
          barcode: '8901234000210',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Shake well before use.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0022',
          medicineName: 'Pediatric Ear Drops 10ml',
          genericName: 'Chloramphenicol + Benzocaine',
          brandName: 'Otogesic',
          description: 'Antibiotic and anesthetic drops for painful outer ear infections.',
          category: 'Otology',
          manufacturer: 'East India Pharm',
          agencyId: agencies[1 % agencies.length]._id,
          strength: '10ml',
          medicineForm: 'Drops',
          purchasePrice: 35,
          sellingPrice: 52,
          mrp: 58,
          gstPercentage: 12,
          discountAllowed: 0,
          minimumStockLevel: 20,
          reorderLevel: 40,
          currentStock: 18,
          unitType: 'Bottle',
          packSize: 1,
          prescriptionRequired: 'Yes',
          storageType: 'Cool Place',
          hsnCode: '30049094',
          barcode: '8901234000227',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Instill as prescribed. Throw away 1 month after opening.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0023',
          medicineName: 'B-Complex Capsules',
          genericName: 'Vitamin B-Complex with Vitamin C',
          brandName: 'Becosules',
          description: 'Vitamin capsule to resolve mouth ulcers and supplement vitamin deficiency.',
          category: 'Vitamins',
          manufacturer: 'Pfizer India',
          agencyId: agencies[2 % agencies.length]._id,
          strength: '10 Capsules',
          medicineForm: 'Capsule',
          purchasePrice: 22,
          sellingPrice: 32,
          mrp: 38,
          gstPercentage: 12,
          discountAllowed: 5,
          minimumStockLevel: 60,
          reorderLevel: 120,
          currentStock: 150,
          unitType: 'Strip',
          packSize: 20,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '29362920',
          barcode: '8901234000234',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: true,
          allowSale: true,
          notes: 'Highly popular supplement.',
          status: 'Active',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0024',
          medicineName: 'ORS Liquid Apple 200ml',
          genericName: 'Electrolytes Drink',
          brandName: 'ORS Apple',
          description: 'Ready-to-drink apple flavored electrolyte formula.',
          category: 'Supplements',
          manufacturer: 'FDC Limited',
          agencyId: agencies[3 % agencies.length]._id,
          strength: '200ml',
          medicineForm: 'Syrup',
          purchasePrice: 24,
          sellingPrice: 30,
          mrp: 35,
          gstPercentage: 12,
          discountAllowed: 0,
          minimumStockLevel: 50,
          reorderLevel: 100,
          currentStock: 90,
          unitType: 'Bottle',
          packSize: 1,
          prescriptionRequired: 'No',
          storageType: 'Room Temperature',
          hsnCode: '22029990',
          barcode: '8901234000241',
          expiryAlertDays: 90,
          trackBatches: false,
          allowPurchase: true,
          allowSale: true,
          notes: 'Inactive trial medicine.',
          status: 'Inactive',
          createdBy: creatorId
        },
        {
          medicineCode: 'MED0025',
          medicineName: 'Tramadol 50mg (Blocked)',
          genericName: 'Tramadol Hydrochloride',
          brandName: 'Contramal',
          description: 'Opioid pain medication used to treat moderate to moderately severe pain.',
          category: 'Analgesics',
          manufacturer: 'Abbott India',
          agencyId: agencies[0]._id,
          strength: '50mg',
          medicineForm: 'Capsule',
          purchasePrice: 90,
          sellingPrice: 140,
          mrp: 160,
          gstPercentage: 12,
          discountAllowed: 0,
          minimumStockLevel: 10,
          reorderLevel: 25,
          currentStock: 30,
          unitType: 'Strip',
          packSize: 10,
          prescriptionRequired: 'Yes',
          storageType: 'Room Temperature',
          hsnCode: '30049061',
          barcode: '8901234000258',
          expiryAlertDays: 90,
          trackBatches: true,
          allowPurchase: false,
          allowSale: false,
          notes: 'CRITICAL: Blocked due to narcotic regulations.',
          status: 'Active',
          isBlocked: true,
          createdBy: creatorId
        }
      ];

      await Medicine.create(dummyMedicines);
      console.log('Seeded 25 dummy medicines successfully!');
    }
  } catch (error) {
    console.error(`Error seeding medicines: ${error.message}`);
  }
};

// Seed Initial Purchases, Batches, Payments, Ledger, and Snapshots if they don't exist
const seedPurchases = async () => {
  try {
    const Purchase = require('./models/Purchase');
    const PurchaseItem = require('./models/PurchaseItem');
    const InventoryBatch = require('./models/InventoryBatch');
    const InventoryActivity = require('./models/InventoryActivity');
    const SupplierPayment = require('./models/SupplierPayment');
    const AgencyLedger = require('./models/AgencyLedger');
    const InventorySnapshot = require('./models/InventorySnapshot');

    const count = await Purchase.countDocuments();
    if (count > 0) return;

    console.log('No purchases found. Seeding 15 dummy purchases, batches, payments, ledger, and snapshots...');

    const adminUser = await User.findOne({ role: 'admin' });
    const creatorId = adminUser ? adminUser._id : null;
    const agencies = await Agency.find({ isDeleted: false });
    const medicines = await Medicine.find({ isDeleted: false });

    if (agencies.length === 0 || medicines.length === 0 || !creatorId) {
      console.error('Cannot seed purchases: Missing dependencies');
      return;
    }

    // Let's create 15 purchases
    for (let i = 1; i <= 15; i++) {
      const isPosted = i <= 10; // 1 to 10 are Posted, 11 to 15 are Drafts
      const agencyIndex = (i - 1) % agencies.length;
      const agency = agencies[agencyIndex];

      const purchaseNumber = `PUR${String(i).padStart(6, '0')}`;
      const invoiceNumber = `INV-${20260600 + i}`;
      const purchaseDate = new Date();
      // stagger dates back in time
      purchaseDate.setDate(purchaseDate.getDate() - (15 - i));

      const creditDays = agency.creditDays || 30;
      const dueDate = new Date(purchaseDate.getTime() + creditDays * 24 * 60 * 60 * 1000);

      // select 2 medicines
      const med1 = medicines[(i * 2) % medicines.length];
      const med2 = medicines[(i * 2 + 1) % medicines.length];

      // pricing
      const qty1 = 50 + (i * 2);
      const qty2 = 30 + (i * 3);
      const free1 = i % 3 === 0 ? 5 : 0;
      const free2 = 0;

      const item1Price = med1.purchasePrice || 10;
      const item2Price = med2.purchasePrice || 20;

      const subTotal1 = qty1 * item1Price;
      const subTotal2 = qty2 * item2Price;
      const billAmount = subTotal1 + subTotal2;

      const gstRate1 = med1.gstPercentage || 12;
      const gstRate2 = med2.gstPercentage || 12;
      const gst1 = subTotal1 * (gstRate1 / 100);
      const gst2 = subTotal2 * (gstRate2 / 100);
      const gstAmount = gst1 + gst2;

      const grandTotal = billAmount + gstAmount;
      const paidAmount = isPosted ? (i % 2 === 0 ? Math.round(grandTotal / 2) : 0) : 0;
      const pendingAmount = grandTotal - paidAmount;

      const purchase = await Purchase.create({
        purchaseNumber,
        invoiceNumber,
        invoiceDate: purchaseDate,
        purchaseDate,
        agencyId: agency._id,
        billAmount: Math.round(billAmount * 100) / 100,
        gstAmount: Math.round(gstAmount * 100) / 100,
        discountAmount: 0,
        grandTotal: Math.round(grandTotal * 100) / 100,
        paidAmount: Math.round(paidAmount * 100) / 100,
        pendingAmount: Math.round(pendingAmount * 100) / 100,
        dueDate,
        creditDays,
        paymentMethod: i % 2 === 0 ? 'Bank Transfer' : 'Credit',
        purchaseStatus: isPosted ? 'Posted' : 'Draft',
        remarks: `Seeded purchase record ${i}`,
        createdBy: creatorId
      });

      const pItem1 = await PurchaseItem.create({
        purchaseId: purchase._id,
        medicineId: med1._id,
        batchNumber: `BAT-${20260600 + i}-A`,
        manufacturingDate: new Date(purchaseDate.getTime() - 90 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(purchaseDate.getTime() + (i <= 3 ? 15 : 365) * 24 * 60 * 60 * 1000), // Expiry within 15 days for first few batches to test alerts
        quantity: qty1,
        freeQuantity: free1,
        purchasePrice: item1Price,
        sellingPrice: med1.sellingPrice || item1Price * 1.2,
        mrp: med1.mrp || item1Price * 1.3,
        gstPercentage: gstRate1,
        discountPercentage: 0,
        lineTotal: subTotal1 + gst1
      });

      const pItem2 = await PurchaseItem.create({
        purchaseId: purchase._id,
        medicineId: med2._id,
        batchNumber: `BAT-${20260600 + i}-B`,
        manufacturingDate: new Date(purchaseDate.getTime() - 90 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(purchaseDate.getTime() + (i <= 5 && i > 3 ? 60 : 365) * 24 * 60 * 60 * 1000), // Near Expiry for some
        quantity: qty2,
        freeQuantity: free2,
        purchasePrice: item2Price,
        sellingPrice: med2.sellingPrice || item2Price * 1.2,
        mrp: med2.mrp || item2Price * 1.3,
        gstPercentage: gstRate2,
        discountPercentage: 0,
        lineTotal: subTotal2 + gst2
      });

      if (isPosted) {
        // Create Batches
        const processItem = async (pItem, medObj) => {
          const totalQty = pItem.quantity + pItem.freeQuantity;

          // Determine status
          const today = new Date();
          const expiryDate = new Date(pItem.expiryDate);
          let status = 'Active';
          if (expiryDate <= today) status = 'Expired';
          else if ((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24) <= 90) status = 'Near Expiry';

          const batch = await InventoryBatch.create({
            batchCode: `BAT${String(Math.random()).slice(2, 8)}`,
            medicineId: pItem.medicineId,
            purchaseItemId: pItem._id,
            batchNumber: pItem.batchNumber,
            manufacturingDate: pItem.manufacturingDate,
            expiryDate: pItem.expiryDate,
            originalQuantity: totalQty,
            availableQuantity: totalQty,
            reservedQuantity: 0,
            purchasePrice: pItem.purchasePrice,
            sellingPrice: pItem.sellingPrice,
            mrp: pItem.mrp,
            status,
            isLocked: false,
            isSaleBlocked: status === 'Expired',
            createdBy: creatorId
          });

          // update medicine stock
          medObj.currentStock = (medObj.currentStock || 0) + totalQty;
          await medObj.save();

          // Activity
          await InventoryActivity.create({
            inventoryBatchId: batch._id,
            action: 'Purchase Receipt',
            description: `Seeded receipt of ${totalQty} units via Purchase ${purchaseNumber}`,
            performedBy: creatorId
          });
        };

        await processItem(pItem1, med1);
        await processItem(pItem2, med2);

        // Update agency balance and ledger
        agency.currentBalance = (agency.currentBalance || 0) + purchase.grandTotal;
        agency.lastPurchaseDate = purchaseDate;
        await agency.save();

        await AgencyLedger.create({
          agencyId: agency._id,
          transactionType: 'Purchase',
          referenceId: purchase._id,
          referenceNumber: purchaseNumber,
          debit: 0,
          credit: purchase.grandTotal,
          runningBalance: agency.currentBalance,
          remarks: `Seeded purchase credit for ${purchaseNumber}`
        });
      }
    }

    // Seed 10 payments to suppliers
    for (let p = 1; p <= 10; p++) {
      const agency = agencies[p % agencies.length];
      const amountPaid = 2000 + (p * 500);

      const paymentNumber = `PAY${String(p).padStart(6, '0')}`;
      const paymentDate = new Date();
      paymentDate.setDate(paymentDate.getDate() - (10 - p));

      const payment = await SupplierPayment.create({
        paymentNumber,
        agencyId: agency._id,
        paymentDate,
        amountPaid,
        paymentMethod: p % 2 === 0 ? 'Bank Transfer' : 'Cash',
        referenceNumber: `TXN${100000 + p}`,
        remarks: `Seeded supplier payment ${p}`,
        createdBy: creatorId
      });

      // Update agency balance and ledger
      agency.currentBalance = Math.max(0, (agency.currentBalance || 0) - amountPaid);
      await agency.save();

      await AgencyLedger.create({
        agencyId: agency._id,
        transactionType: 'Payment',
        referenceId: payment._id,
        referenceNumber: paymentNumber,
        debit: amountPaid,
        credit: 0,
        runningBalance: agency.currentBalance,
        remarks: `Seeded supplier payment debit for ${paymentNumber}`
      });

      // update purchase pendingAmount
      let remaining = amountPaid;
      const purchases = await Purchase.find({ agencyId: agency._id, purchaseStatus: 'Posted', pendingAmount: { $gt: 0 } }).sort({ purchaseDate: 1 });
      for (const pur of purchases) {
        if (remaining <= 0) break;
        const deduct = Math.min(pur.pendingAmount, remaining);
        pur.pendingAmount -= deduct;
        pur.paidAmount += deduct;
        await pur.save();
        remaining -= deduct;
      }
    }

    // Seed daily snapshots for last 5 days
    for (let s = 5; s >= 1; s--) {
      const snapDate = new Date();
      snapDate.setDate(snapDate.getDate() - s);
      snapDate.setHours(0, 0, 0, 0);

      // get valuations on that day
      const batches = await InventoryBatch.find({ isDeleted: false });
      let itemsCount = batches.length;
      let purchaseVal = 0;
      let sellingVal = 0;
      let mrpVal = 0;

      batches.forEach(b => {
        purchaseVal += b.availableQuantity * b.purchasePrice;
        sellingVal += b.availableQuantity * b.sellingPrice;
        mrpVal += b.availableQuantity * b.mrp;
      });

      // Stagger stats back in time for trend visualization
      const factor = 1 - (s * 0.05); // slight variation

      await InventorySnapshot.create({
        snapshotDate: snapDate,
        totalItems: Math.round(itemsCount * factor),
        totalPurchaseValue: Math.round(purchaseVal * factor * 100) / 100,
        totalSellingValue: Math.round(sellingVal * factor * 100) / 100,
        totalMrpValue: Math.round(mrpVal * factor * 100) / 100,
        createdBy: creatorId
      });
    }

    console.log('Seeded purchase database successfully.');
  } catch (error) {
    console.error('Seeding purchases error:', error);
  }
};

let serverInstance;

// Start Server
const startServer = async () => {
  const startupBegin = Date.now();
  try {
    // 1. Environment Validation
    validateEnvironment();

    // 2. Database Connection
    await connectDB().catch(err => {
      logger.error(`Database connection failed: ${err.message}`);
    });

    // 3. Folder Validation & Startup Health Checks
    const { runStartupHealthChecks, getSystemStatus, getBootFailureReason } = require('./config/StartupHealthValidationService');
    await runStartupHealthChecks();

    const bootStatus = getSystemStatus();

    if (bootStatus === 'RECOVERY_ONLY' || bootStatus === 'CRITICAL') {
      logger.error(`SYSTEM BOOTED IN RESTRICTED RECOVERY MODE: ${getBootFailureReason()}`);

      // Auto-enable maintenance mode to ensure business routes are intercepted
      try {
        const { enableMaintenanceMode } = require('./config/MaintenanceModeService');
        await enableMaintenanceMode(`Recovery Mode: ${getBootFailureReason()}`);
      } catch (maintErr) {
        logger.error(`Failed to enable maintenance mode during recovery boot: ${maintErr.message}`);
      }
    } else {
      // 4. Admin Seeding (only if DB is healthy)
      await seedUsers();

      // 5. Single Admin Integrity Validation
      const userCount = await User.countDocuments();
      if (userCount !== 1) {
        throw new Error(`Single Admin Integrity Violation: Expected exactly 1 user account in database, found ${userCount}.`);
      }
      const primaryAdmin = await User.findOne({ isPrimaryAdmin: true }).select('+password');
      if (!primaryAdmin) {
        throw new Error('Single Admin Integrity Violation: Primary administrator account not found.');
      }
      if (!primaryAdmin.isActive) {
        throw new Error('Single Admin Integrity Violation: Primary administrator account is deactivated.');
      }
      if (!primaryAdmin.password || primaryAdmin.password.trim() === '') {
        throw new Error('Single Admin Integrity Violation: Password hash is missing or corrupted.');
      }
      if (primaryAdmin.needsPasswordReset === undefined) {
        throw new Error('Single Admin Integrity Violation: needsPasswordReset state is undefined.');
      }
      if (!primaryAdmin.email || primaryAdmin.email.trim() === '') {
        throw new Error('Single Admin Integrity Violation: Administrator email/username is empty.');
      }
      logger.info('Single Admin Integrity Validation: PASSED.');

      if (process.env.NODE_ENV !== 'production') {
        logger.info('Development mode detected: seeding agency, medicine, and purchase dummy data...');
        await seedAgencies();
        await seedMedicines();
        await seedPurchases();
      }

      // 6. Database Migrations & settings initialization
      await initializeSettings();
      await runMigrations();
    }

    // 7. HTTP Server Start (Always run server to ensure Recovery UI access)
    const PORT = process.env.PORT || 5000;
    serverInstance = app.listen(PORT, () => {
      logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);

      // 8. Start Background Jobs
      if (bootStatus !== 'RECOVERY_ONLY' && bootStatus !== 'CRITICAL') {
        startBackgroundJobs();
      }

      logger.info(`Startup completed in ${Date.now() - startupBegin}ms`);
    });
  } catch (error) {
    logger.error(`CRITICAL STARTUP ERROR: ${error.message}`);
    process.exit(1);
  }
};

startServer();

// Graceful Shutdown Handler
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  if (serverInstance) {
    serverInstance.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await mongoose.connection.close(false);
        logger.info('MongoDB connection closed.');
        process.exit(0);
      } catch (err) {
        logger.error(`Error during database disconnection: ${err.message}`);
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});
