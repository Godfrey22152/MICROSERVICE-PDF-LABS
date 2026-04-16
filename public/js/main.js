// =====================================================================
//  main.js  —  edit-pdf-service
//  Handles: session checks, drag-drop, AJAX submit, progress,
//           toasts, delete modal, auth error handling
// =====================================================================

// ── Auth / Session ─────────────────────────────────────────────────────────
// Token is cleared immediately — not inside setTimeout — to avoid a race
// condition where a rapid second request could sneak through with a stale token.
function handleAuthError(message) {
  localStorage.removeItem("token");
  showToast(message || "Session expired. Redirecting to login...", "error");
  setTimeout(function () { window.location.href = "http://localhost:3000"; }, 4000);
}

// Map typed 401 responses from sessionCheck to human-friendly messages
async function handle401(response) {
  var messages = {
    TOKEN_EXPIRED: "Session expired. Redirecting to login...",
    INVALID_TOKEN: "Invalid session. Redirecting to login...",
    NO_TOKEN:      "No session found. Redirecting to login...",
  };
  try {
    var data = await response.clone().json();
    handleAuthError(messages[data.type] || messages["TOKEN_EXPIRED"]);
  } catch (_) {
    handleAuthError(messages["TOKEN_EXPIRED"]);
  }
}

// ── Session expiry proactive check ────────────────────────────────────────

function getTokenExpiry(token) {
  try {
    var payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return payload.exp ? payload.exp * 1000 : null;
  } catch (_) {
    return null;
  }
}

function isValidJWTStructure(token) {
  return token && token.split(".").length === 3;
}

