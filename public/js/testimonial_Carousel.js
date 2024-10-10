// Testimonial Carousel
const testimonialCarousel = document.getElementById('testimonial-carousel');
const testimonialItems = testimonialCarousel.querySelectorAll('.testimonial-item');

const navigationIndicator = document.getElementById('navigation-indicator');
let currentIndex = 0;

function showTestimonial(index) {
    testimonialItems.forEach((item, i) => {
        item.style.opacity = i === index ? '1' : '0.7';
        item.style.transform = i === index ? 'scale(1)' : 'scale(0.9)';
    });
}

function nextTestimonial() {
    currentIndex = (currentIndex + 1) % testimonialItems.length;
    showTestimonial(currentIndex);
    updateNavigationIndicator();
}

function updateNavigationIndicator() {
    const dots = navigationIndicator.querySelectorAll('.dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active-dot', i === currentIndex);
    });
}

// Add navigation dots
for (let i = 0; i < testimonialItems.length; i++) {
    const dot = document.createElement('div');
    dot.classList.add('dot');
    dot.addEventListener('click', () => {
        currentIndex = i;
        showTestimonial(currentIndex);
        updateNavigationIndicator();
    });
    navigationIndicator.appendChild(dot);
}

setInterval(nextTestimonial, 5000); // Change testimonial every 5 seconds
showTestimonial(currentIndex); // Show initial testimonial
updateNavigationIndicator(); // Initialize navigation dots
