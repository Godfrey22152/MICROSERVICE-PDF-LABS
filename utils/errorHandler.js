/**
 * errorHandler.js — Server-side error utilities for the Word to PDF service.
 * Client-side session/auth error handling lives in public/js/main.js (handleAuthError).
 */

function handleExecError(err, stderr, res) {
  console.error("[Word to PDF] Conversion error:", err);
  console.error("[Word to PDF] stderr:", stderr);
  const errorMsg =
    stderr && stderr.trim() !== ""
      ? stderr.trim()
      : err.message || "Unknown conversion error";
  return res.status(500).json({
    error: true,
    type:  "CONVERSION_ERROR",
    msg:   "Conversion failed: " + errorMsg,
  });
}

function globalErrorHandler(err, req, res, next) {
  console.error("[Word to PDF] Global error:", err);
  const status   = err.status || 500;
  const errorMsg = err.message || "Internal Server Error";

  // Return JSON for AJAX requests, plain text for direct browser navigation
  if (req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest") {
    return res.status(status).json({
      error: true,
      type:  "SERVER_ERROR",
      msg:   errorMsg,
    });
  }

  res.status(status).send("Error: " + errorMsg);
}

module.exports = { handleExecError, globalErrorHandler };
