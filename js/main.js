// ==================== MOBILE MENU TOGGLE ====================
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');
        });
    }
});

// ==================== SMOOTH SCROLL ====================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ==================== NAVBAR SCROLL EFFECT ====================
window.addEventListener('scroll', function() {
    const navbar = document.querySelector('nav');
    if (window.scrollY > 50) {
        navbar.classList.add('shadow-lg');
    } else {
        navbar.classList.remove('shadow-lg');
    }
});

// ==================== FADE IN ON SCROLL ANIMATION ====================
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all sections and cards
document.querySelectorAll('section, .feature-card, .quick-start-card, .update-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
    observer.observe(el);
});

// ==================== ACTIVE LINK HIGHLIGHT ====================
function setActiveLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('nav a');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('bg-accent-primary/10', 'text-accent-primary');
        } else {
            link.classList.remove('bg-accent-primary/10', 'text-accent-primary');
        }
    });
}

// Run on page load
setActiveLink();

// ==================== FORM VALIDATION (for contact page) ====================
function validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const name = form.querySelector('#name');
        const email = form.querySelector('#email');
        const message = form.querySelector('#message');
        
        let isValid = true;
        
        // Clear previous errors
        document.querySelectorAll('.error-message').forEach(el => el.remove());
        
        // Validate name
        if (!name.value.trim()) {
            showError(name, 'الرجاء إدخال الاسم');
            isValid = false;
        }
        
        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email.value.trim() || !emailRegex.test(email.value)) {
            showError(email, 'الرجاء إدخال بريد إلكتروني صحيح');
            isValid = false;
        }
        
        // Validate message
        if (!message.value.trim() || message.value.trim().length < 10) {
            showError(message, 'الرجاء إدخال رسالة تحتوي على 10 أحرف على الأقل');
            isValid = false;
        }
        
        if (isValid) {
            // Show success message
            showSuccessMessage('تم إرسال رسالتك بنجاح! سنتواصل معك قريباً.');
            form.reset();
        }
    });
}

function showError(input, message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message text-red-400 text-sm mt-1';
    errorDiv.textContent = message;
    input.parentElement.appendChild(errorDiv);
    input.classList.add('border-red-400');
}

function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-4 rounded-lg shadow-2xl z-50 animate-fade-in';
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.remove();
    }, 5000);
}

// Initialize form validation if contact form exists
validateForm('contact-form');

// ==================== SEARCH FUNCTIONALITY ====================
function initSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.searchable-item');
        
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                item.style.display = '';
                item.classList.add('highlight-search');
            } else {
                item.style.display = 'none';
                item.classList.remove('highlight-search');
            }
        });
    });
}

initSearch();

// ==================== FILTER FUNCTIONALITY (for resources page) ====================
function initFilter() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    if (filterButtons.length === 0) return;
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            const filter = this.dataset.filter;
            
            // Update active button
            filterButtons.forEach(btn => {
                btn.classList.remove('bg-accent-primary', 'text-dark-bg');
                btn.classList.add('text-accent-secondary');
            });
            this.classList.add('bg-accent-primary', 'text-dark-bg');
            this.classList.remove('text-accent-secondary');
            
            // Filter items
            const items = document.querySelectorAll('.filter-item');
            items.forEach(item => {
                if (filter === 'all' || item.dataset.category === filter) {
                    item.style.display = '';
                    item.classList.add('fade-in');
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });
}

initFilter();

// ==================== PROGRESS TRACKER (for roadmap) ====================
function initProgressTracker() {
    const progressItems = document.querySelectorAll('.progress-item');
    if (progressItems.length === 0) return;
    
    // Load progress from localStorage
    const savedProgress = JSON.parse(localStorage.getItem('learningProgress') || '{}');
    
    progressItems.forEach(item => {
        const itemId = item.dataset.id;
        const checkbox = item.querySelector('input[type="checkbox"]');
        
        if (checkbox) {
            // Set initial state
            if (savedProgress[itemId]) {
                checkbox.checked = true;
                item.classList.add('completed');
            }
            
            // Save on change
            checkbox.addEventListener('change', function() {
                savedProgress[itemId] = this.checked;
                localStorage.setItem('learningProgress', JSON.stringify(savedProgress));
                
                if (this.checked) {
                    item.classList.add('completed');
                    showSuccessMessage('✅ تم تحديد هذه المرحلة كمكتملة');
                } else {
                    item.classList.remove('completed');
                }
                
                updateProgressBar();
            });
        }
    });
    
    updateProgressBar();
}

function updateProgressBar() {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    if (!progressBar) return;
    
    const progressItems = document.querySelectorAll('.progress-item');
    const checkedItems = document.querySelectorAll('.progress-item input[type="checkbox"]:checked');
    
    const percentage = (checkedItems.length / progressItems.length) * 100;
    
    progressBar.style.width = `${percentage}%`;
    if (progressText) {
        progressText.textContent = `${Math.round(percentage)}%`;
    }
}

