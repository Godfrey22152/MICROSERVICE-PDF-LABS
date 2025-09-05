// ---------- Error Handlers ----------

function handleExecError(err, stderr, res) {
  console.error("Conversion error:", err);
  console.error("stderr:", stderr);

  const errorMsg =
    stderr && stderr.trim() !== ""
      ? stderr.trim()
      : err.message || "Unknown conversion error";

  return res
    .status(500)
    .send(`Conversion failed: ${errorMsg}`);
}

// Global middleware
function globalErrorHandler(err, req, res, next) {
  console.error("Global error:", err);

  const errorMsg = err.message || "Internal Server Error";
  res.status(err.status || 500).send(`Error: ${errorMsg}`);
}

module.exports = { handleExecError, globalErrorHandler };
