// Contact page specific functionality
class ContactManager {
    constructor() {
        this.form = document.getElementById('contactForm');
        this.serviceButtons = document.querySelectorAll('.service-btn');
        this.faqItems = document.querySelectorAll('.faq-item');
        
        this.init();
    }
    
    init() {
        this.setupFormHandler();
        this.setupServiceButtons();
        this.setupFAQ();
        this.setupFormValidation();
        this.setupStatusUpdater();
    }
    
    setupFormHandler() {
        if (this.form) {
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleFormSubmission(e);
            });
        }
    }
    
    async handleFormSubmission(e) {
        const formData = new FormData(this.form);
        const submitBtn = this.form.querySelector('.submit-btn');
        const originalText = submitBtn.querySelector('span').textContent;
        
        // Disable button and show loading state
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Sending...';
        submitBtn.style.background = 'linear-gradient(45deg, #666, #999)';
        
        try {
            // Simulate form submission (replace with actual endpoint)
            await this.simulateFormSubmission(formData);
            
            // Success state
            this.showSuccessMessage();
            this.form.reset();
            
        } catch (error) {
            // Error state
            this.showErrorMessage(error.message);
            
        } finally {
            // Reset button
            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.querySelector('span').textContent = originalText;
                submitBtn.style.background = 'linear-gradient(45deg, var(--neon-purple), var(--neon-pink))';
            }, 2000);
        }
    }
    
    simulateFormSubmission(formData) {
        return new Promise((resolve, reject) => {
            // Simulate API call delay
            setTimeout(() => {
                // Random success/failure for demo
                if (Math.random() > 0.1) {
                    resolve({ success: true });
                } else {
                    reject(new Error('Network error. Please try again.'));
                }
            }, 2000);
        });
    }
    
    showSuccessMessage() {
        const notification = this.createNotification(
            'Transmission sent successfully! I\'ll respond within 24-48 hours.',
            'success'
        );
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
    
    showErrorMessage(message) {
        const notification = this.createNotification(
            `Error: ${message}`,
            'error'
        );
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
    
    createNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        const bgColor = type === 'success' 
            ? 'linear-gradient(45deg, #00ff00, #00cc00)' 
            : 'linear-gradient(45deg, #ff4444, #cc0000)';
            
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: ${bgColor};
            color: white;
            padding: 1rem 2rem;
            border-radius: 10px;
            z-index: 9999;
            max-width: 300px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            animation: slideInRight 0.5s ease;
        `;
        
        return notification;
    }
    
    setupServiceButtons() {
        this.serviceButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const service = btn.getAttribute('data-service');
                this.handleServiceInquiry(service);
            });
        });
    }
    
    handleServiceInquiry(service) {
        const serviceMap = {
            'reading': 'Lilareyon Reading',
            'collaboration': 'Consciousness Collaboration',
            'chemistry': 'Sacred Chemistry Consultation'
        };
        
        const serviceName = serviceMap[service] || service;
        
        // Pre-fill the contact form
        const subjectSelect = document.getElementById('subject');
        const messageTextarea = document.getElementById('message');
        
        if (subjectSelect && messageTextarea) {
            subjectSelect.value = service;
            messageTextarea.value = `I'm interested in booking a ${serviceName}. Please send me more information about:\n\n- Available time slots\n- Preparation requirements\n- Payment process\n\nLooking forward to working together.`;
            
            // Scroll to form
            document.querySelector('.contact-form-container').scrollIntoView({
                behavior: 'smooth'
            });
            
            // Focus on name field
            document.getElementById('name').focus();
        }
    }
    
    setupFAQ() {
        this.faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');
            const answer = item.querySelector('.faq-answer');
            
            question.addEventListener('click', () => {
                const isActive = question.classList.contains('active');
                
                // Close all other FAQs
                this.faqItems.forEach(otherItem => {
                    const otherQuestion = otherItem.querySelector('.faq-question');
                    const otherAnswer = otherItem.querySelector('.faq-answer');
                    otherQuestion.classList.remove('active');
                    otherAnswer.classList.remove('active');
                });
                
                // Toggle current FAQ
                if (!isActive) {
                    question.classList.add('active');
                    answer.classList.add('active');
                }
            });
        });
    }
    
    setupFormValidation() {
        const inputs = this.form.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            input.addEventListener('blur', () => {
                this.validateField(input);
            });
            
            input.addEventListener('input', () => {
                // Remove error styling on input
                input.style.borderColor = '';
                const errorMsg = input.parentNode.querySelector('.error-message');
                if (errorMsg) {
                    errorMsg.remove();
                }
            });
        });
    }
    
    validateField(field) {
        const value = field.value.trim();
        let isValid = true;
        let errorMessage = '';
        
        // Required field validation
        if (field.hasAttribute('required') && !value) {
            isValid = false;
            errorMessage = 'This field is required';
        }
        
        // Email validation
        if (field.type === 'email' && value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                isValid = false;
                errorMessage = 'Please enter a valid email address';
            }
        }
        
        // Message length validation
        if (field.name === 'message' && value && value.length < 10) {
            isValid = false;
            errorMessage = 'Please provide more detail (at least 10 characters)';
        }
        
        // Update field styling
        if (!isValid) {
            field.style.borderColor = 'var(--flame-orange)';
            this.showFieldError(field, errorMessage);
        } else {
            field.style.borderColor = 'var(--neon-blue)';
            this.removeFieldError(field);
        }
        
        return isValid;
    }
    
    showFieldError(field, message) {
        this.removeFieldError(field);
        
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        errorElement.style.cssText = `
            color: var(--flame-orange);
            font-size: 0.8rem;
            margin-top: 0.5rem;
            padding-left: 0.5rem;
        `;
        
        field.parentNode.appendChild(errorElement);
    }
    
    removeFieldError(field) {
        const errorMsg = field.parentNode.querySelector('.error-message');
        if (errorMsg) {
            errorMsg.remove();
        }
    }
    
    setupStatusUpdater() {
        // Simulate real-time status updates
        this.updateOnlineStatus();
        setInterval(() => {
            this.updateOnlineStatus();
        }, 30000); // Update every 30 seconds
    }
    
    updateOnlineStatus() {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = statusIndicator?.parentNode.querySelector('strong');
        
        if (statusIndicator && statusText) {
            // Simulate different statuses
            const statuses = [
                { class: 'online', text: 'Currently Online', color: '#00ff00' },
                { class: 'away', text: 'Away - Back Soon', color: '#ffaa00' },
                { class: 'busy', text: 'In Session', color: '#ff4444' }
            ];
            
            // Mostly online, sometimes away/busy
            const weights = [0.7, 0.2, 0.1];
            const random = Math.random();
            let selectedStatus = statuses[0];
            
            let cumulative = 0;
            for (let i = 0; i < statuses.length; i++) {
                cumulative += weights[i];
                if (random <= cumulative) {
                    selectedStatus = statuses[i];
                    break;
                }
            }
            
            statusIndicator.className = `status-indicator ${selectedStatus.class}`;
            statusIndicator.style.backgroundColor = selectedStatus.color;
            statusIndicator.style.boxShadow = `0 0 10px ${selectedStatus.color}`;
            statusText.textContent = selectedStatus.text;
        }
    }
}

