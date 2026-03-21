// public/js/script.js
// auth-utils.js must be loaded BEFORE this script (see tools.ejs <script> order)

document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-buttons button');

    // ── Navigation buttons active state ──────────────────────────────────────
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    // ── Active link management ────────────────────────────────────────────────
    const setActiveLink = (activeLink) => {
        document.querySelectorAll('nav ul li a').forEach(link => {
            link.classList.remove('active');
        });
        activeLink.classList.add('active');
    };

    // Helper: get stored token
    const getToken = () => localStorage.getItem('token');

    // ── Nav buttons ───────────────────────────────────────────────────────────

    document.getElementById('toolsBtn').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveLink(e.target);
        // Display dashboard content (extend as needed)
    });

    document.getElementById('dashboardBtn').addEventListener('click', guardedNav(() => {
        window.location.href = `http://localhost:3500/?token=${getToken()}`;
    }));

    document.getElementById('settingsBtn').addEventListener('click', guardedNav(() => {
        window.location.href = '/settings';
    }));

    document.getElementById('profileBtn').addEventListener('click', guardedNav(() => {
        window.location.href = `http://localhost:4000/profile?token=${getToken()}`;
    }));

    document.getElementById('logoutBtn').addEventListener('click', () => {
        const token = getToken();
        if (token) {
            window.location.href = `http://localhost:4500/logout?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3000';
        }
    });

    // ── Tool buttons ──────────────────────────────────────────────────────────

    document.getElementById('pdfToImageBtn').addEventListener('click', guardedNav(() => {
        window.location.href = `http://localhost:5100/tools/pdf-to-image?token=${getToken()}`;
    }));

    document.getElementById('imageToPdfBtn').addEventListener('click', guardedNav(() => {
        window.location.href = `http://localhost:5200/tools/image-to-pdf?token=${getToken()}`;
    }));

    document.getElementById('pdfCompressorBtn').addEventListener('click', guardedNav(() => {
        window.location.href = `http://localhost:5300/tools/pdf-compressor?token=${getToken()}`;
    }));

    document.getElementById('wordToPdfBtn').addEventListener('click', guardedNav(() => {
        window.location.href = `http://localhost:5700/tools/word-to-pdf?token=${getToken()}`;
    }));

    document.getElementById('pdfToWordBtn').addEventListener('click', guardedNav(() => {
        window.location.href = `http://localhost:5500/tools/pdf-to-word?token=${getToken()}`;
    }));

    document.getElementById('pdfToAudioBtn').addEventListener('click', guardedNav(() => {
        window.location.href = `http://localhost:5400/tools/pdf-to-audio?token=${getToken()}`;
    }));

    document.getElementById('editPdfBtn').addEventListener('click', guardedNav(() => {
        window.location.href = `http://localhost:5800/tools/edit-pdf?token=${getToken()}`;
    }));

    document.getElementById('sheetlabBtn').addEventListener('click', guardedNav(() => {
        window.location.href = `http://localhost:5600/tools/sheetlab?token=${getToken()}`;
    }));
});
