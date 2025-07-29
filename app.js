const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const connectDB = require('./config/db');

// Initialize express app
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as templating engine
app.set('view engine', 'ejs');

// Connect to the database
connectDB();

// Protect all /tools routes
const sessionCheck = require('./middleware/sessionCheck');
app.use('/tools', sessionCheck);

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

// Start server
const PORT = process.env.PORT || 3500;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
