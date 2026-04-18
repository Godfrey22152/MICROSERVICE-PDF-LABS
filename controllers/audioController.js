const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const { handleExecError } = require("../utils/errorHandler");
const { sanitizeFilename } = require("../utils/fileUtils");
const ProcessedAudio = require("../models/ProcessedAudio");

// ---------------------------------------------------------------------------
// Voice catalogue — curated high-quality Edge TTS neural voices.
// ---------------------------------------------------------------------------
const voiceConfig = {
  // English
  "en-US-AriaNeural":      { label: "Aria (US, Female)",       locale: "en-US" },
  "en-US-GuyNeural":       { label: "Guy (US, Male)",          locale: "en-US" },
  "en-US-JennyNeural":     { label: "Jenny (US, Female)",      locale: "en-US" },
  "en-US-AnaNeural":       { label: "Ana (US, Female)",        locale: "en-US" },
  "en-US-AndrewMultilingualNeural": { label: "Andrew (US, Male)",    locale: "en-US" },
  "en-US-EmmaMultilingualNeural":   { label: "Emma (US, Female)",    locale: "en-US" },
  "en-US-BrianMultilingualNeural":  { label: "Brian (US, Male)",     locale: "en-US" },
  "en-GB-LibbyNeural":     { label: "Libby (UK, Female)",      locale: "en-GB" },
  "en-GB-RyanNeural":      { label: "Ryan (UK, Male)",         locale: "en-GB" },
  "en-GB-MaisieNeural":    { label: "Maisie (UK, Female)",     locale: "en-GB" },
  "en-GB-ThomasNeural":    { label: "Thomas (UK, Male)",       locale: "en-GB" },
  "en-AU-NatashaNeural":   { label: "Natasha (AU, Female)",    locale: "en-AU" },
  "en-AU-WilliamNeural":   { label: "William (AU, Male)",      locale: "en-AU" },
  "en-CA-ClaraNeural":     { label: "Clara (CA, Female)",      locale: "en-CA" },
  "en-CA-LiamNeural":      { label: "Liam (CA, Male)",         locale: "en-CA" },
  "en-IN-NeerjaNeural":    { label: "Neerja (IN, Female)",     locale: "en-IN" },
  "en-IN-PrabhatNeural":   { label: "Prabhat (IN, Male)",      locale: "en-IN" },
  "en-NG-AbeoNeural":      { label: "Abeo (Nigeria, Male)",    locale: "en-NG" },
  "en-NG-EzinneNeural":    { label: "Ezinne (Nigeria, Female)", locale: "en-NG" },
  // Spanish
  "es-ES-ElviraNeural":    { label: "Elvira (ES, Female)",     locale: "es-ES" },
  "es-MX-DaliaNeural":     { label: "Dalia (MX, Female)",      locale: "es-MX" },
  // French
  "fr-FR-DeniseNeural":    { label: "Denise (FR, Female)",     locale: "fr-FR" },
  "fr-FR-HenriNeural":     { label: "Henri (FR, Male)",        locale: "fr-FR" },
  // German
  "de-DE-KatjaNeural":     { label: "Katja (DE, Female)",      locale: "de-DE" },
  "de-DE-ConradNeural":    { label: "Conrad (DE, Male)",       locale: "de-DE" },
  // Portuguese
  "pt-BR-FranciscaNeural": { label: "Francisca (BR, Female)",  locale: "pt-BR" },
  "pt-PT-FernandaNeural":  { label: "Fernanda (PT, Female)",   locale: "pt-PT" },
  // Arabic
  "ar-SA-ZariyahNeural":   { label: "Zariyah (SA, Female)",    locale: "ar-SA" },
  // Chinese
  "zh-CN-XiaoxiaoNeural":  { label: "Xiaoxiao (CN, Female)",   locale: "zh-CN" },
  "zh-CN-YunxiNeural":     { label: "Yunxi (CN, Male)",        locale: "zh-CN" },
  // Japanese
  "ja-JP-NanamiNeural":    { label: "Nanami (JP, Female)",     locale: "ja-JP" },
  // Korean
  "ko-KR-SunHiNeural":     { label: "Sun-Hi (KR, Female)",     locale: "ko-KR" },
  // Hindi
  "hi-IN-SwaraNeural":     { label: "Swara (IN, Female)",      locale: "hi-IN" },
};

