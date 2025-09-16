const mongoose = require("mongoose");

const processedAudioSchema = new mongoose.Schema({
  fileId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  filename: {
    type: String,
    required: true,
  },
  sanitizedName: {
    type: String,
    required: true,
  },
  audioFile: {
    type: String,
    required: true,
  },
  previewUrl: {
    type: String,
    required: true,
  },
  downloadUrl: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("ProcessedAudio", processedAudioSchema);
