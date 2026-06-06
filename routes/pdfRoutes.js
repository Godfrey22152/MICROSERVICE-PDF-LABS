const express = require("express");
const router = express.Router();
const multer = require("multer");
const pdfController = require("../controllers/pdfController");
const sessionCheck = require("../middleware/sessionCheck");

const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB cap
});

// Secured routes
router.get("/pdf-compressor", sessionCheck, pdfController.renderCompressorPage);
router.post("/pdf-compressor", sessionCheck, upload.single("pdf"), pdfController.compressPdf);

// Public download
router.get("/pdf-compressor/download/:id", pdfController.downloadCompressedFile);

// Delete a compressed file
router.delete("/pdf-compressor/:id", sessionCheck, pdfController.deleteCompressedFile);

module.exports = router;
