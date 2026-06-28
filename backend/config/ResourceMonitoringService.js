const os = require('os');

let lastCPUTimes = null;

const getCPUUsage = () => {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) return 0;

  let totalDiff = 0;
  let idleDiff = 0;
  
  const currentTimes = cpus.map(cpu => {
    const times = cpu.times;
    const total = Object.values(times).reduce((acc, t) => acc + t, 0);
    return { total, idle: times.idle };
  });

  if (lastCPUTimes && lastCPUTimes.length === cpus.length) {
    for (let i = 0; i < cpus.length; i++) {
      totalDiff += currentTimes[i].total - lastCPUTimes[i].total;
      idleDiff += currentTimes[i].idle - lastCPUTimes[i].idle;
    }
  }

  lastCPUTimes = currentTimes;
  if (totalDiff === 0) return 0;
  return Math.round((1 - idleDiff / totalDiff) * 100);
};

const getResourceMetrics = () => {
  const memoryUsage = process.memoryUsage();
  const heapUsed = memoryUsage.heapUsed / (1024 * 1024); // MB
  const totalSystemMem = os.totalmem() / (1024 * 1024 * 1024); // GB
  const freeSystemMem = os.freemem() / (1024 * 1024 * 1024); // GB
  const systemMemUsedPercent = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;

  const cpuUsage = getCPUUsage();
  const cpus = os.cpus();
  const coreCount = cpus.length;

  let status = 'Healthy';
  if (heapUsed > 1000 || cpuUsage > 90) {
    status = 'Critical';
  } else if (heapUsed > 750 || cpuUsage > 75 || systemMemUsedPercent > 90) {
    // System memory warning only (never Critical on its own to prevent false alarms due to Win RAM caching)
    status = 'Warning';
  }

  return {
    status,
    nodeHeapUsedMB: Math.round(heapUsed * 100) / 100,
    systemMemoryFreeGB: Math.round(freeSystemMem * 100) / 100,
    systemMemoryTotalGB: Math.round(totalSystemMem * 100) / 100,
    systemMemoryUsedPercent: Math.round(systemMemUsedPercent * 100) / 100,
    cpuUsagePercent: cpuUsage,
    cpuCores: coreCount
  };
};

module.exports = { getResourceMetrics };
