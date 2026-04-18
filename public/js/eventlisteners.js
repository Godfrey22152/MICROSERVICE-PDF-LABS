document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('toolsBtn').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:5000/tools?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3500/home';
        }
    });

    document.getElementById('profileBtn').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:4000/profile?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:4500/logout?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

    document.getElementById('switchToPdfToImage').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:5100/tools/pdf-to-image?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

    document.getElementById('switchToCompressor').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:5300/tools/pdf-compressor?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

    document.getElementById('switchToPdfToAudio').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:5400/tools/pdf-to-audio?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

    document.getElementById('switchToWordToPdf').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:5700/tools/word-to-pdf?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });
});
