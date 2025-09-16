const express = require("express");
const router = express.Router();
const multer = require("multer");
const audioController = require("../controllers/audioController");
const sessionCheck = require("../middleware/sessionCheck");

// Ensure uploads directory exists
const fs = require('fs');
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const upload = multer({ dest: uploadDir });

router.get("/pdf-to-audio", sessionCheck, audioController.renderPdfToAudioPage);
router.post("/pdf-to-audio", sessionCheck, upload.single("pdf"), audioController.convertPdfToAudio);
router.get("/pdf-to-audio/view/:id", audioController.serveAudio);
router.get("/pdf-to-audio/download/:id", audioController.downloadAudio);
router.delete("/pdf-to-audio/:id", sessionCheck, audioController.deleteProcessedFile);

module.exports = router;
