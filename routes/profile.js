const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const config = require('config');
const User = require('../models/User'); // Adjust path as needed

// Middleware to ensure user is authenticated using JWT
function ensureAuthenticated(req, res, next) {
    const token = req.headers['authorization'];

    if (!token) {
        return res.redirect('http://localhost:3000');
    }

    // Verify the token using the secret from the config file
    jwt.verify(token, config.get('jwtSecret'), async (err, decoded) => {
        if (err) {
            return res.redirect('http://localhost:3000');
        }

        // Attach the decoded user ID to the request
        req.user = decoded;

        next();
    });
}

// Route to display profile page
router.get('/profile', ensureAuthenticated, async (req, res) => {
    try {
        // Fetch user data from the database using the decoded user ID
        const user = await User.findById(req.user._id).exec();

        if (!user) {
            return res.redirect('http://localhost:3000');
        }

        // Pass the user data to the profile view
        res.render('profile', { user });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
