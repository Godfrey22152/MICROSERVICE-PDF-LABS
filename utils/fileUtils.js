const path = require("path");

// Helper function to sanitize filename for filesystem
function sanitizeFilename(filename) {
    const nameWithoutExt = path.parse(filename).name;
    return nameWithoutExt.replace(/[^a-zA-Z0-9\-_\s]/g, "_").replace(/\s+/g, "_");
}

module.exports = {
    sanitizeFilename,
};
