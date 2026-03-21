const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.get('/', (req, res) => {
    const token = req.query.token;
    if (token) {
        // Render the tools page with the token
        res.render('tools', { token });
    } else {
        res.redirect(`http://localhost:3500?token=${token}`); // Redirect to Home page if no token is provided
    }
});

module.exports = router;
