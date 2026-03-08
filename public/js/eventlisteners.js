// =====================================================================
//  eventlisteners.js  —  edit-pdf-service
//  Navigation to other PDF Labs services
// =====================================================================

document.addEventListener("DOMContentLoaded", function () {
  var token = new URLSearchParams(window.location.search).get("token") || "";

  var nav = {
    toolsBtn:             "http://localhost:5000/tools?token=",
    profileBtn:           "http://localhost:4000/profile?token=",
    logoutBtn:            "http://localhost:4500/logout?token=",
    switchToPdfToWord:    "http://localhost:5500/tools/pdf-to-word?token=",
    switchToWordToPdf:    "http://localhost:5700/tools/word-to-pdf?token=",
    switchToCompressor:   "http://localhost:5300/tools/pdf-compressor?token=",
    switchToPdfToImage:   "http://localhost:5100/tools/pdf-to-image?token=",
    switchToImageToPdf:   "http://localhost:5200/tools/image-to-pdf?token=",
    switchToPdfToAudio:   "http://localhost:5400/tools/pdf-to-audio?token=",
  };

  Object.keys(nav).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", function () {
        window.location.href = nav[id] + token;
      });
    }
  });
});
