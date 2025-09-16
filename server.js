const express = require("express");
const path = require("path");
require('dotenv').config(); // Load environment variables
const connectDB = require("./config/db"); // Import database connection
const { globalErrorHandler } = require("./utils/errorHandler");
const audioRoutes = require("./routes/audioRoutes");

const app = express();
const PORT = process.env.PORT || 5400;

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
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
