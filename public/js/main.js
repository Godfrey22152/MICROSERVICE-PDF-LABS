// =====================================================================
//  main.js  —  image-to-pdf-service
//  Handles: session checks, drag-drop upload, AJAX submission,
//           progress bar, toasts, delete modal, auth error handling
// =====================================================================

// ---------- Helpers ----------
function $(sel, parent) { return (parent || document).querySelector(sel); }
function createEl(tag, cls) { const el = document.createElement(tag); if (cls) el.className = cls; return el; }

// ---------- Toast ----------
function showToast(message, type) {
    type = type || 'info';
    const container = $('#toast-container');
    if (!container) return;
    const toast = createEl('div', 'toast ' + type);
    toast.textContent = message;
    container.appendChild(toast);
    // Double rAF ensures element is in the DOM before transition fires
    requestAnimationFrame(function () {
        requestAnimationFrame(function () { toast.classList.add('show'); });
    });
    setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () {
            if (container.contains(toast)) container.removeChild(toast);
        }, 350);
    }, 4000);
}

// ---------- Auth / Session ----------
// Token is cleared immediately — not inside setTimeout — to avoid a race
// condition where a rapid second request could sneak through with a stale token.
function handleAuthError(message) {
    localStorage.removeItem('token');
    showToast(message || 'Session expired. Redirecting to login...', 'error');
    setTimeout(function () { window.location.href = 'http://localhost:3000'; }, 4000);
}

// Map typed 401 responses from sessionCheck to human-friendly messages
async function handle401(response) {
    const messages = {
        TOKEN_EXPIRED: 'Session expired. Redirecting to login...',
        INVALID_TOKEN: 'Invalid session. Redirecting to login...',
        NO_TOKEN:      'No session found. Redirecting to login...',
    };
    try {
        const data = await response.clone().json();
        handleAuthError(messages[data.type] || messages['TOKEN_EXPIRED']);
    } catch {
        handleAuthError(messages['TOKEN_EXPIRED']);
    }
}

// ---------- Session expiry proactive check ----------

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
    return token && token.split('.').length === 3;
}

function checkSession() {
    const token = localStorage.getItem('token');

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

    const expiresAt = getTokenExpiry(token);

    // Payload unreadable — treat as tampered
    if (!expiresAt) {
        setTimeout(function () { handleAuthError('Invalid session detected. Redirecting to login...'); }, 100);
        return;
    }

    const delay = expiresAt - Date.now();

    if (delay <= 0) {
        // Already expired — let the page render first so the toast is visible
        setTimeout(function () { handleAuthError('Session expired. Redirecting to login...'); }, 100);
    } else {
        // Valid — fire exactly when the token expires
        setTimeout(function () { handleAuthError('Session expired. Redirecting to login...'); }, delay);
    }
}

// ---------- Progress ----------
function setProgress(perc) {
    const bar     = $('#progress-bar');
    const label   = $('#progress-label');
    const box     = $('#progress-container');
    const message = $('#progress-message');

    box.style.display     = 'block';
    message.style.display = 'block';
    bar.style.width       = perc + '%';
    label.textContent     = Math.floor(perc) + '%';

    if (perc < 30) {
        message.innerHTML = '<span class="spinner"></span>Starting conversion... Please wait while we process your document.';
    } else if (perc < 70) {
        message.innerHTML = '<span class="spinner"></span>Converting PDF pages... This may take a few moments.';
    } else if (perc < 95) {
        message.innerHTML = '<span class="spinner"></span>Almost done... Finalizing your images.';
    } else {
        message.innerHTML = '<span class="spinner"></span>Conversion complete! Preparing download...';
    }
}

function hideProgress() {
    $('#progress-container').style.display = 'none';
    $('#progress-message').style.display   = 'none';
    $('#progress-bar').style.width         = '0%';
    $('#progress-label').textContent       = '0%';
}

