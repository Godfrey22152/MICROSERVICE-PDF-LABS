// ---------- Helpers ----------
function $(sel, parent) { return (parent || document).querySelector(sel); }
function createEl(tag, cls) { const el = document.createElement(tag); if (cls) el.className = cls; return el; }

/**
 * Truncates a filename to the first 3 "tokens" and appends the extension.
 * e.g., "my-long-file-name-v1.png" -> "my-long-file...png"
 * @param {string} fullName The original filename.
 * @returns {string} The truncated filename or the original if it's short enough.
 */
function truncateFilename(fullName) {
  if (!fullName) return '';

  const lastDot = fullName.lastIndexOf('.');
  // Treat as extension if a dot exists and it's not the first character
  const hasExtension = lastDot > 0 && lastDot < fullName.length - 1;

  let name, extension;
  if (hasExtension) {
    name = fullName.substring(0, lastDot);
    extension = fullName.substring(lastDot);
  } else {
    name = fullName;
    extension = '';
  }

  // Split by common delimiters
  const tokens = name.split(/[_\s-]+/).filter(Boolean);

  if (tokens.length > 3) {
    // Re-join with a consistent separator
    const truncatedName = tokens.slice(0, 3).join('-');
    return `${truncatedName}...${extension}`;
  }

  return fullName; // Return original if 3 or fewer tokens
}

/**
 * Updates a .file-name element to show the truncated name and a full-name tooltip.
 * Reads the full name from the element's `data-full-name` attribute.
 * @param {HTMLElement} el The .file-name element to update.
 */
function updateFilenameDisplay(el) {
  const fullName = el.dataset.fullName;
  if (fullName) {
    el.textContent = truncateFilename(fullName);
    el.title = fullName;
  }
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = createEl('div', 'toast ' + type);
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('show'); }, 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => container.removeChild(toast), 200);
  }, 4000);
}

/**
 * Handles authentication errors (401).
 * Shows a toast, clears the token, and redirects to the login page.
 */
function handleAuthError() {
    showToast('Your session has expired or token not valid. Please log in again.', 'error');
    localStorage.removeItem('token');
    // Redirect to login page after a delay to allow the user to see the toast
    setTimeout(() => {
        window.location.href = 'http://localhost:3000';
    }, 4000);
}

function setProgress(perc) {
  const bar = $('#progress-bar');
  const label = $('#progress-label');
  const box = $('#progress-container');
  const message = $('#progress-message');

  // Show progress elements
  box.style.display = 'block';
  message.style.display = 'block';

  // Update progress
  bar.style.width = perc + '%';
  label.textContent = Math.floor(perc) + '%';

  // Update message based on progress
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
  $('#progress-message').style.display = 'none';
  $('#progress-bar').style.width = '0%';
  $('#progress-label').textContent = '0%';
}


// ---------- Drag & Drop ----------
(function initDropzone(){
  const dz = $('#dropzone');
  const input = $('#pdf-file');
  const pickBtn = $('.dz-btn', dz);
  const selected = $('#selected-file');

  function setFileName(f) { selected.textContent = f ? 'Selected: ' + f.name : ''; }

  pickBtn.addEventListener('click', () => input.click());
  dz.addEventListener('click', (e) => {
    if (e.target === dz) input.click();
  });

  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('dragover');
  });

  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));

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

// ---------- Submit (AJAX with progress; falls back to normal POST if XHR not available) ----------
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

  const form = e.target;
  const format = $('#image-format').value;
  const action = form.getAttribute('action'); // includes ?token=

  const data = new FormData(e.target);  // Handles FormData Submission

  // Show progress UI
  setProgress(0);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', action, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); // so server can return JSON

    // --- Fake staged progress ---
    let fakeProgress = 0;
    const interval = setInterval(() => {
      if (fakeProgress < 95) {
        fakeProgress += 5;
        setProgress(fakeProgress);
      }
    }, 500);

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        clearInterval(interval);
        setProgress(100);

        setTimeout(() => hideProgress(), 1000);

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);

            appendProcessedCard(res);
            showToast('Conversion completed successfully! Your document has been converted.', 'success');
            // reset
            form.reset();
            $('#selected-file').textContent = '';
          } catch (err) {
            showToast('Converted, but response parsing failed.', 'error');
          }
        } else if (xhr.status === 401) {
            handleAuthError();
        } else {
          const msg = xhr.responseText || 'Conversion failed.';
          showToast(msg, 'error');
        }
      }
    };

    xhr.send(data);
  } catch (err) {
    hideProgress();
    showToast('Upload error: ' + (err?.message || err), 'error');
  }

  return false;
}

