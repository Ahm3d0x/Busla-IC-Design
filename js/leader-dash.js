import { auth, db, doc, getDoc, getDocs, updateDoc, arrayUnion, arrayRemove, query, where, collection, onAuthStateChanged, signOut, serverTimestamp } from './firebase-config.js';
import { getTeamData } from './team-system.js';

// --- Configuration ---
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzvJ8zpNLRY24HiRvsJqn2y-8ygijipiyFeJpxcv4bEXSg-Mx_n52aXywx1uYqy2KCi/exec';
const CACHE_KEY = 'busla_lms_v5_final';

// --- State Management ---
let currentUser = null;
let currentTeam = null;
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

/**
 * Main Dashboard Initialization
 * Strategy: Load from Cache immediately -> Render -> Fetch from Server -> Re-render
 */
async function initDashboard(uid) {
    try {
        // 1. Fetch User (Required for security/role check)
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) throw new Error("User profile not found");
        const userData = userDoc.data();

        const role = userData.role || (userData.system_info?.role);
        const teamId = userData.team_id || (userData.system_info?.team_id);

        if (role !== 'Leader' || !teamId) {
            window.location.href = "student-dash.html";
            return;
        }

        // 2. Fetch Team Data
        currentTeam = await getTeamData(teamId);
        if (!currentTeam) throw new Error("Team not found");
        currentTeam.team_id = teamId;

        // 3. Update Header UI
        updateHeaderInfo(userData, currentTeam);

        // 4. Initial Render (Cache)
        loadFromCache();
        renderAllTabs();

        // 5. Background Sync
        fetchDataFromServer().then(() => {
            renderAllTabs();
            console.log("Data synced with server");
        }).catch(err => console.error("Background sync failed:", err));

    } catch (e) {
        console.error("Init Error:", e);
        showToast("Error loading dashboard", "error");
    }
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

// ==========================================
// 1. Overview Tab
// ==========================================
function renderOverview() {
    const list = document.getElementById('overview-courses-list');
    const taskList = document.getElementById('student-tasks-list');

    const activeIds = currentTeam.courses_plan || [];
    const tasks = (currentTeam.weekly_tasks || []).filter(t => t.title);

    document.getElementById('stat-active-courses').innerText = activeIds.length;
    document.getElementById('stat-active-tasks').innerText = tasks.length;

    // Active Courses List
    const activeCourses = allData.courses.filter(c =>
        activeIds.includes(String(c.course_id || c.id)) &&
        (!c.type || c.type.toLowerCase() !== 'section')
    );

    if (activeCourses.length === 0) {
        list.innerHTML = `<p class="col-span-full text-center text-gray-500 py-6">No active courses.</p>`;
    } else {
        list.innerHTML = activeCourses.map(c => `
            <div class="bg-white/5 p-4 rounded-xl border border-white/10 hover:border-b-primary/50 transition-all flex gap-4 items-start group">
                <div class="w-12 h-12 rounded-lg bg-gray-800 shrink-0 overflow-hidden">
                    <img src="${c.image_url || '../assets/images/1.jpg'}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity">
                </div>
                <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-white text-sm truncate">${c.title}</h4>
                    <span class="text-[10px] text-gray-400 block mt-1"><i class="far fa-clock"></i> ${c.real_total_duration || c['Module Time'] || 'N/A'}</span>
                    <a href="course-player.html?id=${c.course_id || c.id}" class="inline-block mt-2 text-[10px] bg-b-primary hover:bg-teal-700 text-white px-3 py-1 rounded font-bold transition-colors">Start</a>
                </div>
            </div>
        `).join('');
    }

    // Active Tasks List
    if (tasks.length === 0) {
        taskList.innerHTML = `<p class="text-gray-500 text-center py-4 text-xs">No active tasks.</p>`;
    } else {
        taskList.innerHTML = tasks.map(t => `
            <div class="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                <div class="flex items-center gap-3">
                    <span class="w-2 h-2 rounded-full bg-green-500"></span>
                    <div>
                        <h4 class="font-bold text-sm text-gray-200">${t.title}</h4>
                        <span class="text-[10px] text-gray-500">${t.type || 'task'}</span>
                    </div>
                </div>
                <a href="course-player.html?id=${t.course_id || ''}" class="text-xs text-green-400 hover:text-white font-bold">Go</a>
            </div>
        `).join('');
    }
}

// ==========================================
// 2. Roadmap Tree (Logic & Rendering)
// ==========================================
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