// ---------- Drag & Drop ----------
(function initDropzone() {
    const dz       = $('#dropzone');
    const input    = $('#image-files');
    const pickBtn  = $('.dz-btn', dz);
    const selected = $('#selected-file');

    function setFileNames(files) {
        if (files && files.length > 0) {
            selected.textContent = files.length === 1
                ? 'Selected: ' + files[0].name
                : 'Selected: ' + files.length + ' file(s)';
        } else {
            selected.textContent = '';
        }
    }

    pickBtn.addEventListener('click', function () { input.click(); });
    dz.addEventListener('click', function (e) { if (e.target === dz) input.click(); });

    dz.addEventListener('dragover',  function (e) { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', function ()  { dz.classList.remove('dragover'); });
    dz.addEventListener('drop', function (e) {
        e.preventDefault();
        dz.classList.remove('dragover');
        if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
        const allowedTypes = ['image/jpeg', 'image/png'];
        const validFiles   = Array.from(e.dataTransfer.files).filter(function (f) { return allowedTypes.includes(f.type); });
        if (validFiles.length > 0) {
            input.files = e.dataTransfer.files;
            setFileNames(validFiles);
        } else {
            showToast('Only JPG and PNG images are allowed.', 'error');
        }
    });

    input.addEventListener('change', function () {
        const files        = input.files;
        const allowedTypes = ['image/jpeg', 'image/png'];
        const validFiles   = Array.from(files).filter(function (f) { return allowedTypes.includes(f.type); });
        if (validFiles.length !== files.length) {
            showToast('Only JPG and PNG images are allowed.', 'error');
            input.value = '';
            setFileNames(null);
            return;
        }
        setFileNames(validFiles);
    });
})();

// ---------- Submit ----------
async function handleSubmit(e) {
    e.preventDefault();

    const input = $('#image-files');
    if (!input.files || input.files.length === 0) {
        showToast('Please choose one or more image files.', 'error');
        return false;
    }

    const form   = e.target;
    const action = form.getAttribute('action'); // includes ?token=
    const data   = new FormData(form);

    setProgress(0);

    try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', action, true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        let fakeProgress = 0;
        const interval   = setInterval(function () {
            if (fakeProgress < 95) { fakeProgress += 5; setProgress(fakeProgress); }
        }, 500);

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            clearInterval(interval);
            setProgress(100);
            setTimeout(function () { hideProgress(); }, 1000);

            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const res = JSON.parse(xhr.responseText);
                    appendProcessedCard(res);
                    showToast('Conversion to PDF completed successfully!', 'success');
                    form.reset();
                    $('#selected-file').textContent = '';
                } catch (err) {
                    showToast('Converted, but response parsing failed.', 'error');
                }

            } else if (xhr.status === 401) {
                // Parse the typed 401 response from sessionCheck
                try {
                    const errData = JSON.parse(xhr.responseText);
                    const messages = {
                        TOKEN_EXPIRED: 'Session expired. Redirecting to login...',
                        INVALID_TOKEN: 'Invalid session. Redirecting to login...',
                        NO_TOKEN:      'No session found. Redirecting to login...',
                    };
                    handleAuthError(messages[errData.type] || messages['TOKEN_EXPIRED']);
                } catch {
                    handleAuthError('Session expired. Redirecting to login...');
                }

            } else {
                try {
                    const errData = JSON.parse(xhr.responseText);
                    showToast(errData.msg || 'Conversion failed.', 'error');
                } catch {
                    showToast(xhr.responseText || 'Conversion failed.', 'error');
                }
            }
        };

        xhr.send(data);
    } catch (err) {
        hideProgress();
        showToast('Upload error: ' + (err && err.message ? err.message : err), 'error');
    }

    return false;
}

