const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const profileRoutes = require('./routes/profile');

// Load environment variables
dotenv.config();

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

// Use profile routes
app.use('/', profileRoutes);

// Set up a default route
app.get('/', (req, res) => {
    res.redirect('/profile');
});

// Middleware to handle 404 errors
app.use((req, res, next) => {
    res.status(404).send('Sorry, that resource was not found.');
});

// Start the server
const PORT = process.env.PORT || 4500;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

