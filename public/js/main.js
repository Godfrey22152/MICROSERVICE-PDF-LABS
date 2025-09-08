// ---------- Helpers ----------
function $(sel, parent) { return (parent || document).querySelector(sel); }
function createEl(tag, cls) { const el = document.createElement(tag); if (cls) el.className = cls; return el; }

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
  const input = $('#image-files');
  const pickBtn = $('.dz-btn', dz);
  const selected = $('#selected-file');

  function setFileNames(files) {
    if (files && files.length > 0) {
      if (files.length === 1) {
        selected.textContent = `Selected: ${files[0].name} file`;
      } else {
        selected.textContent = `Selected: ${files.length} file(s)`;
      }
    } else {
      selected.textContent = '';
    }
  }

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
    const files = e.dataTransfer.files;
    const allowedTypes = ['image/jpeg', 'image/png'];
    const validFiles = Array.from(files).filter(file => allowedTypes.includes(file.type));

    if (validFiles.length > 0) {
      input.files = e.dataTransfer.files;
      setFileNames(validFiles);
    } else {
      showToast('Only JPG and PNG images are allowed.', 'error');
    }
  });

  input.addEventListener('change', () => {
    const files = input.files;
    const allowedTypes = ['image/jpeg', 'image/png'];
    const validFiles = Array.from(files).filter(file => allowedTypes.includes(file.type));

    if (validFiles.length !== files.length) {
      showToast('Only JPG and PNG images are allowed.', 'error');
      input.value = '';
      setFileNames(null);
      return;
    }
    setFileNames(validFiles);
  });
})();

// ---------- Submit (AJAX with progress; falls back to normal POST if XHR not available) ----------
async function handleSubmit(e) {
  e.preventDefault();

  const input = $('#image-files');
  if (!input.files || input.files.length === 0) {
    showToast('Please choose one or more image files.', 'error');
    return false;
  }

  const form = e.target;
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
            showToast('Conversion to PDF completed successfully!', 'success');
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
  title.textContent = payload.filename.length > 20 ? payload.filename.substring(0, 17) + '...' : payload.filename;
  title.title = payload.filename;
  card.appendChild(title);

  const actions = createEl('div', 'card-actions');
  const viewBtn = createEl('a', 'download-button');
  viewBtn.href = `/tools/image-to-pdf/view/${payload.fileId}`;
  viewBtn.target = '_blank';
  viewBtn.textContent = 'View PDF';
  actions.appendChild(viewBtn);

  const downloadBtn = createEl('a', 'download-button');
  downloadBtn.href = `/tools/image-to-pdf/download/${payload.fileId}`;
  downloadBtn.textContent = 'Download PDF';
  actions.appendChild(downloadBtn);

  card.appendChild(actions);

  grid.prepend(card); // newest first
}

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
        const response = await fetch(`/tools/image-to-pdf/${fileId}?token=${token}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            card.remove();
            showToast('File deleted successfully.', 'success');

            // Check if the grid is now empty
            const grid = $('#processed-grid');
            if (grid && grid.children.length === 0) {
                // If the grid is empty, remove it and show the 'no files' message
                const section = $('.processed-files-section');
                if (section) {
                    const message = createEl('p', 'no-files-message');
                    message.textContent = 'No PDF files have been generated yet.';
                    section.appendChild(message);
                    grid.remove();
                }
            }
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
