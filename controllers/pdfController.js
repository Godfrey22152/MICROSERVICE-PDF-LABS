const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const FormData = require("form-data");
const { v4: uuidv4 } = require("uuid");
const { sanitizeFilename, formatBytes } = require("../utils/fileUtils");
const ConvertedFile = require("../models/ConvertedFile");

const CONVERSION_MODES = {
  standard: {
    label: "Standard Conversion",
    icon: "📄",
    description: "Best for text-based PDFs. Preserves headings, tables, lists and fonts.",
    suitable: "Text PDFs, reports, articles, forms",
    ocrMode: "auto",
  },
  ocr: {
    label: "OCR Conversion",
    icon: "🔍",
    description: "For scanned or image-based PDFs. Uses OCR to extract text before converting.",
    suitable: "Scanned documents, image-only PDFs, photographed pages",
    ocrMode: "force",
  },
};

// GET /tools/pdf-to-word
const renderPdfToWordPage = async (req, res) => {
  console.log("GET /tools/pdf-to-word hit");
  try {
    const files = await ConvertedFile.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.render("pdf-to-word", {
      locals: {
        convertedFiles: files,
        token: req.query.token,
        conversionModes: CONVERSION_MODES,
        formatBytes,
      },
    });
  } catch (err) {
    console.error("Error fetching converted files:", err);
    res.render("pdf-to-word", {
      locals: {
        convertedFiles: [],
        token: req.query.token,
        conversionModes: CONVERSION_MODES,
        formatBytes,
      },
    });
  }
};

// Core conversion: POST multipart/form-data directly to ConvertAPI REST endpoint.
// We bypass the Node.js SDK entirely and use the raw REST API with form-data,
// which gives us full control over Content-Type and file streaming.
function callConvertApi(inputPath, originalName, ocrMode, secret) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // ConvertAPI validates the filename extension — ensure it always ends with .pdf
    const safeFilename = (originalName || "upload.pdf").toLowerCase().endsWith(".pdf")
      ? originalName
      : originalName + ".pdf";

    form.append("File", fs.createReadStream(inputPath), {
      filename: safeFilename,
      contentType: "application/pdf",
    });
    form.append("OcrMode", ocrMode);
    form.append("OcrLanguage", "en");
    form.append("StoreFile", "true");

    const url = new URL(
      "https://v2.convertapi.com/convert/pdf/to/docx?Secret=" + secret
    );

    const options = {
      method: "POST",
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: form.getHeaders(),
      timeout: 180000,
    };

    const reqHttp = https.request(options, (response) => {
      let rawData = "";
      response.on("data", (chunk) => { rawData += chunk; });
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve({ status: response.statusCode, body: JSON.parse(rawData) });
          } catch (e) {
            reject(new Error("Invalid JSON response from ConvertAPI: " + rawData.slice(0, 200)));
          }
        } else {
          reject(new Error(
            "ConvertAPI HTTP " + response.statusCode + ": " + rawData.slice(0, 300)
          ));
        }
      });
    });

    reqHttp.on("error", (e) => reject(new Error("Network error: " + e.message)));
    reqHttp.on("timeout", () => {
      reqHttp.destroy();
      reject(new Error("Request to ConvertAPI timed out after 3 minutes."));
    });

    form.pipe(reqHttp);
  });
}

