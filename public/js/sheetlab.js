// =====================================================================
//  sheetlab.js  —  SheetLab PDF ↔ Excel frontend
//  Handles: session checks, drag-drop, AJAX submit, progress,
//           toasts, delete modal, auth error handling
// =====================================================================

// ── Auth / Session ─────────────────────────────────────────────────────────
// Token is cleared immediately — not inside setTimeout — to avoid a race
// condition where a rapid second request could sneak through with a stale token.
function slHandleAuthError(message) {
  localStorage.removeItem("token");
  slShowToast(message || "Session expired. Redirecting to login...", "error");
  setTimeout(function () { window.location.href = "http://localhost:3000"; }, 4000);
}

// Map typed 401 responses from auth middleware to human-friendly messages
async function slHandle401(response) {
  var messages = {
    TOKEN_EXPIRED: "Session expired. Redirecting to login...",
    INVALID_TOKEN: "Invalid session. Redirecting to login...",
    NO_TOKEN:      "No session found. Redirecting to login...",
  };
  try {
    var data = await response.clone().json();
    slHandleAuthError(messages[data.type] || messages["TOKEN_EXPIRED"]);
  } catch (_) {
    slHandleAuthError(messages["TOKEN_EXPIRED"]);
  }
}

// ── Session expiry proactive check ────────────────────────────────────────

function slGetTokenExpiry(token) {
  try {
    var payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return payload.exp ? payload.exp * 1000 : null;
  } catch (_) {
    return null;
  }
}

function slIsValidJWTStructure(token) {
  return token && token.split(".").length === 3;
}

