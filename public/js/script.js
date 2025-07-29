document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-buttons button');

    // Navigation buttons active state
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    // Active link management
    const setActiveLink = (activeLink) => {
        document.querySelectorAll('nav ul li a').forEach(link => {
            link.classList.remove('active');
        });
        activeLink.classList.add('active');
    };

    // Button event listeners
    document.getElementById('toolsBtn').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveLink(e.target);
        // Display dashboard content
    });

    document.getElementById('dashboardBtn').addEventListener('click', (e) => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:4000/?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3000'; // Redirect to Home page if no token
        }
    });

    document.getElementById('settingsBtn').addEventListener('click', (e) => {
        window.location.href = '/settings';
    });

    document.getElementById('profileBtn').addEventListener('click', (e) => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:4500/profile?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3000'; // Redirect to login if no token
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:5000/logout?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3000'; // Redirect to login if no token
        }
    });
});
