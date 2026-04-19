/**
 * Sanitize a filename — strip extension, remove unsafe chars, trim.
 * @param {string} originalName
 * @returns {string}
 */
function sanitizeFilename(originalName) {
  return (originalName || "file")
    .replace(/\.[^.]+$/, "")           // remove extension
    .replace(/[^a-zA-Z0-9 _\-().]/g, "") // keep safe chars
    .trim()
    .slice(0, 100) || "file";
}

/**
 * Human-readable file size.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

module.exports = { sanitizeFilename, formatBytes };
