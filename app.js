const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const profileRoutes = require('./routes/profile');
const connectDB = require('./config/db');


// connect to DB FIRST
connectDB();

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', profileRoutes); // ensure it's mounted

const PORT = process.env.PORT || 4500;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
