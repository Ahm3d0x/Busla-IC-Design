import { auth, db, doc, getDoc, getDocs, updateDoc, arrayUnion, arrayRemove, query, where, collection, onAuthStateChanged, signOut, serverTimestamp } from './firebase-config.js';
import { getTeamData } from './team-system.js';

// --- Constants & Config ---
// Please ensure this URL is the latest deployment from your Apps Script
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwTZcXVXAqpu2H7Int1omEeJrfS8bfiSmhhWayX-wjOJsbaHH4-LX39K4RhVKmzrUOL/exec';
const CACHE_KEY = 'busla_lms_v3_master';

// --- State Management ---
let currentUser = null;
let currentTeam = null;
let allData = { phases: [], courses: [], tree: [] };
let selectedAssignCourse = null;
let expandedNodes = new Set(); // Stores IDs of expanded nodes to persist state across renders

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await initDashboard(user.uid);
        } else {
            window.location.href = "auth.html";
        }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = "auth.html";
    });
});

/**
 * Main Initialization Logic
 * Uses "Cache First" strategy for instant loading
 */
async function initDashboard(uid) {
    try {
        // 1. Fetch User Data
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) throw new Error("User profile not found");
        const userData = userDoc.data();

        // 2. Role Validation
        const role = userData.role || (userData.system_info?.role);
        const teamId = userData.team_id || (userData.system_info?.team_id);

        if (role !== 'Leader' || !teamId) {
            window.location.href = "student-dash.html";
            return;
        }

        // 3. Fetch Team Data
        currentTeam = await getTeamData(teamId);
        if (!currentTeam) throw new Error("Team not found");
        currentTeam.team_id = teamId;

        // 4. Update Header UI
        updateHeaderInfo(userData, currentTeam);

        // 5. Load Content (Cache First -> Then Network)
        loadFromCache();
        renderAllTabs(); // Render immediately with cached data

        // Background Fetch
        fetchDataFromServer().then(() => {
            renderAllTabs(); // Re-render with fresh data
            console.log("Data synced with server");
        }).catch(err => console.error("Background sync failed:", err));

    } catch (e) {
        console.error("Init Error:", e);
        showToast("Error loading dashboard", "error");
    }
}

// --- Data Handling ---

function updateHeaderInfo(user, team) {
    const safeText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    
    const name = user.personal_info?.full_name || user.full_name || "Leader";
    const points = user.gamification?.total_points || user.total_points || 0;
    
    safeText('leader-name', name);
    safeText('my-points', points);
    safeText('team-name-sidebar', team.info?.name || "My Team");
    safeText('team-name-display', team.info?.name || "My Team");
    safeText('stat-team-score', team.total_score || 0);
    safeText('stat-members-count', `${team.members ? team.members.length : 0} / 5`);
}

function loadFromCache() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            allData = JSON.parse(cached);
        } catch (e) {
            console.error("Cache corrupted");
            localStorage.removeItem(CACHE_KEY);
        }
    }
}

