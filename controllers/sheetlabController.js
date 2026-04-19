const path          = require("path");
const fs            = require("fs");
const https         = require("https");
const http          = require("http");
const FormData      = require("form-data");
const { v4: uuidv4 } = require("uuid");
const { sanitizeFilename, formatBytes } = require("../utils/fileUtils");
const ConvertedFile = require("../models/ConvertedFile");

// ─────────────────────────────────────────────────────────────────────────────
//  VERIFIED ConvertAPI v2 endpoints:
//
//  PDF  → Excel  POST https://v2.convertapi.com/convert/pdf/to/xlsx
//                     Fields: File, StoreFile=true
//                     Returns: Files[0] = .xlsx download URL
//
//  XLSX → PDF    POST https://v2.convertapi.com/convert/xlsx/to/pdf
//                     Fields: File, StoreFile=true
//                     Optional: PageOrientation, PageSize, AutoFit
//
//  XLS  → PDF    POST https://v2.convertapi.com/convert/xls/to/pdf
//                     Fields: File, StoreFile=true
// ─────────────────────────────────────────────────────────────────────────────

const OPERATIONS = {
  pdfToExcel: {
    label:  "PDF → Excel",
    icon:   "📄➡️📊",
    desc:   "Extract tables and data from a PDF into an editable Excel spreadsheet",
    accept: ".pdf,application/pdf",
  },
  excelToPdf: {
    label:  "Excel → PDF",
    icon:   "📊➡️📄",
    desc:   "Convert an Excel spreadsheet (.xlsx or .xls) into a PDF document",
    accept: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel",
  },
};

// ── Raw HTTPS POST ────────────────────────────────────────────────────────────
function postForm(apiUrl, form) {
  return new Promise((resolve, reject) => {
    const url  = new URL(apiUrl);
    const opts = {
      method:   "POST",
      hostname: url.hostname,
      path:     url.pathname + url.search,
      headers:  form.getHeaders(),
      timeout:  180000,
    };
    console.log("[ConvertAPI]", (url.pathname + url.search).replace(/Secret=[^&]+/, "Secret=***"));

    const req = https.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(raw)); }
          catch (e) { reject(new Error("Non-JSON response: " + raw.slice(0, 300))); }
        } else {
          reject(new Error("ConvertAPI HTTP " + res.statusCode + ": " + raw.slice(0, 600)));
        }
      });
    });
    req.on("error",   (e) => reject(new Error("Network error: " + e.message)));
    req.on("timeout", ()  => { req.destroy(); reject(new Error("Request timed out after 3 minutes.")); });
    form.pipe(req);
  });
}

// ── Single-file POST ──────────────────────────────────────────────────────────
function convertFile(apiUrl, filePath, originalName, mimeType, extraFields) {
  const form = new FormData();
  form.append("File", fs.createReadStream(filePath), {
    filename:    originalName,
    contentType: mimeType,
  });
  form.append("StoreFile", "true");
  if (extraFields) {
    Object.entries(extraFields).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "")
        form.append(k, String(v));
    });
  }
  return postForm(apiUrl, form);
}

// ── Download a remote file to disk ───────────────────────────────────────────
function fetchRemote(remoteUrl, destPath) {
  return new Promise((resolve, reject) => {
    const proto = remoteUrl.startsWith("https") ? https : http;
    const out   = fs.createWriteStream(destPath);
    proto.get(remoteUrl, (res) => {
      if (res.statusCode !== 200) { reject(new Error("Download HTTP " + res.statusCode)); return; }
      res.pipe(out);
      out.on("finish", () => out.close(resolve));
      out.on("error",  (e) => { fs.unlink(destPath, () => {}); reject(e); });
    }).on("error", (e) => { fs.unlink(destPath, () => {}); reject(e); });
  });
}

// ── GET /tools/sheetlab ───────────────────────────────────────────────────────
const renderPage = async (req, res) => {
  try {
    const files = await ConvertedFile.find({ userId: req.user?.id }).sort({ createdAt: -1 });
    res.render("sheetlab", {
      locals: {
        convertedFiles: files,
        token:          req.query.token,
        formatBytes,
        operations:     OPERATIONS,
      },
    });
  } catch (err) {
    console.error("Render error:", err);
    res.render("sheetlab", {
      locals: {
        convertedFiles: [],
        token:          req.query.token,
        formatBytes,
        operations:     OPERATIONS,
      },
    });
  }
};

