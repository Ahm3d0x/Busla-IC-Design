let aboutData = null;
let allPeopleData = {};
let currentLang = localStorage.getItem('busla_lang') || 'ar'; // Default language

// UI Translations
const translations = {
    ar: {
        page_title: "عن موقع بوصلة",
        nav_home: "الرئيسية",
        nav_roadmap: "خريطة الطريق",
        nav_resources: "المصادر",
        nav_tools: "الأدوات",
        nav_experts: "نصائح الخبراء",
        nav_about: "عن الموقع",
        logo: "بوصلة",
        
        hero_title: "عن بوصلة",
        hero_text_1: "في عالم الـ",
        hero_text_2: "، المعلومة موجودة لكنها مبعثرة.",
        hero_desc: "وُجد ليكون المرشد. هدفنا ليس فقط تجميع المصادر، بل تنظيمها في مسار واضح، خطوة بخطوة، يبدأ معك من الصفر ويأخذ بيدك حتى تصل إلى مستوى متقدم يمكنك من بناء مشاريع حقيقية.",
        
        creator_title: "منشئ الموقع",
        creator_subtitle: "العقل المدبر وراء بوصلة",
        
        team_title: "فريق العمل",
        team_subtitle: "الأشخاص الذين ساهموا في بناء وإثراء محتوى بوصلة",
        
        experts_title: "شكر خاص للأساتذة والخبراء",
        experts_subtitle: "الذين قدموا علمهم وخبرتهم لإثراء المجتمع التعليمي",
        
        thanks_title: "شكر وتقدير",
        thanks_msg_1: "هذا العمل لم يكن ليظهر للنور لولا فضل الله أولاً، ثم جهود ومساهمات كل شخص مذكور في هذه الصفحة.",
        thanks_msg_2: "كل الشكر والتقدير لكل من ساهم بوقته، معرفته، أو حتى بكلمة تشجيعية.",
        thanks_msg_3: "بوصلة هو نتاج جهد جماعي نأمل أن يكون علماً ينتفع به",
        
        footer_love: "صُنع بكل حب لمساعدة الطلاب",
        footer_rights: "منصة بوصلة | تم إنشاؤه بواسطة",
        
        btn_details: "عرض التفاصيل",
        label_bio: "نبذة:",
        label_role: "دوره في الموقع:",
        lang_btn_text: "English"
    },
    en: {
        page_title: "About Busla",
        nav_home: "Home",
        nav_roadmap: "Roadmap",
        nav_resources: "Resources",
        nav_tools: "Tools",
        nav_experts: "Expert Tips",
        nav_about: "About",
        logo: "Busla",
        
        hero_title: "About Busla",
        hero_text_1: "In the world of",
        hero_text_2: ", information exists but is scattered.",
        hero_desc: "Is here to be the guide. Our goal is not just to collect resources, but to organize them into a clear path, step by step, starting with you from scratch and taking you to an advanced level where you can build real projects.",
        
        creator_title: "Creator",
        creator_subtitle: "The mastermind behind Busla",
        
        team_title: "The Team",
        team_subtitle: "People who contributed to building and enriching Busla content",
        
        experts_title: "Special Thanks to Professors & Experts",
        experts_subtitle: "Who shared their knowledge and experience to enrich the educational community",
        
        thanks_title: "Acknowledgments",
        thanks_msg_1: "This work would not have come to light without the grace of God first, and then the efforts and contributions of every person mentioned on this page.",
        thanks_msg_2: "All thanks and appreciation to everyone who contributed their time, knowledge, or even a word of encouragement.",
        thanks_msg_3: "Busla is the result of a collective effort, we hope it will be beneficial knowledge",
        
        footer_love: "Made with love to help students",
        footer_rights: "Busla Platform | Created by",
        
        btn_details: "View Details",
        label_bio: "Bio:",
        label_role: "Role in Busla:",
        lang_btn_text: "عربي"
    }
};

// Helper to get text based on lang
function t(key) {
    return translations[currentLang][key] || key;
}

// Function to update static page content
function updatePageLanguage() {
    // Set Direction
    document.documentElement.setAttribute('dir', currentLang === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', currentLang);
    
    // Update Toggle Buttons Text
    const desktopBtn = document.getElementById('lang-toggle-desktop');
    const mobileBtn = document.getElementById('lang-toggle-mobile');
    
    if(desktopBtn) desktopBtn.textContent = translations[currentLang].lang_btn_text;
    if(mobileBtn) mobileBtn.textContent = currentLang === 'ar' ? 'EN' : 'عربي';

    // Update all elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            el.textContent = translations[currentLang][key];
        }
    });
    
    // Re-render dynamic content if data is loaded
    if (aboutData) {
        renderAllSections();
    }
}

