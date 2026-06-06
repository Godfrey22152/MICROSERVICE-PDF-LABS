const path = require("path");
const fs = require("fs");
const https = require("https");
const { v4: uuidv4 } = require("uuid");
const { sanitizeFilename, formatBytes } = require("../utils/fileUtils");
const CompressedFile = require("../models/CompressedFile");

// ── ConvertAPI Compression Presets ────────────────────────────────────────
// Endpoint:  POST https://v2.convertapi.com/convert/pdf/to/compress
// Auth:      Authorization: Bearer <token>   (header — NOT ?Secret= query param)
// Format:    multipart/form-data
// Preset field name: "Preset"  (singular — confirmed from ConvertAPI curl docs)
// Valid values: none | text | archive | web | ebook | printer
const COMPRESSION_LEVELS = {
  none: {
    label: "Not Set",
    apiValue: "none",
    icon: "⚙️",
    description: "No preset. Structural optimisation only — fonts subsetted, duplicates removed, streams optimised.",
    expectedReduction: "5–15%",
  },
  text: {
    label: "Text",
    apiValue: "text",
    icon: "📝",
    description: "20 image DPI — lowest quality, highest compression. Best for text-only docs.",
    expectedReduction: "80–95%",
  },
  archive: {
    label: "Archive",
    apiValue: "archive",
    icon: "🗄️",
    description: "40 image DPI — low quality, high compression. Good for long-term storage.",
    expectedReduction: "70–90%",
  },
  web: {
    label: "Web",
    apiValue: "web",
    icon: "🌐",
    description: "75 image DPI — medium quality, high compression. Ideal for web sharing.",
    expectedReduction: "50–70%",
  },
  ebook: {
    label: "Ebook",
    apiValue: "ebook",
    icon: "📱",
    description: "150 image DPI — high quality, medium compression. Great for e-readers.",
    expectedReduction: "30–50%",
  },
  printer: {
    label: "Printer",
    apiValue: "printer",
    icon: "🖨️",
    description: "300 image DPI — high quality, low compression. Suitable for desktop printing.",
    expectedReduction: "10–30%",
  },
};

// ── multipart/form-data builder (pure Node — no external library) ─────────
// Manually constructs a multipart body so there are zero dependencies on
// form-data or node-fetch.  Boundary is a random hex string.
function buildMultipart(fields, filePart) {
  const boundary = "----ConvertAPIBoundary" + Math.random().toString(16).slice(2);
  const CRLF = "\r\n";
  const chunks = [];

  // Text fields
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      "--" + boundary + CRLF +
      `Content-Disposition: form-data; name="${name}"` + CRLF + CRLF +
      value + CRLF
    ));
  }

  // File field
  chunks.push(Buffer.from(
    "--" + boundary + CRLF +
    `Content-Disposition: form-data; name="File"; filename="${filePart.filename}"` + CRLF +
    "Content-Type: application/pdf" + CRLF + CRLF
  ));
  chunks.push(filePart.data);
  chunks.push(Buffer.from(CRLF + "--" + boundary + "--" + CRLF));

  return {
    body: Buffer.concat(chunks),
    contentType: "multipart/form-data; boundary=" + boundary,
  };
}

// ── Promisified HTTPS POST ─────────────────────────────────────────────────
function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("ConvertAPI timed out")));
    req.write(body);
    req.end();
  });
}

// ── GET /tools/pdf-compressor ─────────────────────────────────────────────
const renderCompressorPage = async (req, res) => {
  console.log("GET /tools/pdf-compressor hit");
  try {
    const files = await CompressedFile.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.render("pdf-compressor", {
      locals: { compressedFiles: files, token: req.query.token, compressionLevels: COMPRESSION_LEVELS, formatBytes },
    });
  } catch (err) {
    console.error("Error fetching compressed files:", err);
    res.render("pdf-compressor", {
      locals: { compressedFiles: [], token: req.query.token, compressionLevels: COMPRESSION_LEVELS, formatBytes },
    });
  }
};

