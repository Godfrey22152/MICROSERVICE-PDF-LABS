const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

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
router.get('/home', auth, (req, res) => {
    res.redirect(`http://localhost:4000?token=${result.token}`);
});

// Protected route to the Logout Page.
router.get('/logout', auth, (req, res) => {
    res.redirect(`http://localhost:5000/logout?token=${token}`);
});

// 🛡️ Protect each tool page
router.get('/pdf-to-audio', auth, (req, res) => {
    res.render('tools/pdf-to-audio?token=${token}', { user: req.user });
});

router.get('/pdf-to-image', auth, (req, res) => {
    res.render('tools/pdf-to-image', { user: req.user });
});

router.get('/pdf-compressor', auth, (req, res) => {
    res.render('tools/pdf-compressor', { user: req.user });
});

router.get('/pdf-to-word', auth, (req, res) => {
    res.render('tools/pdf-to-word', { user: req.user });
});

router.get('/word-to-pdf', auth, (req, res) => {
    res.render('tools/word-to-pdf', { user: req.user });
});

router.get('/edit-pdf', auth, (req, res) => {
    res.render('tools/edit-pdf', { user: req.user });
});

router.get('/pdf-merge', auth, (req, res) => {
    res.render('tools/pdf-merge', { user: req.user });
});

router.get('/image-to-pdf', auth, (req, res) => {
    res.render('tools/image-to-pdf', { user: req.user });
});

module.exports = router;
