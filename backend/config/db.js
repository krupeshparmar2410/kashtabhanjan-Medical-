const mongoose = require('mongoose');

const connectDB = async () => {
  const localURI = 'mongodb://127.0.0.1:27017/medical_shop';
  try {
    console.log('Attempting to connect to MongoDB Atlas...');
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000 // Timeout fast if IP is blocked
    });
    console.log(`MongoDB Connected (Atlas): ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Atlas connection error: ${error.message}`);
    console.log('Falling back to local MongoDB instance...');
    try {
      const conn = await mongoose.connect(localURI);
      console.log(`MongoDB Connected (Local Fallback): ${conn.connection.host}`);
    } catch (localError) {
      console.error(`Local MongoDB connection failed: ${localError.message}`);
      console.error('Database connection failed completely. Please make sure MongoDB is running.');
      process.exit(1);
    }
  }
};

module.exports = connectDB;
