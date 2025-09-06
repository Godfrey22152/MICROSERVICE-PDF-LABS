const express = require("express");
const router = express.Router();
const multer = require("multer");
const imageToPdfController = require("../controllers/imageToPdfController");
const sessionCheck = require("../middleware/sessionCheck"); // Import session middleware

// Storage for uploads
const upload = multer({ dest: "uploads/" });

// New routes for image-to-PDF conversion
router.get("/image-to-pdf", sessionCheck, imageToPdfController.renderImageToPdfPage);
router.post("/image-to-pdf", sessionCheck, upload.array("images"), imageToPdfController.convertImageToPdf);
router.get("/image-to-pdf/view/:id", imageToPdfController.viewPdf);
router.get("/image-to-pdf/download/:id", imageToPdfController.downloadPdf);
router.delete("/image-to-pdf/:id", sessionCheck, imageToPdfController.deleteProcessedFile);

module.exports = router;
