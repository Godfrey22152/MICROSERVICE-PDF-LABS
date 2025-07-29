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
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `http://localhost:3500/tools?token=${token}`;
        } else {
            window.location.href = 'http://localhost:4000/home?token=${token}'; // Redirect to Home page if no token
        }
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

    // Handle profile update form submission
    const updateForm = document.getElementById('updateProfileForm');
    if (updateForm) {
        updateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = localStorage.getItem('token');
            if (!token) {
                alert('No token found. Please login again.');
                return;
            }

            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/update-profile', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({ name, email, password }),
                });

                if (response.ok) {
                  Toastify({
      		    text: "Profile updated successfully✅🎉",
        	    duration: 3000,
        	    gravity: "top",
                    close: true,
                    position: "center",
                    backgroundColor: "#4caf50",
                  }).showToast();

                  setTimeout(() => {
                    window.location.href = '/profile?token=' + token;
                  }, 3000); // delay redirect
                } else {
                    const errData = await response.json();
                  Toastify({
        	    text: data.msg || "❌ Failed to update profile",
                    duration: 4000,
                    close: true,
        	    gravity: "top",
        	    position: "right",
                    backgroundColor: "#f44336",
                  }).showToast();
                }
            } catch (err) {
                console.error('Update error:', err);
              Toastify({
      	        text: "❌ An error occurred. Please try again🙏",
                duration: 4000,
                close: true,
                gravity: "top",
                position: "right",
                backgroundColor: "#f44336",
             }).showToast();
            }
        });
    }
});