// Platform link handlers
class PlatformManager {
    constructor() {
        this.setupPlatformLinks();
        this.setupSocialLinks();
    }
    
    setupPlatformLinks() {
        document.querySelectorAll('.platform-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                
                const platform = this.getPlatformFromCard(card);
                this.trackPlatformClick(platform);
                
                // Show platform modal instead of direct redirect
                this.showPlatformModal(platform);
            });
        });
    }
    
    setupSocialLinks() {
        document.querySelectorAll('.social-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                
                const platform = this.getSocialFromCard(card);
                this.trackSocialClick(platform);
                
                // For demo purposes, show coming soon message
                this.showComingSoonModal(platform);
            });
        });
    }
    
    getPlatformFromCard(card) {
        if (card.classList.contains('onlyfans')) return 'OnlyFans';
        if (card.classList.contains('fansly')) return 'Fansly';
        if (card.classList.contains('manyvids')) return 'ManyVids';
        return 'Unknown Platform';
    }
    
    getSocialFromCard(card) {
        if (card.classList.contains('instagram')) return 'Instagram';
        if (card.classList.contains('twitter')) return 'Twitter';
        if (card.classList.contains('tiktok')) return 'TikTok';
        if (card.classList.contains('telegram')) return 'Telegram';
        return 'Unknown Social';
    }
    
    showPlatformModal(platform) {
        const modal = this.createModal(`
            <h2>🔥 ${platform} Access</h2>
            <p>You're about to visit my ${platform} page where you'll find:</p>
            <ul>
                <li>Exclusive intimate content</li>
                <li>Custom request options</li>
                <li>Direct messaging</li>
                <li>Live shows and interactions</li>
            </ul>
            <p><strong>Please note:</strong> You must be 18+ to access this content.</p>
            <div class="modal-buttons">
                <button class="modal-btn primary" onclick="this.closest('.modal').remove()">
                    Continue to ${platform}
                </button>
                <button class="modal-btn secondary" onclick="this.closest('.modal').remove()">
                    Cancel
                </button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    showComingSoonModal(platform) {
        const modal = this.createModal(`
            <h2>✨ ${platform} Coming Soon</h2>
            <p>I'm currently setting up my ${platform} presence. Follow me here to get notified when it's live!</p>
            <p>In the meantime, you can connect with me through:</p>
            <ul>
                <li>The contact form on this page</li>
                <li>My premium platforms</li>
                <li>Direct email inquiry</li>
            </ul>
            <div class="modal-buttons">
                <button class="modal-btn primary" onclick="this.closest('.modal').remove()">
                    Got It
                </button>
            </div>
        `);
        
        document.body.appendChild(modal);
    }
    
    createModal(content) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                ${content}
            </div>
        `;
        
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        return modal;
    }
    
    trackPlatformClick(platform) {
        // Analytics tracking would go here
        console.log(`Platform clicked: ${platform}`);
    }
    
    trackSocialClick(platform) {
        // Analytics tracking would go here
        console.log(`Social platform clicked: ${platform}`);
    }
}

