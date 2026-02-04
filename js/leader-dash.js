import { 
    auth, db, doc, getDoc, getDocs, updateDoc, setDoc, deleteDoc, writeBatch, // 👈 تأكد من وجود دول
    arrayUnion, arrayRemove, query, where, collection, onAuthStateChanged, signOut, serverTimestamp 
} from './firebase-config.js';
import { getTeamData } from './team-system.js';
// --- Configuration ---
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzvJ8zpNLRY24HiRvsJqn2y-8ygijipiyFeJpxcv4bEXSg-Mx_n52aXywx1uYqy2KCi/exec';
const CACHE_KEY = 'busla_lms_v5_final';

// --- State Management ---
let currentUser = null;
let currentTeam = null;
let currentUserData = null;
let allData = { phases: [], courses: [], tree: [] };
let selectedAssignCourse = null;
let expandedNodes = new Set(); // Persist expanded tree nodes

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

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await signOut(auth);
            window.location.href = "auth.html";
        });
    }
});

async function initDashboard(uid) {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) throw new Error("User profile not found");
        
        // 👇 حفظ البيانات عالمياً
        currentUserData = userDoc.data(); // هذا السطر مهم جداً
        const userData = currentUserData;

        const role = userData.role || (userData.system_info?.role);
        const teamId = userData.team_id || (userData.system_info?.team_id);

        if (role !== 'Leader' || !teamId) {
            window.location.href = "student-dash.html";
            return;
        }
        if(document.getElementById('calendar')) renderCalendarTab();
        currentTeam = await getTeamData(teamId);
        if (!currentTeam) throw new Error("Team not found");
        currentTeam.team_id = teamId;

        updateHeaderInfo(userData, currentTeam);
        loadFromCache();
        renderAllTabs();

        fetchDataFromServer().then(() => {
            renderAllTabs();
        }).catch(err => console.error("Background sync failed:", err));

    } catch (e) {
        console.error("Init Error:", e);
        showToast("Error loading dashboard", "error");
    }
}

function getSafeDate(dateVal) {
    if (!dateVal) return new Date(); // لو فارغ هات تاريخ دلوقتي
    if (typeof dateVal.toDate === 'function') {
        return dateVal.toDate(); // لو جاي من Firebase Timestamp
    }
    return new Date(dateVal); // لو جاي String أو Date عادي
}
// إضافة دالة مساعدة لفتح المودال الجديد
window.openTaskDetailsModal = (taskId) => {
    // البحث عن المهمة في البيانات المحلية
    const task = currentTeam.weekly_tasks.find(t => t.task_id === taskId);
    if (!task) return;

    document.getElementById('modal-task-title').innerText = task.title || 'بدون عنوان';
    document.getElementById('modal-task-desc').innerText = task.description || 'لا يوجد وصف متاح.';
    document.getElementById('modal-task-duration').innerText = formatDuration(task.duration) || '--:--';
    
    // رابط المشغل
    const playerLink = `course-player.html?id=${task.course_id}&content=${task.content_id}&task_id=${task.task_id}`;
    document.getElementById('modal-task-link').href = playerLink;

    document.getElementById('task-details-modal').classList.remove('hidden');
};

