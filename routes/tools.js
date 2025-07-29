const express = require('express');
const router = express.Router();
//const auth = require('../middleware/auth');
const sessionCheck = require('../middleware/sessionCheck');

router.get('/', (req, res) => {
    const token = req.query.token;
    if (token) {
        // Render the tools page with the token
        res.render('tools', { token });
    } else {
        res.redirect('http://localhost:4000?token=${token}'); // Redirect to Home page if no token is provided
    }
});

//Protected route to the Home page.
router.get('/home', sessionCheck, (req, res) => {
    res.redirect(`http://localhost:4000?token=${result.token}`);
});

// Protected route to the Logout Page.
router.get('/logout', sessionCheck, (req, res) => {
    res.redirect(`http://localhost:5000/logout?token=${token}`);
});

// 🛡️ Protect each tool page
router.get('/pdf-to-audio', sessionCheck, (req, res) => {
    res.render('tools/pdf-to-audio?token=${token}', { user: req.user });
});

router.get('/pdf-to-image', sessionCheck, (req, res) => {
    res.render('tools/pdf-to-image', { user: req.user });
});

router.get('/pdf-compressor', sessionCheck, (req, res) => {
    res.render('tools/pdf-compressor', { user: req.user });
});

router.get('/pdf-to-word', sessionCheck, (req, res) => {
    res.render('tools/pdf-to-word', { user: req.user });
});

router.get('/word-to-pdf', sessionCheck, (req, res) => {
    res.render('tools/word-to-pdf', { user: req.user });
});

router.get('/edit-pdf', sessionCheck, (req, res) => {
    res.render('tools/edit-pdf', { user: req.user });
});

router.get('/pdf-merge', sessionCheck, (req, res) => {
    res.render('tools/pdf-merge', { user: req.user });
});

router.get('/image-to-pdf', sessionCheck, (req, res) => {
    res.render('tools/image-to-pdf', { user: req.user });
});

module.exports = router;