initProgressTracker();

// ==================== COPY TO CLIPBOARD ====================
function initCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-btn');
    
    copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.dataset.target;
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                const text = targetElement.textContent || targetElement.value;
                
                navigator.clipboard.writeText(text).then(() => {
                    const originalText = this.textContent;
                    this.textContent = '✓ تم النسخ';
                    this.classList.add('bg-green-500');
                    
                    setTimeout(() => {
                        this.textContent = originalText;
                        this.classList.remove('bg-green-500');
                    }, 2000);
                });
            }
        });
    });
}

initCopyButtons();

// ==================== ACCORDION (for FAQ section) ====================
function initAccordion() {
    const accordionButtons = document.querySelectorAll('.accordion-btn');
    
    accordionButtons.forEach(button => {
        button.addEventListener('click', function() {
            const content = this.nextElementSibling;
            const icon = this.querySelector('.accordion-icon');
            
            // Toggle current accordion
            const isOpen = content.style.maxHeight;
            
            // Close all accordions
            document.querySelectorAll('.accordion-content').forEach(el => {
                el.style.maxHeight = null;
            });
            document.querySelectorAll('.accordion-icon').forEach(el => {
                el.style.transform = 'rotate(0deg)';
            });
            
            // Open clicked accordion if it was closed
            if (!isOpen) {
                content.style.maxHeight = content.scrollHeight + 'px';
                if (icon) icon.style.transform = 'rotate(180deg)';
            }
        });
    });
}

initAccordion();

// ==================== BACK TO TOP BUTTON ====================
function initBackToTop() {
    const backToTopBtn = document.getElementById('back-to-top');
    if (!backToTopBtn) return;
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 300) {
            backToTopBtn.classList.remove('hidden');
            backToTopBtn.classList.add('block');
        } else {
            backToTopBtn.classList.add('hidden');
            backToTopBtn.classList.remove('block');
        }
    });
    
    backToTopBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

initBackToTop();

// ==================== DARK MODE TOGGLE (optional) ====================
function initDarkMode() {
    const darkModeBtn = document.getElementById('dark-mode-toggle');
    if (!darkModeBtn) return;
    
    // Check for saved preference or default to dark
    const darkMode = localStorage.getItem('darkMode') !== 'false';
    
    if (darkMode) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    
    darkModeBtn.addEventListener('click', function() {
        document.documentElement.classList.toggle('dark');
        const isDark = document.documentElement.classList.contains('dark');
        localStorage.setItem('darkMode', isDark);
    });
}

initDarkMode();

// ==================== LAZY LOADING IMAGES ====================
function initLazyLoading() {
    const images = document.querySelectorAll('img[data-src]');
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.add('fade-in');
                observer.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
}

initLazyLoading();

// ==================== TOOLTIP ====================
function initTooltips() {
    const tooltipTriggers = document.querySelectorAll('[data-tooltip]');
    
    tooltipTriggers.forEach(trigger => {
        const tooltipText = trigger.dataset.tooltip;
        
        trigger.addEventListener('mouseenter', function(e) {
            const tooltip = document.createElement('div');
            tooltip.className = 'absolute bg-dark-tertiary text-accent-primary text-sm px-3 py-2 rounded-lg shadow-xl z-50 tooltip';
            tooltip.textContent = tooltipText;
            tooltip.style.bottom = '100%';
            tooltip.style.right = '50%';
            tooltip.style.transform = 'translateX(50%) translateY(-8px)';
            tooltip.style.whiteSpace = 'nowrap';
            
            this.style.position = 'relative';
            this.appendChild(tooltip);
        });
        
        trigger.addEventListener('mouseleave', function() {
            const tooltip = this.querySelector('.tooltip');
            if (tooltip) tooltip.remove();
        });
    });
}

initTooltips();

// ==================== PRINT PROGRESS REPORT ====================
function printProgressReport() {
    const printBtn = document.getElementById('print-progress');
    if (!printBtn) return;
    
    printBtn.addEventListener('click', function() {
        window.print();
    });
}

printProgressReport();

// ==================== EXPORT PROGRESS ====================
function exportProgress() {
    const exportBtn = document.getElementById('export-progress');
    if (!exportBtn) return;
    
    exportBtn.addEventListener('click', function() {
        const progress = localStorage.getItem('learningProgress') || '{}';
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(progress);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', dataStr);
        downloadAnchor.setAttribute('download', 'learning-progress.json');
        downloadAnchor.click();
    });
}

exportProgress();

// ==================== CONSOLE LOG ====================
console.log('%c🎯 Digital IC Learning Platform', 'color: #CFFFE2; font-size: 20px; font-weight: bold;');
console.log('%cمرحباً بك في منصة تعلم تصميم الدوائر المتكاملة الرقمية', 'color: #A2D5C6; font-size: 14px;');
console.log('%cإذا كنت تريد المساهمة في المشروع، تواصل معنا!', 'color: #006A67; font-size: 12px;');