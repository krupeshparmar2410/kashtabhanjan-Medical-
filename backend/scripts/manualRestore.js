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
    let admin = await User.findOne({ isPrimaryAdmin: true });
    let operatorId;
    let operatorEmail;

    if (!admin) {
      operatorId = new mongoose.Types.ObjectId('000000000000000000000000'); // Static recovery operator ID
      operatorEmail = 'system-recovery-mode@kashtbhanjan.com';
      console.log('==================================================');
      console.log('⚠ RUNNING IN SYSTEM RECOVERY MODE (EMPTY/CORRUPT DB)');
      console.log('==================================================');
    } else {
      operatorId = admin._id;
      operatorEmail = admin.email;
    }

    console.log(`Starting manual restore process for: ${fileName}`);
    console.log('Operator:', operatorEmail);

    // Call restore service (which automatically runs pre-restore rollback recovery and checks)
    const result = await restoreFromBackup(operatorId, fileName, 'RESTORE SYSTEM STATE');
    
    console.log('Restoration result:', result.message);
    console.log('Database restore completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Manual restoration failed:', err.message);
    process.exit(1);
  }
};

manualRestore();
