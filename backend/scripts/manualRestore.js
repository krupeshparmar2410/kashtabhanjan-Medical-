  const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env parameters
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const { restoreFromBackup } = require('../config/BackupService');

const manualRestore = async () => {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  
  if (fileIndex === -1) {
    console.error('Usage: node manualRestore.js --file <backup-filename-or-relative-path>');
    process.exit(1);
  }

  let filePathInput = args[fileIndex + 1];
  if (!filePathInput) {
    console.error('Invalid arguments. Backup filename or relative path is required.');
    process.exit(1);
  }

  // Get only the file base name (e.g. backup_BKP001_2026.zip.enc)
  const fileName = path.basename(filePathInput);

  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/medical_shop';
    await mongoose.connect(mongoURI);
    console.log('Connected to database successfully.');

    // Find admin operator
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.error('No admin user found in database to associate as restoration operator.');
      process.exit(1);
    }

    console.log(`Starting manual restore process for: ${fileName}`);
    console.log('Operator:', admin.email);

    // Call restore service (which automatically runs pre-restore rollback recovery and checks)
    const result = await restoreFromBackup(admin._id, fileName, 'RESTORE SYSTEM STATE');
    
    console.log('Restoration result:', result.message);
    console.log('Database restore completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Manual restoration failed:', err.message);
    process.exit(1);
  }
};

manualRestore();
