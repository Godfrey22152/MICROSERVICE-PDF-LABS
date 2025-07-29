const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function (req, res, next) {
  const authHeader = req.header('Authorization');
  let token;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.user) {
      return res.status(401).json({ msg: 'Malformed token payload' });
    }
    req.user = decoded.user;
    next();
  } catch (err) {
    console.error('JWT verify failed:', err.message);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
