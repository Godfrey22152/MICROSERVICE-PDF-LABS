const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// DB
connectDB();

// Routes
const toolsRoutes = require('./routes/tools');
app.use('/tools', toolsRoutes);

// Root redirect
app.get('/', (req, res) => {
    const token = req.query.token;
    if (token) {
        res.redirect(`/tools?token=${token}`);
    } else {
        res.redirect('http://localhost:3000');
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        errorType: 'NOT_FOUND',
        loginUrl: 'http://localhost:3000'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Tools Service Error]', err.stack || err.message);

    if (req.accepts('html')) {
        return res.status(500).render('error', {
            errorType: 'SERVER_ERROR',
            loginUrl: 'http://localhost:3000'
        });
    }

    res.status(500).json({
        error: true,
        type: 'SERVER_ERROR',
        msg: 'An unexpected error occurred. Please try again later.'
    });
});

// Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`[Tools Service] Running on http://localhost:${PORT}`);
});
