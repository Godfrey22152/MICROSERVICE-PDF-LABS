const showToast = (message, type = 'error') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 100);

    // Remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 5000);
};

const guardedNav = (navFn) => {
    return (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        if (!token) {
            showToast('You must be logged in to access this tool.');
            // Optional: redirect to login after a short delay
            setTimeout(() => {
                window.location.href = 'http://localhost:3000';
            }, 2000);
            return;
        }
        navFn();
    };
};

// Handle errors from query parameters on page load
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    if (error) {
        showToast(decodeURIComponent(error));
        // Clean up URL without refreshing
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
});
