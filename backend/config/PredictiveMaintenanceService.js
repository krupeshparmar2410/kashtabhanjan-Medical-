const fs = require('fs');
const path = require('path');
const DatabaseMetricsSnapshot = require('../models/DatabaseMetricsSnapshot');
const mongoose = require('mongoose');

const predictStorageExhaustion = async () => {
  // Query up to 30 days of actual database growth snapshots
  const snapshots = await DatabaseMetricsSnapshot.find().sort({ createdAt: -1 }).limit(30);
  
  if (snapshots.length < 3) {
    return {
      forecastOk: false,
      reason: 'Insufficient database metrics snapshot history points for forecasting'
    };
  }

  // Calculate daily data size growth velocity using linear trend
  // Sort chronological: oldest to newest
  const sorted = [...snapshots].reverse();
  const n = sorted.length;
  
  let sumX = 0; // Cumulative days elapsed
  let sumY = 0; // Sizes
  let sumXY = 0;
  let sumXX = 0;
  
  const startTime = new Date(sorted[0].createdAt).getTime();

  for (let i = 0; i < n; i++) {
    const daysElapsed = (new Date(sorted[i].createdAt).getTime() - startTime) / (1000 * 60 * 60 * 24);
    const size = sorted[i].dataSizeMB;
    
    sumX += daysElapsed;
    sumY += size;
    sumXY += daysElapsed * size;
    sumXX += daysElapsed * daysElapsed;
  }

  // Linear Regression Slope (m) in MB per day
  const denominator = (n * sumXX - sumX * sumX);
  const avgDailyGrowthMB = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;

  // Resolve storage path and free disk space
  const storagePath = path.join(__dirname, '../../storage');
  const stats = fs.statfsSync(storagePath);
  const freeBytes = stats.bavail * stats.bsize;
  const freeMB = freeBytes / (1024 * 1024);

  // If we have custom MONGO_DATA_PATH on another drive volume, combine capacity checks
  let finalFreeMB = freeMB;
  const dbPath = process.env.MONGO_DATA_PATH;
  if (dbPath && fs.existsSync(dbPath)) {
    const dbDriveStats = fs.statfsSync(dbPath);
    const dbFreeMB = (dbDriveStats.bavail * dbDriveStats.bsize) / (1024 * 1024);
    finalFreeMB = Math.min(freeMB, dbFreeMB);
  }

  const estimatedGrowthNext30Days = avgDailyGrowthMB * 30;
  const estimatedDaysToExhaust = avgDailyGrowthMB > 0 ? (finalFreeMB / avgDailyGrowthMB) : 9999;
  
  let riskSeverity = 'Info';
  if (estimatedDaysToExhaust < 30) {
    riskSeverity = 'Critical';
  } else if (estimatedDaysToExhaust < 60) {
    riskSeverity = 'Warning';
  }

  return {
    forecastOk: true,
    avgDailyGrowthMB: Math.round(avgDailyGrowthMB * 100) / 100,
    estimatedGrowthNext30Days: Math.round(estimatedGrowthNext30Days * 100) / 100,
    estimatedDaysToDiskExhaustion: Math.round(estimatedDaysToExhaust),
    riskSeverity,
    currentDbSizeMB: sorted[n - 1].dataSizeMB,
    freeDiskSpaceMB: Math.round(finalFreeMB * 100) / 100
  };
};

module.exports = { predictStorageExhaustion };
