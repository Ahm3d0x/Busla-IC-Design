// Creates a resource link (clickable or disabled)
function createResourceLink(resource) {
    // Base styles for the card container
    const baseClasses = "resource-card block p-5 rounded-xl transition-all duration-300 ease-out bg-b-surface border border-b-border group";
    
    // Map resource types to icons
    const iconMap = {
        'video': 'play-circle',
        'website': 'globe',
        'book': 'book-open',
        'paper': 'file-text',
        'tool': 'tool',
        'notes': 'edit-3',
        'file': 'file',
        'diploma': 'award',
        'internship': 'briefcase',
        'advice': 'message-circle',
        'default': 'external-link'
    };
    
    const iconName = iconMap[resource.type] || iconMap['default'];
    
    // Generate Author Link HTML
    const authorLinkHTML = resource.authorLink 
        ? `<a href="${resource.authorLink}" target="_blank" rel="noopener noreferrer" class="text-b-primary hover:text-b-hl-light font-bold transition-colors">${resource.author}</a>`
        : `<strong class="text-white font-bold">${resource.author}</strong>`;

    // Generate Links Buttons HTML
    let linksHTML = '';
    // Check if the new 'links' array exists and has items
    const hasLinks = resource.links && Array.isArray(resource.links) && resource.links.length > 0;

    if (hasLinks) {
        linksHTML = `<div class="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-800">`;
        resource.links.forEach(linkObj => {
            // Fallback for title if missing
            const label = linkObj.title || "رابط";
            const url = linkObj.link;
            // Use specific icon for the sub-link if provided, otherwise based on type
            const type = linkObj.type || 'default';
            const subIcon = iconMap[type] || 'link';

            if (url) {
                linksHTML += `
                    <a href="${url}" target="_blank" rel="noopener noreferrer" 
                       class="flex items-center gap-2 px-4 py-2 rounded-lg bg-b-surface border border-b-border hover:border-b-primary hover:bg-b-primary hover:text-white text-sm font-medium text-gray-300 transition-all duration-200 shadow-sm hover:shadow-md">
                        <i data-feather="${subIcon}" class="w-4 h-4"></i>
                        <span>${label}</span>
                    </a>
                `;
            }
        });
        linksHTML += `</div>`;
    } else {
        // Case: No links available (Search placeholder or empty)
        linksHTML = `
            <div class="flex items-center gap-2 mt-4 pt-4 border-t border-gray-800">
                 <span class="text-b-hl-yellow text-xs flex items-center gap-1">
                    <i data-feather="search" class="w-3 h-3"></i>
                    (ابحث بالاسم)
                </span>
            </div>
        `;
    }

    // Card Opacity Logic
    const opacityClass = hasLinks ? "opacity-100 hover:shadow-xl hover:border-b-primary" : "opacity-70 cursor-not-allowed";

    return `
        <div class="${baseClasses} ${opacityClass}">
            <div class="flex items-start gap-4">
                <!-- Main Icon -->
                <div class="flex-shrink-0 w-12 h-12 bg-b-primary bg-opacity-10 rounded-lg flex items-center justify-center group-hover:bg-opacity-20 transition-all">
                    <i data-feather="${iconName}" class="w-6 h-6 text-b-primary"></i>
                </div>
                
                <!-- Content -->
                <div class="flex-grow min-w-0">
                    <div class="mb-2">${authorLinkHTML}</div>
                    <p class="text-sm text-gray-400 leading-relaxed">${resource.note || ''}</p>
                    ${linksHTML}
                </div>
            </div>
        </div>`;
}

// Creates guidance notes section
function createGuidanceNotes(guidance, title = "💡 نصيحة البوصلة", iconName = "lightbulb", borderColor = "border-b-primary") {
    if (!guidance || guidance.length === 0) return '';
    const guidanceArray = Array.isArray(guidance) ? guidance : [guidance];

    let guidanceHTML = `
        <div class="my-8 p-6 bg-b-surface bg-opacity-80 rounded-xl border-r-4 ${borderColor} shadow-lg">
            <h4 class="text-lg font-bold text-b-hl-light mb-5 flex items-center gap-3">
                <i data-feather="${iconName}" class="w-6 h-6"></i>
                <span>${title}</span>
            </h4>
            <ul class="space-y-4 text-gray-300">`;
    
    guidanceArray.forEach(note => {
        const formattedNote = note.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
        guidanceHTML += `
            <li class="flex items-start gap-3">
                <i data-feather="check-circle" class="w-5 h-5 text-b-hl-light mt-0.5 flex-shrink-0"></i>
                <span class="leading-relaxed">${formattedNote}</span>
            </li>`;
    });
    guidanceHTML += '</ul></div>';
    return guidanceHTML;
}

