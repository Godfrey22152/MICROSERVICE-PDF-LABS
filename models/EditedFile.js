const mongoose = require("mongoose");

const splitPageSchema = new mongoose.Schema({
  index:       { type: Number },
  filename:    { type: String },
  downloadUrl: { type: String },
  size:        { type: Number },
}, { _id: false });

const editedFileSchema = new mongoose.Schema({
  fileId:         { type: String, required: true, unique: true },
  originalName:   { type: String, required: true },
  sanitizedName:  { type: String, required: true },
  originalSize:   { type: Number, required: true },
  editedSize:     { type: Number, required: true },
  operation:      { type: String, required: true },
  operationLabel: { type: String, required: true },
  downloadUrl:    { type: String, required: true },
  filename:       { type: String, required: true },
  isSplit:        { type: Boolean, default: false },
  splitPages:     { type: [splitPageSchema], default: [] },
  createdAt:      { type: Date, default: Date.now },
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

editedFileSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model("EditedFile", editedFileSchema);
