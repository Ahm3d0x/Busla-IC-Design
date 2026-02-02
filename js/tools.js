// Mobile Menu
function initMobileMenu() {
    const menuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    const iconOpen = document.getElementById('icon-open');
    const iconClose = document.getElementById('icon-close');

    if (menuButton && mobileMenu && iconOpen && iconClose) {
        menuButton.addEventListener('click', () => {
            const isExpanded = menuButton.getAttribute('aria-expanded') === 'true';
            menuButton.setAttribute('aria-expanded', !isExpanded);
            mobileMenu.classList.toggle('hidden');
            iconOpen.classList.toggle('hidden');
            iconClose.classList.toggle('hidden');
        });
    }
}

// Tools Page Logic
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('tools-grid');
    const noResults = document.getElementById('no-results');
    
    const filterSearch = document.getElementById('filter-search');
    const filterCategory = document.getElementById('filter-category');
    const filterLevel = document.getElementById('filter-level');
    const resetFiltersBtn = document.getElementById('reset-filters');
    const clearSearchBtn = document.getElementById('clear-search');
    
    const modal = document.getElementById('tool-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalTitle = document.getElementById('modal-title');
    const modalLevel = document.getElementById('modal-level');
    const modalCategory = document.getElementById('modal-category');
    const modalBadges = document.getElementById('modal-badges');
    const modalDescription = document.getElementById('modal-description');
    const modalGuidance = document.getElementById('modal-guidance');
    const modalUsage = document.getElementById('modal-usage');
    const modalUsageSection = document.getElementById('modal-usage-section');
    const modalPros = document.getElementById('modal-pros');
    const modalProsSection = document.getElementById('modal-pros-section');
    const modalCons = document.getElementById('modal-cons');
    const modalConsSection = document.getElementById('modal-cons-section');
    const modalAlternatives = document.getElementById('modal-alternatives');
    const modalAlternativesSection = document.getElementById('modal-alternatives-section');
    const modalSystem = document.getElementById('modal-system');
    const modalSystemSection = document.getElementById('modal-system-section');
    const modalUrl = document.getElementById('modal-url');

    const totalToolsSpan = document.getElementById('total-tools');
    const showingCountSpan = document.getElementById('showing-count');
    const totalCountSpan = document.getElementById('total-count');

    let allTools = [];

    // Get badge class
    function getBadgeClass(badge) {
        const badgeLower = badge.toLowerCase();
        if (badgeLower.includes('free') || badgeLower.includes('open source')) {
            return 'bg-green-500/20 text-green-400 border-green-500';
        } else if (badgeLower.includes('paid')) {
            return 'bg-yellow-500/20 text-yellow-400 border-yellow-500';
        } else if (badgeLower.includes('industry standard')) {
            return 'bg-blue-500/20 text-blue-400 border-blue-500';
        } else if (badgeLower.includes('online')) {
            return 'bg-purple-500/20 text-purple-400 border-purple-500';
        }
        return 'bg-b-primary/20 text-b-hl-medium border-b-primary';
    }

    // Get category icon
    function getCategoryIcon(category) {
        const icons = {
            'أساسيات ومحاكاة': '<i class="fas fa-cube fa-lg text-b-hl-green"></i>',
            'كتابة ومحاكاة HDL': '<i class="fas fa-code fa-lg text-b-hl-yellow"></i>',
            'أدوات FPGA': '<i class="fas fa-microchip fa-lg text-b-hl-light"></i>',
            'أدوات التصنيع (ASIC)': '<i class="fas fa-industry fa-lg text-purple-400"></i>',
            'أدوات التحقق (Verification)': '<i class="fas fa-check-circle fa-lg text-blue-400"></i>',
            'أدوات مساعدة': '<i class="fas fa-tools fa-lg text-orange-400"></i>'
        };
        return icons[category] || '<i class="fas fa-wrench fa-lg text-gray-400"></i>';
    }

    // Render tools
    function renderTools(tools) {
        grid.innerHTML = '';

        if (tools.length === 0) {
            noResults.classList.remove('hidden');
            showingCountSpan.textContent = '0';
            return;
        }

        noResults.classList.add('hidden');
        showingCountSpan.textContent = tools.length;
        
        tools.forEach((tool, index) => {
            const card = document.createElement('div');
            card.className = 'resource-card bg-b-surface p-6 rounded-2xl border border-b-border shadow-lg card-hover-effect cursor-pointer flex flex-col justify-between animate-slide-in-up';
            card.style.animationDelay = `${index * 0.05}s`;

            const badgesHtml = tool.badges.slice(0, 2).map(badge => 
                `<span class="text-xs font-medium rounded-full px-3 py-1 border ${getBadgeClass(badge)}">${badge}</span>`
            ).join(' ');

            const moreBadgesHtml = tool.badges.length > 2 
                ? `<span class="text-xs font-medium bg-b-border text-gray-400 rounded-full px-3 py-1">+${tool.badges.length - 2}</span>` 
                : '';

            card.innerHTML = `
                <div>
                    <div class="flex justify-between items-start mb-4">
                        <span class="text-3xl">${getCategoryIcon(tool.category)}</span>
                        <span class="text-xs bg-b-primary text-white px-3 py-1 rounded-full">${tool.level}</span>
                    </div>
                    <h3 class="text-xl font-bold text-b-text mb-2 hover:text-b-hl-medium transition-colors">${tool.name}</h3>
                    <p class="text-md text-gray-300 line-clamp-2 mb-4">${tool.description}</p>
                </div>
                <div>
                    <div class="flex flex-wrap gap-2 mb-4">
                        ${badgesHtml}
                        ${moreBadgesHtml}
                    </div>
                    <button class="w-full py-2 bg-b-primary text-white rounded-lg hover:bg-b-hl-medium hover:text-black transition-all font-semibold">
                        <i class="fas fa-info-circle ml-1"></i>
                        عرض التفاصيل
                    </button>
                </div>
            `;
            
            card.addEventListener('click', () => openToolModal(tool));
            grid.appendChild(card);
        });
    }

    // Open modal
    function openToolModal(tool) {
        modalTitle.textContent = tool.name;
        modalLevel.textContent = tool.level;
        modalCategory.textContent = tool.category;
        modalDescription.textContent = tool.description;
        modalGuidance.textContent = tool.guidance;

        // Badges
        modalBadges.innerHTML = tool.badges.map(badge => 
            `<span class="text-sm font-medium rounded-full px-4 py-2 border ${getBadgeClass(badge)}">${badge}</span>`
        ).join(' ');

        // Usage
        if (tool.usage) {
            modalUsage.textContent = tool.usage;
            modalUsageSection.classList.remove('hidden');
        } else {
            modalUsageSection.classList.add('hidden');
        }

        // Pros
        if (tool.pros && tool.pros.length > 0) {
            modalPros.innerHTML = tool.pros.map(pro => `
                <li class="flex items-start text-gray-300 text-lg">
                    <i class="fas fa-check-circle text-green-400 mt-1 ml-2 flex-shrink-0"></i>
                    <span>${pro}</span>
                </li>
            `).join('');
            modalProsSection.classList.remove('hidden');
        } else {
            modalProsSection.classList.add('hidden');
        }

        // Cons
        if (tool.cons && tool.cons.length > 0) {
            modalCons.innerHTML = tool.cons.map(con => `
                <li class="flex items-start text-gray-300 text-lg">
                    <i class="fas fa-minus-circle text-yellow-400 mt-1 ml-2 flex-shrink-0"></i>
                    <span>${con}</span>
                </li>
            `).join('');
            modalConsSection.classList.remove('hidden');
        } else {
            modalConsSection.classList.add('hidden');
        }

        // Alternatives
        if (tool.alternatives) {
            modalAlternatives.textContent = tool.alternatives;
            modalAlternativesSection.classList.remove('hidden');
        } else {
            modalAlternativesSection.classList.add('hidden');
        }

        // System Requirements
        if (tool.systemRequirements) {
            modalSystem.textContent = tool.systemRequirements;
            modalSystemSection.classList.remove('hidden');
        } else {
            modalSystemSection.classList.add('hidden');
        }

        // URL
        modalUrl.href = tool.link;

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Scroll to top of modal
        const modalContent = document.getElementById('modal-content');
        if (modalContent) {
            modalContent.scrollTop = 0;
        }
    }

    // Close modal
    function closeToolModal() {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }

    // Apply filters
    function applyFilters() {
        const searchTerm = filterSearch.value.toLowerCase().trim();
        const category = filterCategory.value;
        const level = filterLevel.value;

        const filteredTools = allTools.filter(tool => {
            const levelMatch = (level === 'all') || (tool.level.includes(level));
            const categoryMatch = (category === 'all') || (tool.category === category);
            const searchMatch = (searchTerm === '') ||
                (tool.name.toLowerCase().includes(searchTerm)) ||
                (tool.description.toLowerCase().includes(searchTerm)) ||
                (tool.guidance.toLowerCase().includes(searchTerm)) ||
                (tool.badges.some(badge => badge.toLowerCase().includes(searchTerm)));

            return levelMatch && categoryMatch && searchMatch;
        });

        renderTools(filteredTools);
    }

    // Reset filters
    function resetFilters() {
        filterSearch.value = '';
        filterCategory.value = 'all';
        filterLevel.value = 'all';
        applyFilters();
    }

    // Load tools from JSON
    async function loadTools() {
        try {
            const response = await fetch('../data/tools_data.json');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            allTools = await response.json();
            
            // Populate category filter
            const categories = [...new Set(allTools.map(tool => tool.category))];
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                filterCategory.appendChild(option);
            });

            totalToolsSpan.textContent = allTools.length;
            totalCountSpan.textContent = allTools.length;
            applyFilters();
        } catch (error) {
            console.error("Fetch error: ", error);
            grid.innerHTML = '<p class="text-red-500 text-center col-span-full">فشل تحميل بيانات الأدوات. برجاء المحاولة لاحقاً.</p>';
        }
    }

    // Event listeners
    [filterSearch, filterCategory, filterLevel].forEach(element => {
        element.addEventListener('input', applyFilters);
    });

    resetFiltersBtn.addEventListener('click', resetFilters);
    clearSearchBtn.addEventListener('click', resetFilters);
    modalCloseBtn.addEventListener('click', closeToolModal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeToolModal();
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeToolModal();
        }
    });

    // Initialize
    initMobileMenu();
    loadTools();
});