// ── POST /tools/pdf-compressor ────────────────────────────────────────────
const compressPdf = async (req, res) => {
  console.log("POST /tools/pdf-compressor hit");

  if (!req.file) {
    return res.status(400).json({ error: true, msg: "No PDF file uploaded." });
  }

  const inputPath = req.file.path;
  const level     = req.body.compressionLevel || "web";
  const config    = COMPRESSION_LEVELS[level];

  if (!config) {
    try { fs.unlinkSync(inputPath); } catch (_) {}
    return res.status(400).json({ error: true, msg: "Invalid compression level: " + level });
  }

  const apiToken = process.env.CONVERTAPI_SECRET;
  if (!apiToken) {
    try { fs.unlinkSync(inputPath); } catch (_) {}
    return res.status(500).json({ error: true, msg: "CONVERTAPI_SECRET is not set." });
  }

  const originalSize   = fs.statSync(inputPath).size;
  const fileId         = uuidv4();
  const outDir         = path.join(__dirname, "..", "outputs", fileId);
  fs.mkdirSync(outDir, { recursive: true });
  const sanitizedName  = sanitizeFilename(req.file.originalname);
  const outputFilename = sanitizedName + "_compressed.pdf";
  const outputPath     = path.join(outDir, outputFilename);

  try {
    // Read file into memory, then delete the temp file
    const fileBuffer = fs.readFileSync(inputPath);
    try { fs.unlinkSync(inputPath); } catch (_) {}

    // Build text fields — "Preset" is singular (confirmed from ConvertAPI curl examples)
    const fields = { Preset: config.apiValue };

    // For "none", layer on structural-only flags since no image downsampling preset applies
    if (config.apiValue === "none") {
      Object.assign(fields, {
        SubsetEmbeddedFonts:   "true",
        RemoveDuplicates:      "true",
        Optimize:              "true",
        LzwToFlate:            "true",
        CreateObjectStreams:   "true",
        RemovePieceInformation:"true",
      });
    }

    const { body: multipartBody, contentType } = buildMultipart(fields, {
      filename: req.file.originalname,
      data: fileBuffer,
    });

    const reqOptions = {
      hostname: "v2.convertapi.com",
      path:     "/convert/pdf/to/compress",
      method:   "POST",
      headers: {
        "Authorization": "Bearer " + apiToken,
        "Content-Type":   contentType,
        "Content-Length": multipartBody.length,
      },
    };

    console.log(`ConvertAPI call — Preset: "${config.apiValue}", size: ${originalSize} bytes`);

    const { status, body: responseBody } = await httpsPost(reqOptions, multipartBody);

    if (status < 200 || status >= 300) {
      let errMsg = `ConvertAPI HTTP ${status}`;
      try { errMsg = JSON.parse(responseBody).Message || errMsg; } catch (_) {}
      console.error("ConvertAPI error:", responseBody);
      return res.status(502).json({ error: true, msg: errMsg });
    }

    let apiData;
    try { apiData = JSON.parse(responseBody); } catch (_) {
      console.error("ConvertAPI unparseable response:", responseBody);
      return res.status(502).json({ error: true, msg: "ConvertAPI returned an unexpected response." });
    }

    const fileEntry = apiData.Files && apiData.Files[0];
    if (!fileEntry || !fileEntry.FileData) {
      console.error("ConvertAPI missing FileData:", JSON.stringify(apiData));
      return res.status(502).json({ error: true, msg: "ConvertAPI returned no file data." });
    }

    fs.writeFileSync(outputPath, Buffer.from(fileEntry.FileData, "base64"));

    const compressedSize = fs.statSync(outputPath).size;
    const savedBytes     = Math.max(0, originalSize - compressedSize);
    const savedPercent   = originalSize > 0 ? parseFloat(((savedBytes / originalSize) * 100).toFixed(1)) : 0;

    console.log(`Done — original: ${originalSize}, compressed: ${compressedSize}, saved: ${savedBytes} (${savedPercent}%)`);

    const downloadUrl = "/tools/pdf-compressor/download/" + fileId + "?file=" + encodeURIComponent(outputFilename);

    const payload = {
      fileId, originalName: req.file.originalname, sanitizedName,
      compressionLevel: level, compressionLabel: config.label,
      originalSize, compressedSize, savedBytes, savedPercent,
      downloadUrl, filename: outputFilename, createdAt: new Date(), userId: req.user.id,
    };

    try { await new CompressedFile(payload).save(); } catch (dbErr) { console.error("DB save error:", dbErr); }

    if (req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest") return res.json(payload);
    res.redirect("/tools/pdf-compressor?token=" + req.query.token);

  } catch (err) {
    try { fs.unlinkSync(inputPath); } catch (_) {}
    console.error("[PDF Compressor] Error:", err);
    return res.status(500).json({ error: true, msg: "Compression failed: " + (err.message || "Unknown error") });
  }
};

// ── GET /tools/pdf-compressor/download/:id ────────────────────────────────
const downloadCompressedFile = (req, res) => {
  const { id } = req.params;
  const fileName = req.query.file;
  if (!fileName) return res.status(400).send("Missing file parameter");
  const filePath = path.join(__dirname, "..", "outputs", id, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");
  res.download(filePath, fileName);
};

// ── DELETE /tools/pdf-compressor/:id ─────────────────────────────────────
const deleteCompressedFile = async (req, res) => {
  try {
    const { id: fileId } = req.params;
    const file = await CompressedFile.findOne({ fileId, userId: req.user.id });
    if (!file) return res.status(404).send("File not found or access denied.");
    const fileDir = path.join(__dirname, "..", "outputs", fileId);
    if (fs.existsSync(fileDir)) fs.rmSync(fileDir, { recursive: true, force: true });
    await CompressedFile.deleteOne({ fileId });
    res.status(200).send("File deleted successfully.");
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).send("Server error while deleting file.");
  }
};

module.exports = { renderCompressorPage, compressPdf, downloadCompressedFile, deleteCompressedFile };
