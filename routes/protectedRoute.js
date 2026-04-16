const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const sessionCheck = require('../middleware/sessionCheck');

//Protected route to the Home page.
router.get('/home', auth, (req, res) => {
    res.redirect(`http://localhost:3500?token=${result.token}`);
});

// Protected route to the Logout Page.
router.get('/logout', sessionCheck, (req, res) => {
    res.redirect(`http://localhost:4500/logout?token=${token}`);
});

module.exports = router;
