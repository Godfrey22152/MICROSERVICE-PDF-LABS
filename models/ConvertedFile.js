const mongoose = require("mongoose");

const ConvertedFileSchema = new mongoose.Schema({
  fileId:        { type: String, required: true, unique: true },
  originalName:  { type: String, required: true },
  sanitizedName: { type: String },
  originalSize:  { type: Number, default: 0 },
  convertedSize: { type: Number, default: 0 },
  operation:     { type: String, enum: ["pdfToExcel", "excelToPdf"], required: true },
  operationLabel:{ type: String },
  downloadUrl:   { type: String },
  filename:      { type: String },
  createdAt:     { type: Date, default: Date.now },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("ConvertedFile", ConvertedFileSchema);
