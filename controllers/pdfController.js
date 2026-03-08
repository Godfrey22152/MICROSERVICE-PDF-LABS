const path     = require("path");
const fs       = require("fs");
const https    = require("https");
const http     = require("http");
const FormData = require("form-data");
const { v4: uuidv4 } = require("uuid");
const { sanitizeFilename, formatBytes } = require("../utils/fileUtils");
const EditedFile = require("../models/EditedFile");

// ─────────────────────────────────────────────────────────────────────────────
//  VERIFIED ConvertAPI v2 endpoints (from official docs):
//
//  Rotate      → /convert/pdf/to/rotate          param:  Angle
//  Watermark   → /convert/pdf/to/watermark       fields: Text, FontSize, Opacity
//  Merge       → /convert/pdf/to/merge           fields: Files[0], Files[1]…
//  Protect     → /convert/pdf/to/protect         fields: UserPassword, OwnerPassword
//  Unlock      → /convert/pdf/to/unprotect       field:  Password
//  Delete pages→ /convert/pdf/to/delete-pages    param:  PageRange=from-to
//  Split chunks→ /convert/pdf/to/split           param:  SplitByPageCount=N (multi-result)
//  Extract rng → /convert/pdf/to/split           param:  ExtractPages=from-to (single PDF)
// ─────────────────────────────────────────────────────────────────────────────

const OPERATIONS = {
  rotate:    { label: "Rotate Pages",   icon: "🔄", desc: "Rotate all pages 90°, 180°, or 270°" },
  watermark: { label: "Add Watermark",  icon: "💧", desc: "Stamp text watermark across every page" },
  merge:     { label: "Merge PDFs",     icon: "🔗", desc: "Combine 2+ PDFs into one document", multiFile: true },
  split:     { label: "Split PDF",      icon: "✂️",  desc: "Split into pages, ranges or remove pages" },
  protect:   { label: "Protect PDF",    icon: "🔒", desc: "Password-protect your PDF" },
  unlock:    { label: "Unlock PDF",     icon: "🔓", desc: "Remove password protection" },
};

const BASE = "https://v2.convertapi.com/convert/pdf/to/";

// ── Low-level HTTPS POST ──────────────────────────────────────────────────────
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
    console.log("[ConvertAPI]", url.pathname + url.search.replace(/Secret=[^&]+/, "Secret=***"));

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
    req.on("timeout", ()  => { req.destroy(); reject(new Error("Request timed out.")); });
    form.pipe(req);
  });
}

// ── Single-file POST ──────────────────────────────────────────────────────────
function convertSingle(apiUrl, filePath, originalName, extraFields) {
  const form = new FormData();
  const safe = originalName.toLowerCase().endsWith(".pdf") ? originalName : originalName + ".pdf";
  form.append("File", fs.createReadStream(filePath), { filename: safe, contentType: "application/pdf" });
  form.append("StoreFile", "true");
  if (extraFields) {
    Object.entries(extraFields).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "")
        form.append(k, String(v));
    });
  }
  return postForm(apiUrl, form);
}

// ── Multi-file POST (merge) ───────────────────────────────────────────────────
function convertMulti(apiUrl, files) {
  const form = new FormData();
  files.forEach((f, i) => {
    const safe = f.originalname.toLowerCase().endsWith(".pdf") ? f.originalname : f.originalname + ".pdf";
    form.append("Files[" + i + "]", fs.createReadStream(f.path), { filename: safe, contentType: "application/pdf" });
  });
  form.append("StoreFile", "true");
  return postForm(apiUrl, form);
}

// ── Download a remote file ────────────────────────────────────────────────────
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

// ── Download every file in a multi-result API response ───────────────────────
async function fetchAll(resultFiles, outDir, baseName) {
  const parts = [];
  for (let i = 0; i < resultFiles.length; i++) {
    const filename = baseName + "_part" + (i + 1) + ".pdf";
    const dest     = path.join(outDir, filename);
    await fetchRemote(resultFiles[i].Url, dest);
    parts.push({ index: i + 1, filename, path: dest, size: fs.statSync(dest).size });
  }
  return parts;
}

