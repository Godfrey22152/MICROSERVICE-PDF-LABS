// Global error handler middleware
const globalErrorHandler = (err, req, res, next) => {
    console.error("Global error handler caught an error:", err);

    const statusCode = err.statusCode || 500;
    const message = err.message || "An unexpected server error occurred.";

    if (res.headersSent) {
        return next(err);
    }

    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
};

// Handle errors from child_process.exec
const handleExecError = (err, stderr, res) => {
    console.error(`Execution error: ${err.message}`);
    if (stderr) {
        console.error(`Stderr: ${stderr}`);
    }
    res.status(500).send(`Server error during file conversion: ${stderr || err.message}`);
};

module.exports = {
    globalErrorHandler,
    handleExecError,
};
