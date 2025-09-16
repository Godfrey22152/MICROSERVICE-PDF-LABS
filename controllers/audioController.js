const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { handleExecError } = require("../utils/errorHandler");
const { sanitizeFilename } = require("../utils/fileUtils");
const ProcessedAudio = require("../models/ProcessedAudio");

// Map form voices to gTTS tld (accent hint)
const voiceConfig = {
  "us": { tld: "com", label: "English (US)" },
  "uk": { tld: "co.uk", label: "English (UK)" },
  "au": { tld: "com.au", label: "English (Australia)" },
  "ca": { tld: "ca", label: "English (Canada)" }
};

// Map speed selection to ffmpeg atempo factors
const speedConfig = {
  "0.75": { atempo: 0.75, label: "Slow (0.75x)" },
  "1.0": { atempo: 1.0, label: "Normal (1.0x)" },
  "1.5": { atempo: 1.5, label: "Fast (1.5x)" }
};

const renderPdfToAudioPage = async (req, res) => {
  try {
    const files = await ProcessedAudio.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.render("pdf-to-audio", { locals: { processedFiles: files, token: req.query.token } });
  } catch (err) {
    console.error("Error fetching processed files:", err);
    res.render("pdf-to-audio", { locals: { processedFiles: [], token: req.query.token } });
  }
};

const convertPdfToAudio = async (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded.");

  const { voice, speed } = req.body || {};
  console.log(`Received voice: ${voice}, speed: ${speed}`);

  // Validate and set defaults
  const selectedVoice = voice && voiceConfig[voice] ? voice : "us";
  const selectedSpeed = speed && speedConfig[speed] ? speed : "1.0";
  
  const voiceInfo = voiceConfig[selectedVoice];
  const speedInfo = speedConfig[selectedSpeed];
  
  console.log(`Using voice: ${selectedVoice} (${voiceInfo.label}), speed: ${selectedSpeed} (${speedInfo.label})`);

  const pdfPath = req.file.path;
  const fileId = uuidv4();
  const outDir = path.join(__dirname, "..", "outputs", fileId);
  fs.mkdirSync(outDir, { recursive: true });

  const sanitizedName = sanitizeFilename(req.file.originalname);
  const textPath = path.join(outDir, `${sanitizedName}.txt`);
  const tmpMp3 = path.join(outDir, `${sanitizedName}.tmp.mp3`);
  const finalMp3 = path.join(outDir, `${sanitizedName}.mp3`);

  const txtCmd = `pdftotext "${pdfPath}" "${textPath}"`;

  exec(txtCmd, (err) => {
    if (err) {
      console.error("pdftotext failed:", err);
      return handleExecError(err, "Failed to extract text from PDF.", res);
    }

    // Generate MP3 with gTTS using the selected accent
    const gttsCmd = `gtts-cli -f "${textPath}" -o "${tmpMp3}" --lang en --tld ${voiceInfo.tld}`;
    console.log("Running gTTS command:", gttsCmd);

    exec(gttsCmd, (gErr) => {
      // Clean up temporary files
      fs.unlink(pdfPath, () => {});
      fs.unlink(textPath, () => {});

      if (gErr) {
        console.error("gtts-cli failed:", gErr);
        return handleExecError(gErr, "Failed to generate speech with gTTS.", res);
      }

      // Apply speed adjustment if needed
      const atempo = speedInfo.atempo;
      if (atempo === 1.0) {
        // No speed change needed, move tmp to final
        fs.rename(tmpMp3, finalMp3, async (renameErr) => {
          if (renameErr) {
            console.error("Failed to move temp mp3:", renameErr);
            return handleExecError(renameErr, "Failed preparing audio file.", res);
          }
          await saveEntry();
        });
      } else {
        // Use ffmpeg to adjust tempo
        // Ensure atempo value is within valid range (0.5-2.0)
        const validAtempo = Math.max(0.5, Math.min(2.0, atempo));
        const ffCmd = `ffmpeg -y -i "${tmpMp3}" -filter:a "atempo=${validAtempo}" -ar 44100 -ac 2 -b:a 192k "${finalMp3}"`;
        console.log("Running FFmpeg command:", ffCmd);
        
        exec(ffCmd, async (ffErr) => {
          // Remove tmp file regardless of success/failure
          fs.unlink(tmpMp3, () => {});

          if (ffErr) {
            console.error("ffmpeg atempo failed:", ffErr);
            return handleExecError(ffErr, "Failed to process audio speed.", res);
          }
          await saveEntry();
        });
      }

      async function saveEntry() {
        const payload = {
          fileId,
          filename: req.file.originalname,
          sanitizedName,
          audioFile: `${sanitizedName}.mp3`,
          previewUrl: `/tools/pdf-to-audio/view/${fileId}?file=${encodeURIComponent(sanitizedName)}.mp3`,
          downloadUrl: `/tools/pdf-to-audio/download/${fileId}?file=${encodeURIComponent(sanitizedName)}.mp3`,
          userId: req.user.id,
          // Store both the raw values and the human-readable labels
          voice: selectedVoice,
          voiceLabel: voiceInfo.label,
          speed: selectedSpeed,
          speedLabel: speedInfo.label
        };

        try {
          const dbEntry = new ProcessedAudio(payload);
          await dbEntry.save();
          console.log(`Audio conversion completed: ${voiceInfo.label} at ${speedInfo.label}`);

          if (req.xhr || (req.headers.accept && req.headers.accept.includes("json"))) {
            return res.json(dbEntry);
          }
          res.redirect(`/tools/pdf-to-audio?token=${req.query.token}`);
        } catch (dbErr) {
          console.error("Error saving processed audio:", dbErr);
          return res.status(500).send("Error saving file metadata.");
        }
      }
    });
  });
};

