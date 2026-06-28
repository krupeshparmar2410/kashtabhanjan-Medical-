const Alert = require('../models/Alert');

const triggerAlert = async (module, severity, message) => {
  // Prevent duplication of unacknowledged alerts
  const existing = await Alert.findOne({ module, severity, message, isAcknowledged: false });
  if (existing) return existing;

  // Cooldown Protection for Acknowledged Warnings and Critical Alerts (12 Hours)
  const recentAcknowledge = await Alert.findOne({
    module,
    message,
    severity,
    isAcknowledged: true,
    acknowledgedAt: { $gt: new Date(Date.now() - 12 * 60 * 60 * 1000) }
  });
  if (recentAcknowledge) return recentAcknowledge;

  const alert = new Alert({ module, severity, message });
  await alert.save();
  return alert;
};

module.exports = { triggerAlert };
