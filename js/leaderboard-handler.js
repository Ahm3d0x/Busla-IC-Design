import { auth, db, doc, getDoc, getDocs, collection, query, where, orderBy, limit } from './firebase-config.js';
import { RANKS_DATA } from './badges-data.js';
import { TEAM_RANKS_DATA } from './team-badges-data.js';

// ==========================================
// 1. STATE & CONFIG
// ==========================================
let currentType = 'students'; 
let currentScope = 'global';
let currentUserData = null;
let currentTeamData = null;

// ==========================================
// 2. MAIN INIT
// ==========================================
export async function initLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    if (!container) return;

    const user = auth.currentUser;
    if (user && !currentUserData) {
        try {
            const snap = await getDoc(doc(db, "users", user.uid));
            currentUserData = snap.data();
            
            if (currentUserData.system_info?.team_id) {
                const tSnap = await getDoc(doc(db, "teams", currentUserData.system_info.team_id));
                if (tSnap.exists()) {
                    currentTeamData = tSnap.data();
                    currentTeamData.id = tSnap.id;
                }
            }
        } catch (e) {
            console.error("Context Load Error:", e);
        }
    }

    fetchAndRenderLeaderboard();
}

// ==========================================
// 3. FETCHING STRATEGY
// ==========================================
async function fetchAndRenderLeaderboard() {
    const listContainer = document.getElementById('leaderboard-list');
    const podiumContainer = document.getElementById('podium-container');
    const headerContext = document.getElementById('col-header-context');
    
    // تحديث عنوان العمود
    if (headerContext) {
        headerContext.innerText = currentType === 'students' ? 'الفريق التابع له' : 'قائد الفريق';
    }

    listContainer.innerHTML = `<div class="text-center py-24"><i class="fas fa-circle-notch fa-spin text-b-primary text-4xl"></i></div>`;
    podiumContainer.innerHTML = ''; 

    try {
        let q;
        const collectionName = currentType === 'students' ? 'users' : 'teams';
        const pointsField = currentType === 'students' ? 'gamification.total_points' : 'total_score'; 

        // Query Construction
        if (currentScope === 'global') {
            q = query(collection(db, collectionName), orderBy(pointsField, "desc"), limit(50));
        } 
        else if (currentScope === 'university') {
            const uni = currentType === 'students' 
                ? (currentUserData?.academic_info?.university || 'Zagazig')
                : (currentTeamData?.info?.university || 'Zagazig');
            
            const uniField = currentType === 'students' ? 'academic_info.university' : 'info.university';
            
            q = query(
                collection(db, collectionName), 
                where(uniField, '==', uni),
                orderBy(pointsField, "desc"), 
                limit(50)
            );
        }
        else if (currentScope === 'governorate') {
            const gov = currentType === 'students' 
                ? (currentUserData?.personal_info?.governorate || 'Zagazig')
                : (currentTeamData?.info?.governorate || 'Zagazig');

            const govField = currentType === 'students' ? 'personal_info.governorate' : 'info.governorate';

            q = query(
                collection(db, collectionName), 
                where(govField, '==', gov),
                orderBy(pointsField, "desc"), 
                limit(50)
            );
        }

        const snapshot = await getDocs(q);
        let rawData = [];
        snapshot.forEach(doc => {
            rawData.push({ id: doc.id, ...doc.data() });
        });

        // 🔥 CRITICAL STEP: Fetch Related Names (Teams/Leaders) 🔥
        const enrichedData = await fetchRelatedData(rawData, currentType);

        // Update UI
        updateHeroStats(enrichedData);
        renderPodium(enrichedData.slice(0, 3));
        renderTable(enrichedData);
        checkStickyBar(enrichedData);

    } catch (error) {
        console.error("Leaderboard Error:", error);
        if (error.message.includes("requires an index")) {
            listContainer.innerHTML = `<div class="text-center py-10 text-red-400 text-sm font-bold">⚠️ System Indexing Required (Check Console)</div>`;
        } else {
            listContainer.innerHTML = `<div class="text-center py-10 text-gray-500 text-sm">Failed to load data.</div>`;
        }
    }
}

