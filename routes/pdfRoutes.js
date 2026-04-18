const express = require("express");
const router = express.Router();
const multer = require("multer");
const controller = require("../controllers/pdfController");
const sessionCheck = require("../middleware/sessionCheck");

const ALLOWED_MIME = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/msword",                                                        // doc
  "application/vnd.oasis.opendocument.text",                                  // odt
  "application/rtf", "text/rtf",                                              // rtf
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",// pptx
  "application/vnd.ms-powerpoint",                                            // ppt
];

const ALLOWED_EXT = /\.(docx|doc|odt|rtf|pptx|ppt)$/i;

const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    const extOk = ALLOWED_EXT.test(file.originalname);
    if (extOk) { cb(null, true); }
    else { cb(new Error("Only Word, ODT, RTF and PowerPoint files are allowed"), false); }
  },
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.get("/word-to-pdf",  sessionCheck, controller.renderPage);
router.post("/word-to-pdf", sessionCheck, upload.single("wordFile"), controller.convertToPdf);
router.get("/word-to-pdf/download/:id", controller.downloadFile);
router.delete("/word-to-pdf/:id", sessionCheck, controller.deleteFile);

module.exports = router;
