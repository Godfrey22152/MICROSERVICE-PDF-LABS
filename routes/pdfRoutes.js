const express = require("express");
const router = express.Router();
const multer = require("multer");
const pdfController = require("../controllers/pdfController");
const sessionCheck = require("../middleware/sessionCheck"); // Import session middleware

// Storage for uploads
const upload = multer({ dest: "uploads/" });

// Secure routes (authentication required)
router.get("/pdf-to-image", sessionCheck, pdfController.renderPdfToImagePage);
router.post("/pdf-to-image", sessionCheck, upload.single("pdf"), pdfController.convertPdfToImage);

// Public routes for viewing and downloading files
router.get("/pdf-to-image/view/:id", pdfController.serveImage);
router.get("/pdf-to-image/download/:id", pdfController.downloadImage);
router.get("/pdf-to-image/view-legacy/:id", pdfController.serveLegacyImage);

// Route to delete a processed file
router.delete("/pdf-to-image/:id", sessionCheck, pdfController.deleteProcessedFile);

module.exports = router;