// 🔥 Helper to resolve IDs to Names
async function fetchRelatedData(data, type) {
    if (data.length === 0) return [];

    const result = [...data];
    
    // 1. If listing Students -> Fetch Team Names
    if (type === 'students') {
        const teamIds = [...new Set(data.map(item => item.system_info?.team_id).filter(id => id))];
        if (teamIds.length > 0) {
            // Firestore 'in' limit is 10. For simplicity, we loop fetch if list is small, 
            // or we could chunk. Assuming <50 items, loop is acceptable for now.
            const teamMap = {};
            // Using Promise.all for parallel fetching
            await Promise.all(teamIds.map(async (tid) => {
                try {
                    const snap = await getDoc(doc(db, "teams", tid));
                    if (snap.exists()) {
                        teamMap[tid] = snap.data().info?.name || snap.data().name || "Unknown Team";
                    }
                } catch(e) { console.warn("Team fetch fail", tid); }
            }));

            // Map back to data
            result.forEach(item => {
                const tid = item.system_info?.team_id;
                item._resolvedTeamName = tid ? (teamMap[tid] || "فريق غير معروف") : "مستقل";
            });
        }
    } 
    // 2. If listing Teams -> Fetch Leader Names (if missing)
    else {
        const leaderIds = [...new Set(data.map(item => item.leader_id).filter(id => id))];
        if (leaderIds.length > 0) {
            const userMap = {};
            await Promise.all(leaderIds.map(async (uid) => {
                try {
                    const snap = await getDoc(doc(db, "users", uid));
                    if (snap.exists()) {
                        userMap[uid] = snap.data().personal_info?.full_name || "Unknown Leader";
                    }
                } catch(e) {}
            }));

            result.forEach(item => {
                // Prefer leader_name in team doc, fallback to user doc fetch
                item._resolvedLeaderName = item.leader_name || userMap[item.leader_id] || "غير معروف";
            });
        }
    }

    return result;
}

// ==========================================
// 4. RENDERING LOGIC (Fixed Fonts & Cols)
// ==========================================

function getRankTitle(points, type) {
    const dataSet = type === 'students' ? RANKS_DATA : TEAM_RANKS_DATA;
    let title = type === 'students' ? 'RECRUIT' : 'GROUP';
    let color = '#555';

    for (let i = 0; i < dataSet.length; i++) {
        if (points >= dataSet[i].points_required) {
            title = dataSet[i].title;
            color = dataSet[i].stage_color || '#fff';
        } else {
            break;
        }
    }
    return { title: title.toUpperCase(), color };
}