// Download the converted file from ConvertAPI's temporary storage URL
function downloadFile(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = fileUrl.startsWith("https") ? https : http;
    const file = fs.createWriteStream(destPath);
    protocol.get(fileUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error("Failed to download converted file, status: " + response.statusCode));
        return;
      }
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }).on("error", (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

// POST /tools/pdf-to-word
const convertPdfToWord = async (req, res) => {
  console.log("POST /tools/pdf-to-word hit");

  if (!req.file) {
    return res.status(400).send("No PDF file uploaded.");
  }

  const secret = process.env.CONVERTAPI_SECRET;
  if (!secret) {
    return res.status(500).send("Server configuration error: CONVERTAPI_SECRET is not set.");
  }

  const inputPath = req.file.path;
  const mode      = req.body.conversionMode || "standard";
  const config    = CONVERSION_MODES[mode];

  if (!config) {
    return res.status(400).send("Invalid conversion mode: " + mode);
  }

  const fileId         = uuidv4();
  const outDir         = path.join(__dirname, "..", "outputs", fileId);
  fs.mkdirSync(outDir, { recursive: true });

  const sanitizedName  = sanitizeFilename(req.file.originalname);
  const originalSize   = fs.statSync(inputPath).size;
  const outputFilename = sanitizedName + ".docx";
  const outputPath     = path.join(outDir, outputFilename);

  try {
    console.log("Calling ConvertAPI REST, mode:", mode, "ocrMode:", config.ocrMode);

    const { body } = await callConvertApi(inputPath, req.file.originalname, config.ocrMode, secret);

    // Clean up uploaded temp file
    try { fs.unlinkSync(inputPath); } catch (_) {}

    const files = body && body.Files;
    if (!files || files.length === 0) {
      return res.status(500).send("Conversion failed: ConvertAPI returned no output files.");
    }

    // ConvertAPI returns a temporary download URL (valid 3 hrs) when StoreFile=true
    const downloadLink = files[0].Url;
    console.log("Downloading converted file from ConvertAPI storage...");
    await downloadFile(downloadLink, outputPath);

    if (!fs.existsSync(outputPath)) {
      return res.status(500).send("Conversion failed: output file not found after download.");
    }

    const convertedSize = fs.statSync(outputPath).size;
    const dlUrl = "/tools/pdf-to-word/download/" + fileId +
      "?file=" + encodeURIComponent(outputFilename);

    const payload = {
      fileId,
      originalName:    req.file.originalname,
      sanitizedName,
      originalSize,
      convertedSize,
      pageCount:       0,
      conversionMode:  mode,
      conversionLabel: config.label,
      downloadUrl:     dlUrl,
      filename:        outputFilename,
      createdAt:       new Date(),
      userId:          req.user.id,
    };

    try {
      const dbEntry = new ConvertedFile(payload);
      await dbEntry.save();
      console.log("Saved to DB:", dbEntry._id);
    } catch (dbErr) {
      console.error("DB save error:", dbErr);
    }

    if (req.xhr) return res.json(payload);
    res.redirect("/tools/pdf-to-word?token=" + req.query.token);

  } catch (err) {
    try { fs.unlinkSync(inputPath); } catch (_) {}
    console.error("Conversion error:", err.message || err);

    const msg = err.message || "Unknown error";
    if (msg.includes("401") || msg.includes("403")) {
      return res.status(500).send("Conversion failed: Invalid ConvertAPI secret key.");
    }
    if (msg.includes("429")) {
      return res.status(429).send("Conversion failed: Monthly conversion limit reached.");
    }
    if (msg.includes("415")) {
      return res.status(500).send("Conversion failed: File format rejected by ConvertAPI. Ensure the file is a valid PDF.");
    }
    return res.status(500).send("Conversion failed: " + msg);
  }
};

// GET /tools/pdf-to-word/download/:id
const downloadConvertedFile = (req, res) => {
  const { id }   = req.params;
  const fileName = req.query.file;
  if (!fileName) return res.status(400).send("Missing file parameter");
  const filePath = path.join(__dirname, "..", "outputs", id, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");
  res.download(filePath, fileName);
};

// DELETE /tools/pdf-to-word/:id
const deleteConvertedFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const file   = await ConvertedFile.findOne({ fileId, userId });
    if (!file) {
      return res.status(404).send("File not found or you do not have permission to delete it.");
    }
    const fileDir = path.join(__dirname, "..", "outputs", fileId);
    if (fs.existsSync(fileDir)) {
      fs.rmSync(fileDir, { recursive: true, force: true });
    }
    await ConvertedFile.deleteOne({ fileId });
    res.status(200).send("File deleted successfully.");
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).send("Server error while deleting file.");
  }
};

module.exports = {
  renderPdfToWordPage,
  convertPdfToWord,
  downloadConvertedFile,
  deleteConvertedFile,
};
