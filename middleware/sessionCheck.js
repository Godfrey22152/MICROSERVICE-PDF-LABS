
const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function(req, res, next) {
    const token = req.cookies.token;

    if (!token) {
        return res.redirect('/login?message=Session Expired, Login again to access your account');
    }

    // Verify token
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        return res.redirect('/login?message=Session Expired, Login again to access your account');
    }
};

