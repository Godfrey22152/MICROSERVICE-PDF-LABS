// =====================================================================
//  main.js  —  pdf-compressor-service
//  Handles: session checks, drag-drop, AJAX submit, progress,
//           toasts, delete modal, auth error handling
// =====================================================================

// ── Helpers ───────────────────────────────────────────────────────────────
function $(sel, parent) { return (parent || document).querySelector(sel); }
function $$(sel, parent) { return Array.from((parent || document).querySelectorAll(sel)); }
function createEl(tag, cls) { const el = document.createElement(tag); if (cls) el.className = cls; return el; }

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function truncateFilename(fullName) {
  if (!fullName) return '';
  const lastDot = fullName.lastIndexOf('.');
  const hasExt  = lastDot > 0 && lastDot < fullName.length - 1;
  const name     = hasExt ? fullName.substring(0, lastDot) : fullName;
  const ext      = hasExt ? fullName.substring(lastDot)    : '';
  const tokens   = name.split(/[_\s-]+/).filter(Boolean);
  return tokens.length > 3 ? tokens.slice(0, 3).join('-') + '...' + ext : fullName;
}

// ── Toast ─────────────────────────────────────────────────────────────────
// Defined at module scope so handleAuthError can call it before
// DOMContentLoaded fires.
function showToast(message, type, duration) {
  type     = type     || 'info';
  duration = duration || 4500;
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = createEl('div', 'toast ' + type);
  toast.textContent = message;
  container.appendChild(toast);
  // Double rAF ensures the element is in the DOM before the transition fires
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { if (container.contains(toast)) container.removeChild(toast); }, 350);
  }, duration);
}

// ── Auth / Session ─────────────────────────────────────────────────────────
// Token is cleared immediately — not inside setTimeout — to avoid a race
// condition where a rapid second request could sneak through with a stale token.
function handleAuthError(message) {
  localStorage.removeItem('token');
  showToast(message || 'Session expired. Redirecting to login...', 'error');
  setTimeout(() => { window.location.href = 'http://localhost:3000'; }, 4000);
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
  } catch (_) {
    handleAuthError(messages['TOKEN_EXPIRED']);
  }
}

// ── Session expiry proactive check ────────────────────────────────────────

function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    return payload.exp ? payload.exp * 1000 : null;
  } catch (_) { return null; }
}

function isValidJWTStructure(token) {
  return token && token.split('.').length === 3;
}

function checkSession() {
  const token = localStorage.getItem('token');

  if (!token) {
    setTimeout(() => handleAuthError('No session found. Redirecting to login...'), 100);
    return;
  }
  if (!isValidJWTStructure(token)) {
    setTimeout(() => handleAuthError('Invalid session detected. Redirecting to login...'), 100);
    return;
  }

  const expiresAt = getTokenExpiry(token);
  if (!expiresAt) {
    setTimeout(() => handleAuthError('Invalid session detected. Redirecting to login...'), 100);
    return;
  }

  const delay = expiresAt - Date.now();
  if (delay <= 0) {
    setTimeout(() => handleAuthError('Session expired. Redirecting to login...'), 100);
  } else {
    setTimeout(() => handleAuthError('Session expired. Redirecting to login...'), delay);
  }
}

// ── Progress ──────────────────────────────────────────────────────────────

function setProgress(perc) {
  const bar = $('#progress-bar');
  const lbl = $('#progress-label');
  const box = $('#progress-container');
  const msg = $('#progress-message');
  box.style.display = 'block';
  msg.style.display = 'block';
  bar.style.width   = perc + '%';
  lbl.textContent   = Math.floor(perc) + '%';
  if (perc < 30)      msg.innerHTML = '<span class="spinner"></span>Uploading your PDF...';
  else if (perc < 70) msg.innerHTML = '<span class="spinner"></span>Compressing PDF... Please wait.';
  else if (perc < 95) msg.innerHTML = '<span class="spinner"></span>Almost done... Finalizing compression.';
  else                msg.innerHTML = '<span class="spinner"></span>Compression complete! Preparing download...';
}

function hideProgress() {
  $('#progress-container').style.display = 'none';
  $('#progress-message').style.display   = 'none';
  $('#progress-bar').style.width         = '0%';
  $('#progress-label').textContent       = '0%';
}

// ── Compression Level Card Selection ──────────────────────────────────────

