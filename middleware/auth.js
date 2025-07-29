const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function(req, res, next) {
    // Add cache control headers to prevent caching of authenticated pages
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    // Get token from query parameters
    const token = req.query.token;

    // Check if no token
    if (!token) {
        return res.redirect('http://localhost:3000'); // Redirect to login page if no token
    }

    // Verify token
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        return res.redirect('http://localhost:3000'); // Redirect to login page if token is not valid
    }
};
