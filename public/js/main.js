// =====================================================================
//  main.js  —  word-to-pdf-service
//  Handles: session checks, drag-drop upload, AJAX submission,
//           progress bar, toasts, delete modal, auth error handling
// =====================================================================

// ── Auth / Session ────────────────────────────────────────────────────────

// Token is cleared immediately — not inside setTimeout — to avoid a race
// condition where a rapid second request could sneak through with a stale token.
function handleAuthError(message) {
  localStorage.removeItem("token");
  showToast(message || "Session expired. Redirecting to login...", "error");
  setTimeout(() => { window.location.href = "http://localhost:3000"; }, 4000);
}

// Map typed 401 responses from sessionCheck to human-friendly messages
async function handle401(response) {
  const messages = {
    TOKEN_EXPIRED: "Session expired. Redirecting to login...",
    INVALID_TOKEN: "Invalid session. Redirecting to login...",
    NO_TOKEN:      "No session found. Redirecting to login...",
  };
  try {
    const data = await response.clone().json();
    handleAuthError(messages[data.type] || messages["TOKEN_EXPIRED"]);
  } catch {
    handleAuthError(messages["TOKEN_EXPIRED"]);
  }
}

// ── Session expiry proactive check ────────────────────────────────────────

function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isValidJWTStructure(token) {
  return token && token.split(".").length === 3;
}