function renderPodium(top3) {
    const container = document.getElementById('podium-container');
    const positions = [1, 0, 2]; // 2nd, 1st, 3rd

    const podiumHTML = positions.map(idx => {
        const item = top3[idx];
        if (!item) return `<div class="w-1/3"></div>`; 

        const rank = idx + 1;
        const isStudent = currentType === 'students';
        
        const name = isStudent 
            ? (item.personal_info?.full_name || 'Unknown') 
            : (item.info?.name || item.name || 'Team');
        
        const points = isStudent 
            ? (item.gamification?.total_points || 0) 
            : (item.total_score || 0);

        const badgeData = getRankTitle(points, currentType);

        // Styling
        const height = rank === 1 ? 'h-44' : (rank === 2 ? 'h-36' : 'h-28');
        const color = rank === 1 ? 'text-yellow-500 border-yellow-500' 
                    : (rank === 2 ? 'text-gray-400 border-gray-400' : 'text-orange-700 border-orange-700');
        const bg = rank === 1 ? 'from-yellow-500/10' : (rank === 2 ? 'from-gray-400/10' : 'from-orange-700/10');

        return `
            <div class="flex flex-col items-center justify-end w-1/3 group relative">
                <div class="mb-3 text-2xl ${color} animate-bounce-slow">
                    <i class="fas fa-${rank === 1 ? 'crown' : 'medal'}"></i>
                </div>
                <div class="w-full ${height} bg-gradient-to-t ${bg} to-transparent border-t-4 ${color} rounded-t-2xl relative flex flex-col items-center justify-start pt-6 transition-all hover:opacity-100 opacity-90 shadow-2xl">
                    <span class="text-4xl font-black ${color} opacity-20 absolute bottom-2 font-mono">${rank}</span>
                    <h3 class="text-white font-bold text-center px-1 line-clamp-1 text-sm md:text-base mb-1">${name}</h3>
                    <span class="font-mono text-xs text-gray-300 font-bold">${points.toLocaleString()}</span>
                    <span class="mt-2 text-[10px] uppercase tracking-widest px-2 py-0.5 border ${color} rounded text-white bg-black/60">
                        ${badgeData.title}
                    </span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = podiumHTML;
}

function renderTable(data) {
    const container = document.getElementById('leaderboard-list');
    
    container.innerHTML = data.map((item, index) => {
        const rank = index + 1;
        const isStudent = currentType === 'students';
        const myId = auth.currentUser?.uid;
        
        // Identity Check
        const isMe = isStudent ? (item.uid === myId) : (item.id === currentUserData?.system_info?.team_id);
        
        let name, centerColumnContent, points, badgeData, uni;

        if (isStudent) {
            name = item.personal_info?.full_name || 'Unknown User';
            points = item.gamification?.total_points || 0;
            badgeData = getRankTitle(points, 'students');
            uni = item.academic_info?.university || '---';
            // Context: Resolved Team Name
            centerColumnContent = item._resolvedTeamName || "مستقل";
        } else {
            // Team
            name = item.info?.name || item.name || 'Unnamed Team';
            points = item.total_score || 0;
            badgeData = getRankTitle(points, 'teams');
            uni = item.info?.university || '---';
            // Context: Leader Name
            centerColumnContent = `<i class="fas fa-crown text-yellow-600 ml-1 text-xs"></i> ${item._resolvedLeaderName}`;
        }

        const rowClass = isMe 
            ? 'bg-b-primary/20 border-l-4 border-l-b-primary' 
            : 'hover:bg-white/5 border-l-4 border-l-transparent';
        
        const rankStyle = rank <= 3 
            ? 'text-yellow-500 font-black text-xl' 
            : 'text-gray-500 font-bold text-lg';

        return `
            <div class="grid grid-cols-12 gap-4 p-4 items-center transition-colors border-b border-white/5 ${rowClass}">
                
                <div class="col-span-1 text-center font-mono ${rankStyle}">#${rank}</div>

                <div class="col-span-3 pr-2">
                    <div class="flex items-center gap-2">
                        <span class="text-white font-bold text-base truncate">
                            ${name}
                        </span>
                        ${isMe ? '<span class="text-[10px] bg-b-primary px-2 py-0.5 rounded text-white font-bold">أنت</span>' : ''}
                    </div>
                </div>

                <div class="col-span-2 text-center">
                    <span class="text-[15px] font-black uppercase tracking-widest px-2 py-1 rounded border" 
                          style="color:${badgeData.color}; border-color:${badgeData.color}40; background:${badgeData.color}10">
                        ${badgeData.title}
                    </span>
                </div>

                <div class="col-span-3 text-center text-base text-gray-300 font-medium truncate bg-white/5 py-1 rounded">
                    ${centerColumnContent}
                </div>

                <div class="col-span-2 text-center">
                    <span class="text-white font-mono font-bold text-lg tracking-tight">
                        ${points.toLocaleString()} <span class="text-xs text-gray-500">XP</span>
                    </span>
                </div>

                <div class="col-span-1 text-center text-[14px] font-bold text-gray-200">
                    ${uni.substring(0, 10)}
                </div>
            </div>
        `;
    }).join('');
}

function updateHeroStats(data) {
    const myId = auth.currentUser?.uid;
    const myTeamId = currentUserData?.system_info?.team_id;

    // --- 1. تحديث بيانات الطالب (دائماً) ---
    const elStuRank = document.getElementById('hero-student-rank');
    const elStuPoints = document.getElementById('hero-student-points');
    const elStuBadge = document.getElementById('hero-student-badge');

    let stuPoints = 0;
    let stuRank = '--';

    // محاولة العثور على الطالب في القائمة الحالية
    if (currentType === 'students') {
        const idx = data.findIndex(i => i.uid === myId);
        if (idx !== -1) {
            stuPoints = data[idx].gamification?.total_points || 0;
            stuRank = `#${idx + 1}`;
        } else if (currentUserData) {
            stuPoints = currentUserData.gamification?.total_points || 0;
        }
    } else {
        // لو في تبويب الفرق، نستخدم البيانات المحفوظة للطالب
        if (currentUserData) {
            stuPoints = currentUserData.gamification?.total_points || 0;
            // يمكننا جلب الترتيب في الخلفية إذا أردت، أو تركه --
        }
    }

    elStuPoints.innerText = `${stuPoints.toLocaleString()} XP`;
    elStuBadge.innerText = getRankTitle(stuPoints, 'students').title;
    if(stuRank !== '--' || elStuRank.innerText === '--') elStuRank.innerText = stuRank;


    // --- 2. تحديث بيانات الفريق (دائماً) ---
    const elTeamRank = document.getElementById('hero-team-rank');
    const elTeamPoints = document.getElementById('hero-team-points');
    const elTeamBadge = document.getElementById('hero-team-badge');

    if (myTeamId) {
        let teamPoints = 0;
        let teamRank = '--';

        // محاولة العثور على الفريق في القائمة الحالية
        if (currentType === 'teams') {
            const idx = data.findIndex(i => i.id === myTeamId);
            if (idx !== -1) {
                teamPoints = data[idx].total_score || 0;
                teamRank = `#${idx + 1}`;
            } else if (currentTeamData) {
                teamPoints = currentTeamData.total_score || 0;
            }
        } else {
            // 🔥 الإصلاح: نحن في تبويب الطلاب، لكننا سنعرض بيانات الفريق من الكاش
            if (currentTeamData) {
                teamPoints = currentTeamData.total_score || 0;
                // جلب الترتيب الحقيقي في الخلفية لأننا لا نملكه في القائمة الحالية
                fetchSpecificRank('teams', 'total_score', teamPoints).then(rank => {
                    if(rank) document.getElementById('hero-team-rank').innerText = `#${rank}`;
                });
            }
        }
        
        elTeamPoints.innerText = `${teamPoints.toLocaleString()} XP`;
        elTeamBadge.innerText = getRankTitle(teamPoints, 'teams').title;
        if (teamRank !== '--') elTeamRank.innerText = teamRank;
    }
}


