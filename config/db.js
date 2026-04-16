// config/db.js
const mongoose = require('mongoose');
const config = require('config');

const connectDB = async () => {
  const uri = process.env.MONGO_URI || config.get('db.uri');

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected (account-service)');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
