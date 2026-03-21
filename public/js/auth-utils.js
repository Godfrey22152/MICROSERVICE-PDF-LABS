const guardedNav = (navFn) => {
    return (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = 'http://localhost:3000';
            return;
        }
        navFn();
    };
};
