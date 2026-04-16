const path     = require("path");
const fs       = require("fs");
const https    = require("https");
const http     = require("http");
const FormData = require("form-data");
const { v4: uuidv4 } = require("uuid");
const { sanitizeFilename, formatBytes } = require("../utils/fileUtils");
const EditedFile = require("../models/EditedFile");

// ─────────────────────────────────────────────────────────────────────────────
//  VERIFIED ConvertAPI v2 endpoints:
//
//  Split by Range   → POST /convert/pdf/to/split  param: SplitByRange=1-3,5,7-9
//                     Returns one PDF per range entry in Files[]
//
//  Split All Pages  → POST /convert/pdf/to/split  param: SplitByPageCount=1
//                     Returns one PDF per page in Files[]
//
//  Fixed Ranges     → POST /convert/pdf/to/split  param: SplitByPageCount=N
//                     Returns one PDF per N-page chunk in Files[]
//
//  Delete Pages     → POST /convert/pdf/to/delete-pages  param: PageRange=2,4,6-8
//                     Returns a single PDF with those pages removed
//
//  Protect          → POST /convert/pdf/to/protect  fields: UserPassword, OwnerPassword
//  Unlock           → POST /convert/pdf/to/unprotect  field: Password
//  Merge            → POST /convert/pdf/to/merge  fields: Files[0], Files[1]…
//  Rotate           → POST /convert/pdf/to/rotate  param: Angle=90|180|270
//  Watermark        → POST /convert/pdf/to/watermark  fields: Text, FontSize, Opacity
// ─────────────────────────────────────────────────────────────────────────────

const OPERATIONS = {
  rotate:    { label: "Rotate Pages",  icon: "🔄", desc: "Rotate all pages 90°, 180°, or 270°" },
  watermark: { label: "Add Watermark", icon: "💧", desc: "Stamp text watermark across every page" },
  merge:     { label: "Merge PDFs",    icon: "🔗", desc: "Combine 2+ PDFs into one document", multiFile: true },
  split:     { label: "Split PDF",     icon: "✂️",  desc: "Split into pages, ranges or remove pages" },
  protect:   { label: "Protect PDF",   icon: "🔒", desc: "Password-protect your PDF" },
  unlock:    { label: "Unlock PDF",    icon: "🔓", desc: "Remove password protection" },
};

const BASE = "https://v2.convertapi.com/convert/pdf/to/";

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

// ── Download a single remote file ────────────────────────────────────────────
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

// ── Download every file in a multi-result response ───────────────────────────
// labelFn(i, total) lets each caller control how parts are named
async function fetchAll(resultFiles, outDir, baseName, labelFn) {
  const parts = [];
  for (let i = 0; i < resultFiles.length; i++) {
    const label    = labelFn ? labelFn(i, resultFiles.length) : "part" + (i + 1);
    const filename = baseName + "_" + label + ".pdf";
    const dest     = path.join(outDir, filename);
    await fetchRemote(resultFiles[i].Url, dest);
    parts.push({ index: i + 1, label, filename, path: dest, size: fs.statSync(dest).size });
  }
  return parts;
}

// ── Save DB record + send response (single-file operations) ──────────────────
async function finishSingle(req, res, opts) {
  const { fileId, primaryFile, sanitizedName, originalSize, outFilename, outPath, operation, operationLabel } = opts;
  const editedSize = fs.statSync(outPath).size;
  const dlUrl      = "/tools/edit-pdf/download/" + fileId + "?file=" + encodeURIComponent(outFilename);
  const payload    = {
    fileId,
    originalName:   primaryFile.originalname,
    sanitizedName,
    originalSize,
    editedSize,
    operation,
    operationLabel,
    downloadUrl:    dlUrl,
    filename:       outFilename,
    isSplit:        false,
    splitPages:     [],
    createdAt:      new Date(),
    userId:         req.user.id,
  };
  try { await new EditedFile(payload).save(); } catch (e) { console.error("DB:", e.message); }
  return req.xhr ? res.json(payload) : res.redirect("/tools/edit-pdf?token=" + req.query.token);
}