// Creates modules within a track
function createModules(modules) {
    if (!modules || modules.length === 0) return '<p class="text-gray-500 mr-6">لا توجد وحدات محددة لهذا المسار بعد.</p>';
    
    let modulesHTML = '<div class="space-y-12">';
    modules.forEach(module => {
        modulesHTML += `
            <div class="border-b border-b-border pb-12 last:border-b-0 last:pb-0">
                <div class="flex items-start gap-4 mb-6">
                    <div class="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-b-primary to-b-hl-light rounded-lg flex items-center justify-center">
                        <i data-feather="book-open" class="w-5 h-5 text-white"></i>
                    </div>
                    <div class="flex-grow">
                        <h4 class="text-xl font-bold text-white mb-2">${module.title}</h4>
                        ${module.time ? `
                        <div class="flex items-center text-sm text-gray-400 gap-2">
                            <i data-feather="clock" class="w-4 h-4"></i>
                            <span>المدة التقريبية: ${module.time}</span>
                        </div>` : ''}
                    </div>
                </div>
                
                ${module.topics ? `
                <div class="mr-14 mb-6 p-4 bg-b-surface bg-opacity-50 rounded-lg border border-b-border">
                    <strong class="text-gray-200 block mb-2 flex items-center gap-2">
                        <i data-feather="list" class="w-4 h-4 text-b-hl-light"></i>
                        المواضيع الرئيسية:
                    </strong>
                    <p class="text-gray-400 leading-relaxed">${module.topics}</p>
                </div>` : ''}
                
                ${createGuidanceNotes(module.guidance, "📍 إرشادات الوحدة", "navigation", "border-b-hl-light")}

                ${module.resources && module.resources.length > 0 ? `
                <div class="mr-14 mt-8">
                    <h5 class="text-lg font-bold text-gray-200 mb-5 flex items-center gap-3">
                        <i data-feather="link" class="w-5 h-5 text-b-hl-light"></i>
                        <span>المصادر الموصى بها</span>
                        <span class="text-xs font-normal text-gray-500 bg-b-surface px-3 py-1 rounded-full">${module.resources.length} مصدر</span>
                    </h5>
                    <div class="space-y-4">
                        ${module.resources.map(createResourceLink).join('')}
                    </div>
                </div>` : ''}
            </div>
        `;
    });
    modulesHTML += '</div>';
    return modulesHTML;
}

// Creates tracks within a phase
function createTracks(tracks) {
    if (!tracks || tracks.length === 0) return '<p class="text-gray-500 text-center py-8">لا توجد مسارات محددة لهذه المرحلة بعد.</p>';
    
    let tracksHTML = '<div class="space-y-10">';
    tracks.forEach((track, index) => {
        const parallelText = track.parallelWith ? `<span class="text-sm text-gray-400 font-normal mr-3 bg-b-surface px-3 py-1 rounded-full">بالتوازي مع ${track.parallelWith}</span>` : '';
        
        tracksHTML += `
            <div class="border border-b-border rounded-2xl p-8 bg-b-surface shadow-2xl hover:shadow-b-primary/20 transition-all duration-300 hover:border-b-primary">
                <div class="flex flex-wrap items-center gap-3 mb-8 pb-6 border-b border-b-border">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-gradient-to-br from-b-primary to-b-hl-light rounded-lg flex items-center justify-center">
                            <i data-feather="git-branch" class="w-6 h-6 text-white"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-white">${track.title}</h3>
                    </div>
                    ${parallelText}
                </div>
                ${createModules(track.modules)}
            </div>
        `;
    });
    tracksHTML += '</div>';
    return tracksHTML;
}