const DEFAULT_VOICE = "en-US-AriaNeural";

// ---------------------------------------------------------------------------
// Speed config
// ---------------------------------------------------------------------------
const speedConfig = {
  "0.75": { rate: "-25%", label: "Slow (0.75x)"  },
  "1.0":  { rate: "-10%",   label: "Normal (1.0x)" },
  "1.5":  { rate: "+50%", label: "Fast (1.5x)"   },
};

const DEFAULT_SPEED = "1.0";

// Edge TTS synthesis timeout per chunk (120 seconds)
const TTS_CHUNK_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Chunk text on sentence boundaries. Hard-splits any single sentence that
 * still exceeds maxLen (e.g. very long sentences without punctuation).
 */
function chunkText(text, maxLen = 2000) {
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    // Hard-split oversized individual sentences
    if (sentence.length > maxLen) {
      if (current.trim()) { chunks.push(current.trim()); current = ""; }
      for (let i = 0; i < sentence.length; i += maxLen) {
        chunks.push(sentence.slice(i, i + maxLen).trim());
      }
      continue;
    }
    if ((current + sentence).length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}

/**
 * Synthesise one chunk with a timeout guard. Rejects if Edge TTS takes
 * longer than TTS_CHUNK_TIMEOUT_MS, preventing indefinite hangs.
 */
function synthesiseChunkWithTimeout(tts, text, outDir, index, prosody) {
  const chunkPath = path.join(outDir, `chunk_${index}.mp3`);

  const synthesisPromise = tts
    .toFile(outDir, text, prosody)
    .then(({ audioFilePath }) => {
      fs.renameSync(audioFilePath, chunkPath);
      return chunkPath;
    });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`TTS timeout on chunk ${index} after ${TTS_CHUNK_TIMEOUT_MS / 1000}s`)),
      TTS_CHUNK_TIMEOUT_MS
    )
  );

  return Promise.race([synthesisPromise, timeoutPromise]);
}

/**
 * Binary-concat MP3 files using Node.js streams.
 * Safe for CBR MP3 with identical encoding params (which Edge TTS guarantees).
 * Eliminates the ffmpeg dependency entirely.
 */
function concatMp3Pure(chunkPaths, outputPath) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(outputPath);
    writeStream.on("error", reject);
    writeStream.on("finish", resolve);

    (async () => {
      for (const chunkPath of chunkPaths) {
        await new Promise((res, rej) => {
          const rs = fs.createReadStream(chunkPath);
          rs.on("error", rej);
          rs.on("end", res);
          rs.pipe(writeStream, { end: false });
        });
        fs.unlink(chunkPath, () => {});
      }
      writeStream.end();
    })().catch(reject);
  });
}

/**
 * Safely remove an output directory on failure to prevent disk leaks.
 */
function cleanupOutputDir(outDir) {
  fs.rm(outDir, { recursive: true, force: true }, (err) => {
    if (err) console.error(`Failed to clean up output dir ${outDir}:`, err);
  });
}

