document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-buttons button');

    // Navigation buttons active state
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    // Button event listeners
    document.getElementById('dashboardButton').addEventListener('click', (e) => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:4000/?token=${token}`;
        } else {
            console.error('Token not found in local storage');
        }
    });

    document.getElementById('toolsButton').addEventListener('click', (e) => {
        window.location.href = '/tools'; // Redirect to the tools page
    });

    document.getElementById('settingsButton').addEventListener('click', (e) => {
        window.location.href = '/settings'; // Redirect to the settings page
    });

    document.getElementById('profileButton').addEventListener('click', (e) => {
        e.preventDefault();
        // The profile button is already active, no need to redirect
    });

    document.getElementById('logoutButton').addEventListener('click', () => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:5000/logout?token=${token}`;
        } else {
            window.location.href = 'http://localhost:3000'; // Redirect to login if no token
        }
    });
});
