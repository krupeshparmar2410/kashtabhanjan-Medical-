const mongoose = require('mongoose');
const { setTransactionSupport } = require('./TransactionManager');
const logger = require('./logger');

const connectDB = async () => {
  const atlasURI = process.env.MONGO_URI;
  const localURI = 'mongodb://127.0.0.1:27017/medical_shop?replicaSet=rs0';

  let connected = false;
  let dbType = 'Local';
  let replicaSet = 'standalone';
  let transactionSupport = false;

  const mongooseOptions = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000
  };

  // 1. Try to connect to Atlas if provided
  if (atlasURI) {
    let delay = 1000;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger.info(`Attempting to connect to MongoDB Atlas (Attempt ${attempt}/3)...`);
        await mongoose.connect(atlasURI, mongooseOptions);
        logger.info('MongoDB Connected (Atlas) successfully.');
        connected = true;
        dbType = 'Atlas';
        break;
      } catch (err) {
        let reason = 'Unknown network error';
        if (err.code === 'ENOTFOUND' || err.message.includes('ENOTFOUND')) {
          reason = 'DNS Failure - Hostname could not be resolved. Check internet connection.';
        } else if (err.name === 'MongooseServerSelectionError' || err.message.includes('Server selection timed out')) {
          reason = 'IP Whitelist issue or network timeout. Verify your Atlas IP access list.';
        } else if (err.message.includes('Authentication failed') || err.message.includes('auth failed')) {
          reason = 'Authentication failure - Invalid credentials in MONGO_URI.';
        } else {
          reason = err.message;
        }
        logger.error(`MongoDB Atlas connection attempt ${attempt} failed: ${reason}`);

        if (attempt < 3) {
          logger.info(`Retrying Atlas connection in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        }
      }
    }
  }

  // 2. Fall back to local MongoDB if Atlas fails or is not configured
  if (!connected) {
    logger.info('Falling back to local MongoDB instance...');
    let localDelay = 2000;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger.info(`Attempting to connect to Local MongoDB (Attempt ${attempt}/3)...`);
        await mongoose.connect(localURI, mongooseOptions);
        logger.info('MongoDB Connected (Local Fallback) successfully.');
        connected = true;
        dbType = 'Local';
        break;
      } catch (localError) {
        logger.error(`Local MongoDB connection attempt ${attempt} failed: ${localError.message}`);
        if (attempt < 3) {
          logger.info(`Retrying Local MongoDB connection in ${localDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, localDelay));
        } else {
          logger.error('CRITICAL: Database connection failed completely. Please make sure local MongoDB service is running.');
          throw new Error('Database connection failed completely.');
        }
      }
    }
  }

  // 3. Replica Set Auto-Detection
  try {
    const admin = mongoose.connection.db.admin();
    const status = await admin.command({ hello: 1 });
    const isAtlas = mongoose.connection.host && mongoose.connection.host.includes('mongodb.net');

    if (status.setName) {
      replicaSet = isAtlas ? 'atlas' : 'localReplicaSet';
      transactionSupport = true;
    } else if (isAtlas) {
      // Atlas clusters are always replica sets behind the scenes
      replicaSet = 'atlas';
      transactionSupport = true;
    } else {
      replicaSet = 'standalone';
      transactionSupport = false;
    }
  } catch (err) {
    // If command fails, check if we are on Atlas
    const isAtlas = mongoose.connection.host && mongoose.connection.host.includes('mongodb.net');
    if (isAtlas) {
      replicaSet = 'atlas';
      transactionSupport = true;
    } else {
      replicaSet = 'standalone';
      transactionSupport = false;
      logger.warn(`Could not verify replica set status: ${err.message}. Running in standalone mode.`);
    }
  }

  // Update TransactionManager
  setTransactionSupport(transactionSupport, dbType, replicaSet);

  // Render startup report
  console.log('\n=================================');
  console.log('SYSTEM STARTUP REPORT');
  console.log('=================================');
  console.log(`MongoDB Status: Connected`);
  console.log(`Database Type: ${dbType}`);
  console.log(`Replica Set: ${replicaSet !== 'standalone' ? 'Enabled (' + replicaSet + ')' : 'Disabled'}`);
  console.log(`Transaction Support: ${transactionSupport ? 'Enabled' : 'Disabled'}`);
  console.log(`Health Check: Pending`);
  console.log(`Server Port: ${process.env.PORT || 5000}`);
  console.log('=================================\n');
};

module.exports = connectDB;

