const express       = require('express');
const path          = require('path');
const bodyParser    = require('body-parser');
const profileRoutes = require('./routes/profile');
const { connectDB } = require('./config/db');

const app = express();

// ── Database ───────────────────────────────────────────────────────────────
connectDB();

// ── View engine ────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Body parsers ───────────────────────────────────────────────────────────
// express.json() and express.urlencoded() ensure request bodies are parsed
// on ALL HTTP methods including DELETE.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// ── Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/', profileRoutes);

// ── Global error handler ───────────────────────────────────────────────────
app.use(function (err, req, res, next) {
    console.error('[Profile Service] Unhandled error:', err.stack || err.message || err);
    const status = err.status || err.statusCode || 500;
    const msg    = err.message || 'An unexpected error occurred.';

    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.status(status).json({ error: true, type: 'SERVER_ERROR', msg });
    }
    res.status(status).send('Error: ' + msg);
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`[Profile Service] Running on http://localhost:${PORT}`));