// Switch Language
function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('busla_lang', currentLang);
    updatePageLanguage();
}

// Create person card
function createPersonCard(person, type = 'large') {
    // Get localized data safely
    const name = person.name[currentLang] || person.name.ar || person.name;
    const title = person.title[currentLang] || person.title.ar || person.title;
    
    if (type === 'expert') {
        return `
            <div class="expert-card cursor-pointer" data-person-id="${person.id}">
                <div class="bg-b-surface border border-b-border rounded-2xl p-4 hover:border-b-primary hover:shadow-2xl hover:shadow-b-primary/20 transition-all h-full">
                    <img class="w-20 h-20 rounded-full mx-auto object-cover border-3 border-b-border group-hover:border-b-hl-light transition-all shadow-lg mb-3" src="${person.imageUrl}" alt="${name}">
                    <h3 class="font-bold text-sm text-white text-center line-clamp-2 mb-2">${name}</h3>
                    <p class="text-xs text-gray-400 text-center line-clamp-2">${title}</p>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="card-hover cursor-pointer" data-person-id="${person.id}">
                <div class="gradient-border rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl h-full">
                    <div class="bg-b-surface p-8 text-center h-full flex flex-col">
                        <div class="relative inline-block mx-auto mb-6">
                            <img class="w-32 h-32 rounded-full object-cover border-4 border-b-border hover:border-b-hl-light transition-all shadow-lg" src="${person.imageUrl}" alt="${name}">
                            <div class="absolute -bottom-2 ${currentLang === 'ar' ? '-right-2' : '-left-2'} w-10 h-10 bg-b-primary rounded-full flex items-center justify-center border-4 border-b-surface">
                                <i data-feather="check" class="w-5 h-5 text-white"></i>
                            </div>
                        </div>
                        <h3 class="font-bold text-xl mb-2 text-white">${name}</h3>
                        <p class="text-sm text-b-hl-light mb-4 flex-grow">${title}</p>
                        <div class="mt-auto">
                            <span class="inline-flex items-center gap-2 text-sm text-b-primary hover:text-b-hl-light transition-colors bg-b-bg px-4 py-2 rounded-full">
                                <i data-feather="${currentLang === 'ar' ? 'arrow-left' : 'arrow-right'}" class="w-4 h-4"></i>
                                ${t('btn_details')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

// Populate modal
function populateModal(person) {
    const name = person.name[currentLang] || person.name.ar;
    const title = person.title[currentLang] || person.title.ar;
    const bio = person.bio[currentLang] || person.bio.ar;
    const role = person.role[currentLang] || person.role.ar;

    let socialsHtml = person.socials && person.socials.length > 0 
        ? '<div class="flex flex-wrap gap-3 justify-center mt-8">' +
          person.socials.map(social => `
            <a href="${social.url}" target="_blank" rel="noopener noreferrer" 
               class="inline-flex items-center gap-2 bg-gradient-to-r from-b-primary to-b-hl-light text-white py-3 px-6 rounded-xl font-semibold hover:shadow-xl transform hover:scale-105 transition-all duration-300">
                <i data-feather="external-link" class="w-4 h-4"></i>
                ${social.name}
            </a>
          `).join('') +
          '</div>'
        : '';

    document.getElementById('modal-body').innerHTML = `
        <div class="relative">
            <div class="flex justify-center mb-8">
                <div class="relative">
                    <img class="w-40 h-40 rounded-full object-cover border-4 border-b-primary shadow-2xl" src="${person.imageUrl}" alt="${name}">
                    <div class="absolute -bottom-3 ${currentLang === 'ar' ? '-right-3' : '-left-3'} w-12 h-12 bg-gradient-to-br from-b-primary to-b-hl-light rounded-full flex items-center justify-center border-4 border-b-surface shadow-xl">
                        <i data-feather="star" class="w-6 h-6 text-white"></i>
                    </div>
                </div>
            </div>
            
            <h2 class="text-4xl font-bold text-center mb-3 gradient-text">${name}</h2>
            <p class="text-xl text-center text-b-hl-light mb-8 font-semibold">${title}</p>
            
            <div class="space-y-6">
                <div class="gradient-border rounded-2xl p-1">
                    <div class="bg-b-bg rounded-2xl p-6">
                        <div class="flex items-start gap-3 mb-4">
                            <div class="w-10 h-10 bg-b-hl-green bg-opacity-20 rounded-xl flex items-center justify-center flex-shrink-0">
                                <i data-feather="user" class="w-5 h-5 text-b-hl-green"></i>
                            </div>
                            <div class="flex-grow ${currentLang === 'ar' ? 'text-right' : 'text-left'}">
                                <strong class="text-b-hl-green text-lg block mb-2">${t('label_bio')}</strong>
                                <p class="text-gray-300 leading-relaxed">${bio}</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="gradient-border rounded-2xl p-1">
                    <div class="bg-b-bg rounded-2xl p-6">
                        <div class="flex items-start gap-3 mb-4">
                            <div class="w-10 h-10 bg-b-hl-yellow bg-opacity-20 rounded-xl flex items-center justify-center flex-shrink-0">
                                <i data-feather="briefcase" class="w-5 h-5 text-b-hl-yellow"></i>
                            </div>
                            <div class="flex-grow ${currentLang === 'ar' ? 'text-right' : 'text-left'}">
                                <strong class="text-b-hl-yellow text-lg block mb-2">${t('label_role')}</strong>
                                <p class="text-gray-300 leading-relaxed">${role}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            ${socialsHtml}
        </div>
    `;
    
    // Update close button position based on lang (Handled in CSS via RTL/LTR support, but class manipulation is safe too)
    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) {
        if (currentLang === 'ar') {
            closeBtn.classList.remove('right-6');
            closeBtn.classList.add('left-6');
        } else {
            closeBtn.classList.remove('left-6');
            closeBtn.classList.add('right-6');
        }
    }

    feather.replace();
}

// Modal functions
function openModal() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
        overlay.classList.add('opacity-100');
        content.classList.add('scale-100');
        content.classList.remove('scale-95');
    }, 10);
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    overlay.classList.remove('opacity-100');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    
    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        document.body.style.overflow = '';
        document.getElementById('modal-body').innerHTML = '';
    }, 300);
}

function renderAllSections() {
    // Fill creator
    if (aboutData.creator && aboutData.creator.length > 0) {
        document.getElementById('creator-container').innerHTML = 
            aboutData.creator.map(person => createPersonCard(person, 'large')).join('');
    }

    // Fill contributors
    const allContributors = [...aboutData.mainContributor, ...aboutData.contributors];
    if (allContributors.length > 0) {
        document.getElementById('contributors-container').innerHTML = 
            allContributors.map(person => createPersonCard(person, 'large')).join('');
    }

    // Fill experts
    if (aboutData.experts && aboutData.experts.length > 0) {
        document.getElementById('experts-container').innerHTML = 
            aboutData.experts.map(person => createPersonCard(person, 'expert')).join('');
    }

    feather.replace();

    // Re-attach listeners
    document.querySelectorAll('[data-person-id]').forEach(card => {
        card.addEventListener('click', () => {
            const personId = card.dataset.personId;
            const personData = allPeopleData[personId];
            if (personData) {
                populateModal(personData);
                openModal();
            }
        });
    });
}

// Initialize page
async function initPage() {
    try {
        // Apply initial language settings immediately
        updatePageLanguage();

        // Fetch data from JSON file
        const response = await fetch('../data/about_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        aboutData = await response.json();

        // Combine all people data for easy lookup
        allPeopleData = {
            ...aboutData.creator.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}),
            ...aboutData.mainContributor.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}),
            ...aboutData.contributors.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}),
            ...aboutData.experts.reduce((acc, p) => ({ ...acc, [p.id]: p }), {})
        };
        
        renderAllSections();

    } catch (error) {
        console.error('Failed to fetch data:', error);
        // Error handling UI
    }
}

// Mobile menu
function initMobileMenu() {
    const menuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    const iconOpen = document.getElementById('icon-open');
    const iconClose = document.getElementById('icon-close');

    if (menuButton && mobileMenu) {
        menuButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            iconOpen.classList.toggle('hidden');
            iconClose.classList.toggle('hidden');
        });
    }
}

// Event listeners
document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// Lang toggle listeners
document.getElementById('lang-toggle-desktop')?.addEventListener('click', toggleLanguage);
document.getElementById('lang-toggle-mobile')?.addEventListener('click', toggleLanguage);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initPage();
    document.getElementById('current-year').textContent = new Date().getFullYear();
    feather.replace();
});