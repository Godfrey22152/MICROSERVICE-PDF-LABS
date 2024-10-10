document.addEventListener("DOMContentLoaded", function() {
    const continueBtn = document.getElementById('continueBtn');
    const proceedBtn = document.getElementById('proceedBtn');
    const rateUsNowBtn = document.getElementById('rateUsNowBtn');
    const maybeLaterBtn = document.getElementById('maybeLaterBtn');
    const finalLogoutBtn = document.getElementById('finalLogoutBtn');

    continueBtn.addEventListener('click', () => {
        const token = localStorage.getItem('token'); // Get the token from local storage
        if (token) {
            window.location.href = `http://localhost:4000/?token=${token}`; // Redirect to home service page
        } else {
            console.error('Token not found in local storage');
        }
    });

    proceedBtn.addEventListener('click', () => {
        document.getElementById('ratingSection').style.display = 'block';
        document.getElementById('confirmationSection').style.display = 'none';
    });

    rateUsNowBtn.addEventListener('click', () => {
        document.getElementById('finalLogoutSection').style.display = 'block';
        document.getElementById('ratingSection').style.display = 'none';
    });

    maybeLaterBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = 'http://localhost:3000'; // Redirect to the Account service page
    });

    finalLogoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = 'http://localhost:3000'; // Redirect to the Account service page
    });

    const stars = document.querySelectorAll('.star');
    stars.forEach(star => {
        star.addEventListener('click', () => {
            const rating = star.getAttribute('data-value');
            stars.forEach(s => {
                s.classList.remove('selected');
                if (s.getAttribute('data-value') <= rating) {
                    s.classList.add('selected');
                }
            });
        });
    });
});
