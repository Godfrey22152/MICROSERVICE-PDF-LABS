const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    let token = null;

    // From header
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    // Fallback to query
    if (!token && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({
            error: true,
            type: "NO_TOKEN",
            msg: "No token, authorization denied"
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user || decoded;
        next();
    } catch (err) {
        return res.status(401).json({
            error: true,
            type: "INVALID_TOKEN",
            msg: "Session expired or token invalid"
        });
    }
};

module.exports = auth;
