// =====================================================================
//  eventlisteners.js  —  pdf-to-audio-service
//  Navigation to other PDF Labs services
// =====================================================================
document.addEventListener('DOMContentLoaded', function () {

    document.getElementById('toolsBtn').addEventListener('click', function () {
        var token = localStorage.getItem('token');
        if (token) {
            window.location.href = 'http://localhost:5000/tools?token=' + token;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

    document.getElementById('profileBtn').addEventListener('click', function () {
        var token = localStorage.getItem('token');
        if (token) {
            window.location.href = 'http://localhost:4000/profile?token=' + token;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
        var token = localStorage.getItem('token');
        if (token) {
            window.location.href = 'http://localhost:4500/logout?token=' + token;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

});
