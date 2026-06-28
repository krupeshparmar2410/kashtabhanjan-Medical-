const os = require('os');

const getWindowsMetrics = () => {
  const uptimeSeconds = os.uptime();
  const uptimeDays = uptimeSeconds / (24 * 60 * 60);
  const platform = os.platform();
  const release = os.release();

  return {
    osPlatform: platform,
    osRelease: release,
    windowsUptimeDays: Math.round(uptimeDays * 10) / 10,
    rebootSuggested: uptimeDays > 30
  };
};

module.exports = { getWindowsMetrics };
