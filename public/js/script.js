document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-buttons button');
    const slides = document.querySelectorAll('.animations .slide');
    let currentSlide = 0;

    // Navigation buttons active state
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    // Function to show the next slide
    function showNextSlide() {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }

    // Set interval for sliding animations
    setInterval(showNextSlide, 15000);

    // Active link management
    const setActiveLink = (activeLink) => {
        document.querySelectorAll('nav ul li a').forEach(link => {
            link.classList.remove('active');
        });
        activeLink.classList.add('active');
    };

    // Button event listeners
    document.getElementById('dashboardBtn').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveLink(e.target);
        // Display dashboard content
    });

    document.getElementById('toolsBtn').addEventListener('click', (e) => {
        window.location.href = '/tools';
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
