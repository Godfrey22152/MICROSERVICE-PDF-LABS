document.addEventListener('DOMContentLoaded', function () {

    document.getElementById('toolsBtn').addEventListener('click', function () {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = 'http://localhost:5000/tools?token=' + token;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

    document.getElementById('profileBtn').addEventListener('click', function () {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = 'http://localhost:4000/profile?token=' + token;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = 'http://localhost:4500/logout?token=' + token;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

    document.getElementById('switchToPdfImage').addEventListener('click', function () {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = 'http://localhost:5100/tools/pdf-to-image?token=' + token;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

});
