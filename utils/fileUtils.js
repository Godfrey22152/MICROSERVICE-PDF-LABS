const path = require("path");

// Sanitize filenames to prevent security risks like directory traversal
const sanitizeFilename = (filename) => {
    // Decode URI-encoded characters to prevent encoded traversal sequences
    const decodedFilename = decodeURIComponent(filename);

    // Normalize path to resolve ".." and "." segments
    const normalized = path.normalize(decodedFilename);

    // Use path.basename to extract the final component of the path, effectively stripping directory info
    const base = path.basename(normalized);

    // Replace any characters that are not alphanumeric, dashes, underscores, or dots
    // This is a strict whitelist for common file naming conventions
    const sanitized = base.replace(/[^a-zA-Z0-9-_\.]/g, '_');

    // Limit filename length to prevent filesystem errors
    const maxLength = 200;
    return sanitized.substring(0, maxLength);
};

module.exports = {
    sanitizeFilename,
};
