import { auth, db, doc, getDoc, runTransaction, serverTimestamp } from './firebase-config.js';
import { RANKS_DATA } from './badges-data.js';

// ==========================================
// 1. INJECT CUSTOM STYLES & ANIMATIONS
// ==========================================
const style = document.createElement('style');
style.innerHTML = `
    @keyframes float-slow {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
    }
    @keyframes energy-flow {
        0% { background-position: 0% 0%; }
        100% { background-position: 0% 200%; }
    }
    @keyframes reveal-up {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse-glow {
        0%, 100% { opacity: 0.5; transform: scale(1); }
        50% { opacity: 0.8; transform: scale(1.1); }
    }
    .card-spotlight {
        background: radial-gradient(
            600px circle at var(--mouse-x) var(--mouse-y),
            rgba(255, 255, 255, 0.06),
            transparent 40%
        );
    }
    .energy-line {
        background: linear-gradient(to bottom, transparent, var(--rank-color, #006A67), transparent);
        background-size: 100% 200%;
        animation: energy-flow 3s linear infinite;
    }
    .reveal-element {
        opacity: 0;
        transition: all 0.8s cubic-bezier(0.17, 0.55, 0.55, 1);
    }
    .reveal-visible {
        opacity: 1;
        transform: translateY(0);
    }
    .particle {
        position: absolute;
        background: white;
        border-radius: 50%;
        pointer-events: none;
        opacity: 0;
    }
`;
document.head.appendChild(style);

// ==========================================
// 2. UI HELPERS (TOASTS & MODALS)
// ==========================================

// Helper to show custom toasts (No browser alerts)
function showCustomToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const borderCol = type === 'success' ? 'border-green-500/50' : 'border-red-500/50';
    const textCol = type === 'success' ? 'text-green-400' : 'text-red-400';
    
    toast.className = `flex items-center gap-3 px-6 py-4 rounded-xl border ${borderCol} bg-black/80 backdrop-blur-md shadow-2xl animate-slide-in min-w-[300px] z-[9999]`;
    toast.innerHTML = `<i class="fas fa-info-circle ${textCol}"></i><span class="text-white font-bold text-sm">${msg}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// Logic to handle the Rank Up Modal
function triggerRankUpModal(newRankKey) {
    const modal = document.getElementById('rank-up-modal');
    const card = document.getElementById('rank-up-card');
    const img = document.getElementById('rank-up-img');
    const title = document.getElementById('rank-up-name');
    
    const rankData = RANKS_DATA.find(r => r.key === newRankKey);
    if (!rankData || !modal) return;

    img.src = `../assets/user-badge/lv${rankData.level}.png`;
    title.innerText = rankData.title;
    title.style.color = rankData.stage_color;

    modal.classList.remove('hidden');
    setTimeout(() => {
        card.classList.remove('scale-90', 'opacity-0');
        card.classList.add('scale-100', 'opacity-100');
    }, 50);
}

window.closeRankUpModal = () => {
    const modal = document.getElementById('rank-up-modal');
    const card = document.getElementById('rank-up-card');
    card.classList.add('scale-90', 'opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 500);
};

// ==========================================
// 3. MAIN BADGES UI RENDERER
// ==========================================

export async function initBadgesSystem() {
    const container = document.getElementById('rank-container');
    if (!container) return; 

    // Cinematic Loading
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-32 space-y-4">
            <div class="relative w-16 h-16">
                <div class="absolute inset-0 border-t-4 border-b-primary rounded-full animate-spin"></div>
                <div class="absolute inset-0 border-b-4 border-b-primary/30 rounded-full animate-pulse"></div>
            </div>
            <p class="text-gray-500 text-sm tracking-[0.2em] animate-pulse">LOADING PROFILE DATA...</p>
        </div>
    `;

    const user = auth.currentUser;
    if (!user) return;

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        const currentPoints = userData.gamification?.total_points || 0;

        let currentRankIndex = 0;
        for (let i = 0; i < RANKS_DATA.length; i++) {
            if (currentPoints >= RANKS_DATA[i].points_required) {
                currentRankIndex = i;
            } else {
                break;
            }
        }

        const currentRank = RANKS_DATA[currentRankIndex];
        const nextRank = RANKS_DATA[currentRankIndex + 1] || null;

        renderCinematicPage(container, currentRank, nextRank, currentPoints, currentRankIndex);
        initVisualEffects();

    } catch (error) {
        console.error("Badges Error:", error);
        container.innerHTML = `<div class="text-red-500 text-center py-20 border border-red-500/20 rounded-xl bg-red-900/10">فشل تحميل البيانات</div>`;
    }
}

