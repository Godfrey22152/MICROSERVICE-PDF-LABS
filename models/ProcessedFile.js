// models/ProcessedFile.js
const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema({
  page: { type: Number, required: true },
  filename: { type: String, required: true },
  previewUrl: { type: String, required: true },
  downloadUrl: { type: String, required: true },
});

const processedFileSchema = new mongoose.Schema({
  fileId: { type: String, required: true, unique: true },
  filename: { type: String, required: true }, // original filename
  sanitizedName: { type: String, required: true },
  format: { type: String, required: true },
  totalPages: { type: Number, required: true },
  images: [imageSchema],
  createdAt: { type: Date, default: Date.now },
  userId: { type: String, required: true },
});

// Create an index to quickly find by user and date
processedFileSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("ProcessedPdfFile", processedFileSchema);
