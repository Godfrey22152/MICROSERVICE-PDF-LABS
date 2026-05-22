const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const pdfController = require("../controllers/pdfController");
const sessionCheck  = require("../middleware/sessionCheck");

// Storage for uploads
const upload = multer({ dest: "uploads/" });

// Allowed output formats — tiff/tif excluded: libtiff removed from the
// container image to eliminate CVE-2023-52356 and CVE-2026-4775.
const ALLOWED_FORMATS = new Set(["png", "jpeg", "jpg", "svg", "eps", "ps"]);

// Defence-in-depth: reject any POST that carries a disallowed format before
// it reaches the controller. This catches direct API calls that bypass the UI.
function validateFormat(req, res, next) {
    const format = (req.body.format || "png").toLowerCase();
    if (!ALLOWED_FORMATS.has(format)) {
        return res.status(400).send(`Unsupported format: ${format}`);
    }
    next();
}

// Secure routes (authentication required)
router.get( "/pdf-to-image",        sessionCheck, pdfController.renderPdfToImagePage);
router.post("/pdf-to-image",        sessionCheck, upload.single("pdf"), validateFormat, pdfController.convertPdfToImage);

// Public routes for viewing and downloading files
router.get("/pdf-to-image/view/:id",        pdfController.serveImage);
router.get("/pdf-to-image/download/:id",    pdfController.downloadImage);
router.get("/pdf-to-image/view-legacy/:id", pdfController.serveLegacyImage);

// Route to delete a processed file
router.delete("/pdf-to-image/:id", sessionCheck, pdfController.deleteProcessedFile);

module.exports = router;
