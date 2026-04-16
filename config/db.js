// config/db.js
const mongoose = require('mongoose');
const config = require('config');

const connectDB = async () => {
  const uri = process.env.MONGO_URI || config.get('db.uri');

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected (profile-service)');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

const connectToDb = (dbName) => {
  const uri = process.env.MONGO_URI || config.get('db.uri');
  const baseUri = uri.substring(0, uri.lastIndexOf('/') + 1);
  return mongoose.createConnection(baseUri + dbName);
};

module.exports = { connectDB, connectToDb };