function checkSession() {
  const token = localStorage.getItem("token");

  // No token at all
  if (!token) {
    setTimeout(() => handleAuthError("No session found. Redirecting to login..."), 100);
    return;
  }

  // Structurally invalid — tampered URL / localStorage
  if (!isValidJWTStructure(token)) {
    setTimeout(() => handleAuthError("Invalid session detected. Redirecting to login..."), 100);
    return;
  }

  const expiresAt = getTokenExpiry(token);

  // Payload unreadable — treat as tampered
  if (!expiresAt) {
    setTimeout(() => handleAuthError("Invalid session detected. Redirecting to login..."), 100);
    return;
  }

  const delay = expiresAt - Date.now();

  if (delay <= 0) {
    // Already expired — let the page render first so the toast is visible
    setTimeout(() => handleAuthError("Session expired. Redirecting to login..."), 100);
  } else {
    // Valid — fire exactly when the token expires
    setTimeout(() => handleAuthError("Session expired. Redirecting to login..."), delay);
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────

function showToast(message, type, duration) {
  type     = type     || "info";
  duration = duration || 4000;
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className   = "toast " + type;
  toast.textContent = message;
  container.appendChild(toast);
  // Double rAF ensures the element is in the DOM before the transition fires
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("show"));
  });
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => { if (container.contains(toast)) toast.remove(); }, 350);
  }, duration);
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {

  // ── Boot: store token from URL then run session check ───────────────────
  const params   = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (urlToken) localStorage.setItem("token", urlToken);

  // Run session check — handles expired, tampered, and missing tokens
  checkSession();

  // ── Element refs ─────────────────────────────────────────────────────────

  const dropzone      = document.getElementById("dropzone");
  const fileInput     = document.getElementById("word-file");
  const dzBtn         = document.querySelector(".dz-btn");
  const selectedFile  = document.getElementById("selected-file");
  const progressMsg   = document.getElementById("progress-message");
  const progressCont  = document.getElementById("progress-container");
  const progressBar   = document.getElementById("progress-bar");
  const progressLabel = document.getElementById("progress-label");
  const modal         = document.getElementById("confirm-modal");
  const btnConfirm    = document.getElementById("modal-confirm");
  const btnCancel     = document.getElementById("modal-cancel");
  let   pendingDelete = null;

  const ACCEPTED_EXT = [".docx", ".doc", ".odt", ".rtf", ".pptx", ".ppt"];

  // ── File selection helpers ────────────────────────────────────────────────

  function getFileExt(name) { return name.slice(name.lastIndexOf(".")).toLowerCase(); }
  function isAccepted(name) { return ACCEPTED_EXT.includes(getFileExt(name)); }
  function truncate(name, max) {
    max = max || 48;
    return name.length > max ? name.slice(0, max - 3) + "…" : name;
  }
  function showSelectedFile(name) {
    if (selectedFile) selectedFile.textContent = "✔ " + truncate(name);
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  if (dzBtn)    dzBtn.addEventListener("click", () => fileInput.click());
  if (dropzone) dropzone.addEventListener("click", (e) => { if (e.target !== dzBtn) fileInput.click(); });
  if (fileInput) fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) showSelectedFile(fileInput.files[0].name);
  });

  if (dropzone) {
    dropzone.addEventListener("dragover",  (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
    dropzone.addEventListener("dragleave", ()  => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!isAccepted(file.name)) {
        showToast("Only DOCX, DOC, ODT, RTF, PPTX, PPT files are accepted.", "error");
        return;
      }
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      showSelectedFile(file.name);
    });
  }

  // ── Progress bar ──────────────────────────────────────────────────────────

  function setProgress(pct, label) {
    if (progressBar)   progressBar.style.width   = pct + "%";
    if (progressLabel) progressLabel.textContent  = label || pct + "%";
  }

  function startProgress() {
    if (progressMsg)  progressMsg.style.display  = "block";
    if (progressCont) progressCont.style.display = "block";
    setProgress(0);
    let pct = 0;
    const interval = setInterval(() => {
      if (pct < 85) {
        pct += Math.random() * 8;
        setProgress(Math.min(pct, 85), Math.min(Math.round(pct), 85) + "%");
      }
    }, 600);
    return interval;
  }

  function finishProgress(interval) {
    clearInterval(interval);
    setProgress(100, "100%");
    setTimeout(() => {
      if (progressMsg)  progressMsg.style.display  = "none";
      if (progressCont) progressCont.style.display = "none";
      setProgress(0);
    }, 800);
  }

  // ── Form submission ───────────────────────────────────────────────────────
  // Exposed on window so EJS onsubmit="return handleSubmit(event)" can reach it

  window.handleSubmit = function (e) {
    e.preventDefault();

    if (!fileInput.files[0]) {
      showToast("Please select a file first.", "error");
      return false;
    }
    if (!isAccepted(fileInput.files[0].name)) {
      showToast("Unsupported format. Use DOCX, DOC, ODT, RTF, PPTX or PPT.", "error");
      return false;
    }

    const form      = document.getElementById("word-to-pdf-form");
    const formData  = new FormData(form);
    const token     = new URLSearchParams(window.location.search).get("token") || "";
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled    = true;
    submitBtn.textContent = "Converting…";

    const interval = startProgress();

    fetch("/tools/word-to-pdf?token=" + token, {
      method:  "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      body:    formData,
    })
      .then((res) => {
        // Handle typed 401 responses from sessionCheck
        if (res.status === 401) {
          finishProgress(interval);
          submitBtn.disabled    = false;
          submitBtn.textContent = "📤 Convert to PDF";
          return handle401(res);
        }
        if (!res.ok) return res.text().then((t) => Promise.reject(t));
        return res.json();
      })
      .then((data) => {
        if (!data) return; // handle401 already redirecting
        finishProgress(interval);
        showToast("Conversion successful! Your PDF is ready.", "success");
        appendFileCard(data);
        form.reset();
        if (selectedFile) selectedFile.textContent = "";
        submitBtn.disabled    = false;
        submitBtn.textContent = "📤 Convert to PDF";
      })
      .catch((err) => {
        finishProgress(interval);
        showToast(err || "Conversion failed. Please try again.", "error");
        submitBtn.disabled    = false;
        submitBtn.textContent = "📤 Convert to PDF";
      });

    return false;
  };

  // ── Append new card ───────────────────────────────────────────────────────

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024, s = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + s[i];
  }

  function appendFileCard(data) {
    const noMsg = document.querySelector(".no-files-message");
    if (noMsg) noMsg.remove();

    let gridEl = document.getElementById("processed-grid");
    if (!gridEl) {
      gridEl    = document.createElement("div");
      gridEl.id = "processed-grid";
      gridEl.className = "processed-files-grid";
      document.querySelector(".processed-files-section").appendChild(gridEl);
    }

    const fmt  = (data.inputFormat || "docx").toUpperCase();
    const card = document.createElement("div");
    card.className      = "processed-file-card";
    card.dataset.fileId = data.fileId;
    card.innerHTML = `
      <button class="delete-btn" title="Delete this file">&times;</button>
      <span class="file-icon">📕</span>
      <p class="file-name" title="${data.originalName}">${truncate(data.originalName)}</p>
      <span class="format-badge">${fmt} → PDF</span>
      <div class="stats-block">
        <div class="stats-row"><span class="stats-label">Original</span><span class="stats-value">${formatBytes(data.originalSize)}</span></div>
        <div class="stats-row"><span class="stats-label">PDF size</span><span class="stats-value">${formatBytes(data.convertedSize)}</span></div>
        <div class="stats-row"><span class="stats-label">Format</span><span class="stats-value">${fmt}</span></div>
      </div>
      <a href="${data.downloadUrl}" class="download-button" download>Download PDF</a>
    `;
    gridEl.prepend(card);
    card.querySelector(".delete-btn").addEventListener("click", () => openDeleteModal(data.fileId, card));
  }

  // ── Delete modal ──────────────────────────────────────────────────────────

  function openDeleteModal(fileId, cardEl) {
    pendingDelete = { fileId, cardEl };
    if (modal) modal.classList.add("visible");
  }

  if (btnCancel) {
    btnCancel.addEventListener("click", () => {
      modal.classList.remove("visible");
      pendingDelete = null;
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("visible");
        pendingDelete = null;
      }
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener("click", () => {
      if (!pendingDelete) return;
      const { fileId, cardEl } = pendingDelete;
      const token = new URLSearchParams(window.location.search).get("token") || "";

      fetch("/tools/word-to-pdf/" + fileId + "?token=" + token, {
        method:  "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      })
        .then((res) => {
          // Handle typed 401 responses from sessionCheck
          if (res.status === 401) return handle401(res);
          if (!res.ok) return res.text().then((t) => Promise.reject(t));

          cardEl.remove();
          showToast("File deleted successfully.", "success");

          const grid = document.getElementById("processed-grid");
          if (grid && grid.children.length === 0) {
            grid.remove();
            const sec = document.querySelector(".processed-files-section");
            const msg = document.createElement("p");
            msg.className = "no-files-message";
            msg.innerHTML = "📄 No converted files yet.<br/>Upload a document above to get started.";
            sec.appendChild(msg);
          }
        })
        .catch((err) => showToast(err || "Failed to delete file.", "error"))
        .finally(() => {
          modal.classList.remove("visible");
          pendingDelete = null;
        });
    });
  }

  // Attach delete listeners to server-rendered cards (on page load)
  document.querySelectorAll(".processed-file-card").forEach((card) => {
    const btn = card.querySelector(".delete-btn");
    if (btn) btn.addEventListener("click", () => openDeleteModal(card.dataset.fileId, card));
  });

}); // end DOMContentLoaded
