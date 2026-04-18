// ---------- Helpers ----------
function $(sel, ctx) { return (ctx || document).querySelector(sel); }
function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }
function createEl(tag, cls) { const el = document.createElement(tag); if (cls) el.className = cls; return el; }

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function truncateFilename(fullName) {
    if (!fullName) return '';
    const lastDot = fullName.lastIndexOf('.');
    const hasExt  = lastDot > 0 && lastDot < fullName.length - 1;
    const name     = hasExt ? fullName.substring(0, lastDot) : fullName;
    const ext      = hasExt ? fullName.substring(lastDot) : '';
    const tokens   = name.split(/[_\s-]+/).filter(Boolean);
    return tokens.length > 3 ? tokens.slice(0, 3).join('-') + '...' + ext : fullName;
}

// ---------- Toast ----------
function showToast(message, type) {
    type = type || 'info';
    const container = $('#toast-container');
    if (!container) return;
    const toast = createEl('div', 'toast ' + type);
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.style.opacity   = '0';
        toast.style.transform = 'translateX(40px)';
        setTimeout(() => {
            if (container.contains(toast)) container.removeChild(toast);
        }, 400);
    }, 4000);
}

// ---------- Progress ----------
function setProgress(perc) {
    const bar = $('#progress-bar');
    const lbl = $('#progress-label');
    const box = $('#progress-container');
    const msg = $('#progress-message');
    box.style.display = 'block';
    msg.style.display = 'block';
    bar.style.width   = perc + '%';
    lbl.textContent   = Math.floor(perc) + '%';
    if (perc < 20)      msg.innerHTML = '<span class="spinner"></span>Uploading your PDF...';
    else if (perc < 50) msg.innerHTML = '<span class="spinner"></span>Analysing document structure...';
    else if (perc < 80) msg.innerHTML = '<span class="spinner"></span>Converting to Word format... This may take a moment.';
    else if (perc < 96) msg.innerHTML = '<span class="spinner"></span>Finalising your document...';
    else                msg.innerHTML = '<span class="spinner"></span>Done! Preparing download...';
}

function hideProgress() {
    $('#progress-container').style.display = 'none';
    $('#progress-message').style.display   = 'none';
    $('#progress-bar').style.width         = '0%';
    $('#progress-label').textContent       = '0%';
}

// ---------- Auth / Session ----------
// Token cleared immediately — not inside setTimeout — to avoid race condition.
// Toast and redirect both use 3000ms so they expire together.
function handleAuthError(message) {
    localStorage.removeItem('token');
    showToast(message || 'Session expired. Redirecting to login...', 'error');
    setTimeout(() => { window.location.href = 'http://localhost:3000'; }, 4000);
}

// Parses typed 401 response from sessionCheck and shows the right message
async function handle401(response) {
    const messages = {
        TOKEN_EXPIRED: 'Session expired. Redirecting to login...',
        INVALID_TOKEN: 'Invalid session. Redirecting to login...',
        NO_TOKEN:      'No session found. Redirecting to login...'
    };
    try {
        const data = await response.clone().json();
        handleAuthError(messages[data.type] || messages['TOKEN_EXPIRED']);
    } catch {
        handleAuthError(messages['TOKEN_EXPIRED']);
    }
}

// ---------- Session expiry check on page load ----------
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
        setTimeout(() => handleAuthError('No session found. Redirecting to login...'), 100);
        return;
    }

    // Structurally invalid — tampered URL
    if (!isValidJWTStructure(token)) {
        setTimeout(() => handleAuthError('Invalid session detected. Redirecting to login...'), 100);
        return;
    }

    const expiresAt = getTokenExpiry(token);

    // Payload unreadable — treat as tampered
    if (!expiresAt) {
        setTimeout(() => handleAuthError('Invalid session detected. Redirecting to login...'), 100);
        return;
    }

    const delay = expiresAt - Date.now();

    if (delay <= 0) {
        // Already expired — let page render first so toast is visible
        setTimeout(() => handleAuthError('Session expired. Redirecting to login...'), 100);
    } else {
        // Valid — fire exactly when token expires
        setTimeout(() => handleAuthError('Session expired. Redirecting to login...'), delay);
    }
}

// ---------- Mode Card Selection ----------
(function initModeCards() {
    const cards = $$('.mode-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            const radio = card.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        });
    });
    const checked = $('input[type="radio"][name="conversionMode"]:checked');
    if (checked) checked.closest('.mode-card').classList.add('selected');
})();

// ---------- Drag & Drop ----------
(function initDropzone() {
    const dz      = $('#dropzone');
    const input   = $('#pdf-file');
    const pickBtn = $('.dz-btn', dz);
    const selText = $('#selected-file');

    if (!dz || !input) return;

    function setFileName(f) { selText.textContent = f ? 'Selected: ' + f.name : ''; }

    pickBtn.addEventListener('click', () => input.click());
    dz.addEventListener('click', (e) => { if (e.target === dz) input.click(); });
    dz.addEventListener('dragover',  (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', ()  => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('dragover');
        if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            input.files = e.dataTransfer.files;
            setFileName(file);
        } else {
            showToast('Only PDF files are allowed.', 'error');
        }
    });
    input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        if (f && f.type !== 'application/pdf') {
            showToast('Only PDF files are allowed.', 'error');
            input.value = '';
            setFileName(null);
            return;
        }
        setFileName(f);
    });
})();