// ==========================================
// إصلاح: عرض الاسم والتفاصيل في كارت المهمة
// ==========================================
async function renderTeamOverview(tasks) {
    const container = document.getElementById('overview-container');
    if (!container) return;
    container.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-500"><i class="fas fa-clipboard-list text-4xl mb-3"></i><p>لا توجد مهام نشطة حالياً</p></div>`;
        return;
    }

    const currentWeek = getCurrentWeekCycle();
    // ترتيب المهام
    tasks.sort((a, b) => getSafeDate(b.created_at) - getSafeDate(a.created_at));

    const currentWeekTasks = tasks.filter(t => t.week_id === currentWeek.id);
    const historyTasks = tasks.filter(t => t.week_id !== currentWeek.id);

    const createTaskCard = (task, isHistory = false) => {
        const canDelete = (task.week_id === currentWeek.id) && (!task.stats || task.stats.started_count === 0);
        const title = task.title || "مهمة بدون عنوان"; // استخدام الاسم المخزن
        const dur = formatDuration(task.duration);

        return `
            <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between items-center group hover:border-b-primary transition-all relative">
                <div class="flex items-center gap-4 flex-1 cursor-pointer" onclick="openTaskDetailsModal('${task.task_id}')">
                    <div class="w-12 h-12 rounded-lg bg-b-primary/20 flex items-center justify-center text-b-primary text-xl">
                        <i class="fas fa-play"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-white text-base line-clamp-1">${title}</h4>
                        <div class="flex items-center gap-3 mt-1.5">
                            <span class="text-xs text-gray-400 flex items-center gap-1">
                                <i class="far fa-clock"></i> ${dur || '--:--'}
                            </span>
                            ${!isHistory ? '<span class="px-2 py-0.5 bg-green-900/50 text-green-400 text-[10px] rounded border border-green-700">نشط</span>' : ''}
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-3 z-10">
                     <a href="course-player.html?id=${task.course_id}&content=${task.content_id}&task_id=${task.task_id}" 
                        class="w-9 h-9 rounded-lg bg-b-primary text-white flex items-center justify-center hover:bg-teal-700 transition-colors shadow-lg"
                        title="ابدأ المهمة">
                        <i class="fas fa-external-link-alt text-sm"></i>
                    </a>
                    ${canDelete ? `
                        <button onclick="deleteTask('${task.task_id}', '${task.week_id}')" 
                                class="w-9 h-9 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center">
                            <i class="fas fa-trash-alt text-sm"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    };

    let html = '';
    if (currentWeekTasks.length > 0) {
        html += `<h3 class="text-b-hl-light font-bold mb-4 flex items-center gap-2"><i class="fas fa-calendar-week"></i> الأسبوع الحالي</h3>
                 <div class="space-y-3 mb-8">${currentWeekTasks.map(t => createTaskCard(t)).join('')}</div>`;
    }
    if (historyTasks.length > 0) {
        html += `<h3 class="text-gray-400 font-bold mb-4 pt-4 border-t border-white/10 flex items-center gap-2"><i class="fas fa-history"></i> الأرشيف</h3>
                 <div class="space-y-3 opacity-60">${historyTasks.map(t => createTaskCard(t, true)).join('')}</div>`;
    }
    container.innerHTML = html;
}
function getCurrentWeekCycle() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 (Sun) -> 6 (Sat)
    
    // تحويل اليوم ليكون السبت هو 0، الأحد هو 1، ... الجمعة هو 6
    // JS: Sun=0, Mon=1, ..., Sat=6
    // Target: Sat=0, Sun=1, ..., Fri=6
    // المعادلة: (day + 1) % 7
    const daysSinceSaturday = (dayOfWeek + 1) % 7;
    
    // تاريخ بداية الأسبوع (السبت الماضي أو اليوم لو سبت)
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - daysSinceSaturday);
    startDate.setHours(0, 0, 0, 0);
    
    // تاريخ نهاية الأسبوع (الجمعة القادمة)
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
    
    // Week ID موحد بصيغة YYYY-MM-DD لأول يوم في الأسبوع
    const weekId = startDate.toISOString().split('T')[0];

    return {
        id: weekId,
        start: startDate,
        end: endDate,
        isExpired: (dateToCheck) => dateToCheck > endDate
    };
}

