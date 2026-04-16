const express      = require("express");
const router       = express.Router();
const multer       = require("multer");
const controller   = require("../controllers/pdfController");
const sessionCheck = require("../middleware/sessionCheck");

const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.get(    "/edit-pdf",              sessionCheck, controller.renderPage);
router.post(   "/edit-pdf",              sessionCheck, upload.array("pdfFiles", 10), controller.editPdf);
router.get(    "/edit-pdf/download/:id", controller.downloadFile);
router.delete( "/edit-pdf/:id",          sessionCheck, controller.deleteFile);

module.exports = router;
