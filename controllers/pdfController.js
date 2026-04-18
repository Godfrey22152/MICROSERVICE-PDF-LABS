const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { handleExecError } = require("../utils/errorHandler");
const { sanitizeFilename, formatBytes } = require("../utils/fileUtils");
const CompressedFile = require("../models/CompressedFile");

// Compression level presets mapped to Ghostscript dPDFSETTINGS
// Industry standard Ghostscript settings:
//   /screen   ~72 dpi  -> very small, lowest quality (suitable for screen display)
//   /ebook    ~150 dpi -> small, decent quality (e-readers, email)
//   /printer  ~300 dpi -> moderate size, good quality (desktop printing)
//   /prepress ~300 dpi -> larger, high quality (pre-press / professional print)
const COMPRESSION_LEVELS = {
  maximum: {
    label: "Maximum Compression",
    setting: "/screen",
    description: "Smallest file size. ~40 dpi. Best for screen / email sharing.",
    expectedReduction: "70–90%",
    extraFlags: "-dColorImageResolution=40 -dGrayImageResolution=40 -dMonoImageResolution=70",
  },
  high: {
    label: "High Compression",
    setting: "/ebook",
    description: "Small file size. ~150 dpi. Good for e-readers and digital use.",
    expectedReduction: "40–60%",
  },
  medium: {
    label: "Medium Compression",
    setting: "/printer",
    description: "Balanced quality and size. ~300 dpi. Suitable for desktop printing.",
    expectedReduction: "20–40%",
  },
  low: {
    label: "Low Compression",
    setting: "/prepress",
    description: "High quality. ~300 dpi with colour preservation. For professional print.",
    expectedReduction: "5–20%",
  },
};

// GET /tools/pdf-compressor
const renderCompressorPage = async (req, res) => {
  console.log("GET /tools/pdf-compressor hit");
  try {
    const files = await CompressedFile.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.render("pdf-compressor", {
      locals: {
        compressedFiles: files,
        token: req.query.token,
        compressionLevels: COMPRESSION_LEVELS,
        formatBytes,
      },
    });
  } catch (err) {
    console.error("Error fetching compressed files:", err);
    res.render("pdf-compressor", {
      locals: {
        compressedFiles: [],
        token: req.query.token,
        compressionLevels: COMPRESSION_LEVELS,
        formatBytes,
      },
    });
  }
};

// POST /tools/pdf-compressor
const compressPdf = async (req, res) => {
  console.log("POST /tools/pdf-compressor hit");

  if (!req.file) {
    return res.status(400).send("No PDF file uploaded.");
  }

  const inputPath = req.file.path;
  const level = req.body.compressionLevel || "high";
  const config = COMPRESSION_LEVELS[level];

  if (!config) {
    return res.status(400).send("Invalid compression level: " + level);
  }

  const fileId = uuidv4();
  const outDir = path.join(__dirname, "..", "outputs", fileId);
  fs.mkdirSync(outDir, { recursive: true });

  const sanitizedName = sanitizeFilename(req.file.originalname);
  const outputFilename = sanitizedName + "_compressed.pdf";
  const outputPath = path.join(outDir, outputFilename);

  // Get original file size
  const originalSize = fs.statSync(inputPath).size;

  // Ghostscript compression command
  // -dNOPAUSE -dBATCH     : non-interactive
  // -sDEVICE=pdfwrite      : output PDF
  // -dCompatibilityLevel=1.4: broad compatibility
  // -dPDFSETTINGS          : quality/size preset
  // -dColorImageResolution / -dGrayImageResolution / -dMonoImageResolution: fine-tune DPI
  const cmd = [
    "gs",
    "-dNOPAUSE",
    "-dBATCH",
    "-dSAFER",
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dPDFSETTINGS=" + config.setting,
    config.extraFlags || "",          // ← inject extra flags if defined
    "-dEmbedAllFonts=true",
    "-dSubsetFonts=true",
    "-dAutoRotatePages=/None",
    "-dDetectDuplicateImages=true",
    "-dCompressFonts=true",
    '-sOutputFile="' + outputPath + '"',
    '"' + inputPath + '"',
  ].filter(Boolean).join(" ");       // ← filter removes empty strings

  console.log("Executing: " + cmd);

  exec(cmd, async (err, stdout, stderr) => {
    // Clean up uploaded temp file
    try { fs.unlinkSync(inputPath); } catch (_) {}

    if (err) {
      return handleExecError(err, stderr, res);
    }

    if (!fs.existsSync(outputPath)) {
      return res.status(500).send("Compression failed: output file not created.");
    }

    const compressedSize = fs.statSync(outputPath).size;
    const savedBytes = Math.max(0, originalSize - compressedSize);
    const savedPercent = originalSize > 0
      ? parseFloat(((savedBytes / originalSize) * 100).toFixed(1))
      : 0;

    const downloadUrl = "/tools/pdf-compressor/download/" + fileId + "?file=" + encodeURIComponent(outputFilename);

    const payload = {
      fileId,
      originalName: req.file.originalname,
      sanitizedName,
      compressionLevel: level,
      compressionLabel: config.label,
      originalSize,
      compressedSize,
      savedBytes,
      savedPercent,
      downloadUrl,
      filename: outputFilename,
      createdAt: new Date(),
      userId: req.user.id,
    };

    // Persist to MongoDB
    try {
      const dbEntry = new CompressedFile(payload);
      await dbEntry.save();
      console.log("Compressed file saved to DB:", dbEntry._id);
    } catch (dbErr) {
      console.error("Error saving compressed file:", dbErr);
    }

    if (req.xhr) {
      return res.json(payload);
    }
    res.redirect("/tools/pdf-compressor?token=" + req.query.token);
  });
};

// GET /tools/pdf-compressor/download/:id
const downloadCompressedFile = (req, res) => {
  const { id } = req.params;
  const fileName = req.query.file;
  if (!fileName) return res.status(400).send("Missing file parameter");

  const filePath = path.join(__dirname, "..", "outputs", id, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");

  res.download(filePath, fileName);
};

// DELETE /tools/pdf-compressor/:id
const deleteCompressedFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;

    const file = await CompressedFile.findOne({ fileId, userId });
    if (!file) {
      return res.status(404).send("File not found or you do not have permission to delete it.");
    }

    const fileDir = path.join(__dirname, "..", "outputs", fileId);
    if (fs.existsSync(fileDir)) {
      fs.rmSync(fileDir, { recursive: true, force: true });
    }

    await CompressedFile.deleteOne({ fileId });
    res.status(200).send("File deleted successfully.");
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).send("Server error while deleting file.");
  }
};

module.exports = {
  renderCompressorPage,
  compressPdf,
  downloadCompressedFile,
  deleteCompressedFile,
};
