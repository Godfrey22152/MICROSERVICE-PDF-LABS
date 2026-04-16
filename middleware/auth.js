const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    let token = null;

    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token && req.body && req.body.token) {
        token = req.body.token;
    }

    if (!token) {
        return res.status(401).json({
            error: true,
            type: 'NO_TOKEN',
            msg: 'No token, authorization denied'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user  = decoded.user || decoded;
        req.token = token;
        next();
    } catch (err) {
        const isExpired = err.name === 'TokenExpiredError';
        return res.status(401).json({
            error: true,
            type: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
            msg:  isExpired ? 'Session expired. Please log in again.' : 'Invalid token.'
        });
    }
};

module.exports = auth;