function slCheckSession() {
  var token = localStorage.getItem("token");

  // No token at all
  if (!token) {
    setTimeout(function () { slHandleAuthError("No session found. Redirecting to login..."); }, 100);
    return;
  }

  // Structurally invalid — tampered URL / localStorage
  if (!slIsValidJWTStructure(token)) {
    setTimeout(function () { slHandleAuthError("Invalid session detected. Redirecting to login..."); }, 100);
    return;
  }

  var expiresAt = slGetTokenExpiry(token);

  // Payload unreadable — treat as tampered
  if (!expiresAt) {
    setTimeout(function () { slHandleAuthError("Invalid session detected. Redirecting to login..."); }, 100);
    return;
  }

  var delay = expiresAt - Date.now();

  if (delay <= 0) {
    // Already expired — let the page render first so the toast is visible
    setTimeout(function () { slHandleAuthError("Session expired. Redirecting to login..."); }, 100);
  } else {
    // Valid — fire exactly when the token expires
    setTimeout(function () { slHandleAuthError("Session expired. Redirecting to login..."); }, delay);
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────
// Defined at module scope so slHandleAuthError (above) can call it before
// DOMContentLoaded fires.
function slShowToast(msg, type, dur) {
  type = type || "info";
  dur  = dur  || 4000;
  var c = document.getElementById("sl-toast-container");
  if (!c) return;
  var t = document.createElement("div");
  t.className   = "sl-toast " + type;
  t.textContent = msg;
  c.appendChild(t);
  // Double rAF ensures the element is in the DOM before the transition fires
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { t.classList.add("show"); });
  });
  setTimeout(function () {
    t.classList.remove("show");
    setTimeout(function () { if (c.contains(t)) t.remove(); }, 350);
  }, dur);
}

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {

  // Store token from URL then run session check
  var params   = new URLSearchParams(window.location.search);
  var urlToken = params.get("token");
  if (urlToken) localStorage.setItem("token", urlToken);

  // Run session check — handles expired, tampered, and missing tokens
  slCheckSession();

  // ── DOM refs ─────────────────────────────────────────────────────────────
  var form         = document.getElementById("sl-form");
  var opInput      = document.getElementById("sl-operation-input");
  var fileInput    = document.getElementById("sl-file-input");
  var dropzone     = document.getElementById("sl-dropzone");
  var chooseBtn    = document.getElementById("sl-choose-btn");
  var selectedTxt  = document.getElementById("sl-selected-file");
  var dzSub        = document.getElementById("sl-dz-sub");
  var dzIcon       = document.getElementById("sl-dz-icon");
  var progressWrap = document.getElementById("sl-progress-wrap");
  var progressBar  = document.getElementById("sl-progress-bar");
  var progressLbl  = document.getElementById("sl-progress-label");
  var progressTxt  = document.getElementById("sl-progress-text");
  var submitBtn    = document.getElementById("sl-submit-btn");
  var modal        = document.getElementById("sl-modal");
  var modalConfirm = document.getElementById("sl-modal-confirm");
  var modalCancel  = document.getElementById("sl-modal-cancel");

  var currentOp     = "pdfToExcel";
  var pendingDelete = null;

  // ── Operation card switch ─────────────────────────────────────────────────
  document.querySelectorAll("input[name='sl-operation']").forEach(function (radio) {
    radio.addEventListener("change", function () {
      currentOp = radio.value;
      if (opInput) opInput.value = currentOp;

      document.querySelectorAll(".sl-op-card").forEach(function (c) {
        c.classList.toggle("selected", c.dataset.op === currentOp);
      });
      document.querySelectorAll(".sl-params").forEach(function (p) {
        p.classList.toggle("active", p.dataset.op === currentOp);
      });

      var isPdfToExcel = currentOp === "pdfToExcel";
      if (fileInput) {
        fileInput.accept = isPdfToExcel
          ? "application/pdf,.pdf"
          : ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
        fileInput.value = "";
      }
      if (dzSub)  dzSub.textContent  = isPdfToExcel
        ? "or click to browse \u2022 PDF only \u2022 Max 100 MB"
        : "or click to browse \u2022 .xlsx or .xls \u2022 Max 100 MB";
      if (dzIcon) dzIcon.textContent = isPdfToExcel ? "\uD83D\uDCC4" : "\uD83D\uDCCA";
      showSelected(null);
    });
  });

  // ── Drop zone ─────────────────────────────────────────────────────────────
  if (chooseBtn) chooseBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (fileInput) fileInput.click();
  });
  if (dropzone) dropzone.addEventListener("click", function (e) {
    if (e.target !== chooseBtn && !chooseBtn.contains(e.target) && fileInput) fileInput.click();
  });
  if (fileInput) fileInput.addEventListener("change", function () {
    showSelected(fileInput.files);
  });
  if (dropzone) {
    dropzone.addEventListener("dragover", function (e) {
      e.preventDefault(); dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", function () {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", function (e) {
      e.preventDefault(); dropzone.classList.remove("dragover");
      var files = e.dataTransfer.files;
      if (!files.length) return;
      var f   = files[0];
      var ext = f.name.toLowerCase().split(".").pop();
      var isPdfToExcel = currentOp === "pdfToExcel";
      var validExts    = isPdfToExcel ? ["pdf"] : ["xlsx", "xls"];
      if (!validExts.includes(ext)) {
        slShowToast("Invalid file type. Expected: " + validExts.join(", ").toUpperCase(), "error");
        return;
      }
      var dt = new DataTransfer();
      dt.items.add(f);
      fileInput.files = dt.files;
      showSelected(fileInput.files);
    });
  }

  function showSelected(files) {
    if (!selectedTxt) return;
    if (!files || !files.length) { selectedTxt.textContent = ""; return; }
    selectedTxt.textContent = "\u2714 " + files[0].name;
  }

  // ── Progress ──────────────────────────────────────────────────────────────
  function startProgress() {
    if (progressWrap) progressWrap.style.display = "block";
    setProgress(0);
    var pct = 0;
    return setInterval(function () {
      if (pct < 85) {
        pct += Math.random() * 8;
        setProgress(Math.min(pct, 85));
      }
    }, 600);
  }
  function finishProgress(iv) {
    clearInterval(iv);
    setProgress(100);
    setTimeout(function () {
      if (progressWrap) progressWrap.style.display = "none";
      setProgress(0);
    }, 700);
  }
  function setProgress(pct) {
    pct = Math.round(pct);
    if (progressBar) progressBar.style.width  = pct + "%";
    if (progressLbl) progressLbl.textContent   = pct + "%";
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  window.slHandleSubmit = function (e) {
    e.preventDefault();
    if (!fileInput || !fileInput.files[0]) {
      slShowToast("Please select a file first.", "error"); return false;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = "Converting\u2026";

    var token = new URLSearchParams(window.location.search).get("token") || "";
    var iv    = startProgress();
    if (progressTxt) progressTxt.textContent = currentOp === "pdfToExcel"
      ? "Extracting data from PDF\u2026 Please wait."
      : "Converting spreadsheet to PDF\u2026 Please wait.";

    var formData = new FormData(form);

    fetch("/tools/sheetlab?token=" + token, {
      method:  "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      body:    formData,
    })
      .then(function (res) {
        // Handle typed 401 responses from auth middleware
        if (res.status === 401) {
          finishProgress(iv);
          submitBtn.disabled    = false;
          submitBtn.textContent = "\u26A1 Convert Now";
          return slHandle401(res);
        }
        if (!res.ok) return res.text().then(function (t) { return Promise.reject(t); });
        return res.json();
      })
      .then(function (data) {
        if (!data) return; // slHandle401 is already redirecting
        finishProgress(iv);
        slShowToast("Conversion complete! Your file is ready.", "success");
        appendFileCard(data);
        resetForm();
      })
      .catch(function (err) {
        finishProgress(iv);
        slShowToast(String(err) || "Conversion failed.", "error");
      })
      .finally(function () {
        submitBtn.disabled    = false;
        submitBtn.textContent = "\u26A1 Convert Now";
      });

    return false;
  };

  function resetForm() {
    if (form) form.reset();
    showSelected(null);
    if (fileInput) {
      fileInput.accept = "application/pdf,.pdf";
      fileInput.value  = "";
    }
    if (dzSub)  dzSub.textContent  = "or click to browse \u2022 PDF only \u2022 Max 100 MB";
    if (dzIcon) dzIcon.textContent = "\uD83D\uDCC4";
    currentOp = "pdfToExcel";
    if (opInput) opInput.value = currentOp;
    document.querySelectorAll(".sl-op-card").forEach(function (c) {
      c.classList.toggle("selected", c.dataset.op === "pdfToExcel");
    });
    document.querySelectorAll(".sl-params").forEach(function (p) {
      p.classList.toggle("active", p.dataset.op === "pdfToExcel");
    });
  }

  // ── Append result card ────────────────────────────────────────────────────
  function appendFileCard(data) {
    var noMsg = document.getElementById("sl-no-files");
    if (noMsg) noMsg.remove();

    var grid = document.getElementById("sl-files-grid");
    if (!grid) {
      grid = document.createElement("div");
      grid.id = "sl-files-grid"; grid.className = "sl-files-grid";
      var sec = document.querySelector(".sl-history-section");
      if (sec) sec.appendChild(grid);
    }

    var isExcel  = data.operation === "pdfToExcel";
    var badgeCls = isExcel ? "green" : "blue";
    var icon     = isExcel ? "\uD83D\uDCCA" : "\uD83D\uDCC4";
    var dlLabel  = isExcel ? "\u2B07 Download .xlsx" : "\u2B07 Download .pdf";
    var origSz   = fmtBytes(data.originalSize);
    var convSz   = fmtBytes(data.convertedSize);

    var card = document.createElement("div");
    card.className      = "sl-file-card";
    card.dataset.fileId = data.fileId;
    card.innerHTML =
      '<button type="button" class="sl-delete-btn" title="Delete">&times;</button>' +
      '<div class="sl-file-icon-wrap"><span class="sl-file-icon">' + icon + '</span></div>' +
      '<p class="sl-file-name" title="' + esc(data.originalName) + '">' + truncate(data.originalName, 40) + '</p>' +
      '<span class="sl-op-badge ' + badgeCls + '">' + esc(data.operationLabel || data.operation) + '</span>' +
      '<div class="sl-stats">' +
        '<div class="sl-stat-row"><span class="sl-stat-label">Original</span><span class="sl-stat-value">' + origSz + '</span></div>' +
        '<div class="sl-stat-row"><span class="sl-stat-label">Converted</span><span class="sl-stat-value">' + convSz + '</span></div>' +
      '</div>' +
      '<a href="' + data.downloadUrl + '" class="sl-btn sl-btn-download" download>' + dlLabel + '</a>';

    grid.prepend(card);

    var del = card.querySelector(".sl-delete-btn");
    if (del) del.addEventListener("click", function () { openDeleteModal(data.fileId, card); });
  }

  // ── Delete modal ──────────────────────────────────────────────────────────
  function openDeleteModal(fileId, cardEl) {
    pendingDelete = { fileId: fileId, cardEl: cardEl };
    if (modal) modal.classList.add("visible");
  }

  if (modalCancel) modalCancel.addEventListener("click", function () {
    modal.classList.remove("visible"); pendingDelete = null;
  });
  if (modal) modal.addEventListener("click", function (e) {
    if (e.target === modal) { modal.classList.remove("visible"); pendingDelete = null; }
  });

  if (modalConfirm) modalConfirm.addEventListener("click", function () {
    if (!pendingDelete) return;
    var fileId = pendingDelete.fileId, cardEl = pendingDelete.cardEl;
    var token  = new URLSearchParams(window.location.search).get("token") || "";

    fetch("/tools/sheetlab/" + fileId + "?token=" + token, {
      method:  "DELETE",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
      .then(function (res) {
        // Handle typed 401 responses from auth middleware
        if (res.status === 401) return slHandle401(res);
        if (!res.ok) return res.text().then(function (t) { return Promise.reject(t); });
        cardEl.remove();
        slShowToast("File deleted.", "success");
        var g = document.getElementById("sl-files-grid");
        if (g && !g.children.length) {
          g.remove();
          var sec = document.querySelector(".sl-history-section");
          if (sec) {
            var m = document.createElement("p");
            m.id = "sl-no-files"; m.className = "sl-no-files";
            m.innerHTML = "\uD83D\uDCC2 No conversions yet.<br/>Upload a file above to get started.";
            sec.appendChild(m);
          }
        }
      })
      .catch(function (err) { slShowToast(String(err) || "Delete failed.", "error"); })
      .finally(function () { modal.classList.remove("visible"); pendingDelete = null; });
  });

  // Wire delete buttons for server-rendered cards
  document.querySelectorAll(".sl-file-card").forEach(function (card) {
    var btn = card.querySelector(".sl-delete-btn");
    if (btn) btn.addEventListener("click", function () { openDeleteModal(card.dataset.fileId, card); });
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtBytes(b) {
    if (!b) return "0 B";
    var k = 1024, u = ["B", "KB", "MB", "GB"], i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + " " + u[i];
  }
  function truncate(s, max) {
    return s && s.length > max ? s.slice(0, max - 3) + "\u2026" : s;
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

}); // end DOMContentLoaded
