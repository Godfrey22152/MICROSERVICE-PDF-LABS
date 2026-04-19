// =====================================================================
//  errorHandler.js  —  SheetLab global error middleware
//  Client-side session/auth error handling lives in public/js/sheetlab.js
// =====================================================================

/**
 * 404 handler — mount AFTER all routes.
 */
function notFound(req, res, next) {
  res.status(404).render("error", {
    locals: {
      statusCode: 404,
      title:      "Page Not Found",
      message:    "The page you are looking for does not exist.",
      token:      req.query.token || "",
    },
  });
}

/**
 * Global error handler — mount last of all middleware.
 * Catches anything passed via next(err).
 */
function errorHandler(err, req, res, next) {
  console.error("[SheetLab] Global error:", err.stack || err.message || err);

  const statusCode = err.status || err.statusCode || 500;
  const message    = err.message || "An unexpected error occurred.";

  // Multer file-size / unexpected-field errors
  if (err.code === "LIMIT_FILE_SIZE") {
    const isXhr = req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest";
    return isXhr
      ? res.status(413).json({ error: true, type: "FILE_TOO_LARGE", msg: "File exceeds the 100 MB size limit." })
      : res.status(413).send("Upload error: File exceeds the 100 MB size limit.");
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    const isXhr = req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest";
    return isXhr
      ? res.status(400).json({ error: true, type: "UNEXPECTED_FILE", msg: "Unexpected file field." })
      : res.status(400).send("Upload error: Unexpected file field.");
  }

  // AJAX / XHR requests — return typed JSON
  if (req.xhr || req.headers["x-requested-with"] === "XMLHttpRequest") {
    return res.status(statusCode).json({
      error: true,
      type:  "SERVER_ERROR",
      msg:   message,
    });
  }

  // Browser requests — render error page, fallback to plain text
  try {
    return res.status(statusCode).render("error", {
      locals: {
        statusCode,
        title:   "Error " + statusCode,
        message,
        token:   req.query.token || "",
      },
    });
  } catch (_) {
    return res.status(statusCode).send(statusCode + " — " + message);
  }
}

/**
 * Conversion error helper — called directly from controllers.
 */
function handleExecError(err, stderr, res) {
  console.error("[SheetLab] Conversion error:", err);
  console.error("[SheetLab] stderr:", stderr);
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

module.exports = { notFound, errorHandler, handleExecError };