// Enhanced animations for contact page
class ContactAnimations {
    constructor() {
        this.setupHoverEffects();
        this.setupScrollAnimations();
        this.setupParticleInteractions();
    }
    
    setupHoverEffects() {
        // Enhanced card hover effects
        document.querySelectorAll('.platform-card, .social-card, .service-card').forEach(card => {
            card.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-10px) scale(1.02)';
                this.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            });
            
            card.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0) scale(1)';
            });
        });
        
        // Form field focus effects
        document.querySelectorAll('input, select, textarea').forEach(field => {
            field.addEventListener('focus', function() {
                this.style.transform = 'scale(1.02)';
                this.style.boxShadow = '0 5px 15px rgba(0, 255, 255, 0.2)';
            });
            
            field.addEventListener('blur', function() {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = 'none';
            });
        });
    }
    
    setupScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry, index) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                    }, index * 100);
                }
            });
        }, observerOptions);
        
        document.querySelectorAll('.contact-section, .sidebar-card').forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'all 0.6s ease';
            observer.observe(el);
        });
    }
    
    setupParticleInteractions() {
        // Add click particle effects
        document.addEventListener('click', (e) => {
            if (e.target.matches('.service-btn, .submit-btn, .platform-card, .social-card')) {
                this.createClickParticles(e.clientX, e.clientY);
            }
        });
    }
    
    createClickParticles(x, y) {
        for (let i = 0; i < 5; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: fixed;
                top: ${y}px;
                left: ${x}px;
                width: 4px;
                height: 4px;
                background: var(--neon-pink);
                border-radius: 50%;
                pointer-events: none;
                z-index: 9999;
                animation: particleExplode 0.8s ease-out forwards;
            `;
            
            particle.style.setProperty('--random-x', (Math.random() - 0.5) * 200 + 'px');
            particle.style.setProperty('--random-y', (Math.random() - 0.5) * 200 + 'px');
            
            document.body.appendChild(particle);
            
            setTimeout(() => particle.remove(), 800);
        }
    }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ContactManager();
    new PlatformManager();
    new ContactAnimations();
    
    // Add particle explosion keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes particleExplode {
            0% {
                transform: translate(0, 0) scale(1);
                opacity: 1;
            }
            100% {
                transform: translate(var(--random-x), var(--random-y)) scale(0);
                opacity: 0;
            }
        }
        
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(10, 10, 10, 0.8);
            backdrop-filter: blur(10px);
        }
        
        .modal-content {
            background: rgba(26, 26, 26, 0.95);
            border: 2px solid var(--neon-purple);
            border-radius: 20px;
            padding: 3rem;
            max-width: 500px;
            width: 90%;
            position: relative;
            color: var(--text-primary);
            text-align: center;
        }
        
        .modal-close {
            position: absolute;
            top: 1rem;
            right: 1rem;
            background: none;
            border: none;
            color: var(--text-secondary);
            font-size: 2rem;
            cursor: pointer;
            transition: color 0.3s ease;
        }
        
        .modal-close:hover {
            color: var(--neon-pink);
        }
        
        .modal-content h2 {
            color: var(--gold-accent);
            margin-bottom: 1rem;
        }
        
        .modal-content ul {
            text-align: left;
            margin: 1rem 0;
            color: var(--text-secondary);
        }
        
        .modal-buttons {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 2rem;
        }
        
        .modal-btn {
            padding: 1rem 2rem;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
        }
        
        .modal-btn.primary {
            background: linear-gradient(45deg, var(--neon-purple), var(--neon-pink));
            color: var(--text-primary);
        }
        
        .modal-btn.secondary {
            background: transparent;
            border: 1px solid var(--text-secondary);
            color: var(--text-secondary);
        }
        
        .modal-btn:hover {
            transform: translateY(-2px);
        }
    `;
    document.head.appendChild(style);
});