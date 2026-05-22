/**
 * errorHandler.js — Server-side error utilities for the PDF to Image service.
 * Client-side session/auth error handling lives in public/js/main.js (handleAuthError).
 */

/**
 * Rejects multi-page PDFs for formats that only support single pages (SVG, EPS, PS).
 */
function rejectMultiPageIfNeeded(formatConfig, pageCount, res) {
    if (!formatConfig.multiPage && pageCount > 1) {
        const ext = formatConfig.ext.toUpperCase();
        return res.status(400).json({
            error: true,
            type: 'MULTIPAGE_NOT_SUPPORTED',
            msg: `${ext} supports only single-page PDFs. Please upload a one-page document and try again.`
        });
    }
    return null;
}

/**
 * Handles Ghostscript / exec conversion errors.
 */
function handleExecError(err, stderr, res) {
    console.error('[PDF to Image] Conversion error:', err);
    console.error('[PDF to Image] stderr:', stderr);

    const errorMsg =
        stderr && stderr.trim() !== ''
            ? stderr.trim()
            : err.message || 'Unknown conversion error';

    return res.status(500).json({
        error: true,
        type: 'CONVERSION_ERROR',
        msg: 'Conversion failed: ' + errorMsg
    });
}

/**
 * Express global error handler middleware.
 * Mount last in app.js: app.use(globalErrorHandler)
 */
function globalErrorHandler(err, req, res, next) {
    console.error('[PDF to Image] Global error:', err);

    const status   = err.status || 500;
    const errorMsg = err.message || 'Internal Server Error';

    // Return JSON for XHR/API requests, plain text for others
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.status(status).json({
            error: true,
            type: 'SERVER_ERROR',
            msg: errorMsg
        });
    }

    res.status(status).send('Error: ' + errorMsg);
}

module.exports = { handleExecError, globalErrorHandler, rejectMultiPageIfNeeded };
