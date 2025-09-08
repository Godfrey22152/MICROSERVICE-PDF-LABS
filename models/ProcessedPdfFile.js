// Model for Image -> PDF conversions

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProcessedPdfFileSchema = new Schema({
  userId: {
    type: String,
    required: true,
  },
  format: {
    type: String,
    required: true,
    default: 'pdf',
  },
  // optional metadata
  sourceFilename: {
    type: String,
  },
  outputFilename: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('ProcessedPdfFile', ProcessedPdfFileSchema);