// ---------- UI: Add new processed card ----------
function appendProcessedCard(payload) {
  const grid = $('#processed-grid') || (function(){
    // If no grid yet, create it under the section
    const section = document.querySelector('.processed-files-section');
    const gridEl = createEl('div', 'processed-files-grid');
    gridEl.id = 'processed-grid';
    section.appendChild(gridEl);
    // remove "No files..." text if present
    const nf = section.querySelector('.no-files-message');
    if (nf) nf.remove();
    return gridEl;
  })();

  const card = createEl('div', 'processed-file-card');
  card.dataset.fileId = payload.fileId;

  const deleteBtn = createEl('button', 'delete-btn');
  deleteBtn.title = 'Delete this file';
  deleteBtn.innerHTML = '&times;';
  card.appendChild(deleteBtn);

  const title = createEl('p', 'file-name');
  // Use the first converted image filename as the canonical full name
  const fullName = payload.images[0]?.filename || payload.filename;
  title.dataset.fullName = fullName; // Set data attribute for the updater function
  card.appendChild(title);

  // Set the truncated text and the hover title
  updateFilenameDisplay(title);

  const scroller = createEl('div', 'thumbs-scroller');
  (payload.images || []).forEach(img => {
    const a = createEl('a', 'thumb-link');
    a.href = img.previewUrl;
    a.target = '_blank';

    const container = createEl('div', 'thumb-container');
    a.appendChild(container);

    const t = createEl('img', 'thumb');
    t.src = img.previewUrl;
    t.alt = `Page ${img.page} of ${payload.filename}`;
    t.loading = 'lazy';
    container.appendChild(t);

    const pageNum = createEl('span', 'thumb-page-number');
    pageNum.textContent = `Page ${img.page}`;
    container.appendChild(pageNum);

    scroller.appendChild(a);
  });
  card.appendChild(scroller);

  const actions = createEl('div', 'card-actions');
  const dlAll = createEl('button', 'button small download-all');
  dlAll.textContent = 'Download All';
  dlAll.dataset.fileId = payload.fileId;
  dlAll.dataset.totalPages = payload.totalPages;
  dlAll.dataset.format = payload.format;
  // Store the image file data for downloads
  dlAll.dataset.images = JSON.stringify(payload.images || []);
  actions.appendChild(dlAll);
  card.appendChild(actions);

  const perPage = createEl('div', 'per-page-downloads');
  (payload.images || []).forEach(img => {
    const a = createEl('a', 'download-button');
    a.href = img.downloadUrl;
    a.textContent = 'Page ' + img.page;
    a.download = ''; // Force download
    perPage.appendChild(a);
  });
  card.appendChild(perPage);

  grid.prepend(card); // newest first
}

// ---------- Download All (improved to work with new server structure) ----------
document.addEventListener('click', function(e){
  const btn = e.target.closest('.download-all');
  if (!btn) return;
  e.preventDefault();

  const fileId = btn.dataset.fileId;
  const format = btn.dataset.format;
  const token = '';

  // Check if this is a new card with stored image data
  if (btn.dataset.images) {
    try {
      const images = JSON.parse(btn.dataset.images);
      images.forEach((img, index) => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = img.downloadUrl;
          link.download = ''; // Force download
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 200); // Staggered downloads
      });
      return;
    } catch (err) {
      console.error('Failed to parse image data:', err);
    }
  }

  // Fallback to legacy method for existing cards
  const total = parseInt(btn.dataset.totalPages || '0', 10);
  if (!fileId || !total) return;

  // Open each page in a new tab/window with small delays to avoid popup blockers
  let i = 1;
  (function loopOpen(){
    if (i > total) return;
    const url = `/tools/pdf-to-image/view-legacy/${fileId}?page=${i}&format=${format || 'png'}&token=${encodeURIComponent(token)}`;

    // Create a temporary link for download
    const link = document.createElement('a');
    link.href = url;
    link.download = ''; // Force download
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    i++;
    setTimeout(loopOpen, 200); // staggered
  })();
});

// Initial truncation of server-rendered filenames on page load
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.file-name').forEach(updateFilenameDisplay);
});

/**
 * Shows a custom confirmation modal.
 * @param {string} message The message to display in the modal.
 * @returns {Promise<boolean>} A promise that resolves to true if confirmed, false otherwise.
 */
function showConfirmationModal(message) {
    return new Promise(resolve => {
        const overlay = createEl('div', 'modal-overlay');

        const container = createEl('div', 'modal-container');
        overlay.appendChild(container);

        const content = createEl('div', 'modal-content');
        const p = createEl('p');
        p.textContent = message;
        content.appendChild(p);
        container.appendChild(content);

        const buttons = createEl('div', 'modal-buttons');
        container.appendChild(buttons);

        const confirmBtn = createEl('button', 'modal-btn confirm');
        confirmBtn.textContent = 'Confirm';
        buttons.appendChild(confirmBtn);

        const cancelBtn = createEl('button', 'modal-btn cancel');
        cancelBtn.textContent = 'Cancel';
        buttons.appendChild(cancelBtn);

        const removeModal = () => {
            overlay.classList.remove('visible');
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 300); // Match CSS transition duration
        };

        confirmBtn.addEventListener('click', () => {
            removeModal();
            resolve(true);
        });

        cancelBtn.addEventListener('click', () => {
            removeModal();
            resolve(false);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                removeModal();
                resolve(false);
            }
        });

        document.body.appendChild(overlay);
        // Trigger the transition
        setTimeout(() => {
            overlay.classList.add('visible');
        }, 10);
    });
}

// ---------- Delete Processed File ----------
document.addEventListener('click', async function(e) {
    if (!e.target.matches('.delete-btn')) return;

    const card = e.target.closest('.processed-file-card');
    const fileId = card.dataset.fileId;
    const token = localStorage.getItem('token');

    if (!fileId) {
        showToast('Could not find file ID.', 'error');
        return;
    }

    const confirmed = await showConfirmationModal('Are you sure you want to delete this file? This action cannot be undone.');
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/tools/pdf-to-image/${fileId}?token=${token}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            card.remove();
            showToast('File deleted successfully.', 'success');
        } else if (response.status === 401) {
            handleAuthError();
        } else {
            const errorText = await response.text();
            showToast(`Error: ${errorText}`, 'error');
        }
    } catch (error) {
        showToast('An error occurred while deleting the file.', 'error');
    }
});
