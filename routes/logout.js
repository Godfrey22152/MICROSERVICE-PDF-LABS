const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const logoutController = require('../controllers/logoutController');

router.get('/logout', (req, res, next) => {
    // We want to allow the logout page to load even without a token
    // so it can show the toast and redirect.
    // If there is a token, we still want to apply auth logic but maybe not redirect immediately.
    // Let's use a modified auth check or just pass through.
    const token = req.query.token;
    res.render('logout', { token });
});

router.get('/', (req, res) => {
    // Redirect to /logout/logout or handle it
    const token = req.query.token;
    if (token) {
        res.render('logout', { token });
    } else {
        res.render('logout', { token: null });
    }
});

module.exports = router;
