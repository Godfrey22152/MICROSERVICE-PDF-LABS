const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const logoutController = require('../controllers/logoutController');

router.get('/logout', auth, (req, res) => {
    const token = req.query.token;
    // Render the logout page with the token
    res.render('logout', { token });
});

router.get('/', auth, logoutController.logoutPage);

module.exports = router;