// Fetches data and renders the roadmap
async function renderRoadmap() {
    const container = document.getElementById('roadmap-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    if (!container || !loadingIndicator) return;

    try {
        // Fetch from the local JSON file
        const response = await fetch('../data/roadmap-data.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const roadmapData = await response.json();

        loadingIndicator.remove();

        roadmapData.forEach((phase, index) => {
            const staggerClass = `stagger-${Math.min(index + 1, 4)}`;
            const phaseColors = [
                { bg: 'from-b-primary/10 via-b-primary/5 to-transparent', border: 'border-b-primary', badge: 'bg-b-primary', icon: 'compass' },
                { bg: 'from-b-hl-light/10 via-b-hl-light/5 to-transparent', border: 'border-b-hl-light', badge: 'bg-b-hl-light', icon: 'layers' },
                { bg: 'from-b-hl-green/10 via-b-hl-green/5 to-transparent', border: 'border-b-hl-green', badge: 'bg-b-hl-medium', icon: 'zap' },
                { bg: 'from-b-hl-yellow/10 via-b-hl-yellow/5 to-transparent', border: 'border-b-hl-yellow', badge: 'bg-b-primary', icon: 'award' }
            ];
            const colors = phaseColors[index % phaseColors.length];
            
            const phaseHTML = `
                <div class="bg-b-surface border border-b-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up ${staggerClass} hover:shadow-b-primary/20 transition-all duration-300 hover:border-b-primary">
                    <button class="accordion-button w-full flex justify-between items-center p-8 text-right cursor-pointer hover:bg-gradient-to-r ${colors.bg} transition-all duration-300 group" data-target="#content-${phase.id}">
                        <div class="flex items-start gap-5 flex-grow">
                            <div class="flex-shrink-0">
                                <div class="w-14 h-14 ${colors.badge} rounded-xl flex items-center justify-center shadow-lg">
                                    <span class="text-2xl font-bold text-white">${index + 1}</span>
                                </div>
                            </div>
                            <div class="text-right flex-grow">
                                <h3 class="text-2xl md:text-3xl font-bold text-white mb-3 group-hover:text-b-hl-light transition-colors">${phase.title}</h3>
                                <div class="flex items-center gap-2 text-sm">
                                    <i data-feather="calendar" class="w-4 h-4 text-b-hl-light"></i>
                                    <span class="text-b-hl-light font-semibold">${phase.duration}</span>
                                </div>
                            </div>
                        </div>
                        <span class="accordion-icon mr-4 text-gray-400 group-hover:text-b-hl-light transition-colors flex-shrink-0">
                            <i data-feather="chevron-down" class="w-7 h-7"></i>
                        </span>
                    </button>
                    
                    <div id="content-${phase.id}" class="accordion-content px-8 md:px-10">
                        <div class="border-t border-b-border pt-8">
                            <div class="mb-8 p-6 bg-gradient-to-br ${colors.bg} rounded-xl border ${colors.border} border-opacity-30">
                                <div class="flex items-start gap-3">
                                    <i data-feather="info" class="w-6 h-6 text-b-hl-light flex-shrink-0 mt-1"></i>
                                    <p class="text-lg text-gray-300 leading-relaxed">${phase.description}</p>
                                </div>
                            </div>
                            
                            ${createGuidanceNotes(phase.guidance, "🎯 إرشادات المرحلة", "target", colors.border)}
                            
                            <div class="mt-10">
                                ${createTracks(phase.tracks)}
                            </div>
                        </div>
                    </div>
                </div>`;
            container.innerHTML += phaseHTML;
        });

        feather.replace();
        initAccordion(roadmapData.length > 0 ? `content-${roadmapData[0].id}` : null);

    } catch (error) {
        console.error("Failed to load or render roadmap data:", error);
        if (loadingIndicator) loadingIndicator.remove();
        container.innerHTML = `
            <div class="text-center py-20 px-4">
                <div class="inline-block mb-6">
                    <i data-feather="alert-circle" class="w-20 h-20 text-red-400 mx-auto"></i>
                </div>
                <h3 class="text-2xl font-bold text-red-400 mb-4">⛔ حدث خطأ أثناء تحميل خريطة الطريق</h3>
                <p class="text-gray-500 mb-4">الرجاء التأكد من وجود ملف <code class="bg-b-surface px-2 py-1 rounded text-sm text-b-primary">roadmap-data.json</code> في المسار الصحيح.</p>
                <button onclick="location.reload()" class="mt-4 px-6 py-3 bg-b-primary hover:bg-b-hl-light text-white rounded-lg transition-colors font-semibold">
                    إعادة المحاولة
                </button>
            </div>`;
        feather.replace();
    }
}

// Initializes accordion functionality
function initAccordion(firstContentId = null) {
    const buttons = document.querySelectorAll('.accordion-button');
    buttons.forEach(button => {
        const targetID = button.getAttribute('data-target');
        const content = document.querySelector(targetID);

        if (!content) return;

        button.addEventListener('click', () => {
            const isOpen = content.classList.contains('open');
            
            // Close all other accordions
            document.querySelectorAll('.accordion-content.open').forEach(openContent => {
                if (`#${openContent.id}` !== targetID) {
                    openContent.classList.remove('open');
                    const correspondingButton = document.querySelector(`[data-target="#${openContent.id}"]`);
                    if (correspondingButton) {
                        correspondingButton.classList.remove('open');
                    }
                }
            });

            // Toggle current accordion
            button.classList.toggle('open', !isOpen);
            content.classList.toggle('open', !isOpen);
            
            // Smooth scroll to accordion if opening
            if (!isOpen) {
                setTimeout(() => {
                    button.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
            }
        });
    });

    // Open first accordion by default
    if (firstContentId) {
        const firstButton = document.querySelector(`[data-target="#${firstContentId}"]`);
        const firstContent = document.getElementById(firstContentId);

        if (firstButton && firstContent) {
            setTimeout(() => {
                if (!firstContent.classList.contains('open')) {
                    firstButton.classList.add('open');
                    firstContent.classList.add('open');
                    feather.replace();
                }
            }, 300);
        }
    }
}

// Mobile Menu Toggle Logic
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

// --- Run on DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
     feather.replace(); 
     initMobileMenu(); 
     renderRoadmap(); 
});