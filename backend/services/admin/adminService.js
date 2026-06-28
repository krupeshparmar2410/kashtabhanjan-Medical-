const mongoose = require('mongoose');
const User = require('../../models/User');
const { writeAdminAuditLog } = require('./auditHelper');
const { acquireLock, releaseLock } = require('../../utils/lock');
const { SYSTEM_USER_ID } = require('../../config/constants');

/**
 * Switch the primary admin safely.
 * @param {String|mongoose.Types.ObjectId} newAdminId - target admin
 * @param {String|mongoose.Types.ObjectId} performedById - who initiated the switch
 * @returns {Object}
 */
async function switchPrimaryAdmin(newAdminId, performedById) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const lock = await acquireLock('PRIMARY_ADMIN_SWITCH', session);
    if (!lock) throw new Error('Concurrent switch operation in progress');

    const current = await User.findOne({ isPrimaryAdmin: true }).session(session).lean();
    if (current && current._id.toString() === newAdminId.toString()) {
      await releaseLock('PRIMARY_ADMIN_SWITCH', session);
      await session.commitTransaction();
      session.endSession();
      return { unchanged: true };
    }

    const target = await User.findOne({ _id: newAdminId, role: 'admin' }).session(session);
    if (!target) {
      await releaseLock('PRIMARY_ADMIN_SWITCH', session);
      await session.abortTransaction();
      session.endSession();
      throw new Error('Target admin not found');
    }

    if (current) {
      await User.updateOne({ _id: current._id }, { $set: { isPrimaryAdmin: false } }, { session });
      await writeAdminAuditLog({
        action: 'SWITCH_PRIMARY_ADMIN',
        userId: current._id,
        previousValue: true,
        newValue: false,
        performedBy: performedById,
        source: 'API',
        session,
      });
    }

    await User.updateOne({ _id: target._id }, { $set: { isPrimaryAdmin: true } }, { session });
    await writeAdminAuditLog({
      action: 'SWITCH_PRIMARY_ADMIN',
      userId: target._id,
      previousValue: !!target.isPrimaryAdmin,
      newValue: true,
      performedBy: performedById,
      source: 'API',
      session,
    });

    await releaseLock('PRIMARY_ADMIN_SWITCH', session);
    await session.commitTransaction();
    session.endSession();
    return { success: true, newPrimaryId: target._id };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

module.exports = { switchPrimaryAdmin };
