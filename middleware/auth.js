const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function (req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma',            'no-cache');
    res.setHeader('Expires',           '0');
    res.setHeader('Surrogate-Control', 'no-store');

    let token = null;

    // 1. From Authorization header — used by fetch/AJAX (begin-logout POST)
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    // 2. From query string — used by browser navigation links
    if (!token && req.query.token) token = req.query.token;

    // 3. From request body
    if (!token && req.body && req.body.token) token = req.body.token;

    if (!token) {
        // AJAX → JSON error so fetch() can handle it without throwing
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(401).json({ error: true, type: 'NO_TOKEN', msg: 'No token, authorization denied' });
        }
        return res.redirect('http://localhost:3000');
    }

    if (token.split('.').length !== 3) {
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(401).json({ error: true, type: 'INVALID_TOKEN', msg: 'Token is malformed.' });
        }
        return res.redirect('http://localhost:3000');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user  = decoded.user || decoded;
        req.token = token;
        next();
    } catch (err) {
        const isExpired = err.name === 'TokenExpiredError';
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(401).json({
                error: true,
                type:  isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
                msg:   isExpired ? 'Session expired.' : 'Token is not valid.',
            });
        }
        return res.redirect('http://localhost:3000');
    }
};