// ---------- Append Card ----------
function appendProcessedCard(payload) {
    let grid = $('#processed-grid');
    if (!grid) {
        const section = document.querySelector('.processed-files-section');
        grid          = createEl('div', 'processed-files-grid');
        grid.id       = 'processed-grid';
        section.appendChild(grid);
        const nf = section.querySelector('.no-files-message');
        if (nf) nf.remove();
    }

    const card = createEl('div', 'processed-file-card');
    card.dataset.fileId = payload.fileId;

    const deleteBtn     = createEl('button', 'delete-btn');
    deleteBtn.title     = 'Delete this file';
    deleteBtn.innerHTML = '&times;';
    card.appendChild(deleteBtn);

    const title       = createEl('p', 'file-name');
    title.textContent = payload.filename.length > 20
        ? payload.filename.substring(0, 17) + '...'
        : payload.filename;
    title.title = payload.filename;
    card.appendChild(title);

    const actions    = createEl('div', 'card-actions');
    const viewBtn    = createEl('a', 'download-button');
    viewBtn.href     = '/tools/image-to-pdf/view/' + payload.fileId;
    viewBtn.target   = '_blank';
    viewBtn.textContent = 'View PDF';
    actions.appendChild(viewBtn);

    const downloadBtn    = createEl('a', 'download-button');
    downloadBtn.href     = '/tools/image-to-pdf/download/' + payload.fileId;
    downloadBtn.textContent = 'Download PDF';
    actions.appendChild(downloadBtn);

    card.appendChild(actions);
    grid.prepend(card);
}

// ---------- Confirmation Modal ----------
function showConfirmationModal(message) {
    return new Promise(function (resolve) {
        const overlay   = createEl('div', 'modal-overlay');
        const container = createEl('div', 'modal-container');
        overlay.appendChild(container);

        const content = createEl('div', 'modal-content');
        const p       = createEl('p');
        p.textContent = message;
        content.appendChild(p);
        container.appendChild(content);

        const buttons    = createEl('div', 'modal-buttons');
        const confirmBtn = createEl('button', 'modal-btn confirm');
        confirmBtn.textContent = 'Confirm';
        const cancelBtn  = createEl('button', 'modal-btn cancel');
        cancelBtn.textContent  = 'Cancel';
        buttons.appendChild(confirmBtn);
        buttons.appendChild(cancelBtn);
        container.appendChild(buttons);

        const removeModal = function () {
            overlay.classList.remove('visible');
            setTimeout(function () {
                if (document.body.contains(overlay)) document.body.removeChild(overlay);
            }, 300);
        };

        confirmBtn.addEventListener('click', function () { removeModal(); resolve(true);  });
        cancelBtn.addEventListener('click',  function () { removeModal(); resolve(false); });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) { removeModal(); resolve(false); }
        });

        document.body.appendChild(overlay);
        setTimeout(function () { overlay.classList.add('visible'); }, 10);
    });
}

// ---------- Delete Handler ----------
document.addEventListener('click', async function (e) {
    if (!e.target.matches('.delete-btn')) return;

    const card   = e.target.closest('.processed-file-card');
    const fileId = card && card.dataset.fileId;
    const token  = localStorage.getItem('token');

    if (!fileId) { showToast('Could not find file ID.', 'error'); return; }

    const confirmed = await showConfirmationModal(
        'Are you sure you want to delete this file? This action cannot be undone.'
    );
    if (!confirmed) return;

    try {
        const response = await fetch('/tools/image-to-pdf/' + fileId + '?token=' + token, {
            method:  'DELETE',
            headers: { 'Authorization': 'Bearer ' + token },
        });

        if (response.ok) {
            card.remove();
            showToast('File deleted successfully.', 'success');
            const grid = $('#processed-grid');
            if (grid && grid.children.length === 0) {
                const section = document.querySelector('.processed-files-section');
                if (section) {
                    const msg       = createEl('p', 'no-files-message');
                    msg.textContent = 'No PDF files have been generated yet.';
                    section.appendChild(msg);
                    grid.remove();
                }
            }
        } else if (response.status === 401) {
            await handle401(response);
        } else {
            const errorText = await response.text();
            showToast('Error: ' + errorText, 'error');
        }
    } catch (error) {
        showToast('An error occurred while deleting the file.', 'error');
    }
});

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', function () {
    // Store token from URL
    const params   = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) localStorage.setItem('token', urlToken);

    // Run session check — handles expired, tampered, and missing tokens
    checkSession();
});
