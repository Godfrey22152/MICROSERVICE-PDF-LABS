const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const FormData = require("form-data");
const { v4: uuidv4 } = require("uuid");
const { sanitizeFilename, formatBytes } = require("../utils/fileUtils");
const ConvertedFile = require("../models/ConvertedFile");

// Supported input formats and their ConvertAPI source format identifiers
const FORMAT_MAP = {
  ".docx": "docx",
  ".doc":  "doc",
  ".odt":  "odt",
  ".rtf":  "rtf",
  ".pptx": "pptx",
  ".ppt":  "ppt",
};

// Determine which ConvertAPI endpoint to use based on file extension
function getSourceFormat(filename) {
  const ext = path.extname(filename).toLowerCase();
  return FORMAT_MAP[ext] || "docx";
}

// POST multipart/form-data to ConvertAPI REST endpoint using Node built-in https
// Mirrors the proven pattern from pdf-to-word-service to avoid 415 errors:
// always stream file with original filename so ConvertAPI validates extension.
function callConvertApi(inputPath, originalName, secret) {
  return new Promise((resolve, reject) => {
    const sourceFormat = getSourceFormat(originalName);
    const apiUrl = "https://v2.convertapi.com/convert/" + sourceFormat +
      "/to/pdf?Secret=" + secret;

    const safeFilename = originalName.toLowerCase().endsWith("." + sourceFormat)
      ? originalName
      : originalName + "." + sourceFormat;

    const form = new FormData();
    form.append("File", fs.createReadStream(inputPath), {
      filename: safeFilename,
      contentType: "application/octet-stream",
    });
    form.append("StoreFile", "true");

    const url = new URL(apiUrl);
    const options = {
      method: "POST",
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: form.getHeaders(),
      timeout: 180000,
    };

    console.log("ConvertAPI endpoint:", url.pathname + url.search.replace(secret, "***"));

    const req = https.request(options, (response) => {
      let rawData = "";
      response.on("data", (chunk) => { rawData += chunk; });
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try { resolve({ status: response.statusCode, body: JSON.parse(rawData) }); }
          catch (e) { reject(new Error("Invalid JSON from ConvertAPI: " + rawData.slice(0, 200))); }
        } else {
          reject(new Error("ConvertAPI HTTP " + response.statusCode + ": " + rawData.slice(0, 300)));
        }
      });
    });

    req.on("error", (e) => reject(new Error("Network error: " + e.message)));
    req.on("timeout", () => { req.destroy(); reject(new Error("ConvertAPI request timed out.")); });
    form.pipe(req);
  });
}

// Download resulting PDF from ConvertAPI's temporary storage URL
function downloadFile(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = fileUrl.startsWith("https") ? https : http;
    const file = fs.createWriteStream(destPath);
    protocol.get(fileUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error("Download failed, status: " + response.statusCode));
        return;
      }
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }).on("error", (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

// GET /tools/word-to-pdf
const renderPage = async (req, res) => {
  console.log("GET /tools/word-to-pdf hit");
  try {
    const files = await ConvertedFile.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.render("word-to-pdf", {
      locals: { convertedFiles: files, token: req.query.token, formatBytes },
    });
  } catch (err) {
    console.error("Error fetching files:", err);
    res.render("word-to-pdf", {
      locals: { convertedFiles: [], token: req.query.token, formatBytes },
    });
  }
};

// POST /tools/word-to-pdf
const convertToPdf = async (req, res) => {
  console.log("POST /tools/word-to-pdf hit");

  if (!req.file) return res.status(400).send("No file uploaded.");

  const secret = process.env.CONVERTAPI_SECRET;
  if (!secret) return res.status(500).send("Server error: CONVERTAPI_SECRET not set.");

  const inputPath      = req.file.path;
  const fileId         = uuidv4();
  const outDir         = path.join(__dirname, "..", "outputs", fileId);
  fs.mkdirSync(outDir, { recursive: true });

  const sanitizedName  = sanitizeFilename(req.file.originalname);
  const originalSize   = fs.statSync(inputPath).size;
  const outputFilename = sanitizedName + ".pdf";
  const outputPath     = path.join(outDir, outputFilename);
  const inputFormat    = path.extname(req.file.originalname).replace(".", "").toLowerCase();

  try {
    console.log("Converting via ConvertAPI, format:", inputFormat);
    const { body } = await callConvertApi(inputPath, req.file.originalname, secret);

    try { fs.unlinkSync(inputPath); } catch (_) {}

    const files = body && body.Files;
    if (!files || files.length === 0) {
      return res.status(500).send("Conversion failed: ConvertAPI returned no output files.");
    }

    await downloadFile(files[0].Url, outputPath);

    if (!fs.existsSync(outputPath)) {
      return res.status(500).send("Conversion failed: output file not found after download.");
    }

    const convertedSize = fs.statSync(outputPath).size;
    const dlUrl = "/tools/word-to-pdf/download/" + fileId +
      "?file=" + encodeURIComponent(outputFilename);

    const payload = {
      fileId,
      originalName:   req.file.originalname,
      sanitizedName,
      originalSize,
      convertedSize,
      inputFormat,
      downloadUrl:    dlUrl,
      filename:       outputFilename,
      createdAt:      new Date(),
      userId:         req.user.id,
    };

    try {
      const dbEntry = new ConvertedFile(payload);
      await dbEntry.save();
      console.log("Saved to DB:", dbEntry._id);
    } catch (dbErr) { console.error("DB save error:", dbErr); }

    if (req.xhr) return res.json(payload);
    res.redirect("/tools/word-to-pdf?token=" + req.query.token);

  } catch (err) {
    try { fs.unlinkSync(inputPath); } catch (_) {}
    console.error("Conversion error:", err.message);
    const msg = err.message || "Unknown error";
    if (msg.includes("401") || msg.includes("403")) return res.status(500).send("Conversion failed: Invalid ConvertAPI secret key.");
    if (msg.includes("429")) return res.status(429).send("Conversion failed: Monthly conversion limit reached.");
    if (msg.includes("415")) return res.status(400).send("Conversion failed: Unsupported file format.");
    return res.status(500).send("Conversion failed: " + msg);
  }
};

// GET /tools/word-to-pdf/download/:id
const downloadFile2 = (req, res) => {
  const { id } = req.params;
  const fileName = req.query.file;
  if (!fileName) return res.status(400).send("Missing file parameter");
  const filePath = path.join(__dirname, "..", "outputs", id, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");
  res.download(filePath, fileName);
};

// DELETE /tools/word-to-pdf/:id
const deleteFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const file = await ConvertedFile.findOne({ fileId, userId });
    if (!file) return res.status(404).send("File not found or permission denied.");
    const fileDir = path.join(__dirname, "..", "outputs", fileId);
    if (fs.existsSync(fileDir)) fs.rmSync(fileDir, { recursive: true, force: true });
    await ConvertedFile.deleteOne({ fileId });
    res.status(200).send("File deleted successfully.");
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).send("Server error while deleting file.");
  }
};

module.exports = { renderPage, convertToPdf, downloadFile: downloadFile2, deleteFile };
