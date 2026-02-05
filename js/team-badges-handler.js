import { auth, db, doc, getDoc, getDocs, collection, query, where, orderBy, limit } from './firebase-config.js';
import { TEAM_RANKS_DATA } from './team-badges-data.js';

// ==========================================
// 1. COMMAND CENTER STYLES & EFFECTS
// ==========================================
const style = document.createElement('style');
style.innerHTML = `
    @keyframes beam-flow {
        0% { background-position: 0% 0%; }
        100% { background-position: 0% 200%; }
    }
    @keyframes medallion-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
    }
    .monument-beam {
        background: linear-gradient(to bottom, 
            transparent 0%, 
            var(--beam-color, #444) 20%, 
            var(--beam-color, #444) 80%, 
            transparent 100%);
        box-shadow: 0 0 60px var(--beam-glow, rgba(0,0,0,0));
        opacity: 0.5;
    }
    .team-glass-card {
        background: rgba(20, 20, 20, 0.7);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
    /* --- Flashlight Reveal Effect (250px) --- */
    .locked-badge-overlay {
        background: radial-gradient(
            circle 250px at var(--mouse-x, 50%) var(--mouse-y, 50%), 
            transparent 0%, 
            rgba(0, 0, 0, 0.5) 40%, 
            rgba(0, 0, 0, 0.98) 100%
        );
        transition: opacity 0.3s ease;
    }
    .group:hover .locked-badge-overlay {
        opacity: 1;
    }
`;
document.head.appendChild(style);

// ==========================================
// 2. MAIN LOGIC
// ==========================================

