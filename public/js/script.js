// =====================================================================
//  script.js  —  logout-service
// =====================================================================

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(message, type, duration) {
    type     = type     || 'info';
    duration = duration || 5000;
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className   = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(function () {
        requestAnimationFrame(function () { toast.classList.add('show'); });
    });
    setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () {
            if (container.contains(toast)) container.removeChild(toast);
        }, 350);
    }, duration);
}

// ── Decode JWT exp claim client-side ──────────────────────────────────────
function getTokenExpiry(token) {
    try {
        var payload = JSON.parse(
            atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
        );
        return payload.exp ? payload.exp * 1000 : null;
    } catch (_) { return null; }
}

// ── Countdown bar ─────────────────────────────────────────────────────────
var countdownInterval = null;

function startCountdown(totalSeconds) {
    var remaining = totalSeconds;
    var display   = document.getElementById('countdown-display');
    var bar       = document.getElementById('countdown-bar');

    if (display) display.textContent = remaining;
    if (bar)     bar.style.width     = '100%';
    if (display) display.classList.remove('urgent');

    clearInterval(countdownInterval);
    countdownInterval = setInterval(function () {
        remaining -= 1;
        if (display) display.textContent = remaining;
        if (bar)     bar.style.width     = Math.max(0, (remaining / totalSeconds) * 100) + '%';
        if (remaining <= 10 && display)  display.classList.add('urgent');

        if (remaining <= 0) {
            clearInterval(countdownInterval);
            // checkSession's setTimeout will fire at exactly the same moment
            // and handle the redirect. The countdown is purely visual.
        }
    }, 1000);
}

// ── checkSession — fires handleAuthError at exact token expiry ────────────
// This is the same pattern used across all other services. It decodes the
// JWT exp claim and schedules a redirect at precisely that millisecond.
// When the 60-second token is issued by begin-logout, calling checkSession
// again recalculates the timeout against the new exp value.
var sessionTimeout = null;

function checkSession() {
    var token = localStorage.getItem('token');
    if (!token) return;

    var expiresAt = getTokenExpiry(token);
    if (!expiresAt) return;

    clearTimeout(sessionTimeout);
    var delay = expiresAt - Date.now();

    if (delay <= 0) {
        // Already expired
        handleSessionExpired();
    } else {
        sessionTimeout = setTimeout(function () {
            handleSessionExpired();
        }, delay);
    }
}

function handleSessionExpired() {
    clearInterval(countdownInterval);
    localStorage.removeItem('token');
    sessionStorage.removeItem('logoutPageActive');
    showToast(
        'Session expired — logged out automatically. Please log in again.',
        'warning',
        4000
    );
    setTimeout(function () {
        window.location.replace('http://localhost:3000');
    }, 4000);
}

