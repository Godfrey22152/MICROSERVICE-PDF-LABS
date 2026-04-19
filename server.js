require("dotenv").config();
const express        = require("express");
const path           = require("path");
const bodyParser     = require("body-parser");
const cookieParser   = require("cookie-parser");
const session        = require("express-session");
const flash          = require("connect-flash");
const morgan         = require("morgan");
const methodOverride = require("method-override");
const connectDB      = require("./config/db");

const app = express();

// ── Database ──────────────────────────────────────────────────────────────────
connectDB();

// ── View engine ───────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ── Static assets ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── HTTP request logger ───────────────────────────────────────────────────────
app.use(morgan("dev"));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ── Cookie parser ─────────────────────────────────────────────────────────────
app.use(cookieParser());

// ── Method override (support PUT/DELETE from HTML forms) ──────────────────────
app.use(methodOverride("_method"));

// ── Session ───────────────────────────────────────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET || "sheetlab_secret",
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 1 day
}));

// ── Flash messages ────────────────────────────────────────────────────────────
app.use(flash());
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg   = req.flash("error_msg");
  res.locals.error       = req.flash("error");
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/tools/sheetlab", require("./routes/sheetlabRoutes"));

// ── Error handlers (must be last) ─────────────────────────────────────────────
const { notFound, errorHandler } = require("./middleware/errorHandler");
app.use(notFound);
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5600;
app.listen(PORT, () => console.log(`[SheetLab] Running at http://localhost:${PORT}/tools/sheetlab`));

module.exports = app;