export async function initTeamBadgesSystem() {
    const container = document.getElementById('team-rank-container');
    if (!container) return;

    // Loader
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-48">
            <div class="relative">
                <div class="w-32 h-2 bg-gray-800 rounded-full overflow-hidden relative">
                    <div class="h-full bg-gradient-to-r from-transparent via-white to-transparent w-1/2 animate-[beam-flow_1.5s_linear_infinite]"></div>
                </div>
                <div class="absolute inset-0 blur-md bg-white/20 animate-pulse"></div>
            </div>
            <p class="text-gray-400 font-mono text-sm tracking-[0.4em] mt-6 uppercase">جاري تحميل مركز القيادة</p>
        </div>
    `;

    const user = auth.currentUser;
    if (!user) return;

    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const teamId = userDoc.data().system_info?.team_id;

        if (!teamId) {
            container.innerHTML = `<div class="text-center py-32 text-gray-500 text-xl font-bold">لست عضواً في فريق بعد.</div>`;
            return;
        }

        const teamDoc = await getDoc(doc(db, "teams", teamId));
        if (!teamDoc.exists()) throw "TeamNotFound";
        const teamData = teamDoc.data();

        const teamPoints = teamData.total_score || teamData.gamification?.total_points || 0;

        const membersQ = query(
            collection(db, "users"), 
            where("system_info.team_id", "==", teamId),
            orderBy("gamification.total_points", "desc"),
            limit(5)
        );
        const membersSnap = await getDocs(membersQ);
        const contributors = membersSnap.docs.map(d => ({
            name: d.data().personal_info.full_name,
            points: d.data().gamification.total_points,
            photo: d.data().personal_info.photo_url
        }));

        let currentRankIndex = 0;
        for (let i = 0; i < TEAM_RANKS_DATA.length; i++) {
            if (teamPoints >= TEAM_RANKS_DATA[i].points_required) {
                currentRankIndex = i;
            } else {
                break;
            }
        }
        const currentRank = TEAM_RANKS_DATA[currentRankIndex];
        const nextRank = TEAM_RANKS_DATA[currentRankIndex + 1] || null;

        renderCommandCenter(container, teamData, currentRank, nextRank, teamPoints, currentRankIndex, contributors);
        initFlashlightEffect();

    } catch (error) {
        console.error("Team Badges Error:", error);
        container.innerHTML = `<div class="text-center py-32 text-red-500/80 font-mono text-lg">نظام القيادة غير متصل (System Malfunction)</div>`;
    }
}

function renderCommandCenter(container, team, currentRank, nextRank, points, currentIndex, contributors) {
    let progressPercent = 100;
    if (nextRank) {
        const range = nextRank.points_required - currentRank.points_required;
        const gained = points - currentRank.points_required;
        progressPercent = Math.min(100, Math.max(0, (gained / range) * 100));
    }

    const currentImgUrl = `../assets/team-badge/lv${currentRank.level}.png`;
    const teamName = team.info?.name || team.name || "فريق بلا اسم";

    container.innerHTML = `
        <div class="relative w-full h-[600px] rounded-[2.5rem] overflow-hidden mb-16 border border-white/10 group shadow-2xl">
            <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-black to-black"></div>
            <div class="absolute inset-0 bg-[${currentRank.stage_color}] mix-blend-overlay opacity-20"></div>
            <div class="absolute inset-0 bg-black/40 z-0"></div>
            
            <div class="relative z-10 h-full flex flex-col items-center justify-center pt-4 pb-32">
                
                <div class="relative w-56 h-56 flex items-center justify-center mb-6">
                    <div class="absolute inset-[-30px] rounded-full border-[2px] border-[${currentRank.stage_color}]/30 animate-[spin_25s_linear_infinite] blur-[2px]"></div>
                    <div class="absolute inset-[-15px] rounded-full border border-[${currentRank.stage_color}]/50 animate-[spin_18s_linear_infinite_reverse]"></div>
                    
                    <div class="w-full h-full rounded-full overflow-hidden border-[6px] shadow-[0_0_60px_rgba(0,0,0,0.9)] relative z-20 bg-black"
                         style="border-color: ${currentRank.stage_color}; animation: medallion-float 8s ease-in-out infinite">
                        <img src="${currentImgUrl}" 
                             class="w-full h-full object-cover"
                             alt="${currentRank.title}"
                             onerror="this.src='https://placehold.co/300x300/000/FFF?text=Team'">
                    </div>
                    
                    <div class="absolute w-full h-full bg-[${currentRank.stage_color}] blur-[100px] opacity-40 z-0"></div>
                </div>

                <h1 class="text-5xl font-black text-white tracking-tight uppercase mb-4 drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)] z-20 relative text-center px-4">
                    ${teamName}
                </h1>
                
                <div class="flex flex-col items-center z-20 relative space-y-2">
                    <span class="text-[10px] text-gray-400 font-mono tracking-[0.4em] uppercase border-b border-white/10 pb-1 mb-1">
                        ${currentRank.stage_name}
                    </span>

                    <h2 class="text-4xl font-black uppercase tracking-widest drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]" 
                        style="color: ${currentRank.stage_color}; text-shadow: 0 0 30px ${currentRank.stage_color}40;">
                        ${currentRank.title}
                    </h2>
                </div>

                <p class="mt-6 text-lg text-gray-300 italic font-serif max-w-2xl text-center leading-relaxed opacity-90 z-20 relative px-4 drop-shadow-md">
                    "${currentRank.lore}"
                </p>

            </div>

            <div class="absolute bottom-0 w-full h-28 bg-[#0a0a0a]/90 backdrop-blur-xl border-t border-white/10 flex divide-x divide-white/5 divide-x-reverse z-30">
                <div class="flex-1 flex flex-col items-center justify-center p-4 group hover:bg-white/5 transition-all duration-300">
                    <div class="flex items-center gap-2 mb-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <i class="fas fa-bolt text-[${currentRank.stage_color}]"></i>
                        <span class="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">القوة</span>
                    </div>
                    <span class="text-3xl font-black text-white font-mono tracking-tight leading-none drop-shadow-lg">${points.toLocaleString()}</span>
                </div>
                
                <div class="flex-1 flex flex-col items-center justify-center p-4 group hover:bg-white/5 transition-all duration-300">
                    <div class="flex items-center gap-2 mb-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <i class="fas fa-users text-blue-400"></i>
                        <span class="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">الأعضاء</span>
                    </div>
                    <span class="text-3xl font-black text-white font-mono tracking-tight leading-none drop-shadow-lg">${contributors.length} <span class="text-lg text-gray-500">/ 5</span></span>
                </div>
                
                <div class="flex-1 flex flex-col items-center justify-center p-4 group hover:bg-white/5 transition-all duration-300 relative overflow-hidden">
                     <div class="flex items-center gap-2 mb-1 opacity-70 group-hover:opacity-100 transition-opacity relative z-10">
                        <i class="fas fa-flag-checkered text-yellow-500"></i>
                        <span class="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">التالي</span>
                    </div>
                    <span class="text-3xl font-black text-[${nextRank ? nextRank.stage_color : '#fff'}] font-mono tracking-tight leading-none relative z-10 drop-shadow-lg">
                        ${nextRank ? ((points / nextRank.points_required)*100).toFixed(1) + '%' : 'MAX'}
                    </span>
                    <div class="absolute bottom-0 left-0 h-1.5 bg-[${currentRank.stage_color}]/20 w-full">
                        <div class="h-full bg-[${currentRank.stage_color}]" style="width: ${progressPercent}%"></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 relative">
            
            <div class="lg:col-span-8 relative py-12">
                <div class="absolute left-1/2 top-0 bottom-0 w-32 -translate-x-1/2 monument-beam rounded-full" 
                     style="--beam-color: ${currentRank.stage_color}; --beam-glow: ${currentRank.stage_color}30;"></div>
                <div class="absolute left-1/2 top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-white/30 to-transparent -translate-x-1/2 z-0"></div>

                <div class="space-y-40 relative z-10 py-10">
                    ${TEAM_RANKS_DATA.map((rank, index) => {
                        const isUnlocked = index <= currentIndex;
                        const isCurrent = index === currentIndex;
                        const badgeUrl = `../assets/team-badge/lv${rank.level}.png`;
                        
                        const opacity = isUnlocked ? 'opacity-100' : 'opacity-40 grayscale-[80%]';
                        const scale = isCurrent ? 'scale-110' : 'scale-100';
                        const badgeSize = isCurrent ? 'w-48 h-48' : 'w-40 h-40';
                        const borderGlow = isCurrent ? `border-[${rank.stage_color}] shadow-[0_0_40px_${rank.stage_color}60]` : `border-white/10 group-hover:border-white/30`;
                        const textGlow = isCurrent ? `text-[${rank.stage_color}] drop-shadow-[0_0_15px_${rank.stage_color}50]` : 'text-gray-400 group-hover:text-gray-200';
                        
                        return `
                        <div class="flex items-center justify-center relative group transition-all duration-700 ${isUnlocked ? '' : 'locked-rank'}">
                            
                            <div class="absolute right-[58%] text-right w-72 pr-10 hidden md:block ${opacity} transition-opacity duration-500 group-hover:opacity-100">
                                <h3 class="text-3xl font-black uppercase tracking-tighter mb-2 transition-colors ${textGlow}">${rank.title}</h3>
                                <p class="text-lg font-mono text-gray-500">${rank.points_required.toLocaleString()} XP</p>
                            </div>

                            <div class="relative ${badgeSize} flex items-center justify-center transition-transform duration-500 ${scale} z-20 badge-container">
                                
                                <div class="absolute inset-2 bg-[#050505] rounded-full shadow-2xl"></div>
                                ${isCurrent ? `<div class="absolute inset-[-10px] rounded-full border-[2px] border-[${rank.stage_color}] opacity-60 animate-ping"></div>` : ''}
                                
                                <div class="w-full h-full rounded-full overflow-hidden border-[4px] shadow-[0_0_30px_rgba(0,0,0,0.5)] relative bg-[#080808] transition-all duration-500 ${borderGlow}"
                                     style="border-color: ${isUnlocked ? rank.stage_color : '#333'}">
                                    
                                    <img src="${badgeUrl}" 
                                         class="w-full h-full object-cover relative z-10 transition-all duration-700 ${isUnlocked ? '' : 'brightness-[0.2] group-hover:brightness-100'}"
                                         onerror="this.style.display='none'">

                                    ${!isUnlocked ? `<div class="locked-badge-overlay absolute inset-0 z-30 pointer-events-none"></div>` : ''}
                                </div>
                            </div>

                            <div class="absolute left-[58%] text-left w-72 pl-10 hidden md:block ${opacity} transition-opacity duration-500 group-hover:opacity-100">
                                <p class="text-base text-gray-400 italic leading-relaxed border-l-4 border-white/5 pl-4 group-hover:border-[${rank.stage_color}]/50 transition-colors">
                                    "${rank.lore}"
                                </p>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <div class="lg:col-span-4 relative z-20">
                <div class="sticky top-8 space-y-8">
                    
                    <div class="team-glass-card rounded-[2rem] p-8">
                        <h3 class="text-xl font-black text-white mb-8 flex items-center gap-3 uppercase tracking-wider">
                            <i class="fas fa-shield-alt text-b-primary"></i> نخبة الفريق
                        </h3>
                        
                        <div class="space-y-5">
                            ${contributors.map((member, i) => `
                                <div class="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all hover:scale-[1.02] group">
                                    <div class="relative">
                                        <div class="w-12 h-12 rounded-full bg-gray-900 overflow-hidden border-2 border-white/10 group-hover:border-b-primary/50 transition-colors shadow-lg">
                                            <img src="${member.photo || '../assets/icons/default-avatar.png'}" class="w-full h-full object-cover">
                                        </div>
                                        <div class="absolute -bottom-1 -right-1 w-6 h-6 flex items-center justify-center rounded-full bg-[#0a0a0a] border border-white/10 text-xs font-bold text-gray-400">
                                            #${i+1}
                                        </div>
                                    </div>
                                    <div class="flex-1">
                                        <div class="flex justify-between items-center mb-2">
                                            <span class="text-white font-bold text-sm">${member.name}</span>
                                            <span class="text-b-primary font-mono font-bold">${member.points.toLocaleString()}</span>
                                        </div>
                                        <div class="h-1.5 bg-black/50 rounded-full overflow-hidden">
                                            <div class="h-full bg-gradient-to-r from-b-primary to-white/80" style="width: ${(member.points / points * 100) || 0}%"></div>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                            
                            ${contributors.length === 0 ? '<p class="text-gray-500 text-sm text-center py-4">لا توجد بيانات مساهمة بعد.</p>' : ''}
                        </div>
                    </div>

                    <div class="team-glass-card rounded-2xl p-6">
                        <h3 class="text-white font-bold mb-4 flex items-center gap-2">
                            <i class="fas fa-trophy text-yellow-600"></i> Legacy
                        </h3>
                        <div class="grid grid-cols-4 gap-2">
                            <div class="aspect-square bg-white/5 rounded-lg flex items-center justify-center border border-white/5 text-gray-600">
                                <i class="fas fa-fist-raised"></i>
                            </div>
                            <div class="aspect-square bg-white/5 rounded-lg flex items-center justify-center border border-white/5 text-gray-600">
                                <i class="fas fa-star"></i>
                            </div>
                            <div class="aspect-square bg-black/40 rounded-lg flex items-center justify-center border border-white/5 text-gray-800">
                                <i class="fas fa-lock"></i>
                            </div>
                            <div class="aspect-square bg-black/40 rounded-lg flex items-center justify-center border border-white/5 text-gray-800">
                                <i class="fas fa-lock"></i>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;
}

function initFlashlightEffect() {
    const badgeContainers = document.querySelectorAll('.badge-container');
    
    badgeContainers.forEach(container => {
        const overlay = container.querySelector('.locked-badge-overlay');
        if (!overlay) return;

        container.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            overlay.style.setProperty('--mouse-x', `${x}px`);
            overlay.style.setProperty('--mouse-y', `${y}px`);
        });
    });
}