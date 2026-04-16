const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const jwt     = require('jsonwebtoken');

router.get('/', (req, res) => {
    const token = req.query.token;

    // No token — redirect to login
    if (!token) {
        return res.redirect('http://localhost:3000');
    }

    // Verify token before rendering — catches tampered/invalid tokens
    try {
        jwt.verify(token, process.env.JWT_SECRET);
        res.render('tools', { token });
    } catch (err) {
        return res.redirect('http://localhost:3000');
    }
});

router.get('/validate-session', auth, (req, res) => {
    res.json({ valid: true, user: req.user });
});

module.exports = router;
