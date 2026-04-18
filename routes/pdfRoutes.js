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
router.get("/pdf-to-word", sessionCheck, pdfController.renderPdfToWordPage);
router.post("/pdf-to-word", sessionCheck, upload.single("pdf"), pdfController.convertPdfToWord);

// Public download
router.get("/pdf-to-word/download/:id", pdfController.downloadConvertedFile);

// Delete a converted file
router.delete("/pdf-to-word/:id", sessionCheck, pdfController.deleteConvertedFile);

module.exports = router;
