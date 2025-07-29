document.addEventListener("DOMContentLoaded", function() {
    var authModal = document.getElementById("authModal");
    var createAccountModal = document.getElementById("createAccountModal");
    var loginModal = document.getElementById("loginModal");
    var modalCreateAccountBtn = document.getElementById("modalCreateAccountBtn");
    var modalLoginBtn = document.getElementById("modalLoginBtn");
    var closeButtons = document.getElementsByClassName("close");

    // Show the auth modal
    window.showAuthModal = function() {
        authModal.style.display = "block";
    }

    // Close the auth modal
    window.closeAuthModal = function() {
        authModal.style.display = "none";
    }

    // Show the create account modal from the auth modal
    modalCreateAccountBtn.onclick = function() {
        authModal.style.display = "none";
        createAccountModal.style.display = "block";
    }

    // Show the login modal from the auth modal
    modalLoginBtn.onclick = function() {
        authModal.style.display = "none";
        loginModal.style.display = "block";
    }

    // Close modals
    Array.from(closeButtons).forEach(function(element) {
        element.onclick = function() {
            this.closest('.modal').style.display = "none";
        }
    });

    // Close modals if the user clicks outside of them
    window.onclick = function(event) {
        if (event.target == createAccountModal || event.target == loginModal || event.target == authModal) {
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
                Toastify({
                    text: "✅ Account created, You can now Login🎉",
                    duration: 4000,
                    close: true,
                    gravity: "top",
                    position: "right",
                    backgroundColor: "linear-gradient(to right, #00b09b, #96c93d)",
                }).showToast();
                createAccountModal.style.display = "none";
            } else {
                const error = await response.text();
                Toastify({
                    text: "Error:❌ " + error,
                    duration: 4000,
                    close: true,
                    gravity: "top",
                    position: "right",
                    backgroundColor: "linear-gradient(to right, #ff5f6d, #ffc371)",
                }).showToast();
            }
        } catch (error) {
            console.error('Error:', error);
            Toastify({
                text: "❌ An error occurred. Please try again🙏",
                duration: 4000,
                close: true,
                gravity: "top",
                position: "right",
                backgroundColor: "linear-gradient(to right, #ff5f6d, #ffc371)",
            }).showToast();
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
                Toastify({
                    text: "Login successful👏🎉",
                    duration: 1500,
                    close: true,
                    gravity: "top",
                    position: "center",
                    backgroundColor: "linear-gradient(to right, #00b09b, #96c93d)",
                }).showToast();

                setTimeout(() => {
                  window.location.href = `http://localhost:4000?token=${result.token}`;  // Redirect to the protected route
                }, 1500); // delay redirect
            } else {
                const error = await response.text();
                Toastify({
                    text: "Error: 🙏 " + error,
                    duration: 4000,
                    close: true,
                    gravity: "top",
                    position: "right",
                    backgroundColor: "linear-gradient(to right, #ff5f6d, #ffc371)",
                }).showToast();
            }
        } catch (error) {
            console.error('Error:', error);
            Toastify({
                text: "An error occurred. Please try again🙏",
                duration: 4000,
                close: true,
                gravity: "top",
                position: "right",
                backgroundColor: "linear-gradient(to right, #ff5f6d, #ffc371)",
            }).showToast();
        }
    };
});
