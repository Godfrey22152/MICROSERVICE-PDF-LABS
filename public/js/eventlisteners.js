// =====================================================================
//  eventlisteners.js  —  word-to-pdf-service
// =====================================================================

document.addEventListener("DOMContentLoaded", function () {
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const nav = {
    toolsBtn:           "http://localhost:5000/tools?token=",
    profileBtn:         "http://localhost:4000/profile?token=",
    logoutBtn:          "http://localhost:4500/logout?token=",
    switchToPdfToWord:  "http://localhost:5500/tools/pdf-to-word?token=",
    switchToCompressor: "http://localhost:5300/tools/pdf-compressor?token=",
    switchToPdfToImage: "http://localhost:5100/tools/pdf-to-image?token=",
    switchToImageToPdf: "http://localhost:5200/tools/image-to-pdf?token=",
    switchToPdfToAudio: "http://localhost:5400/tools/pdf-to-audio?token=",
  };

  Object.entries(nav).forEach(([id, url]) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", function () {
        window.location.href = url + token;
      });
    }
  });
});
