const mongoose = require("mongoose");

const convertedFileSchema = new mongoose.Schema({
  fileId:        { type: String, required: true, unique: true },
  originalName:  { type: String, required: true },
  sanitizedName: { type: String, required: true },
  originalSize:  { type: Number, required: true },
  convertedSize: { type: Number, required: true },
  pageCount:     { type: Number, default: 0 },
  conversionMode:{ type: String, required: true }, // 'standard' | 'ocr'
  downloadUrl:   { type: String, required: true },
  filename:      { type: String, required: true },
  createdAt:     { type: Date, default: Date.now },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

convertedFileSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("ConvertedFile", convertedFileSchema);