// ── Shared: save record + respond ─────────────────────────────────────────────
async function finishSingle(req, res, { fileId, primaryFile, sanitizedName, originalSize, outFilename, outPath, operation, operationLabel }) {
  const editedSize = fs.statSync(outPath).size;
  const dlUrl      = "/tools/edit-pdf/download/" + fileId + "?file=" + encodeURIComponent(outFilename);
  const payload    = {
    fileId, originalName: primaryFile.originalname, sanitizedName,
    originalSize, editedSize, operation, operationLabel,
    downloadUrl: dlUrl, filename: outFilename,
    isSplit: false, splitPages: [],
    createdAt: new Date(), userId: req.user.id,
  };
  try { await new EditedFile(payload).save(); } catch (e) { console.error("DB save:", e.message); }
  return req.xhr ? res.json(payload) : res.redirect("/tools/edit-pdf?token=" + req.query.token);
}

// ── GET /tools/edit-pdf ───────────────────────────────────────────────────────
const renderPage = async (req, res) => {
  try {
    const files = await EditedFile.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.render("edit-pdf", { locals: { editedFiles: files, token: req.query.token, formatBytes, operations: OPERATIONS } });
  } catch (err) {
    console.error("Render error:", err);
    res.render("edit-pdf", { locals: { editedFiles: [], token: req.query.token, formatBytes, operations: OPERATIONS } });
  }
};

