const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const homeController = require('../controllers/homeController');

router.get('/', (req, res) => {
    const token = req.query.token;
    if (token) {
        // Render the home page with the token
        res.render('home', { token });
    } else {
        res.redirect('http://localhost:3000'); // Redirect to login if no token is provided
    }
});

router.get('/api/home', auth, homeController.getHomePage);

module.exports = router;