// ── Save DB record + send response (multi-part split operations) ──────────────
async function finishMultiPart(req, res, opts) {
  const { fileId, primaryFile, sanitizedName, originalSize, parts, operation, operationLabel } = opts;
  parts.forEach((pt) => {
    pt.downloadUrl = "/tools/edit-pdf/download/" + fileId + "?file=" + encodeURIComponent(pt.filename);
  });
  const totalSize = parts.reduce((s, pt) => s + pt.size, 0);
  const payload   = {
    fileId,
    originalName:   primaryFile.originalname,
    sanitizedName,
    originalSize,
    editedSize:     totalSize,
    operation,
    operationLabel,
    downloadUrl:    parts[0].downloadUrl,
    filename:       parts[0].filename,
    isSplit:        true,
    splitPages:     parts.map((pt) => ({
      index:       pt.index,
      filename:    pt.filename,
      downloadUrl: pt.downloadUrl,
      size:        pt.size,
    })),
    createdAt: new Date(),
    userId:    req.user.id,
  };
  try { await new EditedFile(payload).save(); } catch (e) { console.error("DB:", e.message); }
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
  console.log("[editPdf] operation:", req.body.operation, "| files:", req.files?.length);

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
    // Read from the specific named field to avoid array collision between protect/unlock
    password: (function() {
      var raw = operation === "protect" ? req.body.protectPassword
              : operation === "unlock"  ? req.body.unlockPassword
              : req.body.password;
      return String(Array.isArray(raw) ? raw[0] : (raw || ""));
    })(),
    fileOrder:      req.body.fileOrder      || "",
    mergedName:     req.body.mergedName     || "",
  };

  const SEC          = "?Secret=" + secret;
  const fileId       = uuidv4();
  const outDir       = path.join(__dirname, "..", "outputs", fileId);
  fs.mkdirSync(outDir, { recursive: true });

  const primaryFile   = req.files[0];
  const sanitizedName = sanitizeFilename(primaryFile.originalname);
  const originalSize  = req.files.reduce((s, f) => s + f.size, 0);
  const cleanup       = () => req.files.forEach((f) => { try { fs.unlinkSync(f.path); } catch (_) {} });

  try {

    // ════════════════════════════════════════════════════════════════════
    //  SPLIT — four sub-modes
    // ════════════════════════════════════════════════════════════════════
    if (operation === "split") {
      const mode = p.splitMode;

      // ── (a) Split by Range ───────────────────────────────────────────
      // SplitByRange=from-to  returns one PDF per range entry in Files[]
      // A single "1-5" entry → Files[0] is the extracted PDF for pages 1-5
      if (mode === "byRange") {
        const from  = Math.max(1, parseInt(p.rangeFrom) || 1);
        const to    = Math.max(from, parseInt(p.rangeTo) || from);
        const range = from === to ? String(from) : from + "-" + to;

        console.log("[Split byRange] SplitByRange=" + range);

        const body = await convertSingle(
          BASE + "split" + SEC + "&SplitByRange=" + encodeURIComponent(range),
          primaryFile.path, primaryFile.originalname, null
        );
        cleanup();

        if (!body?.Files?.length)
          return res.status(500).send("Split by range failed: ConvertAPI returned no output.");

        const outFilename = sanitizedName + "_pages_" + from + "-" + to + ".pdf";
        const outPath     = path.join(outDir, outFilename);
        await fetchRemote(body.Files[0].Url, outPath);

        return finishSingle(req, res, {
          fileId, primaryFile, sanitizedName, originalSize,
          outFilename, outPath, operation,
          operationLabel: "Split by Range (pages " + from + "–" + to + ")",
        });
      }

      // ── (b) Delete Pages ─────────────────────────────────────────────
      // Endpoint: pdf/to/delete-pages  param: PageRange=from-to
      // Returns a single PDF with those pages removed
      if (mode === "deletePages") {
        const deleteRange = p.deleteRange || "1";
        console.log("[Split deletePages] PageRange=" + deleteRange);

        const body = await convertSingle(
          BASE + "delete-pages" + SEC + "&PageRange=" + encodeURIComponent(deleteRange),
          primaryFile.path, primaryFile.originalname, null
        );
        cleanup();

        if (!body?.Files?.length)
          return res.status(500).send("Delete pages failed: ConvertAPI returned no output.");

        const outFilename = sanitizedName + "_deleted_pages.pdf";
        const outPath     = path.join(outDir, outFilename);
        await fetchRemote(body.Files[0].Url, outPath);

        return finishSingle(req, res, {
          fileId, primaryFile, sanitizedName, originalSize,
          outFilename, outPath, operation,
          operationLabel: "Delete Pages (" + deleteRange + ")",
        });
      }

      // ── (c) Fixed Ranges (equal N-page chunks) ────────────────────────
      // SplitByPattern=N  → repeats the N-page chunk pattern across all pages
      // e.g. SplitByPattern=2 on 8 pages → [1-2],[3-4],[5-6],[7-8] = 4 parts
      // Each chunk downloads as its own individual PDF (no ZIP)
      if (mode === "fixedRanges") {
        const n = Math.max(1, parseInt(p.fixedRangeSize) || 1);
        console.log("[Split fixedRanges] SplitByPattern=" + n);

        const body = await convertSingle(
          BASE + "split" + SEC + "&SplitByPattern=" + n,
          primaryFile.path, primaryFile.originalname, null
        );
        cleanup();

        if (!body?.Files?.length)
          return res.status(500).send("Fixed-range split failed: ConvertAPI returned no output.");

        const parts = await fetchAll(
          body.Files, outDir, sanitizedName,
          (i) => "part" + (i + 1)
        );

        return finishMultiPart(req, res, {
          fileId, primaryFile, sanitizedName, originalSize, parts, operation,
          operationLabel: "Split PDF — " + parts.length + " parts (" + n + " page" + (n > 1 ? "s" : "") + " each)",
        });
      }

      // ── (d) Split All Pages ───────────────────────────────────────────
      // SplitByPageCount=1  → every single page becomes its own PDF
      // Returns Files[] with one entry per page — each downloads individually
      if (mode === "allPages") {
        console.log("[Split allPages] SplitByPageCount=1");

        const body = await convertSingle(
          BASE + "split" + SEC + "&SplitByPageCount=1",
          primaryFile.path, primaryFile.originalname, null
        );
        cleanup();

        if (!body?.Files?.length)
          return res.status(500).send("Split all pages failed: ConvertAPI returned no output.");

        const parts = await fetchAll(
          body.Files, outDir, sanitizedName,
          (i, total) => "page" + (i + 1) + "_of_" + total
        );

        return finishMultiPart(req, res, {
          fileId, primaryFile, sanitizedName, originalSize, parts, operation,
          operationLabel: "Split All Pages — " + parts.length + " pages",
        });
      }

      cleanup();
      return res.status(400).send("Unknown split mode: " + mode);
    }

    // ════════════════════════════════════════════════════════════════════
    //  MERGE
    // ════════════════════════════════════════════════════════════════════
    if (operation === "merge") {
      if (req.files.length < 2)
        return res.status(400).send("Merge requires at least 2 PDF files.");

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

      // Use custom name if provided, else fall back to first file's sanitized name
      const rawMergedName  = (p.mergedName || "").trim().replace(/[^a-zA-Z0-9 _\-().]/g, "").trim();
      const mergedBaseName = rawMergedName || sanitizedName;
      const outFilename    = mergedBaseName + "_merged.pdf";
      const displayName    = mergedBaseName + ".pdf";   // shown in the card
      const outPath        = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);
      return finishSingle(req, res, {
        fileId,
        primaryFile:   { ...primaryFile, originalname: displayName },  // override display name
        sanitizedName: mergedBaseName,
        originalSize,
        outFilename, outPath, operation,
        operationLabel: "Merge PDFs" + (rawMergedName ? " → " + displayName : ""),
      });
    }

    // ════════════════════════════════════════════════════════════════════
    //  PROTECT  — pdf/to/protect  fields: UserPassword, OwnerPassword
    // ════════════════════════════════════════════════════════════════════
    if (operation === "protect") {
      if (!p.password.trim()) return res.status(400).send("A password is required to protect a PDF.");
      const body = await convertSingle(
        BASE + "protect" + SEC,
        primaryFile.path, primaryFile.originalname,
        { UserPassword: p.password, OwnerPassword: p.password }
      );
      cleanup();
      if (!body?.Files?.length) return res.status(500).send("Protect failed: no output.");
      const outFilename = sanitizedName + "_protected.pdf";
      const outPath     = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);
      return finishSingle(req, res, {
        fileId, primaryFile, sanitizedName, originalSize,
        outFilename, outPath, operation, operationLabel: "Protect PDF",
      });
    }

    // ════════════════════════════════════════════════════════════════════
    //  UNLOCK  — pdf/to/unprotect  field: Password
    // ════════════════════════════════════════════════════════════════════
    if (operation === "unlock") {
      if (!p.password.trim()) return res.status(400).send("Current PDF password is required.");
      const body = await convertSingle(
        BASE + "unprotect" + SEC,
        primaryFile.path, primaryFile.originalname,
        { Password: p.password }
      );
      cleanup();
      if (!body?.Files?.length) return res.status(500).send("Unlock failed: no output.");
      const outFilename = sanitizedName + "_unlocked.pdf";
      const outPath     = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);
      return finishSingle(req, res, {
        fileId, primaryFile, sanitizedName, originalSize,
        outFilename, outPath, operation, operationLabel: "Unlock PDF",
      });
    }

    // ════════════════════════════════════════════════════════════════════
    //  ROTATE
    // ════════════════════════════════════════════════════════════════════
    if (operation === "rotate") {
      const body = await convertSingle(
        BASE + "rotate" + SEC + "&Angle=" + (p.angle || "90"),
        primaryFile.path, primaryFile.originalname, null
      );
      cleanup();
      if (!body?.Files?.length) return res.status(500).send("Rotate failed.");
      const outFilename = sanitizedName + "_rotated.pdf";
      const outPath     = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);
      return finishSingle(req, res, {
        fileId, primaryFile, sanitizedName, originalSize,
        outFilename, outPath, operation, operationLabel: "Rotate Pages",
      });
    }

    // ════════════════════════════════════════════════════════════════════
    //  WATERMARK
    // ════════════════════════════════════════════════════════════════════
    if (operation === "watermark") {
      const body = await convertSingle(
        BASE + "watermark" + SEC,
        primaryFile.path, primaryFile.originalname,
        { Text: p.watermarkText, FontSize: p.fontSize, Opacity: p.opacity }
      );
      cleanup();
      if (!body?.Files?.length) return res.status(500).send("Watermark failed.");
      const outFilename = sanitizedName + "_watermarked.pdf";
      const outPath     = path.join(outDir, outFilename);
      await fetchRemote(body.Files[0].Url, outPath);
      return finishSingle(req, res, {
        fileId, primaryFile, sanitizedName, originalSize,
        outFilename, outPath, operation, operationLabel: "Add Watermark",
      });
    }

    cleanup();
    return res.status(400).send("Unhandled operation: " + operation);

  } catch (err) {
    cleanup();
    console.error("[editPdf] Error:", err.message);
    const m = err.message || "";
    console.error("[editPdf] RAW error for op=" + operation + ":", m);
    if (m.includes("401") || m.includes("403"))
      return res.status(500).send("Operation failed: Invalid API key.");
    if (m.includes("429"))
      return res.status(429).send("Operation failed: Conversion limit reached.");
    // Only treat password errors as "incorrect password" during unlock — not during protect
    if (operation === "unlock" && (m.includes("4004") || /password/i.test(m)))
      return res.status(400).send("Operation failed: Incorrect password. Please check and try again.");
    return res.status(500).send("Operation failed: " + m);
  }
};

// ── GET /tools/edit-pdf/download/:id ─────────────────────────────────────────
const downloadFile = (req, res) => {
  const { id } = req.params;
  const safe   = path.basename(req.query.file || "");
  if (!safe)   return res.status(400).send("Missing file parameter.");
  const fp     = path.join(__dirname, "..", "outputs", id, safe);
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
