document.addEventListener('DOMContentLoaded', () => {

    // ── Store token from URL on load ──────────────────────────
    const params   = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) localStorage.setItem('token', urlToken);

    // ── Helpers ───────────────────────────────────────────────
    const LOGIN_URL = 'http://localhost:3000';

    function getToken() {
        return localStorage.getItem('token') || null;
    }

    // Toast then redirect — same pattern as pdf-compressor
    function handleAuthError(message) {
        localStorage.removeItem('token');
        showToast(message || 'Session expired. Redirecting to login...', 'error');
        setTimeout(() => {
            window.location.href = LOGIN_URL;
        }, 4000);
    }

    function navigateWithToken(url) {
        const token = getToken();
        if (token) {
            window.location.href = `${url}?token=${token}`;
        } else {
            handleAuthError('No session found. Redirecting to login...');
        }
    }

    // ── Toast ─────────────────────────────────────────────────
    function showToast(message, type) {
        type = type || 'info';
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(() => {
                if (container.contains(toast)) container.removeChild(toast);
            }, 400);
        }, 4000);
    }

    // ── Session expiry check ──────────────────────────────────
    function getTokenExpiry(token) {
        try {
            const payload = JSON.parse(
                atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
            );
            return payload.exp ? payload.exp * 1000 : null;
        } catch {
            return null;
        }
    }

    function isValidJWTStructure(token) {
        // A real JWT always has exactly 3 parts separated by dots
        return token && token.split('.').length === 3;
    }

    function checkSession() {
        const token = getToken();

        // No token at all
        if (!token) {
            setTimeout(() => handleAuthError('No session found. Redirecting to login...'), 100);
            return;
        }

        // Token is structurally invalid (tampered URL)
        if (!isValidJWTStructure(token)) {
            setTimeout(() => handleAuthError('Invalid session detected. Redirecting to login...'), 100);
            return;
        }

        const expiresAt = getTokenExpiry(token);

        // Can't read exp — token payload is corrupt/tampered
        if (!expiresAt) {
            setTimeout(() => handleAuthError('Invalid session detected. Redirecting to login...'), 100);
            return;
        }

        const delay = expiresAt - Date.now();

        if (delay <= 0) {
            // Already expired — let page render first so toast is visible
            setTimeout(() => handleAuthError('Session expired. Redirecting to login...'), 100);
        } else {
            // Valid — schedule expiry toast for exact moment token dies
            setTimeout(() => handleAuthError('Session expired. Redirecting to login...'), delay);
        }
    }

    checkSession();

    // ── Navigation active state ───────────────────────────────
    const navButtons = document.querySelectorAll('.nav-buttons button');
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    // ── Nav button listeners ──────────────────────────────────
    document.getElementById('toolsBtn').addEventListener('click', (e) => {
        e.preventDefault();
    });

    document.getElementById('dashboardBtn').addEventListener('click', () => {
        navigateWithToken('http://localhost:3500/');
    });

    document.getElementById('settingsBtn').addEventListener('click', () => {
        window.location.href = '/settings';
    });

    document.getElementById('profileBtn').addEventListener('click', () => {
        navigateWithToken('http://localhost:4000/profile');
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        const token = getToken();
        localStorage.removeItem('token');
        if (token) {
            window.location.href = `http://localhost:4500/logout?token=${token}`;
        } else {
            window.location.href = LOGIN_URL;
        }
    });

    // ── Tool card listeners ───────────────────────────────────
    const toolRoutes = {
        pdfToImageBtn:    'http://localhost:5100/tools/pdf-to-image',
        imageToPdfBtn:    'http://localhost:5200/tools/image-to-pdf',
        pdfCompressorBtn: 'http://localhost:5300/tools/pdf-compressor',
        pdfToAudioBtn:    'http://localhost:5400/tools/pdf-to-audio',
        pdfToWordBtn:     'http://localhost:5500/tools/pdf-to-word',
        sheetlabBtn:      'http://localhost:5600/tools/sheetlab',
        wordToPdfBtn:     'http://localhost:5700/tools/word-to-pdf',
        editPdfBtn:       'http://localhost:5800/tools/edit-pdf',
    };

    Object.entries(toolRoutes).forEach(([id, url]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                navigateWithToken(url);
            } catch (err) {
                console.error(`[script.js] Navigation error for #${id}:`, err);
                showToast('Something went wrong. Please try again.', 'error');
            }
        });
    });

});