// ── POST /tools/edit-pdf ──────────────────────────────────────────────────────
const editPdf = async (req, res) => {
  console.log("[editPdf] operation:", req.body.operation, "files:", req.files?.length);

  if (!req.files?.length) return res.status(400).send("No PDF file(s) uploaded.");

  const secret = process.env.CONVERTAPI_SECRET;
  if (!secret)  return res.status(500).send("Server error: CONVERTAPI_SECRET not set.");

  const operation = req.body.operation || "rotate";
  if (!OPERATIONS[operation]) return res.status(400).send("Unknown operation: " + operation);

  const p = {
    angle:          req.body.angle          || "90",
    watermarkText:  req.body.watermarkText  || "CONFIDENTIAL",
    fontSize:       req.body.fontSize       || "60",
    opacity:        req.body.opacity        || "30",
    splitMode:      req.body.splitMode      || "byRange",
    rangeFrom:      req.body.rangeFrom      || "1",
    rangeTo:        req.body.rangeTo        || "1",
    deleteRange:    req.body.deleteRange    || "1",
    fixedRangeSize: req.body.fixedRangeSize || "1",
    fixedRangeType: req.body.fixedRangeType || "pagesPerPart",
    fixedPartCount: req.body.fixedPartCount || "2",
    password:       req.body.password       || "",
    fileOrder:      req.body.fileOrder      || "",
  };

  const SEC          = "?Secret=" + secret;
  const fileId       = uuidv4();
  const outDir       = path.join(__dirname, "..", "outputs", fileId);
  fs.mkdirSync(outDir, { recursive: true });

  const primaryFile  = req.files[0];
  const sanitizedName = sanitizeFilename(primaryFile.originalname);
  const originalSize = req.files.reduce((s, f) => s + f.size, 0);
  const cleanup      = () => req.files.forEach((f) => { try { fs.unlinkSync(f.path); } catch (_) {} });

  try {

    // ════════════════════════════════════════════════════════════
    //  MERGE
    // ════════════════════════════════════════════════════════════
    if (operation === "merge") {
      if (req.files.length < 2) return res.status(400).send("Merge requires at least 2 PDF files.");

      let ordered = req.files;
      if (p.fileOrder) {
        try {
          const order = JSON.parse(p.fileOrder);
          const re    = order.map((i) => req.files[i]).filter(Boolean);
          if (re.length === req.files.length) ordered = re;
        } catch (_) {}
      }

      const body = await convertMulti(BASE + "merge" + SEC, ordered);
      cleanup();

      if (!body?.Files?.length) return res.status(500).send("Merge failed: no output.");
      const outFilename = sanitizedName + "_merged.pdf";
      const outPath     = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);
      return finishSingle(req, res, { fileId, primaryFile, sanitizedName, originalSize, outFilename, outPath, operation, operationLabel: "Merge PDFs" });
    }

    // ════════════════════════════════════════════════════════════
    //  PROTECT  → verified endpoint: pdf/to/protect
    //  fields:  UserPassword, OwnerPassword
    // ════════════════════════════════════════════════════════════
    if (operation === "protect") {
      if (!p.password.trim()) return res.status(400).send("A password is required.");
      const body = await convertSingle(
        BASE + "protect" + SEC,
        primaryFile.path, primaryFile.originalname,
        { UserPassword: p.password }
      );
      cleanup();

      if (!body?.Files?.length) return res.status(500).send("Protect failed: no output.");
      const outFilename = sanitizedName + "_protected.pdf";
      const outPath     = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);
      return finishSingle(req, res, { fileId, primaryFile, sanitizedName, originalSize, outFilename, outPath, operation, operationLabel: "Protect PDF" });
    }

    // ════════════════════════════════════════════════════════════
    //  UNLOCK  → verified endpoint: pdf/to/unprotect
    //  field:   Password
    // ════════════════════════════════════════════════════════════
    if (operation === "unlock") {
      if (!p.password.trim()) return res.status(400).send("Current PDF password is required.");
      const body = await convertSingle(
        BASE + "unprotect" + SEC,
        primaryFile.path, primaryFile.originalname,
        { Password: p.password, UserPassword: p.password }
      );
      cleanup();

      if (!body?.Files?.length) return res.status(500).send("Unlock failed: no output.");
      const outFilename = sanitizedName + "_unlocked.pdf";
      const outPath     = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);
      return finishSingle(req, res, { fileId, primaryFile, sanitizedName, originalSize, outFilename, outPath, operation, operationLabel: "Unlock PDF" });
    }

    // ════════════════════════════════════════════════════════════
    //  SPLIT
    // ════════════════════════════════════════════════════════════
    if (operation === "split") {
      const mode = p.splitMode;

      // ── (a) Split by Range → single output PDF ─────────────────────────
      // ExtractPages=from-to returns exactly the pages in that range as 1 PDF.
      if (mode === "byRange") {
        const from  = Math.max(1, parseInt(p.rangeFrom) || 1);
        const to    = Math.max(from, parseInt(p.rangeTo) || from);
        const range = from === to ? String(from) : from + "-" + to;
        const body  = await convertSingle(
          BASE + "split" + SEC + "&ExtractPages=" + encodeURIComponent(range),
          primaryFile.path, primaryFile.originalname, null
        );
        cleanup();

        if (!body?.Files?.length) return res.status(500).send("Split by range failed: no output.");
        const outFilename = sanitizedName + "_split_range.pdf";
        const outPath     = path.join(outDir, outFilename);
        await fetchRemote(body.Files[0].Url, outPath);
        return finishSingle(req, res, { fileId, primaryFile, sanitizedName, originalSize, outFilename, outPath, operation, operationLabel: "Split by Range" });
      }

      // ── (b) Delete Pages → single output PDF ───────────────────────────
      // Verified endpoint: pdf/to/delete-pages  param: PageRange
      if (mode === "deletePages") {
        const body = await convertSingle(
          BASE + "delete-pages" + SEC + "&PageRange=" + encodeURIComponent(p.deleteRange || "1"),
          primaryFile.path, primaryFile.originalname, null
        );
        cleanup();

        if (!body?.Files?.length) return res.status(500).send("Delete pages failed: no output.");
        const outFilename = sanitizedName + "_deleted_pages.pdf";
        const outPath     = path.join(outDir, outFilename);
        await fetchRemote(body.Files[0].Url, outPath);
        return finishSingle(req, res, { fileId, primaryFile, sanitizedName, originalSize, outFilename, outPath, operation, operationLabel: "Delete Pages" });
      }

      // ── (c) Fixed Ranges → multiple PDFs, each downloadable ────────────
      if (mode === "fixedRanges" || mode === "splitAll") {
        let params = {};
        if (mode === "splitAll") {
          params.SplitByPageCount = 1;
        } else if (p.fixedRangeType === "pagesPerPart") {
          params.SplitByPageCount = Math.max(1, parseInt(p.fixedRangeSize) || 1);
        } else {
          params.SplitByPartCount = Math.max(1, parseInt(p.fixedPartCount) || 2);
        }

        const body = await convertSingle(
          BASE + "split" + SEC,
          primaryFile.path, primaryFile.originalname,
          params
        );
        cleanup();

        if (!body?.Files?.length) return res.status(500).send("Split failed: no output.");
        const parts = await fetchAll(body.Files, outDir, sanitizedName);
        parts.forEach((pt) => {
          pt.downloadUrl = "/tools/edit-pdf/download/" + fileId + "?file=" + encodeURIComponent(pt.filename);
        });

        const totalSize = parts.reduce((s, pt) => s + pt.size, 0);
        const payload   = {
          fileId, originalName: primaryFile.originalname, sanitizedName,
          originalSize, editedSize: totalSize, operation,
          operationLabel: mode === "splitAll" ? "Split All Pages" : "Fixed-Range Split",
          downloadUrl:    parts[0].downloadUrl,
          filename:       parts[0].filename,
          isSplit:        true,
          splitPages:     parts.map((pt) => ({ index: pt.index, filename: pt.filename, downloadUrl: pt.downloadUrl, size: pt.size })),
          createdAt: new Date(), userId: req.user.id,
        };
        try { await new EditedFile(payload).save(); } catch (e) { console.error("DB save:", e.message); }
        return req.xhr ? res.json(payload) : res.redirect("/tools/edit-pdf?token=" + req.query.token);
      }

      cleanup();
      return res.status(400).send("Unknown split mode: " + mode);
    }

    // ════════════════════════════════════════════════════════════
    //  ROTATE
    // ════════════════════════════════════════════════════════════
    if (operation === "rotate") {
      const body = await convertSingle(
        BASE + "rotate" + SEC + "&Angle=" + (p.angle || "90"),
        primaryFile.path, primaryFile.originalname, null
      );
      cleanup();
      if (!body?.Files?.length) return res.status(500).send("Rotate failed: no output.");
      const outFilename = sanitizedName + "_rotated.pdf";
      const outPath     = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);
      return finishSingle(req, res, { fileId, primaryFile, sanitizedName, originalSize, outFilename, outPath, operation, operationLabel: "Rotate Pages" });
    }

    // ════════════════════════════════════════════════════════════
    //  WATERMARK
    // ════════════════════════════════════════════════════════════
    if (operation === "watermark") {
      const body = await convertSingle(
        BASE + "watermark" + SEC,
        primaryFile.path, primaryFile.originalname,
        { Text: p.watermarkText, FontSize: p.fontSize, Opacity: p.opacity }
      );
      cleanup();
      if (!body?.Files?.length) return res.status(500).send("Watermark failed: no output.");
      const outFilename = sanitizedName + "_watermarked.pdf";
      const outPath     = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);
      return finishSingle(req, res, { fileId, primaryFile, sanitizedName, originalSize, outFilename, outPath, operation, operationLabel: "Add Watermark" });
    }

    cleanup();
    return res.status(400).send("Unhandled operation: " + operation);

  } catch (err) {
    cleanup();
    console.error("[editPdf] Error:", err.message);
    const m = err.message || "";
    if (m.includes("401") || m.includes("403"))   return res.status(500).send("Operation failed: Invalid API key.");
    if (m.includes("429"))                         return res.status(429).send("Operation failed: Conversion limit reached.");
    if (m.includes("4004") || /password/i.test(m)) return res.status(400).send("Operation failed: Incorrect password.");
    return res.status(500).send("Operation failed: " + m);
  }
};

// ── GET /tools/edit-pdf/download/:id ─────────────────────────────────────────
const downloadFile = (req, res) => {
  const { id } = req.params;
  const safe   = path.basename(req.query.file || "");
  if (!safe)   return res.status(400).send("Missing file parameter.");
  const fp = path.join(__dirname, "..", "outputs", id, safe);
  if (!fs.existsSync(fp)) return res.status(404).send("File not found.");
  res.download(fp, safe);
};

// ── DELETE /tools/edit-pdf/:id ────────────────────────────────────────────────
const deleteFile = async (req, res) => {
  try {
    const { id: fileId } = req.params;
    const record = await EditedFile.findOne({ fileId, userId: req.user.id });
    if (!record) return res.status(404).send("Not found or permission denied.");
    const dir = path.join(__dirname, "..", "outputs", fileId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    await EditedFile.deleteOne({ fileId });
    res.status(200).send("Deleted.");
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).send("Server error.");
  }
};

module.exports = { renderPage, editPdf, downloadFile, deleteFile };
