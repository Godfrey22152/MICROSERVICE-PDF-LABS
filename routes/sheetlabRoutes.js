const express    = require("express");
const router     = express.Router();
const multer     = require("multer");
const path       = require("path");
const fs         = require("fs");
const { renderPage, convertDoc, downloadFile, deleteFile } = require("../controllers/sheetlabController");
const auth = require("../middleware/auth");

// ── Upload directory ──────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Multer config ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = [".pdf", ".xlsx", ".xls"];
  if (allowed.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, XLSX and XLS files are accepted."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

// ── Routes ────────────────────────────────────────────────────────────────────
router.get("/",                  auth, renderPage);
router.post("/",                 auth, upload.single("sheetFile"), convertDoc);
// Download is exempt from auth — the UUID fileId + filename is unguessable.
// The token is also appended to the URL as a fallback for browsers that
// send no Authorization header on plain <a href> clicks.
router.get("/download/:id",      downloadFile);
router.delete("/:id",            auth, deleteFile);

// ── Multer error handler ──────────────────────────────────────────────────────
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).send("Upload error: " + err.message);
  }
  next(err);
});

module.exports = router;