async function fetchDataFromServer() {
    try {
        // Try fetching Phases (if supported) and Courses
        // We use Promise.all to fetch concurrently if needed, but for now sequential is safer for error handling
        
        // 1. Fetch Courses (and Sections)
        const cRes = await fetch(`${APPS_SCRIPT_URL}?action=getCourses`);
        const cJson = await cRes.json();

        // 2. Fetch Phases (try API, else fallback)
        let phasesData = [];
        try {
            const pRes = await fetch(`${APPS_SCRIPT_URL}?action=getPhases`);
            const pJson = await pRes.json();
            if (pJson.status === "success") phasesData = pJson.data;
        } catch(e) { console.warn("Phases API not available, using fallback"); }

        if (cJson.status === "success") {
            allData.courses = cJson.data;

            // Use fetched phases or fallback
            if (phasesData.length > 0) {
                allData.phases = phasesData;
            } else if (!allData.phases || allData.phases.length === 0) {
                allData.phases = [
                    { phase_id: "1", title: "المرحلة التمهيدية", description: "التعرف على المجال" },
                    { phase_id: "2", title: "المرحلة الأولى", description: "أساسيات الدوائر الرقمية" },
                    { phase_id: "3", title: "المرحلة الثانية", description: "المواضيع المتقدمة" },
                    { phase_id: "4", title: "المرحلة الثالثة", description: "التخصص الدقيق" }
                ];
            }
            
            localStorage.setItem(CACHE_KEY, JSON.stringify(allData));
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }
}

function renderAllTabs() {
    renderOverview();
    renderRoadmapTree();
    renderAssignments();
    renderSquad();
    renderGrading();
}

// ==========================================
// 1. Overview Tab Logic
// ==========================================
function renderOverview() {
    const list = document.getElementById('overview-courses-list');
    const taskList = document.getElementById('student-tasks-list');
    
    const activeIds = currentTeam.courses_plan || [];
    const tasks = (currentTeam.weekly_tasks || []).filter(t => t.title);

    document.getElementById('stat-active-courses').innerText = activeIds.length;
    document.getElementById('stat-active-tasks').innerText = tasks.length;

    // Render Active Courses (exclude nested sections for cleaner view)
    const activeCourses = allData.courses.filter(c => 
        activeIds.includes(String(c.course_id || c.id)) && 
        (!c.type || c.type.toLowerCase() !== 'section')
    );

    if (activeCourses.length === 0) {
        list.innerHTML = `<p class="col-span-full text-center text-gray-500 py-6">لم يتم تفعيل أي كورسات بعد.</p>`;
    } else {
        list.innerHTML = activeCourses.map(c => `
            <div class="bg-white/5 p-4 rounded-xl border border-white/10 hover:border-b-primary/50 transition-all flex gap-4 items-start group">
                <div class="w-12 h-12 rounded-lg bg-gray-800 shrink-0 overflow-hidden">
                    <img src="${c.image_url || '../assets/images/1.jpg'}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity">
                </div>
                <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-white text-sm truncate">${c.title}</h4>
                    <p class="text-xs text-gray-400 mt-1 line-clamp-2">${c.description || ''}</p>
                    <a href="course-player.html?id=${c.course_id || c.id}" class="inline-block mt-2 text-[10px] bg-b-primary hover:bg-teal-700 text-white px-3 py-1 rounded font-bold transition-colors">ابدأ التعلم</a>
                </div>
            </div>
        `).join('');
    }

    if (tasks.length === 0) {
        taskList.innerHTML = `<p class="text-gray-500 text-center py-4 text-xs">لا توجد مهام نشطة.</p>`;
    } else {
        taskList.innerHTML = tasks.map(t => `
            <div class="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5 hover:bg-white/10 transition-colors group">
                <div class="flex items-center gap-3">
                    <div class="w-2 h-2 rounded-full bg-green-500"></div>
                    <div>
                        <h4 class="font-bold text-sm text-gray-200 group-hover:text-white">${t.title}</h4>
                        <span class="text-[10px] bg-white/5 px-1.5 rounded text-gray-500 border border-white/5">${t.type || 'task'}</span>
                    </div>
                </div>
                <a href="course-player.html?id=${t.course_id || ''}" class="text-xs text-green-400 hover:text-white font-bold transition-colors">ذهاب <i class="fas fa-arrow-left ml-1"></i></a>
            </div>
        `).join('');
    }
}

// ==========================================
// 2. Roadmap Tree Logic (Corrected)
// ==========================================
function renderRoadmapTree() {
    const container = document.getElementById('roadmap-tree-container');
    container.innerHTML = '';

    if (!allData.phases || allData.phases.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-500">جاري تحميل المنهج...</div>';
        return;
    }

    allData.phases.forEach((phase) => {
        const phaseId = String(phase.phase_id || phase.id);
        
        // 1. Get All Items for this Phase
        const phaseItems = allData.courses.filter(c => String(c.phase_id) === phaseId);
        
        // 2. Identify Root Items
        // Root = No 'related_with' OR 'related_with' is empty
        const rootItems = phaseItems.filter(item => !item.related_with || String(item.related_with).trim() === "");

        const phaseEl = document.createElement('div');
        phaseEl.className = "mb-6 border-l-2 border-white/10 pl-6 relative";
        
        // Phase Header
        phaseEl.innerHTML = `
            <div class="absolute -left-[9px] top-0 w-4 h-4 bg-b-primary rounded-full border-2 border-black box-content"></div>
            
            <div class="flex items-center justify-between mb-4 select-none group">
                <div class="cursor-pointer flex-1" onclick="showDetails('phase', '${phaseId}')">
                    <h3 class="font-bold text-lg text-purple-400 group-hover:text-white transition-colors">${phase.title}</h3>
                </div>
                <div class="p-2 cursor-pointer hover:bg-white/5 rounded-full transition-all" 
                     onclick="togglePhaseContent('${phaseId}')">
                    <i class="fas fa-chevron-down text-gray-500 transition-transform duration-300" id="icon-phase-${phaseId}"></i>
                </div>
            </div>
            
            <div id="content-phase-${phaseId}" class="space-y-3"></div>
        `;

        const itemsContainer = phaseEl.querySelector(`#content-phase-${phaseId}`);

        if (rootItems.length === 0) {
            itemsContainer.innerHTML = '<p class="text-xs text-gray-600 italic pl-2">لا يوجد محتوى في هذه المرحلة.</p>';
        }

        rootItems.forEach(root => {
            const rootId = String(root.course_id || root.id);
            const isActive = (currentTeam.courses_plan || []).includes(rootId);
            
            // 3. Find Children (Sections related to this root)
            const children = phaseItems.filter(child => String(child.related_with) === rootId);
            
            const isStandalone = (root.type && root.type.toLowerCase().includes('sec')) && children.length === 0;
            const hasChildren = children.length > 0;
            
            // Check persistence state
            const isExpanded = expandedNodes.has(rootId);

            const itemHTML = document.createElement('div');
            itemHTML.className = `rounded-xl overflow-hidden border transition-all duration-300 ${isActive ? 'border-green-500/50 bg-green-500/5 shadow-[0_0_15px_rgba(34,197,94,0.05)]' : 'border-white/10 bg-b-surface'} ${isStandalone ? 'ml-4 border-dashed border-white/20' : ''}`;

            itemHTML.innerHTML = `
                <div class="p-3 flex items-center justify-between cursor-pointer hover:bg-white/5 select-none"
                     onclick="handleItemClick('${isStandalone ? 'section' : 'course'}', '${rootId}', ${hasChildren})">
                    
                    <div class="flex items-center gap-3 overflow-hidden flex-1">
                        <div class="w-9 h-9 rounded-lg flex items-center justify-center bg-black/20 border border-white/5 shrink-0 text-sm">
                            ${isActive ? '<i class="fas fa-check text-green-400"></i>' : 
                              (isStandalone ? '<i class="fas fa-puzzle-piece text-blue-400"></i>' : '<i class="fas fa-book text-purple-400"></i>')}
                        </div>
                        <div class="truncate">
                            <h4 class="font-bold text-sm ${isActive ? 'text-green-100' : 'text-gray-200'} truncate">${root.title}</h4>
                            <span class="text-[10px] text-gray-500 block">
                                ${isStandalone ? 'محتوى مستقل' : (hasChildren ? `${children.length} دروس` : 'كورس رئيسي')}
                            </span>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <div class="relative flex items-center justify-center p-2 rounded-full hover:bg-white/10" 
                             onclick="event.stopPropagation()">
                            <input type="checkbox" 
                                   class="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-600 bg-gray-800 transition-all checked:border-green-500 checked:bg-green-500 hover:border-green-400"
                                   ${isActive ? 'checked' : ''} 
                                   onchange="toggleActivate('${rootId}', this.checked)">
                            <i class="fas fa-check text-white text-[10px] absolute pointer-events-none opacity-0 peer-checked:opacity-100"></i>
                        </div>
                        
                        ${hasChildren ? 
                            `<div class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                                  onclick="event.stopPropagation(); toggleCourseContent('${rootId}')">
                                <i class="fas fa-chevron-down text-gray-500 text-xs transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}" id="icon-${rootId}"></i>
                             </div>` 
                            : '<div class="w-8"></div>'} 
                    </div>
                </div>
                
                ${hasChildren ? `
                <div id="details-${rootId}" class="${isExpanded ? '' : 'hidden'} border-t border-white/5 bg-black/20 p-2 space-y-1">
                    ${children.map(child => {
                        const childId = String(child.course_id || child.id);
                        const childActive = (currentTeam.courses_plan || []).includes(childId);
                        return `
                        <div class="group flex items-center justify-between p-2 rounded-lg hover:bg-white/5 ml-4 transition-colors cursor-pointer border border-transparent hover:border-white/5 ${childActive ? 'bg-green-500/10 border-green-500/20' : ''}"
                             onclick="showDetails('section', '${childId}', '${root.title}'); event.stopPropagation();">
                            
                            <div class="flex items-center gap-3 overflow-hidden flex-1">
                                <i class="fas fa-level-up-alt rotate-90 text-gray-600 text-xs shrink-0 group-hover:text-gray-400 transition-colors"></i>
                                <span class="text-xs text-gray-400 group-hover:text-gray-200 truncate ${childActive ? 'text-green-200 font-bold' : ''}">${child.title}</span>
                            </div>

                            <div class="relative flex items-center justify-center p-1 rounded-full hover:bg-white/10" 
                                 onclick="event.stopPropagation()">
                                <input type="checkbox" 
                                       class="peer h-3.5 w-3.5 cursor-pointer appearance-none rounded border border-gray-600 bg-gray-800 transition-all checked:border-green-500 checked:bg-green-500 hover:border-green-400"
                                       ${childActive ? 'checked' : ''} 
                                       onchange="toggleActivate('${childId}', this.checked)">
                                <i class="fas fa-check text-white text-[8px] absolute pointer-events-none opacity-0 peer-checked:opacity-100"></i>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                ` : ''}
            `;
            
            itemsContainer.appendChild(itemHTML);
        });

        container.appendChild(phaseEl);
    });
}

// --- Interaction Functions ---

window.handleItemClick = (type, id, hasChildren) => {
    showDetails(type, id);
    // Only auto-expand if it has children and is currently collapsed
    if (hasChildren) {
        const content = document.getElementById(`details-${id}`);
        if (content && content.classList.contains('hidden')) {
            toggleCourseContent(id);
        }
    }
};

window.togglePhaseContent = (phaseId) => {
    const content = document.getElementById(`content-phase-${phaseId}`);
    const icon = document.getElementById(`icon-phase-${phaseId}`);
    if (content) content.classList.toggle('hidden');
    if (icon) icon.classList.toggle('rotate-180');
};

window.toggleCourseContent = (courseId) => {
    const content = document.getElementById(`details-${courseId}`);
    const icon = document.getElementById(`icon-${courseId}`);
    if (content) {
        const isHidden = content.classList.toggle('hidden');
        if (icon) icon.classList.toggle('rotate-180');
        if (!isHidden) expandedNodes.add(String(courseId));
        else expandedNodes.delete(String(courseId));
    }
};

window.showDetails = (type, id, parentTitle = "") => {
    const ph = document.getElementById('node-details-placeholder');
    const ct = document.getElementById('node-details-content');
    
    ph.classList.add('hidden');
    ct.classList.remove('hidden');

    let item;
    if (type === 'phase') item = allData.phases.find(p => String(p.phase_id || p.id) === String(id));
    else item = allData.courses.find(c => String(c.course_id || c.id) === String(id));

    if (!item) return;

    const setText = (eid, txt) => {
        const el = document.getElementById(eid);
        if(el) el.innerText = txt || 'غير محدد';
    };

    setText('detail-title', item.title);
    setText('detail-desc', item.description || item.desc || "لا يوجد وصف متاح.");
    setText('detail-type', type === 'phase' ? 'PHASE' : (item.type || 'COURSE').toUpperCase());
    setText('detail-time', item['Module Time'] || item.module_time || 'غير محدد');
    setText('detail-tools', item.tools_required || item.tools || 'لا توجد أدوات');

    const handleSection = (containerId, textId, content) => {
        const cont = document.getElementById(containerId);
        const txt = document.getElementById(textId);
        if (content && content !== 'None' && content !== 'no') {
            cont.classList.remove('hidden');
            txt.innerText = content;
        } else {
            cont.classList.add('hidden');
        }
    };

    handleSection('detail-prereq-container', 'detail-prereq', item.prerequisites);
    handleSection('detail-learn-container', 'detail-learn', item.what_you_will_learn);
    handleSection('detail-notes-container', 'detail-notes', item.Note);

    const imgEl = document.getElementById('detail-img');
    if (imgEl) imgEl.src = item.image_url || '../assets/images/1.jpg';

    const toggleArea = document.getElementById('course-action-area');
    if (type === 'phase') {
        toggleArea.classList.add('hidden');
    } else {
        toggleArea.classList.remove('hidden');
        const chk = document.getElementById('course-toggle-btn');
        if(chk) {
            chk.checked = (currentTeam.courses_plan || []).includes(String(id));
            const newChk = chk.cloneNode(true);
            chk.parentNode.replaceChild(newChk, chk);
            newChk.addEventListener('change', (e) => toggleActivate(String(id), e.target.checked));
        }
    }
};

window.toggleActivate = async (id, isChecked) => {
    // 1. Optimistic Local Update
    if(!currentTeam.courses_plan) currentTeam.courses_plan = [];
    
    if (isChecked) {
        if (!currentTeam.courses_plan.includes(id)) currentTeam.courses_plan.push(id);
    } else {
        currentTeam.courses_plan = currentTeam.courses_plan.filter(x => x !== id);
    }

    // 2. Refresh UI immediately
    renderRoadmapTree();
    renderOverview();
    renderAssignments();
    
    // Update Details Button
    const detailBtn = document.getElementById('course-toggle-btn');
    if(detailBtn) detailBtn.checked = isChecked;

    // 3. Server Sync
    try {
        const ref = doc(db, "teams", currentTeam.team_id);
        if (isChecked) {
            await updateDoc(ref, { courses_plan: arrayUnion(id) });
            showToast("تم التفعيل ✅", "success");
        } else {
            await updateDoc(ref, { courses_plan: currentTeam.courses_plan });
            showToast("تم الإيقاف ⏸️", "info");
        }
    } catch (e) {
        console.error("Sync Error:", e);
        showToast("فشل الحفظ في السيرفر", "error");
    }
};

// ==========================================
// 3. Assignments Tab Logic (Fixed Content Load)
// ==========================================
function renderAssignments() {
    const list = document.getElementById('assign-courses-list');
    const activeIds = currentTeam.courses_plan || [];
    
    if (activeIds.length === 0) {
        list.innerHTML = `<p class="text-center text-gray-500 text-xs py-10">قم بتفعيل كورسات من الخريطة أولاً.</p>`;
        return;
    }

    const activeItems = allData.courses.filter(c => activeIds.includes(String(c.course_id || c.id)));
    
    list.innerHTML = activeItems.map(item => `
        <div onclick="loadAssignContent('${item.course_id || item.id}')" 
             class="bg-white/5 p-3 rounded-lg border border-white/10 cursor-pointer hover:bg-white/10 hover:border-b-primary transition-all flex justify-between items-center group mb-2">
            <div class="min-w-0">
                <h4 class="font-bold text-sm text-white truncate">${item.title}</h4>
                <span class="text-[10px] text-gray-500 bg-black/20 px-2 py-0.5 rounded border border-white/5 inline-block mt-1">${item.type || 'Course'}</span>
            </div>
            <i class="fas fa-chevron-left text-gray-600 group-hover:text-white transition-colors text-xs"></i>
        </div>
    `).join('');
}

window.loadAssignContent = async (cid) => {
    selectedAssignCourse = cid;
    const cont = document.getElementById('assign-content-list');
    cont.innerHTML = `<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></div>`;
    
    try {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=getCourseContent&course_id=${cid}`);
        const json = await res.json();
        
        if (json.data && json.data.length > 0) {
            cont.innerHTML = json.data.map(m => `
                <label class="flex items-center gap-3 p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group">
                    <input type="checkbox" value="${m.content_id}" class="task-check w-4 h-4 accent-b-primary bg-gray-700 border-gray-600 rounded">
                    <div class="flex-1">
                        <span class="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">${m.title}</span>
                    </div>
                </label>
            `).join('');
            
            const btn = document.getElementById('publish-btn');
            if(btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        } else {
            cont.innerHTML = `<p class="text-center text-gray-500 py-10">لا يوجد محتوى متاح لهذا العنصر.</p>`;
        }
    } catch (e) {
        cont.innerHTML = `<p class="text-center text-red-400 py-10">خطأ في التحميل.</p>`;
    }
};

window.publishSelectedTasks = async () => {
    const checks = document.querySelectorAll('.task-check:checked');
    if (checks.length === 0) return showToast("اختر محتوى واحد على الأقل", "error");

    const btn = document.getElementById('publish-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    const newTasks = [];
    checks.forEach(box => {
        const row = box.closest('label');
        newTasks.push({
            task_id: `T_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
            course_id: selectedAssignCourse,
            content_id: box.value,
            title: row.querySelector('span').innerText,
            type: 'video',
            assigned_at: new Date().toISOString()
        });
    });

    try {
        await updateDoc(doc(db, "teams", currentTeam.team_id), {
            weekly_tasks: arrayUnion(...newTasks)
        });
        
        if(!currentTeam.weekly_tasks) currentTeam.weekly_tasks = [];
        currentTeam.weekly_tasks.push(...newTasks);
        
        showToast(`تم نشر ${newTasks.length} مهام بنجاح!`, "success");
        renderOverview();
    } catch (e) {
        showToast("فشل النشر", "error");
    } finally {
        btn.innerHTML = 'نشر المحدد';
    }
};

window.submitCustomTask = async () => {
    const t = document.getElementById('ct-title').value;
    const d = document.getElementById('ct-desc').value;
    if(!t) return showToast("العنوان مطلوب", "error");

    const task = {
        task_id: `CT_${Date.now()}`,
        title: t,
        description: d,
        type: 'custom',
        is_custom: true,
        assigned_at: new Date().toISOString()
    };

    try {
        await updateDoc(doc(db, "teams", currentTeam.team_id), { weekly_tasks: arrayUnion(task) });
        currentTeam.weekly_tasks.push(task);
        showToast("تم النشر", "success");
        closeModal('custom-task-modal');
        renderOverview();
    } catch (e) { showToast("فشل", "error"); }
};

// ==========================================
// 4. Squad & Management
// ==========================================
function renderSquad() {
    const list = document.getElementById('squad-list');
    const select = document.getElementById('new-leader-select');
    if(!list) return;
    
    list.innerHTML = '';
    if(select) select.innerHTML = '';

    if(!currentTeam.members) return;

    currentTeam.members.forEach(async (mid) => {
        const mDoc = await getDoc(doc(db, "users", mid));
        if(!mDoc.exists()) return;
        const md = mDoc.data();
        
        const name = md.personal_info?.full_name || md.full_name || "Unknown";
        const isMe = mid === currentUser.uid;
        const isLeader = mid === currentTeam.leader_id;

        list.innerHTML += `
            <div class="p-4 flex justify-between items-center hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center font-bold text-gray-400 border border-white/10 uppercase">
                        ${name.charAt(0)}
                    </div>
                    <div>
                        <h4 class="font-bold text-sm text-white flex items-center gap-2">
                            ${name} 
                            ${isMe ? '<span class="text-[10px] bg-white/10 px-1.5 rounded text-gray-400">أنت</span>' : ''}
                            ${isLeader ? '<i class="fas fa-crown text-yellow-500 text-xs"></i>' : ''}
                        </h4>
                        <p class="text-[10px] text-gray-500 font-mono">${md.total_points || 0} XP</p>
                    </div>
                </div>
                ${!isMe && !isLeader ? `<button class="text-red-400 hover:text-red-500 text-xs px-3 py-1.5 border border-red-500/20 hover:bg-red-500/10 rounded transition-all">طرد</button>` : ''}
            </div>
        `;

        if (!isMe && select) {
            const opt = document.createElement('option');
            opt.value = mid;
            opt.text = name;
            select.appendChild(opt);
        }
    });
}

window.confirmLeaveTeam = async () => {
    const newLeaderId = document.getElementById('new-leader-select').value;
    if (!newLeaderId) return showToast("يجب اختيار قائد جديد", "error");

    try {
        const teamRef = doc(db, "teams", currentTeam.team_id);
        const meRef = doc(db, "users", currentUser.uid);
        const newLeaderRef = doc(db, "users", newLeaderId);

        await updateDoc(teamRef, {
            leader_id: newLeaderId,
            members: arrayRemove(currentUser.uid)
        });

        await updateDoc(newLeaderRef, { role: "Leader" });

        await updateDoc(meRef, { 
            role: "Student", 
            team_id: null 
        });

        showToast("تم المغادرة بنجاح", "success");
        setTimeout(() => window.location.href = "student-dash.html", 1500);

    } catch (e) {
        console.error(e);
        showToast("خطأ في المغادرة", "error");
    }
};

window.sendBroadcast = () => {
    const msg = document.getElementById('broadcast-text').value;
    if(msg) {
        showToast("تم الإرسال (تجريبي)", "success");
        closeModal('broadcast-modal');
    }
};

function renderGrading() {
    const grid = document.getElementById('submissions-grid');
    if(grid) {
        grid.innerHTML = `
            <div class="col-span-full text-center text-gray-500 py-20 flex flex-col items-center">
                <i class="fas fa-clipboard-check text-4xl mb-4 text-green-500/20"></i>
                <p>لا توجد مشاريع للمراجعة.</p>
            </div>
        `;
    }
}

// --- Global Utilities ---

function showToast(msg, type='info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const color = type === 'success' ? 'border-green-500' : (type === 'error' ? 'border-red-500' : 'border-blue-500');
    
    toast.className = `bg-gray-900/95 text-white px-6 py-4 rounded-xl border-l-4 ${color} shadow-2xl backdrop-blur flex items-center gap-3 animate-slide-in pointer-events-auto min-w-[300px] mb-3`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle text-green-400' : 'info-circle text-blue-400'} text-xl"></i><span>${msg}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => { 
        toast.classList.add('opacity-0', 'translate-y-4', 'transition-all');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Expose functions
window.switchTab = (id) => {
    document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('bg-b-primary/10', 'text-b-primary', 'font-bold');
        b.classList.add('text-gray-400');
    });
    
    const btn = document.getElementById('btn-'+id);
    if(btn) {
        btn.classList.add('bg-b-primary/10', 'text-b-primary', 'font-bold');
        btn.classList.remove('text-gray-400');
    }
};

window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.openCustomTaskModal = () => document.getElementById('custom-task-modal').classList.remove('hidden');
window.openBroadcastModal = () => document.getElementById('broadcast-modal').classList.remove('hidden');
window.openLeaveTeamModal = () => document.getElementById('leave-team-modal').classList.remove('hidden');
window.openAddMemberModal = () => showToast("نظام الدعوات قريباً", "info");