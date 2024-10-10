const jwt = require('jsonwebtoken');
const config = require('config');

module.exports = function(req, res, next) {
    const token = req.cookies.token;

    if (!token) {
        return res.redirect('/login?message=Session Expired, Login again to access your account');
    }

    // Verify token
    try {
        const decoded = jwt.verify(token, config.get('jwtSecret'));
        req.user = decoded.user;
        next();
    } catch (err) {
        return res.redirect('/login?message=Session Expired, Login again to access your account');
    }
};
