const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set in environment variables");
    process.exit(1);
  }
  try {
    await mongoose.connect(uri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB connected (PDF-to-word-service)");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
  mongoose.connection.on("disconnected", () => console.warn("MongoDB disconnected"));
  mongoose.connection.on("error", (err) => console.error("MongoDB runtime error:", err));
};

module.exports = connectDB;