(function initLevelCards() {
  const cards = $$('.level-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });
  const checked = $('input[type="radio"][name="compressionLevel"]:checked');
  if (checked) checked.closest('.level-card').classList.add('selected');
})();

// ── Drag & Drop ───────────────────────────────────────────────────────────

(function initDropzone() {
  const dz      = $('#dropzone');
  const input   = $('#pdf-file');
  const pickBtn = $('.dz-btn', dz);
  const selected = $('#selected-file');

  function setFileName(f) { selected.textContent = f ? 'Selected: ' + f.name : ''; }

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

// ── Submit ────────────────────────────────────────────────────────────────

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

  setProgress(0);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', action, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    let fakeProgress = 0;
    const interval = setInterval(() => {
      if (fakeProgress < 90) { fakeProgress += 4; setProgress(fakeProgress); }
    }, 400);

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => hideProgress(), 1000);

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          appendCompressedCard(res);
          showToast('PDF compressed successfully!', 'success');
          form.reset();
          $('#selected-file').textContent = '';
          $$('.level-card').forEach(c => c.classList.remove('selected'));
          const def = $('input[type="radio"][name="compressionLevel"][value="high"]');
          if (def) { def.checked = true; def.closest('.level-card').classList.add('selected'); }
        } catch (_) {
          showToast('Compressed, but response parsing failed.', 'error');
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
        } catch (_) {
          handleAuthError('Session expired. Redirecting to login...');
        }

      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          showToast(errData.msg || 'Compression failed.', 'error');
        } catch (_) {
          showToast(xhr.responseText || 'Compression failed.', 'error');
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

// ── Append Card ───────────────────────────────────────────────────────────

function appendCompressedCard(payload) {
  let grid = $('#processed-grid');
  if (!grid) {
    const section = $('.processed-files-section');
    grid    = createEl('div', 'processed-files-grid');
    grid.id = 'processed-grid';
    section.appendChild(grid);
    const nf = section.querySelector('.no-files-message');
    if (nf) nf.remove();
  }

  const card = createEl('div', 'processed-file-card');
  card.dataset.fileId = payload.fileId;

  const delBtn     = createEl('button', 'delete-btn');
  delBtn.title     = 'Delete this file';
  delBtn.innerHTML = '&times;';
  card.appendChild(delBtn);

  const icon       = createEl('span', 'file-icon');
  icon.textContent = '📦';
  card.appendChild(icon);

  const fname       = createEl('p', 'file-name');
  fname.title       = payload.originalName;
  fname.textContent = truncateFilename(payload.originalName);
  card.appendChild(fname);

  const badge       = createEl('span', 'compression-badge');
  badge.textContent = payload.compressionLabel || payload.compressionLevel;
  card.appendChild(badge);

  const stats = createEl('div', 'stats-block');
  stats.innerHTML =
    '<div class="stats-row"><span class="stats-label">Original</span><span class="stats-value">'    + formatBytes(payload.originalSize)    + '</span></div>' +
    '<div class="stats-row"><span class="stats-label">Compressed</span><span class="stats-value">' + formatBytes(payload.compressedSize)  + '</span></div>' +
    '<div class="stats-row"><span class="stats-label">Saved</span><span class="stats-value">'       + formatBytes(payload.savedBytes)      + '</span></div>' +
    '<span class="stats-saved">&#x2193; ' + payload.savedPercent + '% smaller</span>';
  card.appendChild(stats);

  const dl      = createEl('a', 'download-button');
  dl.href       = payload.downloadUrl;
  dl.download   = '';
  dl.textContent = 'Download';
  card.appendChild(dl);

  grid.prepend(card);
}

// ── Confirmation Modal ────────────────────────────────────────────────────

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
      setTimeout(() => { if (document.body.contains(overlay)) document.body.removeChild(overlay); }, 300);
    };

    confirmBtn.addEventListener('click', () => { removeModal(); resolve(true);  });
    cancelBtn.addEventListener('click',  () => { removeModal(); resolve(false); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { removeModal(); resolve(false); } });

    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('visible'), 10);
  });
}

// ── Delete Handler ────────────────────────────────────────────────────────

document.addEventListener('click', async function (e) {
  if (!e.target.matches('.delete-btn')) return;

  const card   = e.target.closest('.processed-file-card');
  const fileId = card && card.dataset.fileId;
  const token  = localStorage.getItem('token');

  if (!fileId) { showToast('Could not find file ID.', 'error'); return; }

  const confirmed = await showConfirmationModal(
    'Are you sure you want to delete this compressed file? This action cannot be undone.'
  );
  if (!confirmed) return;

  try {
    const response = await fetch('/tools/pdf-compressor/' + fileId + '?token=' + token, {
      method:  'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });

    if (response.ok) {
      card.remove();
      showToast('File deleted successfully.', 'success');
      const grid = $('#processed-grid');
      if (grid && grid.children.length === 0) {
        const section = $('.processed-files-section');
        if (section) {
          const msg       = createEl('p', 'no-files-message');
          msg.textContent = 'No compressed files yet.';
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
  } catch (_) {
    showToast('An error occurred while deleting the file.', 'error');
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Store token from URL
  const params   = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) localStorage.setItem('token', urlToken);

  // Run session check — handles expired, tampered, and missing tokens
  checkSession();
});
