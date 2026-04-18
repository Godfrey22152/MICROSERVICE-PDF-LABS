/**
 * errorHandler.js — Server-side error utilities for the PDF to Audio service.
 * Client-side session/auth error handling lives in public/js/main.js (handleAuthError).
 */

// Handle errors from child_process.exec
const handleExecError = (err, stderr, res) => {
    console.error('[PDF to Audio] Execution error:', err.message);
    if (stderr) console.error('[PDF to Audio] Stderr:', stderr);
    const errorMsg =
        stderr && stderr.trim() !== ''
            ? stderr.trim()
            : err.message || 'Unknown conversion error';
    return res.status(500).json({
        error: true,
        type:  'CONVERSION_ERROR',
        msg:   'Conversion failed: ' + errorMsg,
    });
};

// Global error handler middleware — mount last
const globalErrorHandler = (err, req, res, next) => {
    console.error('[PDF to Audio] Global error:', err.stack || err.message || err);
    const statusCode = err.statusCode || err.status || 500;
    const message    = err.message || 'An unexpected server error occurred.';

    if (res.headersSent) return next(err);

    // Return JSON for AJAX requests, structured response otherwise
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.status(statusCode).json({
            error: true,
            type:  'SERVER_ERROR',
            msg:   message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        });
    }

    res.status(statusCode).json({
        success: false,
        error:   message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};

module.exports = { globalErrorHandler, handleExecError };
