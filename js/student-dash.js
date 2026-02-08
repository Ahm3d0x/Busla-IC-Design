import { 
    auth, db, doc, getDoc, getDocs, collection, query, where, addDoc, serverTimestamp, onAuthStateChanged 
} from './firebase-config.js';
import { initBadgesSystem } from './badges-handler.js';
import { initLeaderboard } from './leaderboard-handler.js';

// --- Global State ---
let currentUser = null;
let currentTeam = null;
let allCurriculumData = null;
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyi1nTA-P4QfrmrPhYU7JLScBm13ZzZtkCeTtHuqwOonfIpXbu9VT1TinKaFcje2KNC/exec";

// =========================================================
// 1. INITIALIZATION & AUTH
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await initStudentDash(user.uid);
        } else {
            window.location.href = "auth.html";
        }
    });
});

async function initStudentDash(uid) {
    try {
        console.log("🚀 Initializing Student Dashboard...");
        
        // 1. Fetch User Data
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) {
            console.error("User document not found!");
            return;
        }
        const userData = userDoc.data();
        
        // 2. Set Header Info (Name & Photo)
        updateHeaderUI(userData);

        // 3. Determine User Status (In Team OR Solo)
        const teamId = userData.team_id || userData.system_info?.team_id;

        if (teamId) {
            // --- CASE A: STUDENT IN TEAM ---
            console.log("✅ Student is in Team:", teamId);
            
            // Fetch Team Data
            const teamDoc = await getDoc(doc(db, "teams", teamId));
            if (teamDoc.exists()) {
                currentTeam = { id: teamDoc.id, ...teamDoc.data() };
                
                // Show Team Tabs
                document.getElementById('btn-my-plan').classList.remove('hidden');
                document.getElementById('btn-squad').classList.remove('hidden');
                document.getElementById('header-team-container').classList.remove('hidden');
                
                // Hide Solo Tabs
                document.getElementById('btn-find-team').classList.add('hidden');

                // Render Team Specifics
                updateTeamHeaderUI(currentTeam);
                await renderOverview(userData, currentTeam); // Now awaits for rank calculation
                renderStudentTasks(userData, currentTeam);
                await renderSquad(currentTeam); // Await to fetch member names
            }
        } else {
            // --- CASE B: SOLO STUDENT ---
            console.log("👤 Student is Solo");
            
            // Show Solo Tabs
            document.getElementById('btn-find-team').classList.remove('hidden');
            
            // Hide Team Tabs
            document.getElementById('btn-my-plan').classList.add('hidden');
            document.getElementById('btn-squad').classList.add('hidden');
            document.getElementById('header-team-container').classList.add('hidden');

            renderSoloOverview(userData);
            loadAvailableTeams();
        }

        // 4. Load Common Features (Curriculum, Badges, Leaderboard)
        fetchCurriculumData().then(() => renderCurriculumTree());
        
        // Try/Catch for external modules to prevent dashboard crash if they fail
        try {
            if (typeof initBadgesSystem === 'function') initBadgesSystem(uid);
            if (typeof initLeaderboard === 'function') initLeaderboard();
        } catch (err) {
            console.warn("⚠️ Warning: Badges/Leaderboard module failed:", err);
        }

    } catch (e) {
        console.error("❌ Critical Init Error:", e);
    }
}

// =========================================================
// 2. UI UPDATES (Header & Sidebar)
// =========================================================
function updateHeaderUI(user) {
    const name = user.personal_info?.full_name || "Student";
    const photo = user.personal_info?.photo_url || "https://ui-avatars.com/api/?name=User";
    const xp = user.gamification?.total_points || 0;

    // Header
    document.getElementById('header-user-name').innerText = name.split(' ')[0];
    
    // Sidebar
    document.getElementById('sidebar-user-name').innerText = name;
    document.getElementById('sidebar-user-img').src = photo;
    document.getElementById('sidebar-current-xp').innerText = `${xp} XP`;
    
    // XP Bar Logic (Simple: Every 1000 XP is a level)
    const progress = (xp % 1000) / 10; 
    document.getElementById('sidebar-xp-bar').style.width = `${progress}%`;
}

function updateTeamHeaderUI(team) {
    const info = team.info || {}; // Handle nested info object
    const name = info.name || team.name || "My Team";
    const logo = info.logo_url || team.logo_url || "../assets/icons/team-placeholder.png";

    document.getElementById('header-team-name').innerText = name;
    document.getElementById('header-team-logo').src = logo;
}

