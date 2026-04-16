const express = require("express");
const path    = require("path");
require("dotenv").config();
const connectDB              = require("./config/db");
const { globalErrorHandler } = require("./utils/errorHandler");
const pdfRoutes              = require("./routes/pdfRoutes");

const app  = express();
const PORT = process.env.PORT || 5800;

connectDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/tools", pdfRoutes);
app.use(globalErrorHandler);

app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT + "/tools/edit-pdf");
});