// ---------- Submit ----------
async function handleSubmit(e) {
    e.preventDefault();
    const input = $('#pdf-file');
    if (!input.files || !input.files[0]) {
        showToast('Please choose a PDF file.', 'error');
        return false;
    }
    if (input.files[0].type !== 'application/pdf') {
        showToast('Only PDF files are allowed.', 'error');
        return false;
    }

    const form   = e.target;
    const action = form.getAttribute('action');
    const data   = new FormData(form);
    const mode   = $('input[name="conversionMode"]:checked');

    if (mode && mode.value === 'ocr') {
        showToast('OCR mode selected. Conversion may take longer for multi-page documents.', 'info');
    }

    setProgress(0);

    try {
        const xhr     = new XMLHttpRequest();
        xhr.open('POST', action, true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        const isOcr      = mode && mode.value === 'ocr';
        const step       = isOcr ? 2 : 4;
        let fakeProgress = 0;
        const interval   = setInterval(() => {
            if (fakeProgress < 90) { fakeProgress += step; setProgress(fakeProgress); }
        }, isOcr ? 600 : 400);

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            clearInterval(interval);
            setProgress(100);
            setTimeout(() => hideProgress(), 1000);

            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const res = JSON.parse(xhr.responseText);
                    appendConvertedCard(res);
                    showToast('PDF converted to Word successfully!', 'success');
                    form.reset();
                    $('#selected-file').textContent = '';
                    $$('.mode-card').forEach(c => c.classList.remove('selected'));
                    const def = $('input[name="conversionMode"][value="standard"]');
                    if (def) { def.checked = true; def.closest('.mode-card').classList.add('selected'); }
                } catch (err) {
                    showToast('Converted, but response parsing failed.', 'error');
                }

            } else if (xhr.status === 401) {
                try {
                    const errData = JSON.parse(xhr.responseText);
                    const messages = {
                        TOKEN_EXPIRED: 'Session expired. Redirecting to login...',
                        INVALID_TOKEN: 'Invalid session. Redirecting to login...',
                        NO_TOKEN:      'No session found. Redirecting to login...'
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

// ---------- Append Card Dynamically ----------
function appendConvertedCard(payload) {
    let grid = $('#processed-grid');
    if (!grid) {
        const section = $('.processed-files-section');
        grid          = createEl('div', 'processed-files-grid');
        grid.id       = 'processed-grid';
        section.appendChild(grid);
        const nf = section.querySelector('.no-files-message');
        if (nf) nf.remove();
    }

    const card = createEl('div', 'processed-file-card');
    card.dataset.fileId = payload.fileId;

    const delBtn       = createEl('button', 'delete-btn');
    delBtn.title       = 'Delete this file';
    delBtn.innerHTML   = '&times;';
    card.appendChild(delBtn);

    const icon         = createEl('span', 'file-icon');
    icon.textContent   = '📝';
    card.appendChild(icon);

    const fname        = createEl('p', 'file-name');
    fname.title        = payload.originalName;
    fname.textContent  = truncateFilename(payload.originalName);
    card.appendChild(fname);

    const badge        = createEl('span', 'mode-badge');
    badge.textContent  = payload.conversionLabel || payload.conversionMode;
    card.appendChild(badge);

    const stats = createEl('div', 'stats-block');
    stats.innerHTML =
        '<div class="stats-row"><span class="stats-label">Original</span><span class="stats-value">'  + formatBytes(payload.originalSize)  + '</span></div>' +
        '<div class="stats-row"><span class="stats-label">Word file</span><span class="stats-value">' + formatBytes(payload.convertedSize) + '</span></div>' +
        '<div class="stats-row"><span class="stats-label">Pages</span><span class="stats-value">'     + (payload.pageCount || '—')         + '</span></div>';
    card.appendChild(stats);

    const dl           = createEl('a', 'download-button');
    dl.href            = payload.downloadUrl;
    dl.download        = '';
    dl.textContent     = 'Download DOCX';
    card.appendChild(dl);

    grid.prepend(card);
}

// ---------- Confirmation Modal ----------
function showConfirmationModal(message) {
    return new Promise(resolve => {
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

        const removeModal = () => {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (document.body.contains(overlay)) document.body.removeChild(overlay);
            }, 300);
        };
        confirmBtn.addEventListener('click', () => { removeModal(); resolve(true);  });
        cancelBtn.addEventListener('click',  () => { removeModal(); resolve(false); });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) { removeModal(); resolve(false); }
        });

        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('visible'), 10);
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
        'Are you sure you want to delete this converted file? This action cannot be undone.'
    );
    if (!confirmed) return;

    try {
        const response = await fetch('/tools/pdf-to-word/' + fileId + '?token=' + token, {
            method:  'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (response.ok) {
            card.remove();
            showToast('File deleted successfully.', 'success');
            const grid = $('#processed-grid');
            if (grid && grid.children.length === 0) {
                const section = $('.processed-files-section');
                if (section) {
                    const msg       = createEl('p', 'no-files-message');
                    msg.textContent = 'No converted files yet.';
                    section.appendChild(msg);
                    grid.remove();
                }
            }
        } else if (response.status === 401) {
            await handle401(response);
        } else {
            showToast('Error: ' + (await response.text()), 'error');
        }
    } catch (error) {
        showToast('An error occurred while deleting the file.', 'error');
    }
});

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
    // Store token from URL
    const params   = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) localStorage.setItem('token', urlToken);

    // Run session check — handles expired, tampered, and missing tokens
    checkSession();
});
