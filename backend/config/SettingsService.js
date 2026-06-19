const Settings = require('../models/Settings');

let settingsCache = {};

const defaultSettings = [
  { key: 'LOYALTY_EARN_RATE', value: 100, description: 'Purchase amount in ₹ required to earn 1 loyalty point (e.g. 1 point per ₹100)' },
  { key: 'LOYALTY_REDEMPTION_RATE', value: 1, description: 'Monetary value in ₹ of 1 loyalty point when redeemed' },
  { key: 'CREDIT_LIMIT_DEFAULT', value: 5000, description: 'Default outstanding credit limit allowed for new registered customers' },
  { key: 'INVOICE_PREFIX', value: 'INV', description: 'Prefix for sales invoice numbers' },
  { key: 'RETURN_PREFIX', value: 'SRN', description: 'Prefix for sales return invoice numbers' },
  { key: 'PAYMENT_PREFIX', value: 'CPM', description: 'Prefix for customer credit payment receipt numbers' },
  { key: 'RECALL_PREFIX', value: 'REC', description: 'Prefix for medicine recall transaction logs' },
  { key: 'LOW_STOCK_THRESHOLD', value: 10, description: 'Stock quantity limit below which low stock warnings are flagged' },
  { key: 'NEAR_EXPIRY_DAYS', value: 90, description: 'Warning boundary period in days for batch expiry warnings' },
  { key: 'INVOICE_FOOTER', value: 'Thank you for choosing Kashtbhanjan Medical!', description: 'Terms or greeting message printed at the bottom of customer invoices' },
  { key: 'GST_SETTINGS', value: 'inclusive', description: 'Billing style setting: inclusive or exclusive' },
  { key: 'CASH_CLOSING_RULES', value: { openingCashDefault: 2000 }, description: 'Counter drawers guidelines, such as default daily starting cash float' },
  { key: 'BACKUP_RETENTION_DAYS', value: 30, description: 'Number of days to keep database backup JSON files on disk' },
  { key: 'ARCHIVE_RETENTION_DAYS', value: 365, description: 'Number of days to keep archived transaction documents before permanent purge' },
  { key: 'LOG_RETENTION_DAYS', value: 90, description: 'Number of days to keep system audit logs and failed transaction logs' },
  { key: 'REFILL_REMINDER_DAYS', value: 3, description: 'Configurable setting for number of days before medicine stock runs out to trigger refill reminders' },
  { key: 'REFILL_DUPLICATE_PREVENTION_DAYS', value: 30, description: 'Number of days to check for preventing duplicate refill reminders for the same medicine' }
];

const initializeSettings = async () => {
  try {
    for (const def of defaultSettings) {
      const exists = await Settings.findOne({ key: def.key });
      if (!exists) {
        await Settings.create(def);
      }
    }
    await reloadCache();
    console.log('System configuration settings initialized and cached.');
  } catch (err) {
    console.error('Failed to initialize settings service:', err);
  }
};

const reloadCache = async () => {
  const all = await Settings.find();
  const newCache = {};
  all.forEach((item) => {
    newCache[item.key] = item.value;
  });
  settingsCache = newCache;
};

const getSetting = (key, fallback = null) => {
  if (settingsCache[key] !== undefined) {
    return settingsCache[key];
  }
  const def = defaultSettings.find(d => d.key === key);
  return def ? def.value : fallback;
};

const updateSetting = async (key, value) => {
  await Settings.findOneAndUpdate({ key }, { value }, { new: true, upsert: true });
  await reloadCache();
  return value;
};

module.exports = {
  initializeSettings,
  getSetting,
  updateSetting,
  reloadCache
};