// ── POST /tools/sheetlab ──────────────────────────────────────────────────────
const convertDoc = async (req, res) => {
  console.log("[convertDoc] operation:", req.body.operation, "| file:", req.file?.originalname);

  if (!req.file) return res.status(400).send("No file uploaded.");

  const secret = process.env.CONVERTAPI_SECRET;
  if (!secret)  return res.status(500).send("Server error: CONVERTAPI_SECRET not set.");

  const operation = req.body.operation || "pdfToExcel";
  if (!OPERATIONS[operation]) return res.status(400).send("Unknown operation: " + operation);

  // Excel → PDF options
  const orientation = req.body.pageOrientation || "portrait";
  const pageSize    = req.body.pageSize        || "a4";
  const autoFit     = req.body.autoFit         || "false";
  // FitToPage forces the entire sheet onto exactly N×M pages.
  // "true" = fit all columns to 1 page wide, all rows to 1 page tall.
  const fitToPage   = req.body.fitToPage       || "false";

  const fileId       = uuidv4();
  const outDir       = path.join(__dirname, "..", "outputs", fileId);
  fs.mkdirSync(outDir, { recursive: true });

  const uploadedFile  = req.file;
  const sanitizedName = sanitizeFilename(uploadedFile.originalname);
  const originalSize  = uploadedFile.size;
  const cleanup       = () => { try { fs.unlinkSync(uploadedFile.path); } catch (_) {} };

  const SEC = "?Secret=" + secret;
  const BASE = "https://v2.convertapi.com/convert/";

  try {

    // ════════════════════════════════════════════════════════════════════
    //  PDF → XLSX
    // ════════════════════════════════════════════════════════════════════
    if (operation === "pdfToExcel") {
      const body = await convertFile(
        BASE + "pdf/to/xlsx" + SEC,
        uploadedFile.path,
        sanitizedName + ".pdf",
        "application/pdf",
        null
      );
      cleanup();

      if (!body?.Files?.length)
        return res.status(500).send("Conversion failed: ConvertAPI returned no output.");

      const outFilename = sanitizedName + ".xlsx";
      const outPath     = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);

      const convertedSize = fs.statSync(outPath).size;
      const token         = req.query.token || "";
      const dlUrl         = "/tools/sheetlab/download/" + fileId
                          + "?file=" + encodeURIComponent(outFilename)
                          + (token ? "&token=" + encodeURIComponent(token) : "");

      const payload = {
        fileId,
        originalName:   uploadedFile.originalname,
        sanitizedName,
        originalSize,
        convertedSize,
        operation,
        operationLabel: "PDF → Excel",
        downloadUrl:    dlUrl,
        filename:       outFilename,
        createdAt:      new Date(),
        userId:         req.user?.id,
      };
      try { await new ConvertedFile(payload).save(); } catch (e) { console.error("DB:", e.message); }
      return req.xhr ? res.json(payload) : res.redirect("/tools/sheetlab?token=" + (req.query.token || ""));
    }

    // ════════════════════════════════════════════════════════════════════
    //  XLSX / XLS → PDF
    // ════════════════════════════════════════════════════════════════════
    if (operation === "excelToPdf") {
      const ext      = path.extname(uploadedFile.originalname).toLowerCase();
      const isXls    = ext === ".xls";
      const fromFmt  = isXls ? "xls" : "xlsx";
      const mimeType = isXls
        ? "application/vnd.ms-excel"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      const body = await convertFile(
        BASE + fromFmt + "/to/pdf" + SEC,
        uploadedFile.path,
        sanitizedName + ext,
        mimeType,
        {
          PageOrientation: orientation,
          PageSize:        pageSize,
          // AutoFit shrinks columns to fit page width
          AutoFit:         autoFit,
          // FitToPage=true + FitToWidth=1 + FitToHeight=1 forces the
          // entire sheet content onto a single page — the most reliable
          // way to prevent a 1-page sheet spilling onto 2 pages.
          FitToPage:       fitToPage,
          FitToWidth:      fitToPage === "true" ? "1" : "0",
          FitToHeight:     fitToPage === "true" ? "1" : "0",
        }
      );
      cleanup();

      if (!body?.Files?.length)
        return res.status(500).send("Conversion failed: ConvertAPI returned no output.");

      const outFilename = sanitizedName + ".pdf";
      const outPath     = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);

      const convertedSize = fs.statSync(outPath).size;
      const token         = req.query.token || "";
      const dlUrl         = "/tools/sheetlab/download/" + fileId
                          + "?file=" + encodeURIComponent(outFilename)
                          + (token ? "&token=" + encodeURIComponent(token) : "");

      const payload = {
        fileId,
        originalName:   uploadedFile.originalname,
        sanitizedName,
        originalSize,
        convertedSize,
        operation,
        operationLabel: "Excel → PDF",
        downloadUrl:    dlUrl,
        filename:       outFilename,
        createdAt:      new Date(),
        userId:         req.user?.id,
      };
      try { await new ConvertedFile(payload).save(); } catch (e) { console.error("DB:", e.message); }
      return req.xhr ? res.json(payload) : res.redirect("/tools/sheetlab?token=" + (req.query.token || ""));
    }

    cleanup();
    return res.status(400).send("Unhandled operation: " + operation);

  } catch (err) {
    cleanup();
    console.error("[convertDoc] RAW error for op=" + operation + ":", err.message);
    const m = err.message || "";
    if (m.includes("401") || m.includes("403")) return res.status(500).send("Conversion failed: Invalid API key.");
    if (m.includes("429"))                       return res.status(429).send("Conversion failed: API limit reached. Please try again later.");
    if (m.includes("timed out"))                 return res.status(504).send("Conversion failed: The request timed out. Try a smaller file.");
    return res.status(500).send("Conversion failed: " + m);
  }
};

// ── GET /tools/sheetlab/download/:id ─────────────────────────────────────────
const downloadFile = (req, res) => {
  const { id } = req.params;
  const safe   = path.basename(req.query.file || "");
  if (!safe) return res.status(400).send("Missing file parameter.");
  const fp = path.join(__dirname, "..", "outputs", id, safe);
  if (!fs.existsSync(fp)) return res.status(404).send("File not found or expired.");
  res.download(fp, safe);
};

// ── DELETE /tools/sheetlab/:id ────────────────────────────────────────────────
const deleteFile = async (req, res) => {
  try {
    const { id: fileId } = req.params;
    const record = await ConvertedFile.findOne({ fileId, userId: req.user?.id });
    if (!record) return res.status(404).send("Not found or permission denied.");
    const dir = path.join(__dirname, "..", "outputs", fileId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    await ConvertedFile.deleteOne({ fileId });
    res.status(200).send("Deleted.");
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).send("Server error.");
  }
};

module.exports = { renderPage, convertDoc, downloadFile, deleteFile };
