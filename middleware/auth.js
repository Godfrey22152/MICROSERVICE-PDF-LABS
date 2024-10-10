const jwt = require('jsonwebtoken');
const config = require('config');

module.exports = function(req, res, next) {
    const authHeader = req.header('Authorization') || `Bearer ${req.query.token}`;
    
    if (!authHeader) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, config.get('jwtSecret'));
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};