// ── doLogout — called when user deliberately completes logout ─────────────
function doLogout() {
    clearInterval(countdownInterval);
    clearTimeout(sessionTimeout);
    localStorage.removeItem('token');
    sessionStorage.removeItem('logoutPageActive');
    showToast(
        'Logged out successfully — please log in again to access the app.',
        'success',
        4000
    );
    // location.replace() removes the logout page from browser history so
    // the back button from localhost:3000 cannot return here.
    setTimeout(function () {
        window.location.replace('http://localhost:3000');
    }, 4000);
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {

    // ── sessionStorage back-navigation guard ──────────────────────────────
    // sessionStorage is NOT restored when the browser serves a cached page
    // via the back button. So the flag is only present on a live session.
    //
    // Genuine first load:   flag absent → read URL token, set flag, continue
    // Back-nav after logout: flag absent AND token gone → redirect instantly
    var alreadyActive = sessionStorage.getItem('logoutPageActive');
    var params        = new URLSearchParams(window.location.search);
    var urlToken      = params.get('token');

    if (!alreadyActive) {
        var storedToken = localStorage.getItem('token');

        if (!storedToken && !urlToken) {
            // No token anywhere — redirect immediately
            window.location.replace('http://localhost:3000');
            return;
        }

        if (!storedToken && urlToken) {
            // First genuine load — store the URL token and set the flag
            localStorage.setItem('token', urlToken);
            sessionStorage.setItem('logoutPageActive', '1');
        } else {
            // Token already in localStorage — just set the flag
            sessionStorage.setItem('logoutPageActive', '1');
        }
    }
    // Once alreadyActive is set we never re-read the URL token.
    // Back-navigation cannot restore the token through the URL.

    // Final check
    var token = localStorage.getItem('token');
    if (!token) {
        window.location.replace('http://localhost:3000');
        return;
    }

    // Start the session expiry watcher against the current (1-hour) token
    checkSession();

    // ── DOM refs ──────────────────────────────────────────────────────────
    var continueBtn    = document.getElementById('continueBtn');
    var proceedBtn     = document.getElementById('proceedBtn');
    var rateUsNowBtn   = document.getElementById('rateUsNowBtn');
    var maybeLaterBtn  = document.getElementById('maybeLaterBtn');
    var finalLogoutBtn = document.getElementById('finalLogoutBtn');

    // ── Section 1: Confirmation ───────────────────────────────────────────

    continueBtn.addEventListener('click', function () {
        var currentToken = localStorage.getItem('token');
        sessionStorage.removeItem('logoutPageActive');
        clearTimeout(sessionTimeout);
        clearInterval(countdownInterval);
        if (currentToken) {
            window.location.href = 'http://localhost:3500/?token=' + currentToken;
        } else {
            window.location.replace('http://localhost:3000');
        }
    });

    proceedBtn.addEventListener('click', function () {
        proceedBtn.disabled    = true;
        proceedBtn.textContent = 'Starting...';

        var currentToken = localStorage.getItem('token');

        fetch('/logout/begin-logout', {
            method:  'POST',
            headers: {
                'Authorization':    'Bearer ' + currentToken,
                'Content-Type':     'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
        })
        .then(function (res) {
            if (!res.ok) return res.json().then(function (e) { return Promise.reject(e); });
            return res.json();
        })
        .then(function (data) {
            if (!data.success) {
                showToast(data.msg || 'Could not begin logout. Please try again.', 'error');
                proceedBtn.disabled    = false;
                proceedBtn.textContent = 'Proceed to logout';
                return;
            }

            // Replace the 1-hour token with the 60-second one
            localStorage.setItem('token', data.token);

            // Re-run checkSession — it will now schedule handleSessionExpired
            // to fire in exactly 60 seconds based on the new token's exp claim.
            checkSession();

            // Show the rating section and start the visual countdown
            document.getElementById('confirmationSection').style.display = 'none';
            document.getElementById('ratingSection').style.display       = 'block';
            document.getElementById('countdown-section').style.display   = 'block';

            startCountdown(data.expiresIn || 60);
        })
        .catch(function (err) {
            var msg = (err && err.msg) ? err.msg : 'Network error. Please try again.';
            showToast(msg, 'error');
            proceedBtn.disabled    = false;
            proceedBtn.textContent = 'Proceed to logout';
        });
    });

    // ── Section 2: Rating ─────────────────────────────────────────────────

    var stars = document.querySelectorAll('.star');
    stars.forEach(function (star) {
        star.addEventListener('click', function () {
            var rating = parseInt(star.getAttribute('data-value'));
            stars.forEach(function (s) {
                s.classList.remove('selected');
                if (parseInt(s.getAttribute('data-value')) <= rating) {
                    s.classList.add('selected');
                }
            });
        });
    });

    rateUsNowBtn.addEventListener('click', function () {
        document.getElementById('ratingSection').style.display      = 'none';
        document.getElementById('finalLogoutSection').style.display = 'block';
    });

    maybeLaterBtn.addEventListener('click', function () { doLogout(); });

    // ── Section 3: Final logout ───────────────────────────────────────────

    finalLogoutBtn.addEventListener('click', function () { doLogout(); });

});
