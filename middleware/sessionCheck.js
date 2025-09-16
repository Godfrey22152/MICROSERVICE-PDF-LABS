const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    let token = null;

    // Get token from Authorization header
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    // Or get token from query string
    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user || decoded; // Support both { user } and flat payloads
        next();
    } catch (err) {
        return res.status(401).json({ msg: 'Token is not valid' });
    }
};