const serveAudio = async (req, res) => {
  try {
    const file = await ProcessedAudio.findOne({ fileId: req.params.id });
    if (!file) return res.status(404).send("File not found.");
    const audioPath = path.join(__dirname, "..", "outputs", req.params.id, file.audioFile);
    
    // Check if file exists
    if (!fs.existsSync(audioPath)) {
      return res.status(404).send("Audio file not found.");
    }
    
    res.sendFile(audioPath);
  } catch (error) {
    console.error("serveAudio error:", error);
    res.status(500).send("Server error");
  }
};

const downloadAudio = async (req, res) => {
  try {
    const file = await ProcessedAudio.findOne({ fileId: req.params.id });
    if (!file) return res.status(404).send("File not found.");

    const audioPath = path.join(__dirname, "..", "outputs", req.params.id, file.audioFile);
    // Check if file exists
    if (!fs.existsSync(audioPath)) {
      return res.status(404).send("Audio file not found.");
    }

    // Always use the stored audioFile name (File_Name.mp3)
    res.download(audioPath, file.audioFile);
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).send("Server error during file download.");
  }
};

const deleteProcessedFile = async (req, res) => {
  try {
    const file = await ProcessedAudio.findOne({ fileId: req.params.id, userId: req.user.id });
    if (!file) return res.status(404).send("File not found or you don't have permission.");

    const fileDir = path.join(__dirname, "..", "outputs", req.params.id);
    fs.rm(fileDir, { recursive: true, force: true }, async (err) => {
      if (err) {
        console.error("Error deleting file directory:", err);
        return res.status(500).send("Error deleting file.");
      }
      
      try {
        await ProcessedAudio.deleteOne({ _id: file._id });
        res.status(200).send("File deleted successfully.");
      } catch (dbErr) {
        console.error("Error deleting from database:", dbErr);
        res.status(500).send("File deleted but database cleanup failed.");
      }
    });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).send("Server error while deleting file.");
  }
};

module.exports = {
  renderPdfToAudioPage,
  convertPdfToAudio,
  serveAudio,
  downloadAudio,
  deleteProcessedFile,
};
