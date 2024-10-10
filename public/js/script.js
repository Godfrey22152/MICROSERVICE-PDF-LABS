document.addEventListener("DOMContentLoaded", function() {
    var startBtn = document.getElementById("startBtn");
    var authOptions = document.getElementById("authOptions");
    var createAccountBtn = document.getElementById("createAccountBtn");
    var loginBtn = document.getElementById("loginBtn");
    var createAccountModal = document.getElementById("createAccountModal");
    var loginModal = document.getElementById("loginModal");
    var closeButtons = document.getElementsByClassName("close");

    startBtn.onclick = function() {
        authOptions.style.display = "flex";
    }

    createAccountBtn.onclick = function() {
        createAccountModal.style.display = "block";
    }

    loginBtn.onclick = function() {
        loginModal.style.display = "block";
    }

    Array.from(closeButtons).forEach(function(element) {
        element.onclick = function() {
            this.parentElement.parentElement.style.display = "none";
        }
    });

    window.onclick = function(event) {
        if (event.target == createAccountModal || event.target == loginModal) {
            event.target.style.display = "none";
        }
    }

    // Handle create account form submission
    var createAccountForm = document.getElementById("createAccountForm");

    createAccountForm.onsubmit = async function(event) {
        event.preventDefault();
        const formData = new FormData(createAccountForm);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                alert('Account created, You can now Login');
                createAccountModal.style.display = "none";
            } else {
                const error = await response.text();
                alert('Error: ' + error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred. Please try again.');
        }
    };

    // Handle login form submission
    var loginForm = document.getElementById("loginForm");

    loginForm.onsubmit = async function(event) {
        event.preventDefault();
        const formData = new FormData(loginForm);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                const result = await response.json();
                localStorage.setItem('token', result.token); // Save the token
                alert('Login successful');
                window.location.href = `http://localhost:4000?token=${result.token}`;  // Redirect to the protected route
            } else {
                const error = await response.text();
                alert('Error: ' + error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred. Please try again.');
        }
    };
});
