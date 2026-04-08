// =====================================================================
//  script.js  —  profile-service
//  Handles: session checks, nav buttons, profile update form,
//           account deletion, toasts
// =====================================================================

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(message, type, duration) {
    type     = type     || 'info';
    duration = duration || 4000;
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
        setTimeout(function () { if (container.contains(toast)) toast.remove(); }, 350);
    }, duration);
}

// ── Auth / Session ─────────────────────────────────────────────────────────
function handleAuthError(message) {
    localStorage.removeItem('token');
    showToast(message || 'Session expired. Redirecting to login...', 'error');
    setTimeout(function () { window.location.href = 'http://localhost:3000'; }, 4000);
}

function handleDeletedUser(message) {
    localStorage.removeItem('token');
    showToast(
        message || 'Something just happened — user no longer found or deleted.',
        'warning'
    );
    setTimeout(function () { window.location.href = 'http://localhost:3000'; }, 4000);
}

async function handleErrorResponse(response) {
    var authMessages = {
        TOKEN_EXPIRED: 'Session expired. Redirecting to login...',
        INVALID_TOKEN: 'Invalid session. Redirecting to login...',
        NO_TOKEN:      'No session found. Redirecting to login...',
    };
    try {
        var data = await response.clone().json();
        if (data.type === 'USER_DELETED') { handleDeletedUser(data.msg); return; }
        if (response.status === 401) { handleAuthError(authMessages[data.type] || authMessages['TOKEN_EXPIRED']); return; }
        showToast(data.msg || 'An unexpected error occurred.', 'error');
    } catch (_) {
        handleAuthError(authMessages['TOKEN_EXPIRED']);
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

// ── Page load: detect deleted user on tab refresh ─────────────────────────
async function checkProfileExists() {
    var token = localStorage.getItem('token');
    if (!token) return;
    try {
        var response = await fetch('/profile?token=' + token, {
            headers: { 'Accept': 'application/json' },
        });
        if (!response.ok) await handleErrorResponse(response);
    } catch (_) {}
}

// ── Confirmation Modal ────────────────────────────────────────────────────
function showConfirmModal(options) {
    var existing = document.getElementById('confirm-modal-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id        = 'confirm-modal-overlay';
    overlay.className = 'modal-overlay';
    var modalHTML =
        '<div class="modal-container">' +
            '<div class="modal-content">' +
                '<h3>' + (options.title   || 'Confirm') + '</h3>' +
                '<p>'  + (options.message || 'Are you sure?') + '</p>';

    if (options.showInput) {
        modalHTML += '<input type="' + (options.inputType || 'text') + '" id="modal-input" class="modal-input" placeholder="' + (options.inputPlaceholder || '') + '">';
    }

    modalHTML +=
            '</div>' +
            '<div class="modal-buttons">' +
                '<button class="modal-btn cancel" id="modal-cancel-btn">Cancel</button>' +
                '<button class="modal-btn confirm ' + (options.confirmClass || '') + '" id="modal-confirm-btn">' +
                    (options.confirmLabel || 'Confirm') +
                '</button>' +
            '</div>' +
        '</div>';

    overlay.innerHTML = modalHTML;

    document.body.appendChild(overlay);
    setTimeout(function () { overlay.classList.add('visible'); }, 10);

    function closeModal() {
        overlay.classList.remove('visible');
        setTimeout(function () { if (document.body.contains(overlay)) overlay.remove(); }, 300);
    }

    document.getElementById('modal-confirm-btn').addEventListener('click', function () {
        var inputValue = null;
        if (options.showInput) {
            inputValue = document.getElementById('modal-input').value;
        }

        if (options.showInput && !inputValue) {
            showToast('Please enter the required information.', 'error');
            return;
        }

        closeModal();
        if (options.onConfirm) options.onConfirm(inputValue);
    });
    document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {

    // ── Boot ──────────────────────────────────────────────────────────────
    var params   = new URLSearchParams(window.location.search);
    var urlToken = params.get('token');
    if (urlToken) localStorage.setItem('token', urlToken);

    checkSession();
    checkProfileExists();

    // ── Nav button active state ───────────────────────────────────────────
    var navButtons = document.querySelectorAll('.nav-buttons button');
    navButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            navButtons.forEach(function (btn) { btn.classList.remove('active'); });
            button.classList.add('active');
        });
    });

    // ── Navigation handlers ───────────────────────────────────────────────
    document.getElementById('dashboardButton').addEventListener('click', function () {
        var token = localStorage.getItem('token');
        window.location.href = token ? 'http://localhost:4000/?token=' + token : 'http://localhost:3000';
    });

    document.getElementById('toolsButton').addEventListener('click', function () {
        var token = localStorage.getItem('token');
        window.location.href = token ? 'http://localhost:5000/tools?token=' + token : 'http://localhost:3000';
    });

    document.getElementById('settingsButton').addEventListener('click', function () {
        var token = localStorage.getItem('token');
        window.location.href = token ? '/settings?token=' + token : '/settings';
    });

    document.getElementById('profileButton').addEventListener('click', function (e) {
        e.preventDefault();
    });

    document.getElementById('logoutButton').addEventListener('click', function () {
        var token = localStorage.getItem('token');
        window.location.href = token ? 'http://localhost:4500/logout?token=' + token : 'http://localhost:3000';
    });

    // ── Profile update form ───────────────────────────────────────────────
    var updateForm = document.getElementById('updateProfileForm');
    if (updateForm) {
        updateForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            var token = localStorage.getItem('token');
            if (!token) {
                showToast('No session found. Please log in again.', 'error');
                setTimeout(function () { window.location.href = 'http://localhost:3000'; }, 4000);
                return;
            }

            var name     = document.getElementById('name').value;
            var email    = document.getElementById('email').value;
            var password = document.getElementById('password').value;

            try {
                var response = await fetch('/update-profile', {
                    method:  'POST',
                    headers: {
                        'Content-Type':  'application/json',
                        'Authorization': 'Bearer ' + token,
                    },
                    body: JSON.stringify({ name: name, email: email, password: password }),
                });

                if (!response.ok) return handleErrorResponse(response);

                showToast('Profile updated successfully! ✅', 'success');
                setTimeout(function () {
                    window.location.href = '/profile?token=' + token;
                }, 3000);
            } catch (err) {
                console.error('Update error:', err);
                showToast('An error occurred. Please try again.', 'error');
            }
        });
    }

    // ── Delete account ────────────────────────────────────────────────────
    var deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', function () {
            showConfirmModal({
                title:            'Delete Account',
                message:          'This will permanently delete your account and all associated data. This action cannot be undone. Please enter your password to confirm.',
                confirmLabel:     'Yes, Delete My Account',
                confirmClass:     'danger',
                showInput:        true,
                inputType:        'password',
                inputPlaceholder: 'Your password',
                onConfirm:        async function (password) {

                    var token = localStorage.getItem('token');
                    if (!token) {
                        showToast('No session found. Please log in again.', 'error');
                        setTimeout(function () { window.location.href = 'http://localhost:3000'; }, 4000);
                        return;
                    }

                    try {
                        var response = await fetch('/delete-account?token=' + token, {
                            method:  'DELETE',
                            headers: {
                                'Authorization':    'Bearer ' + token,
                                'Content-Type':     'application/json',
                                'X-Requested-With': 'XMLHttpRequest',
                            },
                            body: JSON.stringify({ password: password })
                        });

                        if (!response.ok) return handleErrorResponse(response);

                        // Success — clear session and redirect
                        localStorage.removeItem('token');
                        showToast(
                            'Your account has been permanently deleted. Redirecting...',
                            'warning',
                            5000
                        );
                        setTimeout(function () { window.location.href = 'http://localhost:3000'; }, 4000);

                    } catch (err) {
                        console.error('Delete account error:', err);
                        showToast('An error occurred. Please try again.', 'error');
                    }
                },
            });
        });
    }

});