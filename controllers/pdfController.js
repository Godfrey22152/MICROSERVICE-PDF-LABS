const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { handleExecError, rejectMultiPageIfNeeded } = require("../utils/errorHandler");
const { sanitizeFilename } = require("../utils/fileUtils");
const ProcessedFile = require("../models/ProcessedFile"); // MongoDB model

// Render main PDF-to-image page
const renderPdfToImagePage = async (req, res) => {
    console.log("GET /tools/pdf-to-image hit");

    try {
        // Fetch user's processed files from DB, newest first
        const files = await ProcessedFile.find({ userId: req.user.id }).sort({ createdAt: -1 });

        res.render("pdf-to-image", {
            locals: { processedFiles: files, token: req.query.token },
        });
    } catch (err) {
        console.error("Error fetching processed files:", err);
        res.render("pdf-to-image", {
            locals: { processedFiles: [], token: req.query.token },
        });
    }
};

// Convert PDF to images
const convertPdfToImage = async (req, res) => {
    console.log("POST /tools/pdf-to-image hit");
    const pdfPath = req.file.path;
    const format = req.body.format || "png";
    const fileId = uuidv4();
    const outDir = path.join(__dirname, "..", "outputs", fileId);
    fs.mkdirSync(outDir, { recursive: true });

    const sanitizedName = sanitizeFilename(req.file.originalname);
    const outBase = path.join(outDir, sanitizedName);

    // Format mapping
    const formatMap = {
        png: { flag: "-png", ext: "png", multiPage: true },
        jpeg: { flag: "-jpeg", ext: "jpg", multiPage: true },
        tiff: { flag: "-tiff", ext: "tif", multiPage: true },
        svg: { flag: "-svg", ext: "svg", multiPage: false },
        eps: { flag: "-eps", ext: "eps", multiPage: false },
        ps: { flag: "-ps", ext: "ps", multiPage: false },
    };

    // Normalize format input
    function getFormatConfig(format) {
        format = format.toLowerCase();
        if (format === "jpg") format = "jpeg";
        return formatMap[format];
    }

    const formatConfig = getFormatConfig(format);
    if (!formatConfig) {
        return res.status(400).send(`Unsupported format: ${format}`);
    }

    const quality = parseInt(req.body.quality, 10) || 600;
    let cmd;

    exec(`pdfinfo "${pdfPath}"`, (infoErr, infoStdout) => {
        if (infoErr) {
            return handleExecError(infoErr, infoErr.message, res);
        }

        const match = infoStdout.match(/Pages:\s+(\d+)/);
        const pageCount = match ? parseInt(match[1], 10) : 1;

        const rejection = rejectMultiPageIfNeeded(formatConfig, pageCount, res);
        if (rejection) return;

        if (formatConfig.multiPage) {
            cmd = `pdftocairo -r ${quality} ${formatConfig.flag} "${pdfPath}" "${outBase}"`;
        } else {
            cmd = `pdftocairo -r ${quality} ${formatConfig.flag} "${pdfPath}" "${outBase}.${formatConfig.ext}"`;
        }

        console.log(`Executing: ${cmd}`);

        exec(cmd, async (err, stdout, stderr) => {
            if (err) {
                return handleExecError(err, stderr, res);
            }

            let imageFiles = [];
            try {
                if (formatConfig.multiPage) {
                    imageFiles = fs.readdirSync(outDir).filter((f) => {
                        const regex = new RegExp(`${sanitizedName}-\\d+\\.${formatConfig.ext}$`, "i");
                        return regex.test(f);
                    });
                } else {
                    const singleFile = `${sanitizedName}.${formatConfig.ext}`;
                    if (fs.existsSync(path.join(outDir, singleFile))) {
                        imageFiles = [singleFile];
                    }
                }

                imageFiles.sort();

                if (imageFiles.length === 0) {
                    console.error("No image files generated");
                    return res.status(500).send("No images were generated");
                }

                const images = imageFiles.map((file, idx) => {
                    const previewUrl = `/tools/pdf-to-image/view/${fileId}?file=${encodeURIComponent(file)}&format=${format}`;
                    const downloadUrl = `/tools/pdf-to-image/download/${fileId}?file=${encodeURIComponent(file)}&format=${format}`;
                    return {
                        page: idx + 1,
                        filename: file,
                        previewUrl,
                        downloadUrl,
                    };
                });

                const payload = {
                    fileId,
                    filename: req.file.originalname,
                    sanitizedName,
                    format,
                    totalPages: images.length,
                    images,
                    createdAt: new Date(),
                    userId: req.user.id, // Associate with user
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
                res.redirect(`/tools/pdf-to-image?token=${req.query.token}`);
            } catch (fsErr) {
                console.error("File system error:", fsErr);
                return res.status(500).send("Error processing generated files");
            }
        });
    });
};

// Serve generated images
const serveImage = (req, res) => {
    const { id } = req.params;
    const fileName = req.query.file;
    if (!fileName) {
        return res.status(400).send("Missing file parameter");
    }
    const imgPath = path.join(__dirname, "..", "outputs", id, fileName);
    if (!fs.existsSync(imgPath)) {
        return res.status(404).send("File not found");
    }
    res.sendFile(imgPath);
};

// Download generated images
const downloadImage = (req, res) => {
    const { id } = req.params;
    const fileName = req.query.file;
    if (!fileName) {
        return res.status(400).send("Missing file parameter");
    }
    const imgPath = path.join(__dirname, "..", "outputs", id, fileName);
    if (!fs.existsSync(imgPath)) {
        return res.status(404).send("Not found");
    }
    res.download(imgPath);
};

// Legacy endpoint for old file serving
const serveLegacyImage = (req, res) => {
    const { id } = req.params;
    const page = req.query.page;
    const format = req.query.format || "png";
    const outDir = path.join(__dirname, "..", "outputs", id);
    try {
        const files = fs.readdirSync(outDir);
        const extMap = { jpeg: "jpg", jpg: "jpg", tiff: "tif", svg: "svg", eps: "eps", ps: "ps", png: "png" };
        const ext = extMap[format] || format;
        const targetFile = files.find((f) => {
            return f.includes(`-${page}.${ext}`) || f.endsWith(`.${ext}`);
        });
        if (targetFile) {
            return res.sendFile(path.join(outDir, targetFile));
        }
    } catch (err) {
        console.error("Error reading directory:", err);
    }
    res.status(404).send("Not found");
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

        // Delete the folder from the filesystem
        const fileDir = path.join(__dirname, "..", "outputs", fileId);
        if (fs.existsSync(fileDir)) {
            fs.rmSync(fileDir, { recursive: true, force: true });
        }

        // Delete the entry from the database
        await ProcessedFile.deleteOne({ fileId: fileId });

        res.status(200).send("File deleted successfully.");

    } catch (error) {
        console.error("Error deleting file:", error);
        res.status(500).send("Server error while deleting file.");
    }
};

module.exports = {
    renderPdfToImagePage,
    convertPdfToImage,
    serveImage,
    downloadImage,
    serveLegacyImage,
    deleteProcessedFile,
    sanitizeFilename
};
