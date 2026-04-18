// Polyfill globalThis.crypto for Node.js 18.
// msedge-tts uses crypto.subtle.digest and crypto.getRandomValues as globals.
// These are available in Node 18 via require('crypto').webcrypto but are only
// auto-globalised in Node 19+. Without this line Node 18 throws:
//   "ReferenceError: crypto is not defined"
if (!globalThis.crypto) {
  globalThis.crypto = require("crypto").webcrypto;
}

const express = require("express");
const path = require("path");
require("dotenv").config(); // Load environment variables
const connectDB = require("./config/db"); // Import database connection
const { globalErrorHandler } = require("./utils/errorHandler");
const audioRoutes = require("./routes/audioRoutes");

const app = express();
const PORT = process.env.PORT || 5400;

// Connect to MongoDB
connectDB();

// Middleware
// Set 100MB limit on JSON and URL-encoded body parsers to match the
//     file upload limit and prevent payload size mismatches.
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.static("public"));

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Mount the router
app.use("/tools", audioRoutes);

// Global error handler
app.use(globalErrorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}/tools/pdf-to-audio`);
});