// =========================================================
// 3. OVERVIEW TAB (Fixed Logic)
// =========================================================
async function renderOverview(user, team) {
    const xp = user.gamification?.total_points || 0;
    
    // 1. My XP Card
    document.getElementById('stat-my-xp').innerText = `${xp} XP`;
    document.getElementById('stat-xp-progress').style.width = `${(xp % 1000) / 10}%`;

    // 2. Active Tasks Card
    const tasks = team.weekly_tasks || [];
    document.getElementById('stat-active-tasks').innerText = tasks.length;

    // 3. Team Global Rank
    document.getElementById('team-global-rank').innerText = `#${team.total_score ? 'calculating...' : 'N/A'}`; 
    // Note: Global rank usually requires a separate DB query or Cloud Function. 
    // We display score for now if rank isn't ready.
    if(team.total_score) document.getElementById('team-global-rank').innerText = `${team.total_score} pts`;

    // 4. My Rank in Team (FIXED: Calculates real rank)
    try {
        const membersCollection = await Promise.all(
            team.members.map(uid => getDoc(doc(db, "users", uid)))
        );
        
        const sortedMembers = membersCollection
            .map(d => ({ uid: d.id, points: d.data()?.gamification?.total_points || 0 }))
            .sort((a, b) => b.points - a.points);
            
        const myRankIndex = sortedMembers.findIndex(m => m.uid === user.uid);
        const myRank = myRankIndex !== -1 ? myRankIndex + 1 : "-";
        
        document.getElementById('stat-my-rank').innerText = `#${myRank}`;
    } catch (e) {
        console.warn("Rank calculation warning:", e);
        document.getElementById('stat-my-rank').innerText = "-";
    }
}

function renderSoloOverview(user) {
    const xp = user.gamification?.total_points || 0;
    document.getElementById('stat-my-xp').innerText = `${xp} XP`;
    document.getElementById('stat-active-tasks').innerText = "0";
    document.getElementById('stat-my-rank').innerText = "Solo";
    document.getElementById('team-global-rank').innerText = "-";
}

// =========================================================
// 4. MY PLAN / TASKS TAB
// =========================================================
function renderStudentTasks(user, team) {
    const container = document.getElementById('student-tasks-container');
    const tasks = team.weekly_tasks || [];

    if (tasks.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-500">لا توجد مهام نشطة حالياً.</div>';
        return;
    }

    container.innerHTML = tasks.map(task => {
        // Check completion in user content_states
        // content_states keys are usually just the content ID
        const state = user.content_states?.[task.content_id];
        const isDone = state?.is_completed || false;
        
        const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('ar-EG') : 'مفتوح';
        
        let icon = 'fa-circle';
        if (task.type === 'video') icon = 'fa-play-circle';
        if (task.type === 'quiz') icon = 'fa-question-circle';
        if (task.type === 'project') icon = 'fa-code-branch';

        // Action Button Logic
        let actionBtn = '';
        if (isDone) {
            actionBtn = `<span class="text-green-500 font-bold text-sm"><i class="fas fa-check-circle"></i> مكتمل</span>`;
        } else {
            // Link to course player
            const url = `course-player.html?id=${task.course_id}&content=${task.content_id}&mode=student`;
            actionBtn = `<a href="${url}" class="px-4 py-2 bg-b-primary hover:bg-teal-600 text-white text-sm rounded-lg transition">ابدأ الآن</a>`;
        }

        return `
        <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between hover:border-b-primary/50 transition-all">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-gray-400">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <h4 class="font-bold text-white text-sm">${task.title}</h4>
                    <p class="text-xs text-gray-500">الاستحقاق: ${dueDate}</p>
                </div>
            </div>
            <div>${actionBtn}</div>
        </div>`;
    }).join('');
}

