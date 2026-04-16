const express        = require('express');
const router         = express.Router();
const auth           = require('../middleware/auth');
const homeController = require('../controllers/homeController');

// ── GET / ──────────────────────────────────────────────────────────────────
// auth middleware handles all token validation — missing, malformed, expired,
// and tampered tokens all redirect to login before this handler runs.
router.get('/', auth, (req, res) => {
    const token = req.token || req.query.token || '';
    res.render('home', { token });
});

// ── GET /api/home ──────────────────────────────────────────────────────────
router.get('/api/home', auth, homeController.getHomePage);

module.exports = router;
