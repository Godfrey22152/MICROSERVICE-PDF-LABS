const mongoose = require("mongoose");

const compressedFileSchema = new mongoose.Schema({
  fileId:         { type: String, required: true, unique: true },
  originalName:   { type: String, required: true },
  sanitizedName:  { type: String, required: true },
  compressionLevel: { type: String, required: true },
  originalSize:   { type: Number, required: true },
  compressedSize: { type: Number, required: true },
  savedBytes:     { type: Number, required: true },
  savedPercent:   { type: Number, required: true },
  downloadUrl:    { type: String, required: true },
  filename:       { type: String, required: true },
  createdAt:      { type: Date, default: Date.now },
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

compressedFileSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("CompressedFile", compressedFileSchema);
