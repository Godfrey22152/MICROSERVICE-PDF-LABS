const mongoose = require("mongoose");

// FIX: Added voiceLabel and speedLabel fields which were missing from the
// original schema. Without these, Mongoose silently strips them on save,
// causing the audiobook card to always show "Default Voice / Normal"
// regardless of what the user selected.
const ProcessedAudioSchema = new mongoose.Schema(
  {
    fileId:        { type: String, required: true, unique: true },
    filename:      { type: String, required: true },
    sanitizedName: { type: String, required: true },
    audioFile:     { type: String, required: true },
    previewUrl:    { type: String, required: true },
    downloadUrl:   { type: String, required: true },
    userId:        { type: String, required: true },

    // Raw selected values (used for re-selecting in the UI if needed)
    voice:         { type: String, default: "en-US-AriaNeural" },
    speed:         { type: String, default: "1.0" },

    // Human-readable labels displayed on the audiobook card
    voiceLabel:    { type: String, default: "Aria (US, Female)" },
    speedLabel:    { type: String, default: "Normal (1.0x)" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProcessedAudio", ProcessedAudioSchema);
