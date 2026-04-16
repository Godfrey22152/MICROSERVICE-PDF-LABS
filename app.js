const express    = require('express');
const bodyParser = require('body-parser');
const path       = require('path');
const connectDB  = require('./config/db');

const app = express();

// ── Database ───────────────────────────────────────────────────────────────
connectDB();

// ── View engine ────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Body parsers ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ── Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ─────────────────────────────────────────────────────────────────
const homeRoutes = require('./routes/home');
app.use('/', homeRoutes);

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).send('Sorry, that resource was not found.');
});

// ── Global error handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Home Service] Unhandled error:', err.stack || err.message || err);
    const status = err.status || err.statusCode || 500;
    const msg    = err.message || 'An unexpected error occurred.';
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.status(status).json({ error: true, type: 'SERVER_ERROR', msg });
    }
    res.status(status).send('Error: ' + msg);
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3500;
app.listen(PORT, () => {
    console.log(`[Home Service] Running on http://localhost:${PORT}`);
});
