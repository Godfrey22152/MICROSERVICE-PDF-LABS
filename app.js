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

// Routes
const homeRoutes = require('./routes/home');
app.use('/', homeRoutes);

// Middleware to handle 404 errors
app.use((req, res, next) => {
    res.status(404).send('Sorry, that resource was not found.');
});

// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Home Service is running on http://localhost:${PORT}`);
});