async function fetchSpecificRank(collectionName, fieldName, myScore) {
    try {
        const q = query(
            collection(db, collectionName), 
            where(fieldName, ">", myScore)
        );
        const snapshot = await getDocs(q); 
        return snapshot.size + 1;
    } catch (e) {
        console.warn("Background rank fetch failed", e);
        return null;
    }
}

function checkStickyBar(data) {
    const stickyBar = document.getElementById('sticky-user-rank');
    const myId = auth.currentUser?.uid;
    const myTeamId = currentUserData?.system_info?.team_id;

    const myIndex = data.findIndex(item => 
        currentType === 'students' 
        ? item.uid === myId 
        : item.id === myTeamId
    );

    if (myIndex > 6) { // Show if out of view
        const me = data[myIndex];
        const prev = data[myIndex - 1];
        
        const points = currentType === 'students' 
            ? (me.gamification?.total_points || 0) 
            : (me.total_score || 0);
            
        const prevPoints = currentType === 'students' 
            ? (prev.gamification?.total_points || 0) 
            : (prev.total_score || 0);
            
        const diff = prevPoints - points;

        document.getElementById('sticky-rank-num').innerText = `#${myIndex + 1}`;
        document.getElementById('sticky-points').innerText = `${points.toLocaleString()} XP`;
        document.getElementById('sticky-diff-text').innerText = `تحتاج ${diff} نقطة لتتجاوز المركز السابق`;
        
        stickyBar.classList.remove('translate-y-[200%]');
    } else {
        stickyBar.classList.add('translate-y-[200%]');
    }
}

// Global Window Functions
window.switchLeaderboardType = (type) => {
    currentType = type;
    
    const btnS = document.getElementById('tab-students');
    const btnT = document.getElementById('tab-teams');
    
    if (type === 'students') {
        btnS.className = "px-8 py-2.5 rounded-md text-sm font-bold transition-all bg-white text-black shadow-lg";
        btnT.className = "px-8 py-2.5 rounded-md text-sm font-bold text-gray-500 hover:text-white transition-all";
    } else {
        btnT.className = "px-8 py-2.5 rounded-md text-sm font-bold transition-all bg-white text-black shadow-lg";
        btnS.className = "px-8 py-2.5 rounded-md text-sm font-bold text-gray-500 hover:text-white transition-all";
    }

    fetchAndRenderLeaderboard();
};

window.switchLeaderboardScope = (scope) => {
    currentScope = scope;
    document.querySelectorAll('.scope-btn').forEach(btn => {
        btn.className = "scope-btn px-4 py-2 rounded-lg text-xs font-bold text-gray-500 hover:bg-white/5 border border-transparent";
    });
    const activeBtn = document.getElementById(`scope-${scope}`);
    activeBtn.className = "scope-btn px-4 py-2 rounded-lg text-xs font-bold bg-white/10 text-white border border-white/20";

    fetchAndRenderLeaderboard();
};