// =========================================================
// 5. SQUAD TAB (FIXED: Fetch Names instead of IDs)
// =========================================================
async function renderSquad(team) {
    const container = document.getElementById('squad-list');
    container.innerHTML = '<div class="col-span-full text-center"><div class="spinner"></div></div>';

    try {
        const membersIDs = team.members || [];
        
        // Fetch all member profiles in parallel
        const memberPromises = membersIDs.map(uid => getDoc(doc(db, "users", uid)));
        const memberSnapshots = await Promise.all(memberPromises);
        
        container.innerHTML = memberSnapshots.map(snap => {
            if (!snap.exists()) return '';
            const mData = snap.data();
            const mName = mData.personal_info?.full_name || "Unknown";
            const mPhoto = mData.personal_info?.photo_url || `https://ui-avatars.com/api/?name=${mName}`;
            const mRole = mData.role || "Student"; // Leader or Student
            const mPoints = mData.gamification?.total_points || 0;

            const isLeader = mRole === 'Leader';

            return `
            <div class="bg-b-surface border ${isLeader ? 'border-yellow-500/30' : 'border-white/10'} rounded-xl p-4 flex items-center gap-4">
                <img src="${mPhoto}" class="w-12 h-12 rounded-full object-cover border border-white/10">
                <div>
                    <h4 class="text-sm font-bold text-white flex items-center gap-2">
                        ${mName}
                        ${isLeader ? '<i class="fas fa-crown text-yellow-500 text-xs"></i>' : ''}
                    </h4>
                    <p class="text-[10px] text-gray-500">${mRole} • ${mPoints} XP</p>
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        console.error("Squad Render Error:", e);
        container.innerHTML = '<p class="text-red-400">حدث خطأ في تحميل الأعضاء</p>';
    }
}

// =========================================================
// 6. CURRICULUM TAB (Read-Only)
// =========================================================
async function fetchCurriculumData() {
    try {
        // Check local storage first to save API calls
        const cached = localStorage.getItem('curriculum_cache');
        if (cached) {
            allCurriculumData = JSON.parse(cached);
            return;
        }

        const response = await fetch(`${APPS_SCRIPT_URL}?action=getFullCurriculum`);
        const json = await response.json();
        
        if (json.status !== 'error') {
            allCurriculumData = json;
            localStorage.setItem('curriculum_cache', JSON.stringify(json));
        }
    } catch (e) {
        console.error("Curriculum Fetch Error:", e);
    }
}

function renderCurriculumTree() {
    const container = document.getElementById('curriculum-tree-container');
    if (!allCurriculumData || !allCurriculumData.courses) {
        container.innerHTML = '<p class="text-center text-gray-500 mt-10">جاري تحميل المنهج...</p>';
        return;
    }

    // Simple Grid View for Courses
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${allCurriculumData.courses.map(course => `
                <div onclick="openCourseModal('${course.course_id}')" class="bg-black/40 border border-white/10 p-5 rounded-xl cursor-pointer hover:border-b-primary hover:bg-white/5 transition-all group">
                    <div class="h-32 w-full bg-gray-800 rounded-lg mb-4 overflow-hidden relative">
                        <img src="${course.image_url || '../assets/banners/course-placeholder.jpg'}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" onerror="this.style.display='none'">
                        <div class="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-transparent transition-colors">
                            <i class="fas fa-play-circle text-4xl text-white/80 group-hover:text-b-primary transition-colors"></i>
                        </div>
                    </div>
                    <h4 class="font-bold text-white text-lg mb-1">${course.title}</h4>
                    <p class="text-xs text-gray-400 line-clamp-2">${course.description || 'لا يوجد وصف متاح'}</p>
                    <div class="mt-3 flex items-center gap-2 text-[10px] text-gray-500">
                        <span><i class="fas fa-video mr-1"></i> دروس الفيديو</span>
                        <span>•</span>
                        <span>${course.instructor || 'Busla Team'}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Modal Logic
window.openCourseModal = (courseId) => {
    const course = allCurriculumData.courses.find(c => String(c.course_id) === String(courseId));
    if(!course) return;
    
    document.getElementById('modal-course-title').innerText = course.title;
    document.getElementById('modal-course-desc').innerText = course.description || "لا يوجد وصف.";
    
    const playlistBtn = document.getElementById('modal-course-playlist');
    if (course.playlist_url) {
        playlistBtn.href = course.playlist_url;
        playlistBtn.classList.remove('hidden');
    } else {
        playlistBtn.classList.add('hidden');
    }
    
    // Filter Contents
    const contents = allCurriculumData.contents?.filter(c => String(c.course_id) === String(courseId)) || [];
    const listHtml = contents.map(c => {
        let icon = c.type === 'video' ? 'fa-play' : (c.type === 'quiz' ? 'fa-question' : 'fa-code');
        return `<li class="flex items-center gap-2 py-1"><i class="fas ${icon} text-[10px] text-b-primary"></i> ${c.title}</li>`;
    }).join('');
    
    document.getElementById('modal-course-content-list').innerHTML = listHtml || '<li>لا توجد محتويات مسجلة</li>';
    document.getElementById('course-details-modal').classList.remove('hidden');
};

// =========================================================
// 7. FIND TEAM (MARKETPLACE)
// =========================================================
async function loadAvailableTeams() {
    const container = document.getElementById('available-teams-container');
    container.innerHTML = '<div class="col-span-full flex justify-center py-10"><div class="spinner"></div></div>';

    try {
        const snapshot = await getDocs(collection(db, "teams"));
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="col-span-full text-center text-gray-500">لا توجد فرق متاحة حالياً.</p>';
            return;
        }

        container.innerHTML = '';
        snapshot.forEach(doc => {
            const team = doc.data();
            const info = team.info || {};
            // Basic validation
            if (!info.name) return;

            container.innerHTML += `
            <div class="bg-b-surface border border-white/10 rounded-xl p-5 hover:border-b-primary/50 transition-all">
                <div class="flex items-center gap-4 mb-4">
                    <img src="${info.logo_url || '../assets/icons/team-placeholder.png'}" class="w-16 h-16 rounded-lg bg-black object-cover border border-white/10">
                    <div>
                        <h4 class="text-white font-bold text-lg leading-tight">${info.name}</h4>
                        <p class="text-xs text-gray-400 mt-1"><i class="fas fa-university mr-1"></i> ${info.university || 'عام'}</p>
                    </div>
                </div>
                <div class="flex justify-between text-xs text-gray-500 mb-4 bg-black/20 p-2 rounded">
                    <span>${team.members ? team.members.length : 0} Members</span>
                    <span class="text-yellow-500 font-bold">${team.total_score || 0} XP</span>
                </div>
                <button onclick="openTeamDetails('${doc.id}')" class="w-full py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-bold rounded-lg border border-white/5 transition-colors">
                    عرض التفاصيل
                </button>
            </div>`;
        });
    } catch (e) {
        console.error("Marketplace Error:", e);
    }
}

window.openTeamDetails = async (teamId) => {
    // 1. Fetch Fresh Data
    const teamDoc = await getDoc(doc(db, "teams", teamId));
    if(!teamDoc.exists()) return;

    const team = teamDoc.data();
    const info = team.info || {};
    
    // 2. Fetch Leader Name
    let leaderName = "N/A";
    if (info.leader_id) {
        const lDoc = await getDoc(doc(db, "users", info.leader_id));
        if (lDoc.exists()) leaderName = lDoc.data().personal_info?.full_name || "Leader";
    }

    // 3. Populate Modal
    document.getElementById('modal-team-name').innerText = info.name;
    document.getElementById('modal-team-logo').src = info.logo_url || "";
    document.getElementById('modal-team-score').innerText = team.total_score || 0;
    document.getElementById('modal-team-uni').innerText = info.university || "-";
    document.getElementById('modal-team-gov').innerText = info.governorate || "-";
    document.getElementById('modal-team-leader').innerText = leaderName;

    // 4. Setup Button
    const btn = document.getElementById('btn-join-team-request');
    btn.innerHTML = '<i class="fas fa-user-plus"></i> إرسال طلب انضمام';
    btn.disabled = false;
    btn.onclick = () => sendJoinRequest(teamId, info.leader_id);

    document.getElementById('team-preview-modal').classList.remove('hidden');
};

async function sendJoinRequest(teamId, leaderId) {
    if(!currentUser) return;
    const btn = document.getElementById('btn-join-team-request');
    btn.innerHTML = 'جاري الإرسال...';
    btn.disabled = true;

    try {
        // Check duplicates
        const q = query(collection(db, "team_requests"), 
            where("sender_uid", "==", currentUser.uid),
            where("status", "==", "Pending")
        );
        const snap = await getDocs(q);
        if(!snap.empty) {
            alert("لديك طلب معلق بالفعل!");
            return;
        }

        await addDoc(collection(db, "team_requests"), {
            type: "join_request",
            sender_uid: currentUser.uid,
            sender_name: document.getElementById('header-user-name').innerText,
            team_id: teamId,
            leader_id: leaderId,
            status: "Pending",
            created_at: serverTimestamp()
        });

        alert("تم إرسال الطلب بنجاح!");
        document.getElementById('team-preview-modal').classList.add('hidden');

    } catch (e) {
        console.error("Join Error:", e);
        alert("حدث خطأ.");
    } finally {
        btn.disabled = false;
    }
}