window.loadAssignContent = async (cid) => {
    selectedAssignCourse = cid;
    const cont = document.getElementById('assign-content-list');
    cont.innerHTML = `<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></div>`;
    
    try {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=getCourseContent&course_id=${cid}`);
        const json = await res.json();
        const assignedIds = (currentTeam.weekly_tasks || []).map(t => String(t.content_id));

        if (json.data && json.data.length > 0) {
            cont.innerHTML = json.data.map(m => {
                const isAssigned = assignedIds.includes(String(m.content_id));
                
                // 🔥🔥 هنا التعديل: استخدام دالة التنسيق الجديدة 🔥🔥
                let rawDur = m.Duration || m.duration || '';
                const cleanDuration = formatDuration(rawDur); 
                
                const durationBadge = cleanDuration ? 
                    `<span class="text-[10px] text-blue-300 bg-blue-900/20 px-1.5 rounded border border-blue-500/20 flex items-center gap-1">
                        <i class="far fa-clock"></i> ${cleanDuration}
                     </span>` : '';

                const note = m.Note || m.note || '';
                const points = m.base_points || m.Base_Points || '';

                return `
                <label class="flex items-start gap-3 p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group ${isAssigned ? 'bg-green-900/10 border-l-2 border-l-green-500' : ''}">
                    <div class="pt-1">
                        <input type="checkbox" value="${m.content_id}" 
                               class="task-check w-4 h-4 accent-b-primary bg-gray-700 border-gray-600 rounded"
                               ${isAssigned ? 'checked' : ''}>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start">
                            <span class="text-sm font-medium ${isAssigned ? 'text-green-300' : 'text-gray-300'} group-hover:text-white transition-colors truncate">
                                ${m.title}
                            </span>
                            <div class="flex flex-col items-end gap-1 ml-2">
                                ${isAssigned ? '<span class="text-[9px] text-green-400 font-bold bg-green-900/20 px-1.5 py-0.5 rounded"><i class="fas fa-check"></i> تم النشر</span>' : ''}
                                <span class="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 uppercase border border-white/5">${m.type || 'Video'}</span>
                            </div>
                        </div>
                        
                        <div class="flex flex-wrap items-center gap-3 mt-1.5">
                            ${durationBadge}
                            ${points ? `<span class="text-[10px] text-yellow-500"><i class="fas fa-star"></i> ${points} نقطة</span>` : ''}
                        </div>
                        
                        ${note ? `<p class="text-[10px] text-gray-400 mt-2 bg-black/20 p-1.5 rounded border-r-2 border-yellow-500/50 italic"><i class="fas fa-info-circle text-yellow-500 mr-1"></i> ${note}</p>` : ''}
                    </div>
                </label>
            `}).join('');
            
            const btn = document.getElementById('publish-btn');
            if(btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        } else {
            cont.innerHTML = `<p class="text-center text-gray-500 py-10">لا يوجد محتوى متاح.</p>`;
        }
    } catch (e) {
        console.error(e);
        cont.innerHTML = `<p class="text-center text-red-400 py-10">خطأ في التحميل.</p>`;
    }
};

window.publishSelectedTasks = async () => {
    const checks = document.querySelectorAll('.task-check:checked');
    // Allow zero selection if user wants to just see (but button implies action)
    if (checks.length === 0) return showToast("Select content to publish", "error");

    const btn = document.getElementById('publish-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    const newTasks = [];
    checks.forEach(box => {
        const row = box.closest('label');
        // Prevent duplicate assignment of the exact same content ID
        const alreadyExists = (currentTeam.weekly_tasks || []).some(t => String(t.content_id) === String(box.value));
        
        if (!alreadyExists) {
            newTasks.push({
                task_id: `T_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
                course_id: selectedAssignCourse,
                content_id: box.value,
                title: row.querySelector('.text-sm').innerText.trim(),
                type: 'video', // You might want to grab actual type from DOM if varying
                assigned_at: new Date().toISOString()
            });
        }
    });

    if (newTasks.length === 0) {
        btn.innerHTML = 'Publish Selected';
        return showToast("Selected items already assigned.", "info");
    }

    try {
        await updateDoc(doc(db, "teams", currentTeam.team_id), {
            weekly_tasks: arrayUnion(...newTasks)
        });
        
        if(!currentTeam.weekly_tasks) currentTeam.weekly_tasks = [];
        currentTeam.weekly_tasks.push(...newTasks);
        
        showToast(`Published ${newTasks.length} tasks!`, "success");
        renderOverview();
        // Refresh list to update badges
        loadAssignContent(selectedAssignCourse);
    } catch (e) {
        showToast("Publish Failed", "error");
    } finally {
        btn.innerHTML = 'Publish Selected';
    }
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