function checkSession() {
  var token = localStorage.getItem("token");

  // No token at all
  if (!token) {
    setTimeout(function () { handleAuthError("No session found. Redirecting to login..."); }, 100);
    return;
  }

  // Structurally invalid — tampered URL / localStorage
  if (!isValidJWTStructure(token)) {
    setTimeout(function () { handleAuthError("Invalid session detected. Redirecting to login..."); }, 100);
    return;
  }

  var expiresAt = getTokenExpiry(token);

  // Payload unreadable — treat as tampered
  if (!expiresAt) {
    setTimeout(function () { handleAuthError("Invalid session detected. Redirecting to login..."); }, 100);
    return;
  }

  var delay = expiresAt - Date.now();

  if (delay <= 0) {
    // Already expired — let the page render first so the toast is visible
    setTimeout(function () { handleAuthError("Session expired. Redirecting to login..."); }, 100);
  } else {
    // Valid — fire exactly when the token expires
    setTimeout(function () { handleAuthError("Session expired. Redirecting to login..."); }, delay);
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────
// Defined at module scope so handleAuthError (above) can call it before
// DOMContentLoaded fires.
function showToast(msg, type, dur) {
  type = type || "info";
  dur  = dur  || 4000;
  var c = document.getElementById("toast-container");
  if (!c) return;
  var t = document.createElement("div");
  t.className   = "toast " + type;
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
  checkSession();

  // ── DOM refs ────────────────────────────────────────────────────────────
  var dropzone         = document.getElementById("dropzone");
  var fileInput        = document.getElementById("pdf-files");
  var dzBtn            = document.querySelector(".dz-btn");
  var dzSub            = document.getElementById("dz-sub");
  var selectedFileTxt  = document.getElementById("selected-file");
  var progressMsg      = document.getElementById("progress-message");
  var progressCont     = document.getElementById("progress-container");
  var progressBar      = document.getElementById("progress-bar");
  var progressLabel    = document.getElementById("progress-label");
  var opInput          = document.getElementById("operation-input");
  var fileOrderInput   = document.getElementById("file-order-input");
  var deleteRangeInput = document.getElementById("deleteRange-input");
  var mergeOrderList   = document.getElementById("merge-order-list");
  var modal            = document.getElementById("confirm-modal");
  var btnConfirm       = document.getElementById("modal-confirm");
  var btnCancel        = document.getElementById("modal-cancel");
  var pendingDelete    = null;

  var currentOp      = "rotate";
  var mergeFileOrder = [];

  // ── Password toggle ──────────────────────────────────────────────────────
  document.querySelectorAll(".toggle-pw").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var inp = document.getElementById(btn.dataset.target);
      if (!inp) return;
      inp.type        = inp.type === "password" ? "text" : "password";
      btn.textContent = inp.type === "password" ? "\uD83D\uDC41" : "\uD83D\uDE48";
    });
  });

  // ── Operation card switch ────────────────────────────────────────────────
  document.querySelectorAll("input[name='operation']").forEach(function (radio) {
    radio.addEventListener("change", function () {
      currentOp = radio.value;

      document.querySelectorAll(".op-card").forEach(function (c) {
        c.classList.toggle("selected", c.dataset.op === currentOp);
      });
      if (opInput) opInput.value = currentOp;

      document.querySelectorAll(".op-params").forEach(function (panel) {
        panel.classList.toggle("active", panel.dataset.op === currentOp);
      });

      var isMulti = currentOp === "merge";
      if (fileInput) {
        if (isMulti) { fileInput.setAttribute("multiple", "multiple"); }
        else          { fileInput.removeAttribute("multiple"); }
        fileInput.value = "";
      }
      if (dzSub) {
        dzSub.textContent = isMulti
          ? "Select 2 or more PDF files \u2022 PDF only \u2022 Max 100 MB per file"
          : "or click to browse \u2022 PDF only \u2022 Max 100 MB per file";
      }
      if (dzBtn) dzBtn.textContent = isMulti ? "Choose Files" : "Choose File";
      showSelected(null);
      mergeFiles = [];
      mergeFileOrder = [];
      if (mergeOrderList)   { mergeOrderList.style.display = "none"; }
      if (mergeSortable)    { mergeSortable.innerHTML = ""; }
      if (mergeFileCounter) { mergeFileCounter.style.display = "none"; }
      if (mergeMinWarning)  { mergeMinWarning.style.display = "none"; }
      if (mergeNameRow)     { mergeNameRow.style.display = "none"; var ni = document.getElementById("mergedName"); if (ni) ni.value = ""; }
    });
  });

  // ── Split mode tabs ──────────────────────────────────────────────────────
  var splitModeInput = document.getElementById("splitMode");

  document.querySelectorAll(".split-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".split-tab").forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      if (splitModeInput) splitModeInput.value = tab.dataset.mode;
      document.querySelectorAll(".split-panel").forEach(function (panel) {
        panel.classList.toggle("active", panel.dataset.panel === tab.dataset.mode);
      });
      syncDeleteRange();
    });
  });

  // ── Sync deleteFrom + deleteTo → hidden deleteRange field ───────────────
  function syncDeleteRange() {
    var fromEl = document.getElementById("deleteFrom");
    var toEl   = document.getElementById("deleteTo");
    if (!fromEl || !toEl || !deleteRangeInput) return;
    var from = Math.max(1, parseInt(fromEl.value) || 1);
    var to   = Math.max(from, parseInt(toEl.value) || from);
    deleteRangeInput.value = from === to ? String(from) : from + "-" + to;
  }
  ["deleteFrom", "deleteTo"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", syncDeleteRange);
  });
  syncDeleteRange();

  // ── Helpers ──────────────────────────────────────────────────────────────
  function truncate(s, max) {
    max = max || 48;
    return s.length > max ? s.slice(0, max - 3) + "\u2026" : s;
  }
  function showSelected(files) {
    if (!selectedFileTxt) return;
    if (!files || files.length === 0) { selectedFileTxt.textContent = ""; return; }
    selectedFileTxt.innerHTML = files.length === 1
      ? "\u2714 " + truncate(files[0].name)
      : "\u2714 <strong>" + files.length + " files selected</strong>";
  }
  function fmtBytes(b) {
    if (!b) return "0 B";
    var k = 1024, u = ["B", "KB", "MB", "GB"], i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + " " + u[i];
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Merge: master file list ──────────────────────────────────────────────
  var mergeFiles       = [];
  var mergeNameRow     = document.getElementById("merge-name-row");
  var mergeFileCounter = document.getElementById("merge-file-counter");
  var mergeFileCountText = document.getElementById("merge-file-count-text");
  var mergeClearBtn    = document.getElementById("merge-clear-btn");
  var mergeMinWarning  = document.getElementById("merge-min-warning");
  var mergeSortable    = document.getElementById("merge-sortable");

  function addMergeFiles(newFiles) {
    Array.from(newFiles).forEach(function (f) {
      var dup = mergeFiles.some(function (x) { return x.name === f.name && x.size === f.size; });
      if (!dup) mergeFiles.push(f);
    });
    renderMergeUI();
  }

  function removeMergeFile(idx) {
    mergeFiles.splice(idx, 1);
    renderMergeUI();
    syncMergeInputToFiles();
  }

  function clearMergeFiles() {
    mergeFiles = [];
    if (fileInput) fileInput.value = "";
    renderMergeUI();
    syncMergeInputToFiles();
  }

  function syncMergeInputToFiles() {
    if (!fileInput) return;
    var dt = new DataTransfer();
    mergeFileOrder.forEach(function (origIdx) {
      if (mergeFiles[origIdx]) dt.items.add(mergeFiles[origIdx]);
    });
    try { fileInput.files = dt.files; } catch (e) {}
  }

  function renderMergeUI() {
    var count = mergeFiles.length;

    if (mergeFileCounter) {
      mergeFileCounter.style.display = count > 0 ? "flex" : "none";
    }
    if (mergeFileCountText) {
      mergeFileCountText.textContent = count === 1
        ? "1 file selected \u2014 add 1 more to merge"
        : count + " files selected";
    }
    if (mergeMinWarning) {
      mergeMinWarning.style.display = count === 1 ? "inline" : "none";
    }
    if (dzSub) {
      dzSub.textContent = count === 0
        ? "Drop PDFs here or click \u2014 select 2 or more \u2022 PDF only \u2022 Max 100 MB"
        : "Drop more PDFs here to add them to the list";
    }

    if (!mergeOrderList) return;
    if (count < 2) {
      mergeOrderList.style.display = "none";
      if (mergeNameRow) mergeNameRow.style.display = "none";
      mergeFileOrder = count === 1 ? [0] : [];
      return;
    }

    mergeOrderList.style.display = "block";
    if (mergeNameRow) mergeNameRow.style.display = "block";

    if (!mergeSortable) return;
    mergeSortable.innerHTML = "";
    mergeFileOrder = Array.from({ length: count }, function (_, i) { return i; });

    mergeFiles.forEach(function (f, i) {
      var li = document.createElement("li");
      li.className     = "merge-item";
      li.draggable     = true;
      li.dataset.index = String(i);
      li.innerHTML =
        '<span class="drag-handle" title="Drag to reorder">&#x2630;</span>' +
        '<span class="merge-item-num-badge">' + (i + 1) + '</span>' +
        '<span class="merge-item-file-icon">&#x1F4C4;</span>' +
        '<span class="merge-item-info">' +
          '<span class="merge-item-name" title="' + esc(f.name) + '">' + truncate(f.name, 34) + '</span>' +
          '<span class="merge-item-size">' + fmtBytes(f.size) + '</span>' +
        '</span>' +
        '<span class="merge-item-arrows">' +
          '<button type="button" class="merge-arrow up" data-dir="up" title="Move up">&#x25B2;</button>' +
          '<button type="button" class="merge-arrow down" data-dir="down" title="Move down">&#x25BC;</button>' +
        '</span>' +
        '<button type="button" class="merge-item-remove" data-i="' + i + '" title="Remove">&times;</button>';
      mergeSortable.appendChild(li);
    });

    mergeSortable.querySelectorAll(".merge-arrow").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var li  = btn.closest("li");
        var idx = Array.from(mergeSortable.children).indexOf(li);
        var dir = btn.dataset.dir;
        if (dir === "up"   && idx > 0)                                    mergeSortable.insertBefore(li, mergeSortable.children[idx - 1]);
        if (dir === "down" && idx < mergeSortable.children.length - 1)    mergeSortable.insertBefore(mergeSortable.children[idx + 1], li);
        recomputeMergeOrder();
      });
    });

    mergeSortable.querySelectorAll(".merge-item-remove").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        removeMergeFile(parseInt(btn.dataset.i));
      });
    });

    var dragged = null;
    mergeSortable.addEventListener("dragstart", function (e) {
      dragged = e.target.closest("li");
      if (dragged) { setTimeout(function () { dragged.classList.add("dragging"); }, 0); e.dataTransfer.effectAllowed = "move"; }
    });
    mergeSortable.addEventListener("dragend", function () {
      if (dragged) { dragged.classList.remove("dragging"); dragged = null; }
    });
    mergeSortable.addEventListener("dragover", function (e) {
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      var target = e.target.closest("li");
      if (target && target !== dragged) {
        var rect  = target.getBoundingClientRect();
        var after = e.clientY > rect.top + rect.height / 2;
        mergeSortable.insertBefore(dragged, after ? target.nextSibling : target);
        recomputeMergeOrder();
      }
    });

    syncMergeInputToFiles();
  }

  function recomputeMergeOrder(ul) {
    mergeFileOrder = [];
    var list = ul || mergeSortable;
    if (!list) return;
    list.querySelectorAll("li").forEach(function (li, idx) {
      mergeFileOrder.push(parseInt(li.dataset.index));
      var badge = li.querySelector(".merge-item-num-badge");
      if (badge) badge.textContent = idx + 1;
    });
    if (fileOrderInput) fileOrderInput.value = JSON.stringify(mergeFileOrder);
    syncMergeInputToFiles();
  }

  if (mergeClearBtn) mergeClearBtn.addEventListener("click", clearMergeFiles);

  // ── Drop zone ────────────────────────────────────────────────────────────
  if (dzBtn) dzBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (fileInput) fileInput.click();
  });
  if (dropzone) dropzone.addEventListener("click", function (e) {
    if (e.target !== dzBtn && !dzBtn.contains(e.target) && fileInput) fileInput.click();
  });
  if (fileInput) fileInput.addEventListener("change", function () {
    if (currentOp === "merge") {
      addMergeFiles(fileInput.files);
      fileInput.value = "";
    } else {
      showSelected(fileInput.files);
    }
  });
  if (dropzone) {
    dropzone.addEventListener("dragover",  function (e) { e.preventDefault(); dropzone.classList.add("dragover"); });
    dropzone.addEventListener("dragleave", function ()  { dropzone.classList.remove("dragover"); });
    dropzone.addEventListener("drop", function (e) {
      e.preventDefault(); dropzone.classList.remove("dragover");
      if (!fileInput) return;
      var files = e.dataTransfer.files;
      for (var i = 0; i < files.length; i++) {
        if (!files[i].name.toLowerCase().endsWith(".pdf")) {
          showToast("Only PDF files accepted.", "error"); return;
        }
      }
      if (currentOp === "merge") { addMergeFiles(files); }
      else {
        var dt = new DataTransfer();
        dt.items.add(files[0]);
        fileInput.files = dt.files;
        showSelected(fileInput.files);
      }
    });
  }

  // ── Progress ─────────────────────────────────────────────────────────────
  function setProgress(pct, lbl) {
    if (progressBar)   progressBar.style.width   = pct + "%";
    if (progressLabel) progressLabel.textContent  = lbl || pct + "%";
  }
  function startProgress() {
    if (progressMsg)  progressMsg.style.display  = "block";
    if (progressCont) progressCont.style.display = "block";
    setProgress(0);
    var pct = 0;
    return setInterval(function () {
      if (pct < 85) { pct += Math.random() * 7; setProgress(Math.min(pct, 85), Math.min(Math.round(pct), 85) + "%"); }
    }, 600);
  }
  function finishProgress(iv) {
    clearInterval(iv);
    setProgress(100, "100%");
    setTimeout(function () {
      if (progressMsg)  progressMsg.style.display  = "none";
      if (progressCont) progressCont.style.display = "none";
      setProgress(0);
    }, 800);
  }

  // ── Form submit ──────────────────────────────────────────────────────────
  window.handleSubmit = function (e) {
    e.preventDefault();

    if (currentOp === "merge") {
      if (mergeFiles.length < 2) {
        showToast("Please select at least 2 PDF files to merge.", "error");
        if (mergeMinWarning) mergeMinWarning.style.display = "inline";
        return false;
      }
      syncMergeInputToFiles();
      if (fileOrderInput) fileOrderInput.value = JSON.stringify(mergeFileOrder);
    } else {
      if (!fileInput || !fileInput.files[0]) {
        showToast("Please select a PDF file first.", "error"); return false;
      }
    }

    if (currentOp === "protect" || currentOp === "unlock") {
      var pwId = currentOp === "protect" ? "protectPassword" : "unlockPassword";
      var pw   = document.getElementById(pwId);
      if (!pw || !pw.value.trim()) { showToast("Please enter a password.", "error"); return false; }
    }

    var form      = document.getElementById("edit-pdf-form");
    var token     = new URLSearchParams(window.location.search).get("token") || "";
    var submitBtn = form.querySelector("button[type='submit']");
    submitBtn.disabled    = true;
    submitBtn.textContent = "Processing\u2026";

    syncDeleteRange();

    var iv       = startProgress();
    var formData = new FormData(form);

    fetch("/tools/edit-pdf?token=" + token, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      body: formData,
    })
      .then(function (res) {
        // Handle typed 401 responses from sessionCheck
        if (res.status === 401) {
          finishProgress(iv);
          submitBtn.disabled    = false;
          submitBtn.textContent = "\u270F\uFE0F\u00A0 Apply Edit";
          return handle401(res);
        }
        if (!res.ok) return res.text().then(function (t) { return Promise.reject(t); });
        return res.json();
      })
      .then(function (data) {
        if (!data) return; // handle401 is already redirecting
        finishProgress(iv);
        showToast("Done! Your edited PDF is ready.", "success");
        appendFileCard(data);
        form.reset();
        showSelected(null);
        // Full merge state reset
        mergeFiles = [];
        mergeFileOrder = [];
        if (mergeOrderList)   { mergeOrderList.style.display = "none"; }
        if (mergeSortable)    { mergeSortable.innerHTML = ""; }
        if (mergeFileCounter) { mergeFileCounter.style.display = "none"; }
        if (mergeMinWarning)  { mergeMinWarning.style.display = "none"; }
        if (mergeNameRow)     { mergeNameRow.style.display = "none"; var ni = document.getElementById("mergedName"); if (ni) ni.value = ""; }
        // Reset to rotate
        document.querySelectorAll(".op-card").forEach(function (c) { c.classList.remove("selected"); });
        var first = document.querySelector(".op-card"); if (first) first.classList.add("selected");
        document.querySelectorAll(".op-params").forEach(function (p) { p.classList.remove("active"); });
        var fp = document.querySelector(".op-params"); if (fp) fp.classList.add("active");
        if (opInput) opInput.value = "rotate";
        currentOp = "rotate";
        if (fileInput) fileInput.removeAttribute("multiple");
        if (dzBtn) dzBtn.textContent = "Choose File";
        if (dzSub) dzSub.textContent = "or click to browse \u2022 PDF only \u2022 Max 100 MB per file";
        submitBtn.disabled    = false;
        submitBtn.textContent = "\u270F\uFE0F\u00A0 Apply Edit";
      })
      .catch(function (err) {
        finishProgress(iv);
        showToast(String(err) || "Operation failed.", "error");
        submitBtn.disabled    = false;
        submitBtn.textContent = "\u270F\uFE0F\u00A0 Apply Edit";
      });

    return false;
  };

  // ── Append result card ───────────────────────────────────────────────────
  function appendFileCard(data) {
    var noMsg = document.querySelector(".no-files-message");
    if (noMsg) noMsg.remove();

    var grid = document.getElementById("processed-grid");
    if (!grid) {
      grid = document.createElement("div");
      grid.id = "processed-grid"; grid.className = "processed-files-grid";
      var sec = document.querySelector(".processed-files-section");
      if (sec) sec.appendChild(grid);
    }

    var card = document.createElement("div");
    card.className      = "processed-file-card" + (data.isSplit ? " split-card" : "");
    card.dataset.fileId = data.fileId;

    var dlHtml = "";
    if (data.isSplit && data.splitPages && data.splitPages.length > 0) {
      var count      = data.splitPages.length;
      var partsLabel =
        '<p class="split-parts-label">&#x1F4C4; <strong>' + count + '</strong> ' +
        (count === 1 ? "part" : "parts") + " \u2014 download individually:</p>";
      var items = data.splitPages.map(function (pg) {
        return '<div class="split-page-item">' +
          '<span class="split-page-icon">&#x1F4C4;</span>' +
          '<span class="split-page-label">Part ' + pg.index + '</span>' +
          '<span class="split-page-size">' + fmtBytes(pg.size) + '</span>' +
          '<a href="' + pg.downloadUrl + '" class="split-page-btn" download>\u2B07 Download</a>' +
          '</div>';
      }).join("");
      var urlsJson = JSON.stringify(data.splitPages.map(function (p) { return p.downloadUrl; }));
      dlHtml =
        partsLabel +
        '<div class="split-pages-row">' + items + "</div>" +
        '<button type="button" class="download-button download-all-btn" data-parts=\'' +
        urlsJson.replace(/'/g, "&#39;") + '\'>\uD83D\uDCE5 Download All Parts</button>';
    } else {
      dlHtml = '<a href="' + data.downloadUrl + '" class="download-button" download>\u2B07 Download PDF</a>';
    }

    card.innerHTML =
      '<button type="button" class="delete-btn" title="Delete">&times;</button>' +
      '<span class="file-icon">&#x1F4DD;</span>' +
      '<p class="file-name" title="' + esc(data.originalName) + '">' + truncate(data.originalName) + '</p>' +
      '<span class="op-badge">' + esc(data.operationLabel || data.operation) + '</span>' +
      '<div class="stats-block">' +
        '<div class="stats-row"><span class="stats-label">Original</span><span class="stats-value">' + fmtBytes(data.originalSize) + '</span></div>' +
        '<div class="stats-row"><span class="stats-label">Result</span><span class="stats-value">' + fmtBytes(data.editedSize) + '</span></div>' +
      '</div>' + dlHtml;

    grid.prepend(card);

    var del = card.querySelector(".delete-btn");
    if (del) del.addEventListener("click", function () { openDeleteModal(data.fileId, card); });
    var dlAll = card.querySelector(".download-all-btn");
    if (dlAll) wireDownloadAll(dlAll);
  }

  // ── Download All Parts ───────────────────────────────────────────────────
  function wireDownloadAll(btn) {
    btn.addEventListener("click", function () {
      var urls;
      try { urls = JSON.parse(btn.dataset.parts); } catch (_) { return; }
      if (!urls || !urls.length) return;
      showToast("Downloading " + urls.length + " files\u2026", "info", 3500);
      urls.forEach(function (url, i) {
        setTimeout(function () {
          var a = document.createElement("a");
          a.href = url; a.download = ""; a.style.display = "none";
          document.body.appendChild(a); a.click();
          setTimeout(function () { document.body.removeChild(a); }, 500);
        }, i * 700);
      });
    });
  }
  document.querySelectorAll(".download-all-btn[data-parts]").forEach(wireDownloadAll);

  // ── Delete modal ─────────────────────────────────────────────────────────
  function openDeleteModal(fileId, cardEl) {
    pendingDelete = { fileId: fileId, cardEl: cardEl };
    if (modal) modal.classList.add("visible");
  }

  if (btnCancel) btnCancel.addEventListener("click", function () {
    modal.classList.remove("visible"); pendingDelete = null;
  });
  if (modal) modal.addEventListener("click", function (e) {
    if (e.target === modal) { modal.classList.remove("visible"); pendingDelete = null; }
  });

  if (btnConfirm) btnConfirm.addEventListener("click", function () {
    if (!pendingDelete) return;
    var fileId = pendingDelete.fileId, cardEl = pendingDelete.cardEl;
    var token  = new URLSearchParams(window.location.search).get("token") || "";

    fetch("/tools/edit-pdf/" + fileId + "?token=" + token, {
      method: "DELETE",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
      .then(function (res) {
        // Handle typed 401 responses from sessionCheck
        if (res.status === 401) return handle401(res);
        if (!res.ok) return res.text().then(function (t) { return Promise.reject(t); });
        cardEl.remove();
        showToast("File deleted.", "success");
        var g = document.getElementById("processed-grid");
        if (g && !g.children.length) {
          g.remove();
          var s = document.querySelector(".processed-files-section");
          if (s) {
            var m = document.createElement("p");
            m.className = "no-files-message";
            m.innerHTML = "&#x1F4C4; No edited files yet.<br/>Upload a PDF above to get started.";
            s.appendChild(m);
          }
        }
      })
      .catch(function (e) { showToast(String(e) || "Delete failed.", "error"); })
      .finally(function () { modal.classList.remove("visible"); pendingDelete = null; });
  });

  document.querySelectorAll(".processed-file-card").forEach(function (card) {
    var btn = card.querySelector(".delete-btn");
    if (btn) btn.addEventListener("click", function () { openDeleteModal(card.dataset.fileId, card); });
  });

}); // end DOMContentLoaded