/**
 * Format bytes to a human-readable string.
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const renderPdfToAudioPage = async (req, res) => {
  try {
    const files = await ProcessedAudio.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.render("pdf-to-audio", {
      locals: { processedFiles: files, token: req.query.token, voiceConfig },
    });
  } catch (err) {
    console.error("Error fetching processed files:", err);
    res.render("pdf-to-audio", {
      locals: { processedFiles: [], token: req.query.token, voiceConfig },
    });
  }
};

const convertPdfToAudio = async (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded.");

  const voiceRaw = (req.body && req.body.voice) ? req.body.voice.trim() : DEFAULT_VOICE;
  const speedRaw = (req.body && req.body.speed) ? req.body.speed.trim() : DEFAULT_SPEED;

  const selectedVoice = voiceConfig[voiceRaw] ? voiceRaw : DEFAULT_VOICE;
  const selectedSpeed = speedConfig[speedRaw] ? speedRaw : DEFAULT_SPEED;

  const voiceInfo = voiceConfig[selectedVoice];
  const speedInfo = speedConfig[selectedSpeed];

  console.log(`Voice: ${selectedVoice} (${voiceInfo.label}), Speed: ${selectedSpeed} (${speedInfo.label})`);

  const pdfPath       = req.file.path;
  const fileId        = uuidv4();
  const outDir        = path.join(__dirname, "..", "outputs", fileId);
  fs.mkdirSync(outDir, { recursive: true });

  const sanitizedName = sanitizeFilename(req.file.originalname);
  const textPath      = path.join(outDir, `${sanitizedName}.txt`);
  const finalMp3      = path.join(outDir, `${sanitizedName}.mp3`);

  // Step 1 — Extract text from PDF
  exec(`pdftotext "${pdfPath}" "${textPath}"`, async (err) => {
    fs.unlink(pdfPath, () => {});

    if (err) {
      console.error("pdftotext failed:", err);
      cleanupOutputDir(outDir);
      return handleExecError(err, "Failed to extract text from PDF.", res);
    }

    let rawText;
    try {
      rawText = fs.readFileSync(textPath, "utf8").trim();
      fs.unlink(textPath, () => {});
    } catch (readErr) {
      cleanupOutputDir(outDir);
      return res.status(500).send("Failed to read extracted text from PDF.");
    }

    if (!rawText) {
      cleanupOutputDir(outDir);
      return res.status(422).send(
        "The PDF contains no extractable text. It may be a scanned image-only PDF."
      );
    }

    // --- Text normalization for natural TTS output ---
    //
    // pdftotext preserves the PDF visual layout: every line becomes its own
    // line separated by \n or \n\n. This causes Edge TTS to insert unnatural
    // pauses and voice breaks at every line boundary, even mid-sentence.
    //
    // Pipeline:
    //   A. Normalize line endings (\r\n, \r -> \n)
    //   B. Remove form-feed (\f) page-break characters from pdftotext
    //   C. Collapse 3+ consecutive newlines to 2
    //   D. Rejoin soft-wrapped lines: a line ending in a letter or comma
    //      followed by \n\n and a lowercase letter is a mid-sentence wrap —
    //      join it with a space instead of treating it as a paragraph break
    //   E. Collapse all remaining newlines to spaces
    //      (TTS needs clean prose, not PDF layout)
    //   F. Add a period after ALL-CAPS headings so TTS pauses naturally
    //      e.g. "PERSONAL STATEMENT How do..." -> "PERSONAL STATEMENT. How..."
    //   G. Escape XML/SSML special characters — & < > and smart quotes —
    //      which break the SSML XML payload sent to Microsoft's Edge TTS,
    //      causing it to return 0 bytes ("No audio data received")
    //   H. Collapse leftover multiple spaces from justified-layout PDFs

    // A: normalize line endings
    rawText = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // B: remove form-feed page-break characters inserted by pdftotext
    rawText = rawText.replace(/\f/g, " ");

    // C: collapse 3+ newlines to 2
    rawText = rawText.replace(/\n{3,}/g, "\n\n");

    // D: rejoin soft-wrapped lines
    // "word \n\n lowercase" => the two lines are the same sentence, join with space
    rawText = rawText.replace(/([a-zA-Z,]) *\n\n *([a-z])/g, "$1 $2");

    // E: collapse all remaining newlines to spaces
    rawText = rawText.replace(/\n+/g, " ");

    // F: add period after ALL-CAPS headings so TTS pauses naturally
    rawText = rawText.replace(/([A-Z]{2,}(?: [A-Z]+)*) +([A-Z][a-z])/g, "$1. $2");

    // G: XML/SSML special character escaping
    rawText = rawText.replace(/&/g, "and");
    rawText = rawText.replace(/</g, "");
    rawText = rawText.replace(/>/g, "");
    rawText = rawText.replace(/[\u2018\u2019]/g, "'");
    rawText = rawText.replace(/[\u201c\u201d]/g, '"');
    rawText = rawText.replace(/\u00b4/g, "'");
    rawText = rawText.replace(/\u2013/g, "-");
    rawText = rawText.replace(/\u2014/g, "-");
    rawText = rawText.replace(/\u2026/g, "...");

    // H: collapse multiple spaces (justified-layout PDFs, post-replacement gaps)
    rawText = rawText.replace(/ {2,}/g, " ").trim();


    // Step 2 — Synthesise with Edge TTS
    let tts;
    try {
      tts = new MsEdgeTTS();
      await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

      const prosody    = { rate: speedInfo.rate };
      const chunks     = chunkText(rawText);
      console.log(`Synthesising ${chunks.length} chunk(s) with ${voiceInfo.label}...`);

      if (chunks.length === 1) {
        const { audioFilePath } = await Promise.race([
          tts.toFile(outDir, chunks[0], prosody),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error("TTS timeout on single chunk")), TTS_CHUNK_TIMEOUT_MS)
          ),
        ]);
        fs.renameSync(audioFilePath, finalMp3);
      } else {
        const chunkPaths = [];
        for (let i = 0; i < chunks.length; i++) {
          chunkPaths.push(
            await synthesiseChunkWithTimeout(tts, chunks[i], outDir, i, prosody)
          );
        }
        await concatMp3Pure(chunkPaths, finalMp3);
      }

      tts.close();
    } catch (ttsErr) {
      // msedge-tts rejects with plain strings in three cases, not Error objects:
      //   "Connect Error: ..."     — WebSocket failed (network/endpoint issue)
      //   "No audio data received" — synthesis wrote 0 bytes (empty text chunk)
      //   "No metadata received"   — metadata stream closed with no content
      // Using ttsErr.message on a plain string gives undefined, producing the
      // unhelpful "audio synthesis: undefined" error. Normalise to string first.
      const errMsg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr);
      console.error("Edge TTS synthesis failed:", errMsg);
      if (tts) try { tts.close(); } catch (_) {}
      cleanupOutputDir(outDir);
      return res.status(500).send(`Server error during audio synthesis: ${errMsg}`);
    }

    // Step 3 — Get audio file size for display
    let audioFileSizeBytes = 0;
    try {
      audioFileSizeBytes = fs.statSync(finalMp3).size;
    } catch (_) {}

    // Step 4 — Persist metadata
    const payload = {
      fileId,
      filename:           req.file.originalname,
      sanitizedName,
      audioFile:          `${sanitizedName}.mp3`,
      previewUrl:         `/tools/pdf-to-audio/view/${fileId}?file=${encodeURIComponent(sanitizedName)}.mp3`,
      downloadUrl:        `/tools/pdf-to-audio/download/${fileId}?file=${encodeURIComponent(sanitizedName)}.mp3`,
      userId:             req.user.id,
      voice:              selectedVoice,
      voiceLabel:         voiceInfo.label,
      speed:              selectedSpeed,
      speedLabel:         speedInfo.label,
      audioFileSizeBytes,
      audioFileSize:      formatBytes(audioFileSizeBytes),
    };

    try {
      const dbEntry = new ProcessedAudio(payload);
      await dbEntry.save();
      console.log(`Saved: ${voiceInfo.label} at ${speedInfo.label}, size: ${payload.audioFileSize}`);

      if (req.xhr || (req.headers.accept && req.headers.accept.includes("json"))) {
        return res.json(dbEntry);
      }
      res.redirect(`/tools/pdf-to-audio?token=${req.query.token}`);
    } catch (dbErr) {
      console.error("Error saving processed audio:", dbErr);
      return res.status(500).send("Error saving file metadata.");
    }
  });
};

const serveAudio = async (req, res) => {
  try {
    const file = await ProcessedAudio.findOne({ fileId: req.params.id });
    if (!file) return res.status(404).send("File not found.");
    const audioPath = path.join(__dirname, "..", "outputs", req.params.id, file.audioFile);
    if (!fs.existsSync(audioPath)) return res.status(404).send("Audio file not found.");
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
    if (!fs.existsSync(audioPath)) return res.status(404).send("Audio file not found.");
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
