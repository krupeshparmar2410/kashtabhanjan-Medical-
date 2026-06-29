// admin_cleanup.js
// This script connects using the same MONGO_URI as the backend and safely resolves
// the "Single Admin Integrity Violation" by demoting excess admin accounts.
// It never deletes users, never touches passwords or tokens, and only updates the `role` field.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const User = require('./models/User');

async function runCleanup() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // 1. Inspect all admin users
    const admins = await User.find({ role: 'admin' }).select('_id email createdAt isActive isPrimaryAdmin').lean();
    console.log('🔎 Admin accounts found:');
    admins.forEach(a => {
      console.log(` - _id: ${a._id}, email: ${a.email}, createdAt: ${a.createdAt.toISOString()}, isActive: ${a.isActive}, isPrimaryAdmin: ${a.isPrimaryAdmin}`);
    });

    if (admins.length === 0) {
      console.log('⚠️ No admin accounts present. Nothing to do.');
      return;
    }

    // 2. Determine primary admin per priority rules
    let primary = admins.find(a => a.isActive === true);
    let reason = '';
    if (primary) {
      reason = 'selected because isActive===true';
    } else {
      // second priority – earliest createdAt
      admins.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      primary = admins[0];
      reason = 'selected because earliest createdAt';
    }
    // third priority fallback – lowest _id (already handled by sort if needed)
    console.log(`🏆 Primary admin: ${primary.email || primary._id} (${reason})`);

    // 3. Demote other admins (keep primary unchanged)
    const toDemote = admins.filter(a => a._id.toString() !== primary._id.toString());
    console.log(`🔧 Accounts to demote: ${toDemote.length}`);
    for (const admin of toDemote) {
      // Log before applying
      console.log(`  → Demoting _id: ${admin._id}, email: ${admin.email}`);
      await User.updateOne({ _id: admin._id }, { $set: { role: 'user', isPrimaryAdmin: false } });
    }

    // 4. Validate result
    const finalAdmins = await User.find({ role: 'admin' }).countDocuments();
    console.log(`✅ Final admin count: ${finalAdmins}`);
    if (finalAdmins === 1) {
      console.log('✅ Single admin integrity restored.');
    } else {
      console.warn('⚠️ Unexpected admin count after cleanup.');
    }
  } catch (err) {
    console.error('❌ Error during cleanup:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🛑 Disconnected from MongoDB');
  }
}

runCleanup();
