// ---------- Error Handlers ----------

// Reject multi-page PDFs for single-page formats (SVG, EPS, PS)
function rejectMultiPageIfNeeded(formatConfig, pageCount, res) {
  if (!formatConfig.multiPage && pageCount > 1) {
    const ext = formatConfig.ext.toUpperCase();
    return res
      .status(400)
      .send(`Conversion failed: ${ext} supports only single-page PDFs. Upload a one-page document and try again.`);
  }
  return null;
}

function handleExecError(err, stderr, res) {
  console.error("Conversion error:", err);
  console.error("stderr:", stderr);

  const errorMsg =
    stderr && stderr.trim() !== ""
      ? stderr.trim()
      : err.message || "Unknown conversion error";

  return res
    .status(500)
    .send(`Conversion failed: ${errorMsg} Upload a one-page document and try again`);
}

// Global middleware
function globalErrorHandler(err, req, res, next) {
  console.error("Global error:", err);

  const errorMsg = err.message || "Internal Server Error";
  res.status(err.status || 500).send(`Error: ${errorMsg}`);
}

module.exports = { handleExecError, globalErrorHandler, rejectMultiPageIfNeeded };
