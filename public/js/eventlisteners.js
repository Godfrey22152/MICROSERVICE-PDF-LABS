// =====================================================================
//  eventlisteners.js  —  pdf-compressor-service
//  Navigation to other PDF Labs services
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {

    // Token is re-read from localStorage at each click so it is always
    // current — checkSession or handleAuthError may update it between
    // page load and when the user clicks a navigation button.

    document.getElementById('toolsBtn').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        window.location.href = token
            ? `http://localhost:5000/tools?token=${token}`
            : 'http://localhost:3000';
    });

    document.getElementById('profileBtn').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        window.location.href = token
            ? `http://localhost:4000/profile?token=${token}`
            : 'http://localhost:3000';
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        window.location.href = token
            ? `http://localhost:4500/logout?token=${token}`
            : 'http://localhost:3000';
    });

    document.getElementById('switchToPdfToImage').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        window.location.href = token
            ? `http://localhost:5100/tools/pdf-to-image?token=${token}`
            : 'http://localhost:3000';
    });

    document.getElementById('switchToImageToPdf').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        window.location.href = token
            ? `http://localhost:5200/tools/image-to-pdf?token=${token}`
            : 'http://localhost:3000';
    });

    document.getElementById('switchToPdfToWord').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        window.location.href = token
            ? `http://localhost:5500/tools/pdf-to-word?token=${token}`
            : 'http://localhost:3000';
    });

    document.getElementById('switchToPdfToAudio').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        window.location.href = token
            ? `http://localhost:5400/tools/pdf-to-audio?token=${token}`
            : 'http://localhost:3000';
    });

    document.getElementById('switchToWordToPdf').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        window.location.href = token
            ? `http://localhost:5700/tools/word-to-pdf?token=${token}`
            : 'http://localhost:3000';
    });

    document.getElementById('switchToEditPdf').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        window.location.href = token
            ? `http://localhost:5800/tools/edit-pdf?token=${token}`
            : 'http://localhost:3000';
    });

});
