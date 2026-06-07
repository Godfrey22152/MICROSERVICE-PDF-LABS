// =====================================================================
//  main.js  —  pdf-to-audio-service
//  Handles: session checks, drag-drop, XHR submit, progress,
//           toasts, delete modal, auth error handling
// =====================================================================

// ── Toast ─────────────────────────────────────────────────────────────────
// Defined at module scope so handleAuthError can call it before
// DOMContentLoaded fires.
function showToast(message, type, duration) {
    type     = type     || 'info';
    duration = duration || 5000;
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
        setTimeout(function () { if (container.contains(toast)) toast.remove(); }, 350);
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

// Map typed 401 responses from sessionCheck to human-friendly messages
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
    } catch (_) {
        return null;
    }
}

function isValidJWTStructure(token) {
    return token && token.split('.').length === 3;
}

function checkSession() {
    var token = localStorage.getItem('token');

    // No token at all
    if (!token) {
        setTimeout(function () { handleAuthError('No session found. Redirecting to login...'); }, 100);
        return;
    }

    // Structurally invalid — tampered URL / localStorage
    if (!isValidJWTStructure(token)) {
        setTimeout(function () { handleAuthError('Invalid session detected. Redirecting to login...'); }, 100);
        return;
    }

    var expiresAt = getTokenExpiry(token);

    // Payload unreadable — treat as tampered
    if (!expiresAt) {
        setTimeout(function () { handleAuthError('Invalid session detected. Redirecting to login...'); }, 100);
        return;
    }

    var delay = expiresAt - Date.now();

    if (delay <= 0) {
        // Already expired — let the page render first so the toast is visible
        setTimeout(function () { handleAuthError('Session expired. Redirecting to login...'); }, 100);
    } else {
        // Valid — fire exactly when the token expires
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

    // ── DOM refs ─────────────────────────────────────────────────────────
    function $(sel, parent) { return (parent || document).querySelector(sel); }
    function createEl(tag, cls) { var el = document.createElement(tag); if (cls) el.className = cls; return el; }

    var form                = $('#pdf-to-audio-form');
    var fileInput           = $('#pdf-file');
    var dropzone            = $('#dropzone');
    var selectedFileDisplay = $('#selected-file');
    var chooseFileButton    = $('.dz-btn');
    var submitButton        = $('#submit-btn');
    var progressContainer   = $('#progress-container');
    var progressBar         = $('#progress-bar');
    var progressLabel       = $('#progress-label');
    var progressMessage     = $('#progress-message');

    // Voice and speed labels matching the controller
    var voiceLabels = {
        'us': 'English (US)',
        'uk': 'English (UK)',
        'au': 'English (Australia)',
        'ca': 'English (Canada)',
    };
    var speedLabels = {
        '0.75': 'Slow (0.75x)',
        '1.0':  'Normal (1.0x)',
        '1.5':  'Fast (1.5x)',
    };

    // ── Progress Bar ──────────────────────────────────────────────────────

    function setProgress(perc) {
        progressContainer.style.display = 'block';
        progressMessage.style.display   = 'block';
        progressBar.style.width         = perc + '%';
        progressLabel.textContent       = Math.floor(perc) + '%';

        var messageText = progressMessage.querySelector('.message-text');
        if (!messageText) return;
        if (perc < 30)      messageText.textContent = 'Starting conversion... Please wait.';
        else if (perc < 70) messageText.textContent = 'Converting PDF pages to audio...';
        else if (perc < 95) messageText.textContent = 'Almost done... Finalizing audio file.';
        else                messageText.textContent = 'Conversion complete! Finishing up...';
    }

    function hideProgress() {
        progressContainer.style.display = 'none';
        progressMessage.style.display   = 'none';
        progressBar.style.width         = '0%';
        progressLabel.textContent       = '0%';
    }

    // ── Filename truncation ───────────────────────────────────────────────

    function truncateFilename(fullName) {
        if (!fullName) return '';
        var lastDot      = fullName.lastIndexOf('.');
        var hasExtension = lastDot > 0 && lastDot < fullName.length - 1;
        var name         = hasExtension ? fullName.substring(0, lastDot) : fullName;
        var extension    = hasExtension ? fullName.substring(lastDot)    : '';
        var tokens       = name.split(/[_\s-]+/).filter(Boolean);
        return tokens.length > 3
            ? tokens.slice(0, 3).join('_') + '...' + extension
            : fullName;
    }

    // ── Confirmation Modal ────────────────────────────────────────────────

    function showModal(title, message, onConfirm) {
        var existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();

        var modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.innerHTML =
            '<div class="modal-container">' +
                '<div class="modal-content"><h3>' + title + '</h3><p>' + message + '</p></div>' +
                '<div class="modal-buttons">' +
                    '<button class="modal-btn cancel">Cancel</button>' +
                    '<button class="modal-btn confirm">Confirm</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modalOverlay);
        setTimeout(function () { modalOverlay.classList.add('visible'); }, 10);

        var confirmBtn = modalOverlay.querySelector('.confirm');
        var cancelBtn  = modalOverlay.querySelector('.cancel');

        function closeModal() {
            modalOverlay.classList.remove('visible');
            modalOverlay.addEventListener('transitionend', function () { modalOverlay.remove(); });
        }

        confirmBtn.addEventListener('click', function () { if (onConfirm) onConfirm(); closeModal(); });
        cancelBtn.addEventListener('click',  closeModal);
        modalOverlay.addEventListener('click', function (e) { if (e.target === modalOverlay) closeModal(); });
    }

    // ── Audio Card Builder ────────────────────────────────────────────────

    function createAudioCard(fileData) {
        var card = document.createElement('div');
        card.className      = 'processed-file-card';
        card.dataset.fileId = fileData.fileId;

        var voiceLabel  = fileData.voice ? (voiceLabels[fileData.voice] || fileData.voice) : 'Default Voice';
        var speedLabel  = fileData.speed ? (speedLabels[fileData.speed] || fileData.speed) : 'Normal';
        var displayName = truncateFilename(fileData.audioFile);

        card.innerHTML =
            '<button class="delete-btn" title="Delete this file">&times;</button>' +
            '<p class="file-name" title="Original: ' + fileData.audioFile + '">' + displayName + '</p>' +
            '<p class="file-meta">Voice: ' + voiceLabel + ', Speed: ' + speedLabel + '</p>' +
            '<audio controls style="width: 100%; margin-top: 1rem;">' +
                '<source src="' + fileData.previewUrl + '" type="audio/mpeg">' +
            '</audio>' +
            '<div class="card-actions" style="margin-top: 1rem;">' +
                '<a href="' + fileData.downloadUrl + '" class="download-button" download>Download</a>' +
            '</div>';

        card.querySelector('.delete-btn').addEventListener('click', handleDeleteClick);
        return card;
    }

    // ── Submit Handler ────────────────────────────────────────────────────

    function handleSubmit(event) {
        event.preventDefault();

        if (!fileInput.files || !fileInput.files[0]) {
            showToast('Please choose a PDF file.', 'error');
            return;
        }

        var formData = new FormData(form);
        submitButton.disabled    = true;
        submitButton.textContent = 'Converting...';
        setProgress(0);

        var fakeProgress = 0;
        var progressInterval = setInterval(function () {
            if (fakeProgress < 95) { fakeProgress += 5; setProgress(fakeProgress); }
        }, 800);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', form.action, true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        xhr.onload = function () {
            clearInterval(progressInterval);
            setProgress(100);

            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var result = JSON.parse(xhr.responseText);
                    showToast('Conversion successful!', 'success');
                    var newCard = createAudioCard(result);
                    var grid    = $('#processed-grid');
                    var noMsg   = $('.no-files-message');
                    if (grid) {
                        grid.prepend(newCard);
                    } else if (noMsg) {
                        var newGrid = createEl('div', 'processed-files-grid');
                        newGrid.id  = 'processed-grid';
                        newGrid.prepend(newCard);
                        noMsg.replaceWith(newGrid);
                    }
                    form.reset();
                    selectedFileDisplay.textContent = '';
                } catch (_) {
                    showToast('Error parsing server response.', 'error');
                }

            } else if (xhr.status === 401) {
                // Parse the typed 401 response from sessionCheck
                try {
                    var errData = JSON.parse(xhr.responseText);
                    var messages = {
                        TOKEN_EXPIRED: 'Session expired. Redirecting to login...',
                        INVALID_TOKEN: 'Invalid session. Redirecting to login...',
                        NO_TOKEN:      'No session found. Redirecting to login...',
                    };
                    handleAuthError(messages[errData.type] || messages['TOKEN_EXPIRED']);
                } catch (_) {
                    handleAuthError('Session expired. Redirecting to login...');
                }

            } else {
                try {
                    var errJson = JSON.parse(xhr.responseText);
                    showToast(errJson.msg || 'Conversion failed.', 'error');
                } catch (_) {
                    showToast(xhr.responseText || 'Conversion failed.', 'error');
                }
            }

            setTimeout(function () {
                hideProgress();
                submitButton.disabled    = false;
                submitButton.textContent = 'Convert to Audio';
            }, 1000);
        };

        xhr.onerror = function () {
            clearInterval(progressInterval);
            hideProgress();
            showToast('A network error occurred.', 'error');
            submitButton.disabled    = false;
            submitButton.textContent = 'Convert to Audio';
        };

        xhr.send(formData);
    }

    // ── Delete Handler ────────────────────────────────────────────────────

    function handleDeleteClick(e) {
        var card   = e.target.closest('.processed-file-card');
        if (!card) return;
        var fileId = card.dataset.fileId;
        if (!fileId) return showToast('Cannot delete: missing file ID.', 'error');

        showModal(
            'Confirm Deletion',
            'Are you sure you want to delete this file? This action cannot be undone.',
            async function () {
                var token = localStorage.getItem('token');
                try {
                    var response = await fetch('/tools/pdf-to-audio/' + fileId, {
                        method:  'DELETE',
                        headers: { 'Authorization': 'Bearer ' + token },
                    });

                    if (response.ok) {
                        card.remove();
                        showToast('File deleted.', 'success');
                        var grid = $('#processed-grid');
                        if (grid && grid.children.length === 0) {
                            var noFilesMessage       = createEl('p', 'no-files-message');
                            noFilesMessage.textContent = 'No audiobooks have been created yet.';
                            grid.replaceWith(noFilesMessage);
                        }
                    } else if (response.status === 401) {
                        await handle401(response);
                    } else {
                        var error = await response.text();
                        showToast('Error: ' + error, 'error');
                    }
                } catch (_) {
                    showToast('An error occurred while deleting the file.', 'error');
                }
            }
        );
    }

    // ── File Selection ────────────────────────────────────────────────────

    function handleFileSelect(file) {
        selectedFileDisplay.textContent = file ? 'Selected File: ' + file.name : '';
    }

    // ── Init ──────────────────────────────────────────────────────────────

    if (form) form.addEventListener('submit', handleSubmit);

    // Delegated listener for server-rendered delete buttons
    document.body.addEventListener('click', function (e) {
        if (e.target.matches('.delete-btn')) handleDeleteClick(e);
    });

    if (chooseFileButton) chooseFileButton.addEventListener('click', function () { fileInput.click(); });

    if (fileInput) {
        fileInput.addEventListener('change', function () {
            if (fileInput.files.length > 0) handleFileSelect(fileInput.files[0]);
        });
    }

    if (dropzone) {
        dropzone.addEventListener('dragover',  function (e) { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone.addEventListener('dragleave', function (e) { e.preventDefault(); dropzone.classList.remove('dragover'); });
        dropzone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (!e.dataTransfer.files.length) return;
            var file = e.dataTransfer.files[0];
            if (file.type === 'application/pdf') {
                fileInput.files = e.dataTransfer.files;
                handleFileSelect(file);
            } else {
                showToast('Only PDF files are allowed.', 'error');
            }
        });
    }

    // Truncate filenames on server-rendered cards
    document.querySelectorAll('.file-name[data-audio-file]').forEach(function (el) {
        var audioFile = el.dataset.audioFile;
        if (audioFile) el.textContent = truncateFilename(audioFile);
    });

}); // end DOMContentLoaded
