// =====================================================================
//  eventlisteners.js  —  edit-pdf-service
//  Navigation to other PDF Labs services
// =====================================================================
document.addEventListener("DOMContentLoaded", function () {

  // Read token from URL (set by the server on page load) — fall back to
  // localStorage so the guard works even after a soft navigation.
  var token =
    new URLSearchParams(window.location.search).get("token") ||
    localStorage.getItem("token") ||
    "";

  // Map of button ID → base URL (token appended at click time so it is
  // always fresh from localStorage in case it was refreshed).
  var nav = {
    toolsBtn:           "http://localhost:5000/tools?token=",
    profileBtn:         "http://localhost:4000/profile?token=",
    logoutBtn:          "http://localhost:4500/logout?token=",
    switchToPdfToWord:  "http://localhost:5500/tools/pdf-to-word?token=",
    switchToWordToPdf:  "http://localhost:5700/tools/word-to-pdf?token=",
    switchToCompressor: "http://localhost:5300/tools/pdf-compressor?token=",
    switchToPdfToImage: "http://localhost:5100/tools/pdf-to-image?token=",
    switchToImageToPdf: "http://localhost:5200/tools/image-to-pdf?token=",
    switchToPdfToAudio: "http://localhost:5400/tools/pdf-to-audio?token=",
  };

  Object.keys(nav).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", function () {
      // Re-read from localStorage at click time so the value is always current
      var currentToken = localStorage.getItem("token") || token;
      if (currentToken) {
        window.location.href = nav[id] + currentToken;
      } else {
        window.location.href = "http://localhost:3000";
      }
    });
  });

});
