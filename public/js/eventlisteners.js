
document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-buttons button');

    document.getElementById('toolsBtn').addEventListener('click', (e) => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:3500/tools?token=${token}`;
        } else {
            window.location.href = 'http://localhost:4000/home?token=${token}'; // Redirect to Home page if no token
        }
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

document.addEventListener("DOMContentLoaded", function() {
    const token = localStorage.getItem("token"); // reuse stored token
    document.getElementById("switchToPdfImage").addEventListener("click", function() {
      if (token) {
        window.location.href = `http://localhost:5500/tools/pdf-to-image?token=${token}`;
      } else {
        window.location.href = 'http://localhost:3000'; // Redirect to login if no token
      }
    });
});