function updateHeaderInfo(user, team) {
    const safeText = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.innerText = txt;
    };

    const name = user.personal_info?.full_name || user.full_name || "Leader";
    const points = user.gamification?.total_points || user.total_points || 0;

    safeText('leader-name', name);
    safeText('my-points', points);
    safeText('team-name-sidebar', team.info?.name || "Team");
    safeText('team-name-display', team.info?.name || "Team");
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
        // Fetch Courses (containing stats)
        const cRes = await fetch(`${APPS_SCRIPT_URL}?action=getCourses`);
        const cJson = await cRes.json();

        // Fetch Phases (optional, fallback if fails)
        let phasesData = [];
        try {
            const pRes = await fetch(`${APPS_SCRIPT_URL}?action=getPhases`);
            const pJson = await pRes.json();
            if (pJson.status === "success") phasesData = pJson.data;
        } catch (e) { console.warn("Phases API not reachable, using cache/fallback"); }

        if (cJson.status === "success") {
            allData.courses = cJson.data;

            if (phasesData.length > 0) {
                allData.phases = phasesData;
            } else if (!allData.phases || allData.phases.length === 0) {
                // Static Fallback
                allData.phases = [
                    { phase_id: "1", title: "Intro Phase", description: "Introduction" },
                    { phase_id: "2", title: "Phase 1", description: "Basics" },
                    { phase_id: "3", title: "Phase 2", description: "Advanced" },
                    { phase_id: "4", title: "Phase 3", description: "Specialization" }
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

function renderOverview() {
    // 1. استدعاء دالة رسم الهيدر الجديدة 👇
    renderWeekInfo();

    const activeIds = (currentTeam && currentTeam.courses_plan) ? currentTeam.courses_plan : [];
    const tasks = (currentTeam && currentTeam.weekly_tasks) ? currentTeam.weekly_tasks : [];

    const statCourses = document.getElementById('stat-active-courses');
    const statTasks = document.getElementById('stat-active-tasks');

    if (statCourses) statCourses.innerText = activeIds.length;
    if (statTasks) statTasks.innerText = tasks.length;

    renderTeamOverview(tasks);
}
function renderRoadmapTree() {
    const container = document.getElementById('roadmap-tree-container');
    container.innerHTML = '';

    if (!allData.phases || allData.phases.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-500">Loading curriculum...</div>';
        return;
    }

    allData.phases.forEach((phase) => {
        const phaseId = String(phase.phase_id || phase.id);
        const phaseItems = allData.courses.filter(c => String(c.phase_id) === phaseId);
        
        // Root Items: Items with NO 'related_with' value
        const rootItems = phaseItems.filter(item => !item.related_with || String(item.related_with).trim() === "");

        const phaseEl = document.createElement('div');
        phaseEl.className = "mb-6 border-l-2 border-white/10 pl-6 relative";

        phaseEl.innerHTML = `
            <div class="absolute -left-[9px] top-0 w-4 h-4 bg-b-primary rounded-full border-2 border-black box-content"></div>
            
            <div class="flex items-center justify-between mb-4 select-none group">
                <div class="cursor-pointer flex-1" onclick="window.showDetails('phase', '${phaseId}')">
                    <h3 class="font-bold text-lg text-purple-400 group-hover:text-white transition-colors">${phase.title}</h3>
                    <span class="text-[10px] text-gray-500">${phase['Module Time'] || ''}</span>
                </div>
                <div class="p-2 cursor-pointer hover:bg-white/5 rounded-full transition-all" 
                     onclick="window.togglePhaseContent('${phaseId}')">
                    <i class="fas fa-chevron-down text-gray-500 transition-transform duration-300" id="icon-phase-${phaseId}"></i>
                </div>
            </div>
            
            <div id="content-phase-${phaseId}" class="space-y-3"></div>
        `;

        const itemsContainer = phaseEl.querySelector(`#content-phase-${phaseId}`);

        if (rootItems.length === 0) {
            itemsContainer.innerHTML = '<p class="text-xs text-gray-600 italic pl-2">No content.</p>';
        }

        rootItems.forEach(root => {
            const rootId = String(root.course_id || root.id);
            const isActive = (currentTeam.courses_plan || []).includes(rootId);
            
            // Children: Items that specify 'related_with' = rootId
            const children = phaseItems.filter(child => String(child.related_with) === rootId);
            
            // Determine type: Standalone Section vs Course
            const isStandalone = (root.type && root.type.toLowerCase().includes('sec')) && children.length === 0;
            const hasChildren = children.length > 0;
            const isExpanded = expandedNodes.has(rootId);
            
            // Text for subtitle (duration only shows in details usually, but we can show text here)
            const subtitle = root['Module Time'] || root.module_time || '';

            const itemHTML = document.createElement('div');
            itemHTML.className = `rounded-xl overflow-hidden border transition-all duration-300 ${isActive ? 'border-green-500/50 bg-green-500/5' : 'border-white/10 bg-b-surface'} ${isStandalone ? 'ml-4 border-dashed border-white/20' : ''}`;

            itemHTML.innerHTML = `
                <div class="p-3 flex items-center justify-between cursor-pointer hover:bg-white/5 select-none"
                     onclick="window.handleItemClick('${isStandalone ? 'section' : 'course'}', '${rootId}', ${hasChildren})">
                    
                    <div class="flex items-center gap-3 overflow-hidden flex-1">
                        <div class="w-9 h-9 rounded-lg flex items-center justify-center bg-black/20 border border-white/5 shrink-0 text-sm">
                            ${isActive ? '<i class="fas fa-check text-green-400"></i>' : 
                              (isStandalone ? '<i class="fas fa-puzzle-piece text-blue-400"></i>' : '<i class="fas fa-book text-purple-400"></i>')}
                        </div>
                        <div class="truncate flex-1">
                            <div class="flex justify-between items-center w-full">
                                <h4 class="font-bold text-sm ${isActive ? 'text-green-100' : 'text-gray-200'} truncate">${root.title}</h4>
                            </div>
                            <div class="flex items-center gap-3 mt-0.5">
                                <span class="text-[10px] text-gray-500">
                                    ${isStandalone ? 'Standalone' : (hasChildren ? `${children.length} Modules` : 'Course')}
                                </span>
                                ${subtitle ? `<span class="text-[10px] text-gray-500 border-l border-gray-700 pl-2"><i class="far fa-clock"></i> ${subtitle}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <div class="relative flex items-center justify-center p-2 rounded-full hover:bg-white/10" 
                             onclick="event.stopPropagation()">
                            <input type="checkbox" 
                                   class="peer h-4 w-4 cursor-pointer appearance-none rounded border border-gray-600 bg-gray-800 transition-all checked:border-green-500 checked:bg-green-500 hover:border-green-400"
                                   ${isActive ? 'checked' : ''} 
                                   onchange="window.toggleActivate('${rootId}', this.checked)">
                            <i class="fas fa-check text-white text-[10px] absolute pointer-events-none opacity-0 peer-checked:opacity-100"></i>
                        </div>
                        
                        ${hasChildren ? 
                            `<div class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                                  onclick="event.stopPropagation(); window.toggleCourseContent('${rootId}')">
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
                        const cTime = child['Module Time'] || child.module_time || '';
                        return `
                        <div class="group flex items-center justify-between p-2 rounded-lg hover:bg-white/5 ml-4 transition-colors cursor-pointer border border-transparent hover:border-white/5 ${childActive ? 'bg-green-500/10 border-green-500/20' : ''}"
                             onclick="window.showDetails('section', '${childId}', '${root.title}'); event.stopPropagation();">
                            
                            <div class="flex items-center gap-3 overflow-hidden flex-1">
                                <i class="fas fa-level-up-alt rotate-90 text-gray-600 text-xs shrink-0 group-hover:text-gray-400 transition-colors"></i>
                                <div class="flex flex-col min-w-0">
                                    <span class="text-xs text-gray-400 group-hover:text-gray-200 truncate ${childActive ? 'text-green-200 font-bold' : ''}">${child.title}</span>
                                    ${cTime ? `<span class="text-[9px] text-gray-600">${cTime}</span>` : ''}
                                </div>
                            </div>

                            <div class="relative flex items-center justify-center p-1 rounded-full hover:bg-white/10" 
                                 onclick="event.stopPropagation()">
                                <input type="checkbox" 
                                       class="peer h-3.5 w-3.5 cursor-pointer appearance-none rounded border border-gray-600 bg-gray-800 transition-all checked:border-green-500 checked:bg-green-500 hover:border-green-400"
                                       ${childActive ? 'checked' : ''} 
                                       onchange="window.toggleActivate('${childId}', this.checked)">
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

// ==========================================
// 3. Assignments (Content Loader)
// ==========================================
function renderAssignments() {
    const list = document.getElementById('assign-courses-list');
    const activeIds = currentTeam.courses_plan || [];
    
    if (activeIds.length === 0) {
        list.innerHTML = `<p class="text-center text-gray-500 text-xs py-10">Activate courses from Roadmap first.</p>`;
        return;
    }

    const activeItems = allData.courses.filter(c => activeIds.includes(String(c.course_id || c.id)));
    
    list.innerHTML = activeItems.map(item => {
        // Show Total Stats here for context
        const stats = [];
        if(item.real_total_duration) stats.push(item.real_total_duration);
        if(item.real_video_count) stats.push(`${item.real_video_count} Videos`);
        const subInfo = stats.length > 0 ? stats.join(' • ') : (item['Module Time'] || '');

        return `
        <div onclick="window.loadAssignContent('${item.course_id || item.id}')" 
             class="bg-white/5 p-3 rounded-lg border border-white/10 cursor-pointer hover:bg-white/10 hover:border-b-primary transition-all group mb-2">
            <div class="min-w-0">
                <div class="flex justify-between items-start">
                    <h4 class="font-bold text-sm text-white truncate max-w-[80%]">${item.title}</h4>
                    <span class="text-[9px] text-gray-500 bg-black/20 px-2 rounded border border-white/5 uppercase">${item.type || 'Course'}</span>
                </div>
                ${subInfo ? `<p class="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><i class="far fa-clock"></i> ${subInfo}</p>` : ''}
            </div>
        </div>
    `}).join('');
}
// ==========================================
// إصلاح: تخزين بيانات المهمة (الاسم، الوصف) في الـ Checkbox
// ==========================================
window.loadAssignContent = async (cid) => {
    selectedAssignCourse = cid;
    const cont = document.getElementById('assign-content-list');
    cont.innerHTML = `<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></div>`;
    
    try {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=getCourseContent&course_id=${cid}`);
        const json = await res.json();
        
        // التأكد من تهيئة المصفوفة
        if (!currentTeam.weekly_tasks) currentTeam.weekly_tasks = [];
        const assignedIds = currentTeam.weekly_tasks.map(t => String(t.content_id));

        if (json.data && json.data.length > 0) {
            cont.innerHTML = json.data.map(m => {
                const isAssigned = assignedIds.includes(String(m.content_id));
                
                // 🛠️ معالجة البيانات الهامة وتخزينها
                const title = m.title || m.Title || 'بدون عنوان';
                // تجربة أكثر من حقل للوصف والمدة حسب شيت جوجل
                const desc = m.desc || m.Description || m.description || 'لا يوجد وصف';
                const rawDur = m.Duration || m.time || m.duration || '';
                const cleanDuration = formatDuration(rawDur); 

                return `
                <label class="flex items-start gap-3 p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group ${isAssigned ? 'bg-green-900/10 border-l-2 border-l-green-500' : ''}">
                    <div class="pt-1">
                        <input type="checkbox" 
                               value="${m.content_id}" 
                               data-title="${title}"
                               data-desc="${desc}"
                               data-duration="${rawDur}"
                               data-course-id="${cid}"
                               class="task-check w-4 h-4 accent-b-primary bg-gray-700 border-gray-600 rounded"
                               ${isAssigned ? 'checked disabled' : ''}>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start">
                            <span class="text-sm font-medium ${isAssigned ? 'text-green-300' : 'text-gray-300'} group-hover:text-white transition-colors truncate">
                                ${title}
                            </span>
                            ${isAssigned ? '<span class="text-[9px] text-green-400 bg-green-900/20 px-1.5 rounded">منشور</span>' : ''}
                        </div>
                        <div class="flex gap-2 mt-1">
                             ${cleanDuration ? `<span class="text-[10px] text-blue-300 bg-blue-900/10 px-1 rounded"><i class="far fa-clock"></i> ${cleanDuration}</span>` : ''}
                        </div>
                    </div>
                </label>
            `}).join('');
            
            const btn = document.getElementById('publish-btn');
            if(btn) btn.disabled = false;
        } else {
            cont.innerHTML = `<p class="text-center text-gray-500 py-10">لا يوجد محتوى متاح.</p>`;
        }
    } catch (e) {
        console.error(e);
        cont.innerHTML = `<p class="text-center text-red-400 py-10">خطأ في التحميل.</p>`;
    }
};

// ==========================================
// إصلاح: قراءة البيانات وحفظها في قاعدة البيانات بشكل صحيح
// ==========================================
window.publishSelectedTasks = async function() {
    const checkedBoxes = document.querySelectorAll('.task-check:checked:not(:disabled)');
    if (checkedBoxes.length === 0) return showToast("برجاء اختيار محتوى أولاً", "warning");

    const btn = document.getElementById('publish-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري النشر...';
    btn.disabled = true;

    try {
        const teamId = currentUserData.system_info.team_id;
        const batch = writeBatch(db);
        const weekCycle = getCurrentWeekCycle();
        const now = new Date();
        const due = weekCycle.end.toISOString();
        
        let count = 0;
        const newTasksLocal = [];

        checkedBoxes.forEach(box => {
            const contentId = box.value;
            // 🛠️ القراءة من الـ attributes التي أضفناها
            const title = box.getAttribute('data-title');
            const desc = box.getAttribute('data-desc');
            const duration = box.getAttribute('data-duration');
            const courseId = box.getAttribute('data-course-id');

            const taskId = `${teamId}_${contentId}`;
            const taskRef = doc(db, "teams", teamId, "tasks", taskId);

            const taskData = {
                task_id: taskId,
                content_id: contentId,
                course_id: courseId,
                title: title,           // ✅ الاسم الصحيح
                description: desc,      // ✅ الوصف
                duration: duration,     // ✅ المدة
                type: 'video',
                week_id: weekCycle.id,
                created_at: now,
                due_date: due,
                assigned_by: currentUser.uid,
                leader_name: currentUserData.personal_info.full_name,
                status: 'active',
                stats: { total_students: 0, started_count: 0, completed_count: 0 }
            };

            // الحفظ في المكانين (Sub-collection و Array)
            batch.set(taskRef, taskData);
            
            const teamRef = doc(db, "teams", teamId);
            batch.update(teamRef, { weekly_tasks: arrayUnion(taskData) });
            
            newTasksLocal.push(taskData);
            count++;
        });

        await batch.commit();

        // تحديث الواجهة فوراً
        if (!currentTeam.weekly_tasks) currentTeam.weekly_tasks = [];
        currentTeam.weekly_tasks.push(...newTasksLocal);

        showToast(`تم نشر ${count} مهمة للأسبوع الحالي`, "success");
        if(selectedAssignCourse) loadAssignContent(selectedAssignCourse);
        renderOverview();

    } catch (error) {
        console.error(error);
        showToast("خطأ أثناء النشر: " + error.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.deleteTask = function(taskId, taskWeekId) {
    // 1. استخدام النافذة المخصصة بدلاً من window.confirm
    openConfirmModal("هل أنت متأكد تماماً من حذف هذه المهمة؟ سيتم إزالتها من سجلات الفريق ولن تظهر للطلاب.", async () => {
        
        // 🔒 التحقق من الأسبوع (Client Side)
        const currentWeek = getCurrentWeekCycle();
        if (taskWeekId !== currentWeek.id) {
            showToast("لا يمكن حذف مهام من أسابيع سابقة (الأرشفة فقط)", "error");
            return;
        }

        try {
            const teamId = currentUserData.system_info.team_id;
            const taskRef = doc(db, "teams", teamId, "tasks", taskId);
            const teamRef = doc(db, "teams", teamId);

            // أ. التحقق من التفاعل (Server Side)
            const docSnap = await getDoc(taskRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.stats && data.stats.started_count > 0) {
                    showToast("عذراً، لا يمكن الحذف لأن الطلاب بدأوا العمل بالفعل.", "error");
                    return;
                }
            }

            // ب. الحذف من الـ Sub-collection
            await deleteDoc(taskRef);
            
            // ج. 🔥 الإصلاح الجذري: الحذف من المصفوفة الرئيسية لضمان عدم الرجوع 🔥
            // نستخدم طريقة: جلب المصفوفة -> فلترة العنصر -> إعادة الحفظ
            // لأن arrayRemove قد تفشل إذا اختلفت التوقيتات (Timestamps)
            const teamDocSnap = await getDoc(teamRef);
            if(teamDocSnap.exists()) {
                const currentTasks = teamDocSnap.data().weekly_tasks || [];
                const updatedTasks = currentTasks.filter(t => t.task_id !== taskId);
                
                await updateDoc(teamRef, {
                    weekly_tasks: updatedTasks
                });
                
                // تحديث النسخة المحلية فوراً
                if (currentTeam) currentTeam.weekly_tasks = updatedTasks;
            }

            showToast("تم حذف المهمة نهائياً", "success");
            
            // تحديث الواجهة
            renderOverview(); 

        } catch (error) {
            console.error("Error deleting task:", error);
            showToast("فشل الحذف: " + error.message, "error");
        }
    });
};
window.submitCustomTask = async () => {
    const t = document.getElementById('ct-title').value;
    const d = document.getElementById('ct-desc').value;
    if(!t) return showToast("Title required", "error");

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
        showToast("Task Published", "success");
        closeModal('custom-task-modal');
        renderOverview();
    } catch (e) { showToast("Failed", "error"); }
};
function renderWeekInfo() {
    const headerContainer = document.getElementById('week-header-info');
    if (!headerContainer) return;

    const week = getCurrentWeekCycle();
    const now = new Date();
    
    // أسماء الأيام بالعربي
    const daysAr = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const currentDayName = daysAr[now.getDay()];

    // تنسيق التاريخ
    const options = { month: 'long', day: 'numeric' };
    const startStr = week.start.toLocaleDateString('ar-EG', options);
    const endStr = week.end.toLocaleDateString('ar-EG', options);

    headerContainer.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-center bg-gradient-to-r from-b-primary/20 to-black/20 p-4 rounded-xl border border-b-primary/30 mb-6">
            <div class="flex items-center gap-4 mb-2 md:mb-0">
                <div class="w-12 h-12 rounded-full bg-b-primary flex items-center justify-center text-white text-xl">
                    <i class="fas fa-calendar-alt"></i>
                </div>
                <div>
                    <h3 class="font-bold text-white text-lg">الأسبوع الحالي</h3>
                    <p class="text-sm text-gray-300">من <span class="text-b-hl-light font-bold">${startStr}</span> إلى <span class="text-b-hl-light font-bold">${endStr}</span></p>
                </div>
            </div>
            <div class="text-center md:text-left">
                <div class="bg-black/40 px-4 py-2 rounded-lg border border-white/5">
                    <p class="text-xs text-gray-400">اليوم</p>
                    <p class="font-bold text-white text-lg">${currentDayName}</p>
                </div>
            </div>
        </div>
    `;
}
// ==========================================
// 4. Global Interactions & Window Binding
// ==========================================

window.handleItemClick = (type, id, hasChildren) => {
    window.showDetails(type, id);
    if (hasChildren) {
        const content = document.getElementById(`details-${id}`);
        // Only open if currently closed
        if (content && content.classList.contains('hidden')) {
            window.toggleCourseContent(id);
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
        if(el) el.innerText = txt || 'Not specified';
    };

    setText('detail-title', item.title);
    setText('detail-desc', item.description || item.desc || "No description.");
    setText('detail-type', type === 'phase' ? 'PHASE' : (item.type || 'COURSE').toUpperCase());
    
    // Display Detailed Stats in Side Panel
    let timeDisplay = item['Module Time'] || item.module_time || 'N/A';
    if (item.real_video_count > 0 || item.real_total_duration) {
        const parts = [];
        if (item.real_video_count) parts.push(`${item.real_video_count} Videos`);
        if (item.real_total_duration && item.real_total_duration !== "0m") parts.push(item.real_total_duration);
        if (parts.length > 0) timeDisplay += ` • (${parts.join(', ')})`;
    }
    setText('detail-time', timeDisplay);
    setText('detail-tools', item.tools_required || item.tools || 'None');

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
            newChk.addEventListener('change', (e) => window.toggleActivate(String(id), e.target.checked));
        }
    }
};

window.toggleActivate = async (id, isChecked) => {
    if(!currentTeam.courses_plan) currentTeam.courses_plan = [];
    
    if (isChecked) {
        if (!currentTeam.courses_plan.includes(id)) currentTeam.courses_plan.push(id);
    } else {
        currentTeam.courses_plan = currentTeam.courses_plan.filter(x => x !== id);
    }

    renderRoadmapTree();
    renderOverview();
    renderAssignments();
    
    const detailBtn = document.getElementById('course-toggle-btn');
    if(detailBtn) detailBtn.checked = isChecked;

    try {
        const ref = doc(db, "teams", currentTeam.team_id);
        if (isChecked) {
            await updateDoc(ref, { courses_plan: arrayUnion(id) });
            showToast("Activated", "success");
        } else {
            await updateDoc(ref, { courses_plan: currentTeam.courses_plan });
            showToast("Deactivated", "info");
        }
    } catch (e) {
        console.error("Sync Error:", e);
        showToast("Sync Error", "error");
    }
};

// --- Squad & Grading ---

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
                            ${isMe ? '<span class="text-[10px] bg-white/10 px-1.5 rounded text-gray-400">YOU</span>' : ''}
                            ${isLeader ? '<i class="fas fa-crown text-yellow-500 text-xs"></i>' : ''}
                        </h4>
                        <p class="text-[10px] text-gray-500 font-mono">${md.total_points || 0} XP</p>
                    </div>
                </div>
                ${!isMe && !isLeader ? `<button class="text-red-400 hover:text-red-500 text-xs px-3 py-1.5 border border-red-500/20 hover:bg-red-500/10 rounded transition-all">Kick</button>` : ''}
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
    if (!newLeaderId) return showToast("Select new leader", "error");

    try {
        const teamRef = doc(db, "teams", currentTeam.team_id);
        const meRef = doc(db, "users", currentUser.uid);
        const newLeaderRef = doc(db, "users", newLeaderId);

        await updateDoc(teamRef, {
            leader_id: newLeaderId,
            members: arrayRemove(currentUser.uid)
        });
        await updateDoc(newLeaderRef, { role: "Leader" });
        await updateDoc(meRef, { role: "Student", team_id: null });

        showToast("Left successfully", "success");
        setTimeout(() => window.location.href = "student-dash.html", 1500);
    } catch (e) {
        showToast("Error leaving", "error");
    }
};

window.sendBroadcast = () => {
    if(document.getElementById('broadcast-text').value) {
        showToast("Sent", "success");
        closeModal('broadcast-modal');
    }
};

function renderGrading() {
    const grid = document.getElementById('submissions-grid');
    if(grid) {
        grid.innerHTML = `<div class="col-span-full text-center text-gray-500 py-20"><i class="fas fa-check-circle text-4xl mb-4 text-green-500/20"></i><p>No submissions.</p></div>`;
    }
}

function showToast(msg, type='info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const color = type === 'success' ? 'border-green-500' : 'border-red-500';
    toast.className = `bg-gray-900/95 text-white px-6 py-4 rounded-xl border-l-4 ${color} shadow-2xl backdrop-blur flex items-center gap-3 animate-slide-in pointer-events-auto min-w-[300px] mb-3`;
    toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
}

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
window.openAddMemberModal = () => showToast("Invite system coming soon", "info");

function formatDuration(rawTime) {
    if (!rawTime) return '';
    const str = String(rawTime);

    if (str.includes('T')) {
        const match = str.match(/T(\d{2}):(\d{2}):(\d{2})/);
        if (match) {
            let h = parseInt(match[1]);
            let m = parseInt(match[2]);
            let s = parseInt(match[3]);

            if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            return `${m}:${s.toString().padStart(2, '0')}`;
        }
    }

    if (str.includes(':')) {
        const parts = str.split(':').map(Number);
        if (parts.length === 3 && parts[0] === 0) {
            return `${parts[1]}:${parts[2].toString().padStart(2, '0')}`;
        }
        return str.replace(/^00:/, '').replace(/^0/, '');
    }

    return str;
}

// ==========================================
// 5. Calendar System (Strict Sat-Fri Logic)
// ==========================================
let calendarDate = new Date();

function renderCalendarTab() {
    if (!currentTeam || !currentTeam.weekly_tasks) return;

    const container = document.getElementById('calendar-weeks-container');
    const monthTitle = document.getElementById('calendar-month-title');
    // حماية إضافية لو العنصر مش موجود في HTML
    if (!container || !monthTitle) return;

    container.innerHTML = '';
    
    // إعدادات الشهر الحالي
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    monthTitle.innerText = `${monthNames[month]} ${year}`;

    // ضبط البداية: نرجع لأول سبت قبل بداية الشهر
    let currentDate = new Date(year, month, 1);
    const dayOfWeek = currentDate.getDay(); // 0=Sun ... 6=Sat
    const offset = (dayOfWeek + 1) % 7; 
    currentDate.setDate(currentDate.getDate() - offset);

    const tasks = currentTeam.weekly_tasks || [];

    // عرض 5 أسابيع لتغطية الشهر
    for (let i = 0; i < 5; i++) {
        const weekStart = new Date(currentDate);
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const startStr = weekStart.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
        const endStr = weekEnd.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });

        // تصفية المهام: هل تاريخ التسليم يقع داخل هذا الأسبوع؟
        const weekTasks = tasks.filter(t => {
            const taskDue = getSafeDate(t.due_date);
            return taskDue.getTime() >= weekStart.getTime() && taskDue.getTime() <= weekEnd.getTime();
        });

        const weekHTML = `
            <div onclick="openWeekDetails('${weekStart.toISOString()}', '${weekEnd.toISOString()}')" 
                 class="group bg-b-surface border border-white/10 rounded-xl p-5 hover:border-b-primary cursor-pointer transition-all relative overflow-hidden mb-3">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl ${weekTasks.length > 0 ? 'bg-b-primary text-white' : 'bg-white/5 text-gray-500'} flex flex-col items-center justify-center font-bold transition-colors">
                            <span class="text-[10px]">أسبوع</span>
                            <span class="text-lg">${i + 1}</span>
                        </div>
                        <div>
                            <h4 class="font-bold text-white text-lg">${startStr} - ${endStr}</h4>
                            <p class="text-xs text-gray-400 mt-1 flex items-center gap-2">
                                <span class="${weekTasks.length > 0 ? 'text-b-hl-light' : ''}">
                                    <i class="fas fa-tasks ml-1"></i> ${weekTasks.length} مهام
                                </span>
                            </p>
                        </div>
                    </div>
                    <i class="fas fa-chevron-left text-gray-600 group-hover:text-white transition-transform"></i>
                </div>
            </div>
        `;

        container.innerHTML += weekHTML;
        currentDate.setDate(currentDate.getDate() + 7);
    }
}
window.openWeekDetails = (startIso, endIso) => {
    const modal = document.getElementById('week-details-modal');
    const container = document.getElementById('week-modal-tasks');
    const headerTitle = document.getElementById('week-modal-title');
    const headerPoints = document.getElementById('week-modal-points');

    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    
    // تصفية المهام
    const tasks = (currentTeam.weekly_tasks || []).filter(t => {
        const d = getSafeDate(t.due_date);
        return d >= startDate && d <= endDate;
    });

    // تحديث العناوين
    headerTitle.innerText = `تفاصيل الأسبوع (${startDate.toLocaleDateString('ar-EG', {day:'numeric', month:'numeric'})} - ${endDate.toLocaleDateString('ar-EG', {day:'numeric', month:'numeric'})})`;
    headerPoints.innerText = tasks.length * 10; // حسب منطق النقاط لديك

    // رسم قائمة المهام
    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 flex flex-col items-center justify-center text-gray-500">
                <div class="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <i class="fas fa-coffee text-2xl"></i>
                </div>
                <p>لا توجد مهام معينة في هذا الأسبوع</p>
            </div>`;
    } else {
        container.innerHTML = tasks.map(t => `
            <div class="flex items-center justify-between p-4 bg-black/20 border border-white/5 rounded-xl hover:bg-black/40 transition-colors">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-lg ${t.stats?.completed_count > 0 ? 'bg-green-500/20 text-green-400' : 'bg-b-primary/20 text-b-primary'} flex items-center justify-center">
                        <i class="fas ${t.type === 'quiz' ? 'fa-question' : 'fa-play'}"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-white text-sm">${t.title || 'بدون عنوان'}</h4>
                        <div class="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span><i class="fas fa-eye ml-1"></i> ${t.stats?.started_count || 0} مشاهدة</span>
                            <span><i class="fas fa-check-circle ml-1"></i> ${t.stats?.completed_count || 0} إنجاز</span>
                        </div>
                    </div>
                </div>
                <div>
                     ${t.stats?.completed_count > 0 ? 
                        '<span class="text-green-400 text-xs font-bold bg-green-900/20 px-2 py-1 rounded">نشط</span>' : 
                        '<span class="text-yellow-400 text-xs font-bold bg-yellow-900/20 px-2 py-1 rounded">قيد الانتظار</span>'}
                </div>
            </div>
        `).join('');
    }

    modal.classList.remove('hidden');
};

window.closeWeekModal = () => {
    document.getElementById('week-details-modal').classList.add('hidden');
};
// دالة لفتح/غلق تفاصيل الأسبوع
window.toggleWeekDetails = (id) => {
    const content = document.getElementById(`content-${id}`);
    const icon = document.getElementById(`icon-${id}`);
    if (content) content.classList.toggle('hidden');
    if (icon) icon.classList.toggle('rotate-180');
};

window.changeMonth = (offset) => {
    calendarDate.setMonth(calendarDate.getMonth() + offset);
    renderCalendarTab();
};

window.changeMonth = (offset) => {
    calendarDate.setMonth(calendarDate.getMonth() + offset);
    renderCalendarTab();
};

window.openDayModal = (dateStr) => {
    const modal = document.getElementById('day-details-modal');
    const content = document.getElementById('day-modal-content');
    const title = document.getElementById('day-modal-title');
    
    // تصفية المهام لهذا اليوم
    const tasks = (currentTeam.weekly_tasks || []).filter(t => t.due_date && t.due_date.startsWith(dateStr));

    title.innerText = `مهام يوم ${dateStr}`;
    
    if (tasks.length === 0) {
        content.innerHTML = `<p class="text-center text-gray-500 py-6">لا توجد مهام مستحقة في هذا اليوم.</p>`;
    } else {
        content.innerHTML = tasks.map(t => `
            <div class="bg-black/30 p-3 rounded-lg border border-white/5 mb-2">
                <h4 class="font-bold text-white text-sm">${t.title}</h4>
                <div class="flex justify-between items-center mt-2 text-xs">
                    <span class="text-gray-400">${t.type || 'Video'}</span>
                    <span class="${t.stats?.completed_count > 0 ? 'text-green-400' : 'text-yellow-400'}">
                        ${t.stats?.completed_count || 0} مكتمل
                    </span>
                </div>
            </div>
        `).join('');
    }

    modal.classList.remove('hidden');
};

// إضافة دالة إغلاق المودال
window.closeDayModal = () => {
    document.getElementById('day-details-modal').classList.add('hidden');
};
// --- Modal Logic ---
let confirmCallback = null;

window.openConfirmModal = (message, callback) => {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-msg');
    const yesBtn = document.getElementById('btn-confirm-yes');
    
    if(msgEl) msgEl.innerText = message;
    confirmCallback = callback;
    
    // إزالة أي مستمعين سابقين لتجنب التكرار
    const newBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newBtn, yesBtn);
    
    newBtn.addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        closeConfirmModal();
    });

    modal.classList.remove('hidden');
};

window.closeConfirmModal = () => {
    document.getElementById('confirm-modal').classList.add('hidden');
    confirmCallback = null;
};