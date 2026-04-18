/**
 * errorHandler.js — Server-side error utilities for the PDF Compressor service.
 * Client-side session/auth error handling lives in public/js/main.js (handleAuthError).
 */

function handleExecError(err, stderr, res) {
  console.error('[PDF Compressor] Compression error:', err);
  console.error('[PDF Compressor] stderr:', stderr);
  const errorMsg =
    stderr && stderr.trim() !== ''
      ? stderr.trim()
      : err.message || 'Unknown compression error';
  return res.status(500).json({
    error: true,
    type:  'COMPRESSION_ERROR',
    msg:   'Compression failed: ' + errorMsg,
  });
}

function globalErrorHandler(err, req, res, next) {
  console.error('[PDF Compressor] Global error:', err);
  const status   = err.status || 500;
  const errorMsg = err.message || 'Internal Server Error';

  // Return JSON for AJAX requests, plain text for direct browser navigation
  if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.status(status).json({
      error: true,
      type:  'SERVER_ERROR',
      msg:   errorMsg,
    });
  }

  res.status(status).send('Error: ' + errorMsg);
}

module.exports = { handleExecError, globalErrorHandler };
