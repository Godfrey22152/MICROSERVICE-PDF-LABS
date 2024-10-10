const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

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

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

// Import and use the auth routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Import and use protected routes
const protectedRoutes = require('./routes/protectedRoute');
app.use('/api', protectedRoutes); // Ensure it matches the route structure

// Test route for static files
app.get('/test', (req, res) => {
    res.send('Static files are working');
});

// Middleware to handle 404 errors
app.use((req, res, next) => {
    res.status(404).send('Sorry, that resource was not found.');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
