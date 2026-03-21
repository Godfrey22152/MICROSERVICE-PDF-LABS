const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
    // req.user is populated by the auth middleware
    const token = req.query.token || (req.header('Authorization')?.replace('Bearer ', ''));

    if (token) {
        // Render the tools page with the token
        res.render('tools', { token });
    } else {
        // This block is effectively unreachable if 'auth' middleware is working
        res.redirect(`http://localhost:3000?error=${encodeURIComponent('Authentication required')}`);
    }
});

module.exports = router;
