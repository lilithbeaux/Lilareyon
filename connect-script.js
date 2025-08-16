Connect . Js


// Connect & Platforms Page JavaScript

// Nexus Canvas Background Animation
function initNexusCanvas() {
const canvas = document.getElementById(‘nexus-canvas’);
if (!canvas) return;

```
const ctx = canvas.getContext('2d');
let animationId;

// Set canvas size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Particle system
const particles = [];
const particleCount = 50;

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = Math.random() * 2 + 1;
        this.opacity = Math.random() * 0.5 + 0.2;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }
    
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 107, 107, ${this.opacity})`;
        ctx.fill();
    }
}

// Initialize particles
for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
}

// Animation loop
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update and draw particles
    particles.forEach(particle => {
        particle.update();
        particle.draw();
    });
    
    // Draw connections
    particles.forEach((particle, i) => {
        particles.slice(i + 1).forEach(otherParticle => {
            const dx = particle.x - otherParticle.x;
            const dy = particle.y - otherParticle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 100) {
                ctx.beginPath();
                ctx.moveTo(particle.x, particle.y);
                ctx.lineTo(otherParticle.x, otherParticle.y);
                ctx.strokeStyle = `rgba(255, 217, 61, ${0.1 * (1 - distance / 100)})`;
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        });
    });
    
    animationId = requestAnimationFrame(animate);
}

animate();

// Cleanup
return () => {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
};
```

}

// Mobile Navigation Toggle
function initMobileNav() {
const navToggle = document.querySelector(’.nav-toggle’);
const navMenu = document.querySelector(’.nav-menu’);

```
if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
        }
    });
}
```

}

// Copy crypto address function
function copyAddress() {
const address = ‘0xfff92162c243434a8d6f082223feb2dd567adc48’;

```
// Try to use the modern clipboard API
if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(address).then(() => {
        showCopyNotification('Crypto address copied!');
    }).catch(() => {
        fallbackCopy(address);
    });
} else {
    fallbackCopy(address);
}
```

}

// Fallback copy method for older browsers
function fallbackCopy(text) {
const textArea = document.createElement(‘textarea’);
textArea.value = text;
textArea.style.position = ‘fixed’;
textArea.style.left = ‘-9999px’;
document.body.appendChild(textArea);
textArea.select();

```
try {
    document.execCommand('copy');
    showCopyNotification('Crypto address copied!');
} catch (err) {
    showCopyNotification('Failed to copy address');
}

document.body.removeChild(textArea);
```

}

// Show copy notification
function showCopyNotification(message) {
// Remove existing notifications
const existingNotification = document.querySelector(’.copy-notification’);
if (existingNotification) {
existingNotification.remove();
}

```
// Create notification
const notification = document.createElement('div');
notification.className = 'copy-notification';
notification.textContent = message;
notification.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    background: linear-gradient(135deg, #ff6b6b, #ffd93d);
    color: #000;
    padding: 1rem 2rem;
    border-radius: 25px;
    font-weight: 600;
    z-index: 10000;
    transform: translateX(400px);
    transition: transform 0.3s ease;
    box-shadow: 0 10px 30px rgba(255, 107, 107, 0.3);
`;

document.body.appendChild(notification);

// Animate in
setTimeout(() => {
    notification.style.transform = 'translateX(0)';
}, 10);

// Animate out and remove
setTimeout(() => {
    notification.style.transform = 'translateX(400px)';
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 300);
}, 3000);
```

}

// Intersection Observer for scroll animations
function initScrollAnimations() {
const observerOptions = {
threshold: 0.1,
rootMargin: ‘0px 0px -50px 0px’
};

```
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements that should animate in
const animateElements = document.querySelectorAll(`
    .contact-card,
    .platform-card,
    .premium-card,
    .payment-card,
    .benefit-card,
    .community-card
`);

animateElements.forEach((el, index) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
    observer.observe(el);
});
```

}

// Platform card hover effects
function initPlatformEffects() {
const platformCards = document.querySelectorAll(’.platform-card, .premium-card’);

```
platformCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-10px) scale(1.02)';
    });
    
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0) scale(1)';
    });
});
```

}

// Initialize everything when DOM is loaded
document.addEventListener(‘DOMContentLoaded’, () => {
initNexusCanvas();
initMobileNav();
initScrollAnimations();
initPlatformEffects();

```
// Add smooth scrolling for any internal links
document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
```

});

// Handle page visibility changes
document.addEventListener(‘visibilitychange’, () => {
if (document.hidden) {
// Pause animations when page is not visible
const canvas = document.getElementById(‘nexus-canvas’);
if (canvas) {
canvas.style.animationPlayState = ‘paused’;
}
} else {
// Resume animations when page becomes visible
const canvas = document.getElementById(‘nexus-canvas’);
if (canvas) {
canvas.style.animationPlayState = ‘running’;
}
}
});