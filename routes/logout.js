const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const logoutController = require('../controllers/logoutController');

router.get('/logout', (req, res) => {
    const token = req.query.token;
    if (token) {
        // Render the logout page with the token
        res.render('logout', { token });
    } else {
        res.redirect('http://localhost:3000'); // Redirect to login if no token is provided
    }
});

router.get('/', auth, logoutController.logoutPage);

module.exports = router;
