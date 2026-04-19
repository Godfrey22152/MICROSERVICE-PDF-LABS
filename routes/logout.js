const express          = require('express');
const router           = express.Router();
const jwt              = require('jsonwebtoken');
const auth             = require('../middleware/auth');
const logoutController = require('../controllers/logoutController');

// app.js does: app.use('/logout', logoutRoute)
// So routes defined here get '/logout' prepended:
//   router.get('/')            → GET  /logout/
//   router.post('/begin-logout') → POST /logout/begin-logout

// ── GET /logout/ ───────────────────────────────────────────────────────────
// Every other service redirects to http://localhost:4500/logout?token=...
// Express matches this to GET /logout/ via the mount prefix.
// We DO NOT use the auth middleware here because we want the page to always load
// so that our client-side history trap and session checks can execute.
router.get('/', logoutController.logoutPage);

// ── POST /logout/begin-logout ──────────────────────────────────────────────
// Called when the user clicks "Proceed to logout".
// Issues a short-lived 60-second replacement token. The client swaps this
// into localStorage, replacing the 1-hour token. checkSession() on the client
// reads the new exp claim and fires handleAuthError at exactly T+60 seconds,
// showing the session-expired toast and redirecting to login.
// The countdown bar is a visual representation of this same 60-second window.
router.post('/begin-logout', auth, (req, res) => {
    try {
        const shortLivedToken = jwt.sign(
            { user: req.user },
            process.env.JWT_SECRET,
            { expiresIn: '60s' }
        );
        console.log('[Logout] Issued 60s token for user:', req.user);
        res.json({ success: true, token: shortLivedToken, expiresIn: 60 });
    } catch (err) {
        console.error('[Logout] Error issuing short-lived token:', err);
        res.status(500).json({ error: true, msg: 'Could not begin logout. Please try again.' });
    }
});

module.exports = router;
