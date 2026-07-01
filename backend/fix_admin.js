// fix_admin.js
// This script connects to the local MongoDB instance (as used by the backend fallback)
// and ensures there is exactly one primary admin user.
// If multiple admin users exist, it will demote all but the first one.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const User = require('./models/User'); // adjust if model path differs

async function fixAdmins() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB for admin fix');

    const admins = await User.find({ role: 'admin' }).sort({ _id: 1 });
    console.log(`Found ${admins.length} admin user(s)`);
    if (admins.length <= 1) {
      console.log('No action needed – single admin already present');
      return;
    }
    // Keep the first admin as primary, demote the rest
    const primary = admins[0];
    await User.updateOne({ _id: primary._id }, { $set: { isPrimaryAdmin: true, isActive: true } });
    console.log(`Primary admin set: ${primary.email || primary._id}`);
    const toDemote = admins.slice(1);
    for (const admin of toDemote) {
      await User.updateOne({ _id: admin._id }, { $set: { isPrimaryAdmin: false, role: 'user' } });
      console.log(`Demoted admin ${admin.email || admin._id}`);
    }
  } catch (err) {
    console.error('Error during admin fix:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

fixAdmins();
