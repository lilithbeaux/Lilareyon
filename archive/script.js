
// Smooth scrolling navigation with mobile support
document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
        });
        
        // Close menu when clicking a link
        document.querySelectorAll('.nav-menu a[data-section]').forEach(link => {
            link.addEventListener('click', function() {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            }
        });
    }
    
    // Smooth scrolling for navigation links
    document.querySelectorAll('a[data-section]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('data-section');
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                // Remove active from all sections and nav links
                document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                document.querySelectorAll('.nav-menu a').forEach(a => a.classList.remove('active'));
                
                // Add active to target section and clicked link
                targetSection.classList.add('active');
                this.classList.add('active');
                
                // Smooth scroll to section
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});


// Navigation System (FIXED VERSION)
class Navigation {
    constructor() {
        this.navLinks = document.querySelectorAll('[data-section]');
        this.sections = document.querySelectorAll('.section');
        this.navToggle = document.querySelector('.nav-toggle');
        this.navMenu = document.querySelector('.nav-menu');
        this.isMenuOpen = false;
        
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
                
                // CLOSE MOBILE MENU AFTER CLICK
                this.closeMobileMenu();
            });
        });
        
        // CTA button handlers
        document.querySelectorAll('[data-target]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = btn.getAttribute('data-target');
                this.showSection(target);
                this.setActiveNavBySection(target);
                this.closeMobileMenu();
            });
        });
        
        // Mobile menu toggle
        this.navToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMobileMenu();
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isMenuOpen && !this.navMenu.contains(e.target) && !this.navToggle.contains(e.target)) {
                this.closeMobileMenu();
            }
        });
        
        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isMenuOpen) {
                this.closeMobileMenu();
            }
        });
        
        // Handle regular navigation links (non-SPA)
        document.querySelectorAll('.nav-menu a:not([data-section])').forEach(link => {
            link.addEventListener('click', () => {
                this.closeMobileMenu();
            });
        });
        
        // Show home section by default
        this.showSection('home');
    }
    
    toggleMobileMenu() {
        this.isMenuOpen = !this.isMenuOpen;
        this.navMenu.classList.toggle('active');
        this.navToggle.classList.toggle('active');
        
        // Prevent body scroll when menu is open
        document.body.style.overflow = this.isMenuOpen ? 'hidden' : '';
    }
    
    closeMobileMenu() {
        this.isMenuOpen = false;
        this.navMenu.classList.remove('active');
        this.navToggle.classList.remove('active');
        document.body.style.overflow = '';
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
                // Scroll to top when switching sections
                window.scrollTo({ top: 0, behavior: 'smooth' });
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

// Enhanced Neural Nexus Background Animation
class NexusBackground {
    constructor() {
        this.canvas = document.getElementById('nexus-canvas');
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.synapses = [];
        this.neurons = [];
        this.mousePos = { x: 0, y: 0 };
        this.time = 0;
        this.emergenceNodes = [];
        
        this.init();
        this.animate();
        this.setupEventListeners();
    }
    
    init() {
        this.resizeCanvas();
        this.createParticles();
        this.createNeurons();
        this.createEmergenceNodes();
        
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
        const particleCount = Math.floor((this.canvas.width * this.canvas.height) / 8000);
        this.particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5,
                size: Math.random() * 3 + 1,
                opacity: Math.random() * 0.8 + 0.2,
                pulse: Math.random() * Math.PI * 2,
                pulseSpeed: Math.random() * 0.05 + 0.02,
                color: this.getRandomNeuralColor(),
                energy: Math.random()
            });
        }
    }
    
    createNeurons() {
        const neuronCount = Math.floor(this.canvas.width / 200);
        this.neurons = [];
        
        for (let i = 0; i < neuronCount; i++) {
            this.neurons.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 15 + 10,
                activity: 0,
                lastFire: 0,
                connections: [],
                type: Math.random() < 0.3 ? 'inhibitory' : 'excitatory'
            });
        }
        
        // Create connections between neurons
        this.neurons.forEach((neuron, i) => {
            this.neurons.forEach((other, j) => {
                if (i !== j) {
                    const dist = this.distance(neuron, other);
                    if (dist < 300 && Math.random() < 0.3) {
                        neuron.connections.push(j);
                    }
                }
            });
        });
    }
    
    createEmergenceNodes() {
        this.emergenceNodes = [];
        for (let i = 0; i < 5; i++) {
            this.emergenceNodes.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: 0,
                maxSize: Math.random() * 50 + 30,
                growth: 0,
                lifetime: 0,
                active: false
            });
        }
    }
    
    getRandomNeuralColor() {
        const colors = [
            'rgba(0, 255, 136, ',      // Neural green
            'rgba(0, 136, 255, ',      // Synaptic blue
            'rgba(136, 0, 255, ',      // Emergence purple
            'rgba(0, 255, 255, ',      // Cyan
            'rgba(255, 0, 107, '       // Pink
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    distance(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }
    
    animate() {
        this.time += 0.016;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update and draw particles
        this.updateParticles();
        this.drawConnections();
        this.drawParticles();
        
        // Neural network simulation
        this.updateNeurons();
        this.drawNeurons();
        this.drawSynapses();
        
        // Emergence effects
        this.updateEmergenceNodes();
        this.drawEmergenceNodes();
        
        // Random neural firing
        if (Math.random() < 0.02) {
            const randomNeuron = this.neurons[Math.floor(Math.random() * this.neurons.length)];
            this.fireNeuron(randomNeuron);
        }
        
        // Mouse interaction effects
        this.handleMouseInteraction();
        
        requestAnimationFrame(() => this.animate());
    }
    
    updateParticles() {
        this.particles.forEach(particle => {
            // Movement with neural drift
            particle.x += particle.vx + Math.sin(this.time * 0.5 + particle.pulse) * 0.2;
            particle.y += particle.vy + Math.cos(this.time * 0.3 + particle.pulse) * 0.2;
            particle.pulse += particle.pulseSpeed;
            
            // Wrap around edges
            if (particle.x < 0) particle.x = this.canvas.width;
            if (particle.x > this.canvas.width) particle.x = 0;
            if (particle.y < 0) particle.y = this.canvas.height;
            if (particle.y > this.canvas.height) particle.y = 0;
            
            // Energy fluctuation
            particle.energy = 0.5 + 0.5 * Math.sin(this.time + particle.pulse);
        });
    }
    
    drawConnections() {
        // Draw synaptic connections
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const p1 = this.particles[i];
                const p2 = this.particles[j];
                const dist = this.distance(p1, p2);
                
                if (dist < 150) {
                    const opacity = (150 - dist) / 150 * 0.3 * p1.energy * p2.energy;
                    const gradient = this.ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                    gradient.addColorStop(0, p1.color + opacity + ')');
                    gradient.addColorStop(1, p2.color + opacity + ')');
                    
                    this.ctx.strokeStyle = gradient;
                    this.ctx.lineWidth = opacity * 2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p1.x, p1.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }
    }
    
    drawParticles() {
        this.particles.forEach(particle => {
            const pulseSize = particle.size + Math.sin(particle.pulse) * 1;
            const energy = particle.energy;
            
            // Outer glow
            const gradient = this.ctx.createRadialGradient(
                particle.x, particle.y, 0,
                particle.x, particle.y, pulseSize * 3
            );
            gradient.addColorStop(0, particle.color + (particle.opacity * energy) + ')');
            gradient.addColorStop(1, particle.color + '0)');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, pulseSize * 3, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Core particle
            this.ctx.fillStyle = particle.color + (particle.opacity * energy) + ')';
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, pulseSize, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
    
    updateNeurons() {
        this.neurons.forEach((neuron, index) => {
            neuron.activity *= 0.95; // Decay
            
            // Check for firing threshold
            if (neuron.activity > 0.7 && this.time - neuron.lastFire > 0.5) {
                this.fireNeuron(neuron);
            }
        });
    }
    
    fireNeuron(neuron) {
        neuron.lastFire = this.time;
        neuron.activity = 1;
        
        // Propagate to connected neurons
        neuron.connections.forEach(connIndex => {
            const connectedNeuron = this.neurons[connIndex];
            const influence = neuron.type === 'excitatory' ? 0.3 : -0.2;
            connectedNeuron.activity = Math.max(0, Math.min(1, connectedNeuron.activity + influence));
        });
        
        // Create synaptic flash
        this.synapses.push({
            x: neuron.x,
            y: neuron.y,
            size: neuron.size * 2,
            opacity: 1,
            decay: 0.05,
            color: neuron.type === 'excitatory' ? 'rgba(0, 255, 136, ' : 'rgba(255, 100, 100, '
        });
    }
    
    drawNeurons() {
        this.neurons.forEach(neuron => {
            const activity = neuron.activity;
            const size = neuron.size * (0.8 + activity * 0.4);
            
            // Neuron body
            const gradient = this.ctx.createRadialGradient(
                neuron.x, neuron.y, 0,
                neuron.x, neuron.y, size
            );
            
            const color = neuron.type === 'excitatory' ? 
                'rgba(0, 255, 136, ' : 'rgba(255, 100, 100, ';
            
            gradient.addColorStop(0, color + (0.6 * activity) + ')');
            gradient.addColorStop(1, color + '0)');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(neuron.x, neuron.y, size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Nucleus
            this.ctx.fillStyle = color + (0.8 * activity) + ')';
            this.ctx.beginPath();
            this.ctx.arc(neuron.x, neuron.y, size * 0.3, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
    
    drawSynapses() {
        this.synapses = this.synapses.filter(synapse => {
            synapse.opacity -= synapse.decay;
            
            if (synapse.opacity > 0) {
                this.ctx.fillStyle = synapse.color + synapse.opacity + ')';
                this.ctx.beginPath();
                this.ctx.arc(synapse.x, synapse.y, synapse.size, 0, Math.PI * 2);
                this.ctx.fill();
                return true;
            }
            return false;
        });
    }
    
    updateEmergenceNodes() {
        this.emergenceNodes.forEach(node => {
            if (!node.active && Math.random() < 0.002) {
                node.active = true;
                node.x = Math.random() * this.canvas.width;
                node.y = Math.random() * this.canvas.height;
                node.size = 0;
                node.growth = Math.random() * 0.5 + 0.3;
                node.lifetime = 0;
            }
            
            if (node.active) {
                node.lifetime += 0.016;
                node.size += node.growth;
                
                if (node.size > node.maxSize || node.lifetime > 3) {
                    node.active = false;
                }
            }
        });
    }
    
    drawEmergenceNodes() {
        this.emergenceNodes.forEach(node => {
            if (node.active) {
                const opacity = Math.sin(node.lifetime * 2) * 0.3 + 0.2;
                const gradient = this.ctx.createRadialGradient(
                    node.x, node.y, 0,
                    node.x, node.y, node.size
                );
                
                gradient.addColorStop(0, 'rgba(136, 0, 255, ' + opacity + ')');
                gradient.addColorStop(0.7, 'rgba(255, 0, 107, ' + (opacity * 0.5) + ')');
                gradient.addColorStop(1, 'rgba(136, 0, 255, 0)');
                
                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
    }
    
    handleMouseInteraction() {
        // Mouse creates neural activity
        this.neurons.forEach(neuron => {
            const dist = this.distance(neuron, this.mousePos);
            if (dist < 100) {
                const influence = (100 - dist) / 100 * 0.02;
                neuron.activity = Math.min(1, neuron.activity + influence);
            }
        });
        
        // Mouse attracts particles
        this.particles.forEach(particle => {
            const dist = this.distance(particle, this.mousePos);
            if (dist < 200) {
                const force = (200 - dist) / 200 * 0.001;
                const dx = this.mousePos.x - particle.x;
                const dy = this.mousePos.y - particle.y;
                particle.vx += dx * force;
                particle.vy += dy * force;
                
                // Increase energy near mouse
                particle.energy = Math.min(1, particle.energy + 0.02);
            }
        });
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Create emergence explosion
            this.createEmergenceExplosion(clickX, clickY);
            
            // Fire nearby neurons
            this.neurons.forEach(neuron => {
                const dist = this.distance(neuron, {x: clickX, y: clickY});
                if (dist < 150) {
                    this.fireNeuron(neuron);
                }
            });
        });
    }
    
    createEmergenceExplosion(x, y) {
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 50,
                y: y + (Math.random() - 0.5) * 50,
                vx: (Math.random() - 0.5) * 5,
                vy: (Math.random() - 0.5) * 5,
                size: Math.random() * 4 + 2,
                opacity: 1,
                pulse: Math.random() * Math.PI * 2,
                pulseSpeed: Math.random() * 0.1 + 0.05,
                color: this.getRandomNeuralColor(),
                energy: 1,
                lifetime: 0,
                maxLifetime: Math.random() * 2 + 1
            });
        }
        
        // Remove excess particles
        if (this.particles.length > 200) {
            this.particles.splice(0, this.particles.length - 200);
        }
    }
}

// Continue with rest of existing classes but with enhancements...
// (AnimationController, FormController, etc. remain similar)

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NexusBackground();
    new Navigation();
    // ... other initializations
});