function renderCinematicPage(container, currentRank, nextRank, points, currentIndex) {
    let progressPercent = 100;
    let pointsNeeded = 0;
    
    if (nextRank) {
        const range = nextRank.points_required - currentRank.points_required;
        const gained = points - currentRank.points_required;
        progressPercent = Math.min(100, Math.max(0, (gained / range) * 100));
        pointsNeeded = nextRank.points_required - points;
    }

    const currentImgUrl = `../assets/user-badge/lv${currentRank.level}.png`;

    container.innerHTML = `
        <div class="relative w-full mb-24 perspective-1000 group">
            
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[${currentRank.stage_color}] blur-[180px] opacity-10 pointer-events-none transition-opacity duration-700 group-hover:opacity-20"></div>
            
            <div id="hero-card" class="relative bg-black/40 border border-white/10 backdrop-blur-xl rounded-[3rem] p-10 overflow-hidden shadow-2xl transition-transform duration-100 ease-out">
                
                <div id="particles-container" class="absolute inset-0 pointer-events-none"></div>

                <div class="card-spotlight absolute inset-0 pointer-events-none z-20"></div>

                <div class="relative z-30 flex flex-col items-center">
                    
                    <div id="hero-badge" class="relative w-64 h-64 mb-8 transition-transform duration-200 ease-out cursor-pointer" style="animation: float-slow 6s ease-in-out infinite;">
                        <div class="absolute inset-0 rounded-full bg-[${currentRank.stage_color}] blur-2xl opacity-40 animate-pulse"></div>
                        
                        <div class="relative w-full h-full rounded-[12%] overflow-hidden border-4 shadow-2xl" style="border-color: ${currentRank.stage_color}">
                            <img src="${currentImgUrl}" 
                                 class="w-full h-full object-cover"
                                 alt="${currentRank.title}"
                                 onerror="this.src='https://placehold.co/200x200/111/FFF?text=Lv${currentRank.level}'">
                        </div>
                    </div>

                    <div class="text-center space-y-2 mb-8">
                        <div class="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono tracking-widest text-gray-400 backdrop-blur-md">
                            <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background-color: ${currentRank.stage_color}"></span>
                            CURRENT RANK
                        </div>
                        
                        <h1 class="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-200 to-gray-500 tracking-tight drop-shadow-lg uppercase">
                            ${currentRank.title}
                        </h1>
                        
                        <p class="text-lg text-gray-400 italic max-w-lg mx-auto leading-relaxed border-l-2 border-[${currentRank.stage_color}] pl-4 text-right">
                            "${currentRank.lore}"
                        </p>
                    </div>

                    <div class="w-full max-w-2xl bg-black/50 border border-white/10 rounded-2xl p-6 relative overflow-hidden group/stats hover:border-white/20 transition-all">
                        <div class="absolute top-0 right-0 w-20 h-full bg-gradient-to-l from-[${currentRank.stage_color}]/10 to-transparent"></div>
                        
                        <div class="flex justify-between items-end mb-3">
                            <div>
                                <span class="block text-xs text-gray-500 uppercase tracking-wider mb-1">نقاط الخبرة (XP)</span>
                                <span class="text-2xl font-bold text-white font-mono">${points.toLocaleString()}</span>
                            </div>
                            <div class="text-right">
                                <span class="block text-xs text-gray-500 uppercase tracking-wider mb-1">الهدف القادم</span>
                                <span class="text-sm font-bold text-[${currentRank.stage_color}]">
                                    ${nextRank ? nextRank.title : 'MAX'}
                                </span>
                            </div>
                        </div>

                        <div class="h-2 bg-white/5 rounded-full overflow-hidden relative">
                            <div class="absolute inset-0 w-full h-full bg-[${currentRank.stage_color}]/20 blur-[2px]"></div>
                            <div class="h-full bg-gradient-to-r from-[${currentRank.stage_color}] to-white transition-all duration-1000 ease-out relative" style="width: ${progressPercent}%">
                                <div class="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-6 bg-white blur-[4px] opacity-70"></div>
                            </div>
                        </div>
                        
                        <p class="text-[10px] text-gray-500 mt-3 text-right">
                            ${nextRank ? `باقي <span class="text-white font-bold">${pointsNeeded.toLocaleString()}</span> نقطة للوصول` : 'أنت في القمة!'}
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <div class="relative pl-0 md:pl-0 mt-32 max-w-4xl mx-auto">
            
            <div class="absolute right-6 md:right-1/2 top-0 bottom-0 w-[2px] energy-line" style="--rank-color: ${currentRank.stage_color}"></div>
            
            <div class="space-y-24 pb-32">
                ${RANKS_DATA.map((rank, index) => {
                    const isUnlocked = index <= currentIndex;
                    const isCurrent = index === currentIndex;
                    
                    const isEven = index % 2 === 0;
                    const alignClass = isEven ? 'md:flex-row' : 'md:flex-row-reverse';
                    const textAlign = isEven ? 'md:text-left' : 'md:text-right';
                    const paddingAlign = isEven ? 'md:pl-24' : 'md:pr-24';
                    
                    let opacity = isUnlocked ? 'opacity-100' : 'opacity-30 blur-[1px]';
                    let scale = isCurrent ? 'scale-110' : 'scale-100';
                    let badgeGlow = isCurrent ? `drop-shadow-[0_0_25px_${rank.stage_color}]` : '';
                    let imgFilter = isUnlocked ? 'grayscale(0)' : 'grayscale(100%) brightness(50%)';
                    
                    const badgeUrl = `../assets/user-badge/lv${rank.level}.png`;

                    return `
                    <div class="reveal-element flex items-center ${alignClass} relative group" data-index="${index}">
                        
                        <div class="w-full md:w-1/2 pl-20 pr-4 md:px-0 ${paddingAlign} ${textAlign} ${opacity} transition-all duration-500 hover:opacity-100 hover:blur-0">
                            <div class="inline-block">
                                <span class="text-[10px] font-mono text-gray-500 border border-white/10 px-2 py-0.5 rounded uppercase tracking-wider mb-2 block w-fit ${isEven ? '' : 'ml-auto'}">
                                    LVL ${rank.level}
                                </span>
                                <h3 class="text-3xl font-bold text-white mb-2 tracking-tight" style="color: ${isUnlocked ? rank.stage_color : 'white'}">${rank.title}</h3>
                                <p class="text-sm font-mono text-[${rank.stage_color}] mb-3">${rank.points_required.toLocaleString()} XP</p>
                                <p class="text-base text-gray-400 leading-relaxed max-w-sm hidden md:block">${rank.description}</p>
                            </div>
                        </div>

                        <div class="absolute right-6 md:right-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-black border-2 z-20" style="border-color: ${isUnlocked ? rank.stage_color : '#333'}">
                            ${isCurrent ? `<div class="absolute inset-0 bg-[${rank.stage_color}] blur-md animate-pulse"></div>` : ''}
                        </div>

                        <div class="absolute right-6 md:right-1/2 translate-x-1/2 -translate-y-1/2 top-1/2 w-24 h-24 flex items-center justify-center z-30 transition-all duration-700 ease-out group-hover:scale-125 ${scale}">
                            
                            <div class="w-full h-full rounded-[12%] overflow-hidden border-2 shadow-lg relative bg-black" style="border-color: ${isUnlocked ? rank.stage_color : '#333'}">
                                <img src="${badgeUrl}" 
                                     class="w-full h-full object-cover transition-all duration-500"
                                     style="filter: ${imgFilter} ${badgeGlow}; transform: translateZ(20px);"
                                     onerror="this.style.display='none';">
                            </div>
                        </div>

                        <div class="hidden md:block w-1/2"></div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function initVisualEffects() {
    
    // Mouse Spotlight Logic
    const card = document.getElementById('hero-card');
    const badge = document.getElementById('hero-badge');

    if (card) {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);

            if(badge) {
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -10;
                const rotateY = ((x - centerX) / centerX) * 10;

                badge.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
            }
        });

        card.addEventListener('mouseleave', () => {
            if(badge) badge.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
        });
    }

    // Scroll Reveal
    const observerOptions = {
        threshold: 0.15, 
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('reveal-visible');
                entry.target.classList.remove('translate-y-[30px]', 'opacity-0');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal-element').forEach(el => {
        el.classList.add('translate-y-[30px]', 'opacity-0');
        observer.observe(el);
    });

    // Particle System
    const particleContainer = document.getElementById('particles-container');
    if(particleContainer) {
        // Clear previous particles if any
        particleContainer.innerHTML = '';
        for(let i=0; i<25; i++) {
            createParticle(particleContainer);
        }
    }
}

