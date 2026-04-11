const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const logoutController = require('../controllers/logoutController');

router.get('/logout', (req, res, next) => {
    // Set cache control headers to prevent back navigation
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const token = req.query.token;
    res.render('logout', { token });
});

router.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const token = req.query.token;
    if (token) {
        res.render('logout', { token });
    } else {
        res.render('logout', { token: null });
    }
});

module.exports = router;
