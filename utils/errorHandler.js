function handleExecError(err, stderr, res) {
  console.error("Operation error:", err);
  const errorMsg = (stderr && stderr.trim()) ? stderr.trim() : (err.message || "Unknown error");
  return res.status(500).send("Operation failed: " + errorMsg);
}
function globalErrorHandler(err, req, res, next) {
  console.error("Global error:", err);
  res.status(err.status || 500).send("Error: " + (err.message || "Internal Server Error"));
}
module.exports = { handleExecError, globalErrorHandler };
