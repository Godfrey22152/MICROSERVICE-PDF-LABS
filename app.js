const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

// Initialize express app
const app = express();

// Middleware
app.use(cors()); // Enable CORS for all origins
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as templating engine
app.set('view engine', 'ejs');

// Connect to the database
connectDB();

// Protect all /tools routes
const auth = require('./middleware/auth');
app.use('/tools', auth);

// Routes
const toolsRoutes = require('./routes/tools');
app.use('/tools', toolsRoutes);

// Test route
app.get('/test', (req, res) => {
    res.send('Static files are working');
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).send('Sorry, that resource was not found.');
});

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';

    // If it's a browser request (HTML), redirect to the current page with the error as a query parameter
    if (req.accepts('html')) {
        const currentUrl = req.header('Referer') || '/tools';
        const separator = currentUrl.includes('?') ? '&' : '?';
        return res.redirect(`${currentUrl}${separator}error=${encodeURIComponent(message)}`);
    }

    // Default to JSON response for API/AJAX requests
    res.status(status).json({
        error: true,
        status: status,
        message: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
