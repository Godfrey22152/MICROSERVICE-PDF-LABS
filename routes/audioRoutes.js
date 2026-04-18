const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const audioController = require("../controllers/audioController");
const sessionCheck = require("../middleware/sessionCheck");

// Ensure uploads directory exists
const fs = require("fs");
const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Added fileSize limit (100MB) and PDF-only file filter
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB maximum
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    if (ext === ".pdf" && mime === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed."), false);
    }
  },
});

// Multer error handler middleware (catches file size & type errors cleanly)
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).send("File too large. Maximum allowed size is 100MB.");
    }
    return res.status(400).send(`Upload error: ${err.message}`);
  }
  if (err) {
    return res.status(400).send(err.message);
  }
  next();
}

router.get("/pdf-to-audio", sessionCheck, audioController.renderPdfToAudioPage);

router.post(
  "/pdf-to-audio",
  sessionCheck,
  (req, res, next) => {
    upload.single("pdf")(req, res, (err) => handleMulterError(err, req, res, next));
  },
  audioController.convertPdfToAudio
);

router.get("/pdf-to-audio/view/:id", audioController.serveAudio);
router.get("/pdf-to-audio/download/:id", audioController.downloadAudio);
router.delete("/pdf-to-audio/:id", sessionCheck, audioController.deleteProcessedFile);

module.exports = router;
