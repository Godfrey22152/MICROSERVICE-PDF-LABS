const { PDFDocument, rgb } = require("pdf-lib");
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const ProcessedFile = require("../models/ProcessedFile"); // MongoDB model

// Render main Image-to-PDF page
const renderImageToPdfPage = async (req, res) => {
    try {
        // Fetch user's processed files from DB, newest first
        const files = await ProcessedFile.find({
            userId: req.user.id,
            $or: [
                { conversionType: 'image-to-pdf' },
                { conversionType: { $exists: false } }
            ]
        }).sort({ createdAt: -1 });

        res.render("image-to-pdf", {
            locals: { processedFiles: files, token: req.query.token },
        });
    } catch (err) {
        console.error("Error fetching processed files:", err);
        res.render("image-to-pdf", {
            locals: { processedFiles: [], token: req.query.token },
        });
    }
};

// Convert Images to PDF
const convertImageToPdf = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).send("No files uploaded.");
        }

        const pdfDoc = await PDFDocument.create();

        for (const file of req.files) {
            const imageBytes = await fs.readFile(file.path);
            let image;
            if (file.mimetype === 'image/jpeg') {
                image = await pdfDoc.embedJpg(imageBytes);
            } else if (file.mimetype === 'image/png') {
                image = await pdfDoc.embedPng(imageBytes);
            } else {
                // Clean up uploaded files
                for (const f of req.files) {
                    await fs.unlink(f.path);
                }
                return res.status(400).send("Unsupported image format. Please use JPG or PNG.");
            }
            
            const page = pdfDoc.addPage([image.width, image.height]);
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: image.width,
                height: image.height,
            });
        }

        const pdfBytes = await pdfDoc.save();
        const fileId = uuidv4();
        const outDir = path.join(__dirname, "..", "outputs");
        const outPath = path.join(outDir, `${fileId}.pdf`);

        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(outPath, pdfBytes);

        // Clean up uploaded files
        for (const file of req.files) {
            await fs.unlink(file.path);
        }

        const originalFilename = req.files[0].originalname;
        const baseFilename = path.parse(originalFilename).name;

        const payload = {
            fileId,
            filename: `${baseFilename}.pdf`,
            sanitizedName: `${baseFilename}.pdf`,
            format: 'pdf',
            conversionType: 'image-to-pdf',
            totalPages: req.files.length,
            createdAt: new Date(),
            userId: req.user.id, // Associate with user
            downloadUrl: `/tools/image-to-pdf/download/${fileId}`,
            viewUrl: `/tools/image-to-pdf/view/${fileId}`,
        };

        // Save metadata in MongoDB
        try {
            const dbEntry = new ProcessedFile(payload);
            await dbEntry.save();
            console.log("Processed file saved to DB:", dbEntry._id);
        } catch (dbErr) {
            console.error("Error saving processed file:", dbErr);
        }

        if (req.xhr) {
            return res.json(payload);
        }
        res.redirect(`/tools/image-to-pdf?token=${req.query.token}`);

    } catch (error) {
        console.error(error);
        res.status(500).send("An error occurred while converting the images to PDF.");
    }
};

// Download generated PDF
const downloadPdf = async (req, res) => {
    const { id } = req.params;
    const filePath = path.join(__dirname, "..", "outputs", `${id}.pdf`);

    try {
        await fs.access(filePath);
        res.download(filePath, "converted.pdf");
    } catch (error) {
        res.status(404).send("File not found.");
    }
};

// View generated PDF
const viewPdf = async (req, res) => {
    const { id } = req.params;
    const filePath = path.join(__dirname, "..", "outputs", `${id}.pdf`);

    try {
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch (error) {
        res.status(404).send("File not found.");
    }
};

// Delete a processed file
const deleteProcessedFile = async (req, res) => {
    try {
        const fileId = req.params.id;
        const userId = req.user.id;

        // Find the file to ensure it exists and belongs to the user
        const file = await ProcessedFile.findOne({ fileId: fileId, userId: userId });

        if (!file) {
            return res.status(404).send("File not found or you don't have permission to delete it.");
        }

        // Delete the file from the filesystem
        const filePath = path.join(__dirname, "..", "outputs", `${fileId}.pdf`);
        try {
            await fs.unlink(filePath);
        } catch (err) {
            // If the error is that the file doesn't exist, we can ignore it and proceed.
            // Otherwise, rethrow the error to be caught by the main catch block.
            if (err.code !== 'ENOENT') {
                throw err;
            }
            console.log(`File not found, but proceeding with DB deletion: ${filePath}`);
        }

        // Delete the entry from the database, ensuring it belongs to the user
        await ProcessedFile.deleteOne({ fileId: fileId, userId: userId });

        res.status(200).send("File deleted successfully.");

    } catch (error) {
        console.error("Error deleting file:", error);
        res.status(500).send("Server error while deleting file.");
    }
};

module.exports = {
    renderImageToPdfPage,
    convertImageToPdf,
    downloadPdf,
    viewPdf,
    deleteProcessedFile,
};
