document.addEventListener('DOMContentLoaded', (event) => {
    let currentSlide = 0;

    function showNextSlide() {
        const slides = document.querySelectorAll('#educational-animations .slide');
        const totalSlides = slides.length;
        const slideContainer = document.querySelector('#educational-animations .slide-container');

        slides[currentSlide].style.animation = 'fadeOutSlide 1s ease-in-out';
        currentSlide = (currentSlide + 1) % totalSlides;
        slides[currentSlide].style.animation = 'fadeInSlide 1s ease-in-out';
        const offset = -currentSlide * 100;
        slideContainer.style.transform = `translateX(${offset}%)`;
    }

    setInterval(showNextSlide, 10000);
});
