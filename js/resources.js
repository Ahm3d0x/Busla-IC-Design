
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

        // Resources Page Logic
        document.addEventListener('DOMContentLoaded', () => {
            const grid = document.getElementById('resource-grid');
            const noResults = document.getElementById('no-results');
            
            const filterSearch = document.getElementById('filter-search');
            const filterStage = document.getElementById('filter-stage');
            const filterType = document.getElementById('filter-type');
            const filterTrack = document.getElementById('filter-track');
            const resetFiltersBtn = document.getElementById('reset-filters');
            const clearSearchBtn = document.getElementById('clear-search');
            
            const modal = document.getElementById('resource-modal');
            const modalCloseBtn = document.getElementById('modal-close-btn');
            const modalTitle = document.getElementById('modal-title');
            const modalAuthor = document.getElementById('modal-author');
            const modalLevel = document.getElementById('modal-level');
            const modalRoadmapStage = document.getElementById('modal-roadmap-stage');
            const modalSummary = document.getElementById('modal-summary');
            const modalFeatures = document.getElementById('modal-features');
            const modalUrl = document.getElementById('modal-url');
            const modalUrlSoon = document.getElementById('modal-url-soon');
            const modalContributorName = document.getElementById('modal-contributor-name');
            const modalContributorLinks = document.getElementById('modal-contributor-links');

            const totalResourcesSpan = document.getElementById('total-resources');
            const showingCountSpan = document.getElementById('showing-count');
            const totalCountSpan = document.getElementById('total-count');

            let allResources = [];

            // Get type icon
            function getTypeIcon(type) {
                const icons = {
                    'video': '<i class="fas fa-video fa-lg text-b-hl-medium"></i>',
                    'book': '<i class="fas fa-book fa-lg text-b-hl-green"></i>',
                    'article': '<i class="fas fa-file-alt fa-lg text-b-hl-yellow"></i>',
                    'project': '<i class="fas fa-code fa-lg text-b-hl-light"></i>',
                    'internship': '<i class="fas fa-briefcase fa-lg text-purple-400"></i>',
                    'diploma': '<i class="fas fa-graduation-cap fa-lg text-blue-400"></i>',
                    'resource': '<i class="fas fa-folder fa-lg text-orange-400"></i>',
                    'community': '<i class="fas fa-users fa-lg text-pink-400"></i>'
                };
                return icons[type] || '<i class="fas fa-link fa-lg text-gray-400"></i>';
            }

            // Get type label
            function getTypeLabel(type) {
                const labels = {
                    'video': 'كورس فيديو',
                    'book': 'كتاب',
                    'article': 'مقال',
                    'project': 'مشروع',
                    'internship': 'تدريب',
                    'diploma': 'دبلومة',
                    'resource': 'مصدر',
                    'community': 'مجتمع'
                };
                return labels[type] || type;
            }

            // Render resources
            function renderResources(resources) {
                grid.innerHTML = '';

                if (resources.length === 0) {
                    noResults.classList.remove('hidden');
                    showingCountSpan.textContent = '0';
                    return;
                }

                noResults.classList.add('hidden');
                showingCountSpan.textContent = resources.length;
                
                resources.forEach((resource, index) => {
                    const card = document.createElement('div');
                    card.className = 'resource-card bg-b-surface p-6 rounded-2xl border border-b-border shadow-lg card-hover-effect cursor-pointer flex flex-col justify-between animate-slide-in-up';
                    card.style.animationDelay = `${index * 0.05}s`;

                    card.dataset.resource = JSON.stringify(resource);

                    const tagsHtml = resource.tags.slice(0, 3).map(tag => 
                        `<span class="badge text-xs font-medium bg-b-bg text-b-hl-medium rounded-full px-3 py-1">${tag}</span>`
                    ).join(' ');

                    const moreTagsHtml = resource.tags.length > 3 
                        ? `<span class="badge text-xs font-medium bg-b-border text-gray-400 rounded-full px-3 py-1">+${resource.tags.length - 3}</span>` 
                        : '';

                    card.innerHTML = `
                        <div>
                            <div class="flex justify-between items-start mb-4">
                                <span class="text-3xl">${getTypeIcon(resource.type)}</span>
                                <span class="text-xs bg-b-primary text-white px-3 py-1 rounded-full">${getTypeLabel(resource.type)}</span>
                            </div>
                            <h3 class="text-xl font-bold text-b-text mb-2 hover:text-b-hl-medium transition-colors">${resource.title}</h3>
                            <p class="text-sm text-gray-400 mb-3 flex items-center">
                                <i class="fas fa-user text-xs ml-1"></i>
                                ${resource.author}
                            </p>
                            <p class="text-md text-gray-300 line-clamp-2 mb-4">${resource.description}</p>
                        </div>
                        <div>
                            <div class="flex flex-wrap gap-2 mb-4">
                                ${tagsHtml}
                                ${moreTagsHtml}
                            </div>
                            <button class="w-full py-2 bg-b-primary text-white rounded-lg hover:bg-b-hl-medium hover:text-black transition-all font-semibold">
                                <i class="fas fa-info-circle ml-1"></i>
                                عرض التفاصيل
                            </button>
                        </div>
                    `;
                    
                    card.addEventListener('click', () => openResourceModal(resource));
                    grid.appendChild(card);
                });
            }

            // Open modal
            function openResourceModal(resource) {
                modalTitle.textContent = resource.title;
                modalAuthor.textContent = resource.author;
                modalLevel.textContent = resource.details.level;
                modalRoadmapStage.textContent = resource.details.roadmap;
                modalSummary.textContent = resource.details.summary;

                modalFeatures.innerHTML = '';
                resource.details.features.forEach(feature => {
                    const li = document.createElement('li');
                    li.className = 'flex items-start text-gray-300 text-lg';
                    li.innerHTML = `
                        <i class="fas fa-check-circle text-b-hl-medium mt-1 ml-2 flex-shrink-0"></i>
                        <span>${feature}</span>
                    `;
                    modalFeatures.appendChild(li);
                });

                if (resource.details.url && resource.details.url !== 'null') {
                    modalUrl.href = resource.details.url;
                    modalUrl.classList.remove('hidden');
                    modalUrlSoon.classList.add('hidden');
                } else {
                    modalUrl.classList.add('hidden');
                    modalUrlSoon.classList.remove('hidden');
                }

                modalContributorName.textContent = resource.contributor.name || 'مساهم غير معروف';
                
                modalContributorLinks.innerHTML = '';
                if (resource.contributor.linkedin && resource.contributor.linkedin !== 'null') {
                    modalContributorLinks.innerHTML += `
                        <a href="${resource.contributor.linkedin}" target="_blank" rel="noopener noreferrer" 
                           class="text-gray-400 hover:text-b-primary transition-all hover:scale-110">
                            <i class="fab fa-linkedin fa-2x"></i>
                        </a>`;
                }
                if (resource.contributor.github && resource.contributor.github !== 'null') {
                    modalContributorLinks.innerHTML += `
                        <a href="${resource.contributor.github}" target="_blank" rel="noopener noreferrer" 
                           class="text-gray-400 hover:text-b-primary transition-all hover:scale-110">
                            <i class="fab fa-github fa-2x"></i>
                        </a>`;
                }
                if (resource.contributor.email && resource.contributor.email !== 'null') {
                    modalContributorLinks.innerHTML += `
                        <a href="mailto:${resource.contributor.email}" 
                           class="text-gray-400 hover:text-b-primary transition-all hover:scale-110">
                            <i class="fas fa-envelope fa-2x"></i>
                        </a>`;
                }

                modal.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            }

            // Close modal
            function closeResourceModal() {
                modal.classList.add('hidden');
                document.body.style.overflow = 'auto';
            }

            // Apply filters
            function applyFilters() {
                const searchTerm = filterSearch.value.toLowerCase().trim();
                const stage = filterStage.value;
                const type = filterType.value;
                const track = filterTrack.value;

                const filteredResources = allResources.filter(resource => {
                    const stageMatch = (stage === 'all') || (resource.stage === stage);
                    const typeMatch = (type === 'all') || (resource.type === type);
                    const trackMatch = (track === 'all') || (resource.track === track);
                    const searchMatch = (searchTerm === '') ||
                        (resource.title.toLowerCase().includes(searchTerm)) ||
                        (resource.author.toLowerCase().includes(searchTerm)) ||
                        (resource.description.toLowerCase().includes(searchTerm)) ||
                        (resource.tags.some(tag => tag.toLowerCase().includes(searchTerm)));

                    return stageMatch && typeMatch && trackMatch && searchMatch;
                });

                renderResources(filteredResources);
            }

            // Reset filters
            function resetFilters() {
                filterSearch.value = '';
                filterStage.value = 'all';
                filterType.value = 'all';
                filterTrack.value = 'all';
                applyFilters();
            }

            // Load resources from JSON
            async function loadResources() {
                try {
                    // Using the JSON data from the previous response
                    const response = await fetch('../data/resources-data.json');
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    allResources = await response.json();
                    totalResourcesSpan.textContent = allResources.length;
                    totalCountSpan.textContent = allResources.length;
                    applyFilters();
                } catch (error) {
                    console.error("Fetch error: ", error);
                    
                    // Fallback: Use inline sample data for demo
                    allResources = [
                        {
                            "id": "res001",
                            "title": "كورس Verilog - Anas Verilog",
                            "author": "Anas Verilog",
                            "description": "كورس شامل يبدأ من الصفر في لغة Verilog، يركز على التطبيق العملي باستخدام Vivado ويغطي أساسيات الـ FPGA Flow.",
                            "type": "video",
                            "tags": ["Verilog", "FPGA", "عربي", "مبتدئ", "Vivado"],
                            "stage": "stage1",
                            "track": "fpga",
                            "details": {
                                "level": "مبتدئ",
                                "roadmap": "المرحلة الأولى: الأساسيات",
                                "summary": "الأفضل للمبتدئين باللغة العربية. يشرح الدكتور أناس لغة Verilog بطريقة عملية باستخدام برنامج Vivado، ويغطي Flow الـ FPGA بشكل كامل.",
                                "features": [
                                    "شرح كامل لـ FPGA Flow",
                                    "مشاريع عملية كثيرة يمكن إضافتها للـ CV",
                                    "يستخدم Vivado في الشرح",
                                    "مناسب جداً للمبتدئين"
                                ],
                                "url": "https://www.youtube.com/playlist?list=PLMSpr7v8N3uwTdb8RSLu3f7BhCRcpsz4r"
                            },
                            "contributor": {
                                "name": "Yousef Sherif",
                                "linkedin": "https://www.linkedin.com/in/yousef-sherif-6343b219b/",
                                "github": null,
                                "email": "shirefy49@gmail.com"
                            }
                        },
                        {
                            "id": "res002",
                            "title": "Digital VLSI Design Course - Adam Teman",
                            "author": "Adam Teman",
                            "description": "كورس شامل يغطي ASIC Flow بالتفصيل مع التركيز على RTL Design و Physical Design.",
                            "type": "video",
                            "tags": ["ASIC", "RTL", "Physical Design", "STA", "English"],
                            "stage": "stage1",
                            "track": "design",
                            "details": {
                                "level": "متوسط إلى متقدم",
                                "roadmap": "المرحلة الأولى والثانية",
                                "summary": "كورس ممتاز من جامعة إسرائيلية يشرح ASIC Flow بشكل كامل، من RTL حتى Physical Design. يتميز بشرح عملي وواقعي.",
                                "features": [
                                    "يمشي معك في ASIC Flow كاملاً",
                                    "شرح ممتاز لـ STA في المحاضرة رقم 5",
                                    "فيديو مهم عن How to write Synthesizeable RTL",
                                    "يتكلم عن Conventions مهمة لكتابة Clean Code"
                                ],
                                "url": "https://www.youtube.com/playlist?list=PLMSpr7v8N3uwTdb8RSLu3f7BhCRcpsz4r"
                            },
                            "contributor": {
                                "name": "Yousef Sherif",
                                "linkedin": "https://www.linkedin.com/in/yousef-sherif-6343b219b/",
                                "github": null,
                                "email": "shirefy49@gmail.com"
                            }
                        },
                        {
                            "id": "book001",
                            "title": "Principles of Digital RTL Design",
                            "author": "Multiple Authors",
                            "description": "كتاب أساسي يغطي أساسيات Digital Design و RTL و STA و Power Reduction و DFT.",
                            "type": "book",
                            "tags": ["RTL", "STA", "Power", "DFT", "كتاب"],
                            "stage": "stage1",
                            "track": "design",
                            "details": {
                                "level": "متوسط إلى متقدم",
                                "roadmap": "جميع المراحل - مرجع أساسي",
                                "summary": "كتاب ممتاز جداً ومهم للمجال. يغطي أساسيات كثيرة ويشرح STA و Power Reduction Techniques و DFT بشكل ممتاز.",
                                "features": [
                                    "يشرح أساسيات المجال",
                                    "فصول ممتازة عن STA",
                                    "يغطي Power Reduction Techniques",
                                    "يشرح DFT",
                                    "مرجع أساسي يجب العودة إليه"
                                ],
                                "url": null
                            },
                            "contributor": {
                                "name": "Yousef Sherif",
                                "linkedin": "https://www.linkedin.com/in/yousef-sherif-6343b219b/",
                                "github": null,
                                "email": "shirefy49@gmail.com"
                            }
                        }
                    ];
                    
                    totalResourcesSpan.textContent = allResources.length;
                    totalCountSpan.textContent = allResources.length;
                    applyFilters();
                }
            }

            // Event listeners
            [filterSearch, filterStage, filterType, filterTrack].forEach(element => {
                element.addEventListener('input', applyFilters);
            });

            resetFiltersBtn.addEventListener('click', resetFilters);
            clearSearchBtn.addEventListener('click', resetFilters);
            modalCloseBtn.addEventListener('click', closeResourceModal);
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeResourceModal();
                }
            });
            
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                    closeResourceModal();
                }
            });

            // Initialize
            initMobileMenu();
            loadResources();
        });
