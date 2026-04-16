// =====================================================================
//  script.js  —  home-service
//  Handles: session checks, nav buttons, slide animations, toasts
// =====================================================================

// ── Toast ─────────────────────────────────────────────────────────────────
// Defined at module scope so handleAuthError can call it before
// DOMContentLoaded fires.
function showToast(message, type, duration) {
    type     = type     || 'info';
    duration = duration || 4000;
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className   = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    // Double rAF ensures the element is in the DOM before the transition fires
    requestAnimationFrame(function () {
        requestAnimationFrame(function () { toast.classList.add('show'); });
    });
    setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () { if (container.contains(toast)) container.removeChild(toast); }, 350);
    }, duration);
}

// ── Auth / Session ─────────────────────────────────────────────────────────
// Token is cleared immediately — not inside setTimeout — to avoid a race
// condition where a rapid second request could sneak through with a stale token.
function handleAuthError(message) {
    localStorage.removeItem('token');
    showToast(message || 'Session expired. Redirecting to login...', 'error');
    setTimeout(function () { window.location.href = 'http://localhost:3000'; }, 4000);
}

// Map typed 401 responses from auth middleware to human-friendly messages
async function handle401(response) {
    var messages = {
        TOKEN_EXPIRED: 'Session expired. Redirecting to login...',
        INVALID_TOKEN: 'Invalid session. Redirecting to login...',
        NO_TOKEN:      'No session found. Redirecting to login...',
    };
    try {
        var data = await response.clone().json();
        handleAuthError(messages[data.type] || messages['TOKEN_EXPIRED']);
    } catch (_) {
        handleAuthError(messages['TOKEN_EXPIRED']);
    }
}

// ── Session expiry proactive check ────────────────────────────────────────

function getTokenExpiry(token) {
    try {
        var payload = JSON.parse(
            atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
        );
        return payload.exp ? payload.exp * 1000 : null;
    } catch (_) { return null; }
}

function isValidJWTStructure(token) {
    return token && token.split('.').length === 3;
}

function checkSession() {
    var token = localStorage.getItem('token');

    if (!token) {
        setTimeout(function () { handleAuthError('No session found. Redirecting to login...'); }, 100);
        return;
    }
    if (!isValidJWTStructure(token)) {
        setTimeout(function () { handleAuthError('Invalid session detected. Redirecting to login...'); }, 100);
        return;
    }

    var expiresAt = getTokenExpiry(token);
    if (!expiresAt) {
        setTimeout(function () { handleAuthError('Invalid session detected. Redirecting to login...'); }, 100);
        return;
    }

    var delay = expiresAt - Date.now();
    if (delay <= 0) {
        setTimeout(function () { handleAuthError('Session expired. Redirecting to login...'); }, 100);
    } else {
        setTimeout(function () { handleAuthError('Session expired. Redirecting to login...'); }, delay);
    }
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {

    // ── Boot: store token from URL then run session check ─────────────────
    var params   = new URLSearchParams(window.location.search);
    var urlToken = params.get('token');
    if (urlToken) localStorage.setItem('token', urlToken);

    // Run session check — handles expired, tampered, and missing tokens
    checkSession();

    // ── Nav button active state ───────────────────────────────────────────
    var navButtons = document.querySelectorAll('.nav-buttons button');
    navButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            navButtons.forEach(function (btn) { btn.classList.remove('active'); });
            button.classList.add('active');
        });
    });

    // ── Slide animations ──────────────────────────────────────────────────
    var slides       = document.querySelectorAll('.animations .slide');
    var currentSlide = 0;

    if (slides.length > 0) {
        slides[currentSlide].classList.add('active');
        setInterval(function () {
            slides[currentSlide].classList.remove('active');
            currentSlide = (currentSlide + 1) % slides.length;
            slides[currentSlide].classList.add('active');
        }, 15000);
    }

    // ── Navigation handlers ───────────────────────────────────────────────

    document.getElementById('dashboardBtn').addEventListener('click', function (e) {
        e.preventDefault();
        // Already on the dashboard — no redirect needed
    });

    document.getElementById('toolsBtn').addEventListener('click', function () {
        var token = localStorage.getItem('token');
        window.location.href = token
            ? 'http://localhost:5000/tools?token=' + token
            : 'http://localhost:3000';
    });

    document.getElementById('settingsBtn').addEventListener('click', function () {
        var token = localStorage.getItem('token');
        window.location.href = token ? '/settings?token=' + token : '/settings';
    });

    document.getElementById('profileBtn').addEventListener('click', function () {
        var token = localStorage.getItem('token');
        window.location.href = token
            ? 'http://localhost:4000/profile?token=' + token
            : 'http://localhost:3000';
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
        var token = localStorage.getItem('token');
        window.location.href = token
            ? 'http://localhost:4500/logout?token=' + token
            : 'http://localhost:3000';
    });

});
