const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function (req, res, next) {
    let token = null;

    // 1. From Authorization header
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    // 2. From query string
    if (!token && req.query.token) token = req.query.token;

    // 3. From request body
    if (!token && req.body && req.body.token) token = req.body.token;

    // No token found at all
    if (!token) {
        if (req.accepts('html')) return res.redirect('http://localhost:3000');
        return res.status(401).json({
            error: true,
            type:  'NO_TOKEN',
            msg:   'No token, authorization denied',
        });
    }

    // A valid JWT always has exactly 3 dot-separated parts.
    // Catches tampered / malformed tokens before jwt.verify() runs.
    if (token.split('.').length !== 3) {
        if (req.accepts('html')) return res.redirect('http://localhost:3000');
        return res.status(401).json({
            error: true,
            type:  'INVALID_TOKEN',
            msg:   'Token is malformed.',
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user  = decoded.user || decoded;
        req.token = token;
        next();
    } catch (err) {
        console.error('JWT verify failed:', err.message);
        const isExpired = err.name === 'TokenExpiredError';
        if (req.accepts('html')) return res.redirect('http://localhost:3000');
        return res.status(401).json({
            error: true,
            type:  isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
            msg:   isExpired
                ? 'Session expired. Please log in again.'
                : 'Token is not valid.',
        });
    }
};