function createParticle(container) {
    const p = document.createElement('div');
    p.classList.add('particle');
    
    const size = Math.random() * 3 + 1;
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const duration = Math.random() * 10 + 5;
    const delay = Math.random() * 5;

    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${x}%`;
    p.style.top = `${y}%`;
    p.style.opacity = Math.random() * 0.5;
    p.style.animation = `float-slow ${duration}s ease-in-out infinite ${delay}s`;

    container.appendChild(p);
}

// ==========================================
// 4. POINT SYSTEM LOGIC (Backend)
// ==========================================

export async function addGamificationPoints(userId, pointsToAdd, activityId, activityType) {
    if (!userId || !pointsToAdd || !activityId) return;

    const userRef = doc(db, "users", userId);
    const logRef = doc(db, "users", userId, "point_logs", activityId);

    try {
        const result = await runTransaction(db, async (transaction) => {
            const logDoc = await transaction.get(logRef);
            if (logDoc.exists()) throw "Duplicate";

            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw "UserNotFound";

            const userData = userDoc.data();
            const currentPoints = userData.gamification?.total_points || 0;
            const newTotal = currentPoints + pointsToAdd;

            let newRankObj = RANKS_DATA[0];
            for (let i = 0; i < RANKS_DATA.length; i++) {
                if (newTotal >= RANKS_DATA[i].points_required) {
                    newRankObj = RANKS_DATA[i];
                } else {
                    break;
                }
            }

            transaction.update(userRef, {
                "gamification.total_points": newTotal,
                "gamification.current_rank": newRankObj.key,
                "gamification.last_updated": serverTimestamp()
            });

            transaction.set(logRef, {
                points: pointsToAdd,
                type: activityType,
                timestamp: serverTimestamp(),
                description: `Completed ${activityType}: ${activityId}`
            });

            const oldRankKey = userData.gamification?.current_rank || "recruit";
            const isRankUp = newRankObj.key !== oldRankKey;

            return { success: true, newTotal, isRankUp, newRankKey: newRankObj.key };
        });

        if (result.success) {
            console.log(`XP Added: ${result.newTotal}`);
            showCustomToast(`+${pointsToAdd} XP Gained`, 'success');

            if (result.isRankUp) {
                triggerRankUpModal(result.newRankKey);
            }
        }

    } catch (e) {
        if (e !== "Duplicate") {
            console.error("Points Error:", e);
            showCustomToast("System Error while saving progress", 'error');
        }
    }
}