// Nexus Background Animation
class NexusBackground {
    constructor() {
        this.canvas = document.getElementById('nexus-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.connections = [];
        this.mousePos = { x: 0, y: 0 };
        
        this.init();
        this.animate();
        this.setupEventListeners();
    }
    
    init() {
        this.resizeCanvas();
        this.createParticles();
        window.addEventListener('resize', () => this.resizeCanvas());
        window.addEventListener('mousemove', (e) => {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
        });
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    createParticles() {
        const particleCount = Math.floor((this.canvas.width * this.canvas.height) / 15000);
        this.particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 0.5,
                opacity: Math.random() * 0.5 + 0.2,
                pulse: Math.random() * Math.PI * 2
            });
        }
    }
    
    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update particles
        this.particles.forEach(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.pulse += 0.02;
            
            // Wrap around edges
            if (particle.x < 0) particle.x = this.canvas.width;
            if (particle.x > this.canvas.width) particle.x = 0;
            if (particle.y < 0) particle.y = this.canvas.height;
            if (particle.y > this.canvas.height) particle.y = 0;
            
            // Mouse interaction
            const dx = this.mousePos.x - particle.x;
            const dy = this.mousePos.y - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 150) {
                const force = (150 - distance) / 150;
                particle.vx += dx * force * 0.0001;
                particle.vy += dy * force * 0.0001;
            }
        });
        
        // Draw connections
        this.drawConnections();
        
        // Draw particles
        this.drawParticles();
        
        requestAnimationFrame(() => this.animate());
    }
    
    drawConnections() {
        this.ctx.strokeStyle = 'rgba(170, 0, 255, 0.1)';
        this.ctx.lineWidth = 0.5;
        
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 120) {
                    const opacity = (120 - distance) / 120 * 0.2;
                    this.ctx.strokeStyle = `rgba(170, 0, 255, ${opacity})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                    this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                    this.ctx.stroke();
                }
            }
        }
    }
    
    drawParticles() {
        this.particles.forEach(particle => {
            const pulseSize = particle.size + Math.sin(particle.pulse) * 0.5;
            const gradient = this.ctx.createRadialGradient(
                particle.x, particle.y, 0,
                particle.x, particle.y, pulseSize * 2
            );
            
            gradient.addColorStop(0, `rgba(0, 255, 255, ${particle.opacity})`);
            gradient.addColorStop(0.5, `rgba(170, 0, 255, ${particle.opacity * 0.5})`);
            gradient.addColorStop(1, 'rgba(170, 0, 255, 0)');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, pulseSize * 2, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Core particle
            this.ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity})`;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, pulseSize, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
    
    setupEventListeners() {
        // Add some interactivity for clicks
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Create ripple effect
            this.createRipple(clickX, clickY);
        });
    }
    
    createRipple(x, y) {
        const ripple = {
            x, y,
            radius: 0,
            maxRadius: 100,
            opacity: 1
        };
        
        const animateRipple = () => {
            this.ctx.strokeStyle = `rgba(255, 0, 107, ${ripple.opacity})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            ripple.radius += 3;
            ripple.opacity -= 0.02;
            
            if (ripple.radius < ripple.maxRadius && ripple.opacity > 0) {
                requestAnimationFrame(animateRipple);
            }
        };
        
        animateRipple();
    }
}

// Navigation System
class Navigation {
    constructor() {
        this.navLinks = document.querySelectorAll('[data-section]');
        this.sections = document.querySelectorAll('.section');
        this.navToggle = document.querySelector('.nav-toggle');
        this.navMenu = document.querySelector('.nav-menu');
        
        this.init();
    }
    
    init() {
        // Navigation click handlers
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetSection = link.getAttribute('data-section');
                this.showSection(targetSection);
                this.setActiveNav(link);
            });
        });
        
        // CTA button handlers
        document.querySelectorAll('[data-target]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = btn.getAttribute('data-target');
                this.showSection(target);
                this.setActiveNavBySection(target);
            });
        });
        
        // Mobile menu toggle
        this.navToggle.addEventListener('click', () => {
            this.navMenu.classList.toggle('active');
            this.navToggle.classList.toggle('active');
        });
        
        // Show home section by default
        this.showSection('home');
    }
    
    showSection(sectionId) {
        // Hide all sections
        this.sections.forEach(section => {
            section.classList.remove('active');
        });
        
        // Show target section with animation delay
        setTimeout(() => {
            const targetSection = document.getElementById(sectionId);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        }, 100);
    }
    
    setActiveNav(activeLink) {
        this.navLinks.forEach(link => link.classList.remove('active'));
        activeLink.classList.add('active');
    }
    
    setActiveNavBySection(sectionId) {
        const targetLink = document.querySelector(`[data-section="${sectionId}"]`);
        if (targetLink) {
            this.setActiveNav(targetLink);
        }
    }
}

// Smooth Animations
class AnimationController {
    constructor() {
        this.setupScrollAnimations();
        this.setupHoverEffects();
    }
    
    setupScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);
        
        // Observe all cards and content blocks
        document.querySelectorAll('.service-card, .blog-post, .topic-card, .practice-card, .experience-tier, .reading-card').forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'all 0.6s ease';
            observer.observe(el);
        });
    }
    
    setupHoverEffects() {
        // Add magnetic effect to buttons
        document.querySelectorAll('button, .platform-link').forEach(btn => {
            btn.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-3px) scale(1.02)';
            });
            
            btn.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0) scale(1)';
            });
        });
    }
}

// Form Handlers
class FormController {
    constructor() {
        this.setupFormHandlers();
    }
    
    setupFormHandlers() {
        // Reading booking buttons
        document.querySelectorAll('.reading-button, .tier-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const buttonText = btn.textContent;
                this.handleBookingClick(buttonText);
            });
        });
    }
    
    handleBookingClick(serviceType) {
        // This would integrate with your payment system
        // For now, we'll show a modal or redirect
        const message = `Booking ${serviceType}. Redirecting to secure payment...`;
        
        // Create a temporary notification
        this.showNotification(message);
        
        // Here you would typically redirect to Stripe, PayPal, etc.
        // window.location.href = 'your-payment-url';
    }
    
    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: linear-gradient(45deg, var(--neon-purple), var(--neon-pink));
            color: white;
            padding: 1rem 2rem;
            border-radius: 10px;
            z-index: 2000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Performance Optimizations
class PerformanceManager {
    constructor() {
        this.setupLazyLoading();
        this.optimizeAnimations();
    }
    
    setupLazyLoading() {
        const images = document.querySelectorAll('img[src]');
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.style.opacity = '0';
                    img.style.transition = 'opacity 0.3s ease';
                    
                    img.onload = () => {
                        img.style.opacity = '1';
                    };
                    
                    imageObserver.unobserve(img);
                }
            });
        });
        
        images.forEach(img => imageObserver.observe(img));
    }
    
    optimizeAnimations() {
        // Reduce animations on low-powered devices
        const isLowPowered = navigator.hardwareConcurrency < 4 || 
                            navigator.deviceMemory < 4 || 
                            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        
        if (isLowPowered) {
            document.documentElement.style.setProperty('--animation-duration', '0.1s');
            document.querySelectorAll('.nexus-bg').forEach(el => {
                el.style.display = 'none';
            });
        }
    }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NexusBackground();
    new Navigation();
    new AnimationController();
    new FormController();
    new PerformanceManager();
    
    // Add some CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        
        .nav-menu.active {
            transform: translateX(0);
        }
        
        .nav-toggle.active span:nth-child(1) {
            transform: rotate(-45deg) translate(-5px, 6px);
        }
        
        .nav-toggle.active span:nth-child(2) {
            opacity: 0;
        }
        
        .nav-toggle.active span:nth-child(3) {
            transform: rotate(45deg) translate(-5px, -6px);
        }
        
        @media (max-width: 768px) {
            .nav-menu {
                position: fixed;
                top: 80px;
                right: 0;
                width: 100%;
                height: calc(100vh - 80px);
                background: rgba(10, 10, 10, 0.95);
                backdrop-filter: blur(20px);
                flex-direction: column;
                justify-content: flex-start;
                align-items: center;
                padding-top: 2rem;
                transform: translateX(100%);
                transition: transform 0.3s ease;
            }
            
            .nav-toggle {
                display: flex;
            }
        }
    `;
    document.head.appendChild(style);
});

// Add some extra interactive features
class InteractiveFeatures {
    constructor() {
        this.setupParallax();
        this.setupTextEffects();
    }
    
    setupParallax() {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const parallaxElements = document.querySelectorAll('.hero-image, .section-sigil');
            
            parallaxElements.forEach(el => {
                const speed = 0.5;
                el.style.transform = `translateY(${scrolled * speed}px)`;
            });
        });
    }
    
    setupTextEffects() {
        // Glitch effect on hover for certain elements
        document.querySelectorAll('.hero-title .main').forEach(el => {
            el.addEventListener('mouseenter', function() {
                this.style.textShadow = `
                    2px 0 #ff006b,
                    -2px 0 #00ffff,
                    0 2px #aa00ff,
                    0 -2px #ffd700
                `;
                this.style.animation = 'glitch 0.5s infinite';
            });
            
            el.addEventListener('mouseleave', function() {
                this.style.textShadow = 'none';
                this.style.animation = 'none';
            });
        });
    }
}

// Initialize interactive features after a short delay
setTimeout(() => {
    new InteractiveFeatures();
}, 1000);