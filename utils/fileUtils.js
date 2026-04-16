const path = require("path");
function sanitizeFilename(filename) {
  const nameWithoutExt = path.parse(filename).name;
  return nameWithoutExt.replace(/[^a-zA-Z0-9\-_\s]/g, "_").replace(/\s+/g, "_");
}
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
module.exports = { sanitizeFilename, formatBytes };
