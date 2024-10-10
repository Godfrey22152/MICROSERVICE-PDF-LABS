const jwt = require('jsonwebtoken');
const config = require('config');

exports.logoutPage = (req, res) => {
    // Clear any session data or perform other necessary cleanup here

    // Set cache control headers to prevent back navigation
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    // Clear token (you might want to remove cookies or invalidate session)
    res.clearCookie('token');

    // Render the logout page
    res.render('logout');
};


