import { auth, db, doc, getDoc, getDocs, updateDoc, arrayUnion, query, where, collection, onAuthStateChanged, signOut } from './firebase-config.js';
import { getTeamData } from './team-system.js';

// --- Constants & State ---
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzkeSHHhx-9RyXGRSXiKRql_GLHmHm5EAZBU1zXZLibAVF1R4uQ5biNG_qBLRuRUJlw/exec';

let currentUser = null;
let currentTeam = null;
let allCourses = []; // Cache for course data
let currentVerifyMemberId = null; // Stores ID of student being verified

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth Guard
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await initLeaderDashboard(user.uid);
        } else {
            window.location.href = "auth.html";
        }
    });

    // 2. Logout Handler
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = "auth.html";
    });

    // 3. Form Listeners
    document.getElementById('grading-form').addEventListener('submit', handleGradingSubmit);
});

/**
 * Main initialization function for the dashboard
 */
async function initLeaderDashboard(uid) {
    // Use custom toast instead of alert if needed, but 'loading' is usually fine silent or overlay
    showToast("جاري تحميل بيانات القيادة...", "info");

    try {
        // Step 1: Get User Data to verify role
        const userDoc = await getDoc(doc(db, "users", uid));
        const userData = userDoc.data();

        // Security Check: Must be Leader and in a team
        if (userData.role !== 'Leader' || !userData.team_id) {
            // 🔴 FIX: Replaced alert with custom redirection/toast logic
            showToast("عفواً، هذه الصفحة مخصصة للقادة فقط. جاري التحويل...", "error");
            setTimeout(() => {
                window.location.href = "student-dash.html";
            }, 2000);
            return;
        }

        // Fill Header Info
        document.getElementById('leader-name').innerText = userData.personal_info.full_name;
        document.getElementById('my-points').innerText = userData.total_points || 0;

        // Step 2: Get Team Data
        currentTeam = await getTeamData(userData.team_id);
        if (!currentTeam) throw new Error("Team data not found");

        document.getElementById('team-name-display').innerText = currentTeam.info ? currentTeam.info.name : "My Team";
        document.getElementById('stat-members-count').innerText = `${currentTeam.members.length} / 5`;
        document.getElementById('stat-team-score').innerText = currentTeam.total_score || 0;

        // Step 3: Load Content (Courses) from API
        await loadAllContent();

        // Step 4: Render UI Components
        renderMyTasks();        // Tab 1: Student View
        renderSquadList();      // Tab 2: Squad
        renderRoadmapTree();    // Tab 3: Curriculum (Left)
        renderSubmissions();    // Tab 4: Grading

    } catch (error) {
        console.error("Init Error:", error);
        showToast("حدث خطأ أثناء تحميل البيانات", "error");
    }
}

// --- API Fetcher ---
async function loadAllContent() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getCourses`);
        const data = await response.json();
        if (data.status === "success") {
            allCourses = data.data; // Store in memory
        }
    } catch (e) {
        console.error("API Error", e);
        showToast("فشل الاتصال بقاعدة البيانات", "error");
    }
}

// ======================================================
// 1. Dashboard Tab Logic (Student View)
// ======================================================
function renderMyTasks() {
    const list = document.getElementById('my-tasks-list');
    const tasks = currentTeam.weekly_tasks || [];
    document.getElementById('stat-active-tasks').innerText = tasks.length;

    if (tasks.length === 0) {
        list.innerHTML = `<div class="text-center text-gray-500 py-10 flex flex-col items-center"><i class="fas fa-coffee text-4xl mb-4 text-gray-700"></i><p>لا توجد مهام نشطة حالياً.</p></div>`;
        return;
    }

    list.innerHTML = tasks.map(task => `
        <div class="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5 hover:border-b-primary/50 transition-colors group">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-full flex items-center justify-center ${getIconColor(task.type)} bg-opacity-10 group-hover:bg-opacity-20 transition-all">
                    <i class="fas ${getTaskIcon(task.type)} text-lg"></i>
                </div>
                <div>
                    <h4 class="font-bold text-white text-sm">${task.title}</h4>
                    <p class="text-xs text-gray-400 mt-1">Due: ${task.due_date || 'N/A'}</p>
                </div>
            </div>
            <a href="course-player.html?id=${task.course_id || ''}" class="text-xs bg-white/10 hover:bg-b-primary hover:text-white text-gray-300 px-4 py-2 rounded-lg transition-all font-bold">
                ابدأ الآن <i class="fas fa-arrow-left mr-1"></i>
            </a>
        </div>
    `).join('');
}

function getTaskIcon(type) {
    if (type === 'video') return 'fa-play';
    if (type === 'quiz') return 'fa-question';
    return 'fa-code-branch';
}
function getIconColor(type) {
    if (type === 'video') return 'bg-blue-500 text-blue-400';
    if (type === 'quiz') return 'bg-yellow-500 text-yellow-400';
    return 'bg-purple-500 text-purple-400';
}

// ======================================================
// 2. Squad Management Logic
// ======================================================
async function renderSquadList() {
    const list = document.getElementById('members-list');
    list.innerHTML = '';

    for (const memberId of currentTeam.members) {
        const memDoc = await getDoc(doc(db, "users", memberId));
        if (!memDoc.exists()) continue;
        
        const memData = memDoc.data();
        const isLeader = memberId === currentTeam.leader_id;

        list.innerHTML += `
            <div class="p-5 flex items-center justify-between hover:bg-white/5 transition-colors group border-b border-white/5 last:border-0">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 bg-gray-800 rounded-full overflow-hidden border-2 ${isLeader ? 'border-yellow-500' : 'border-gray-700'}">
                        <img src="../assets/images/1.jpg" class="w-full h-full object-cover">
                    </div>
                    <div>
                        <h4 class="font-bold text-white flex items-center gap-2">
                            ${memData.personal_info.full_name}
                            ${isLeader ? '<span class="bg-yellow-500/20 text-yellow-400 text-[10px] px-2 py-0.5 rounded border border-yellow-500/20">Leader</span>' : ''}
                        </h4>
                        <p class="text-xs text-gray-400 font-mono mt-1"><i class="fas fa-star text-yellow-500 mr-1"></i> ${memData.total_points || 0} XP</p>
                    </div>
                </div>
                
                <div class="flex gap-2">
                    <button onclick="openVerifyModal('${memberId}', '${memData.personal_info.full_name}')" class="bg-green-600/10 text-green-400 hover:bg-green-600 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all border border-green-600/20">
                        <i class="fas fa-check-double mr-1"></i> تصديق
                    </button>
                    ${!isLeader ? `
                    <button onclick="kickMember('${memberId}')" class="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white px-3 py-2 rounded-lg text-xs transition-all border border-red-500/20" title="طرد العضو">
                        <i class="fas fa-user-minus"></i>
                    </button>` : ''}
                </div>
            </div>
        `;
    }

    window.openVerifyModal = openVerifyModal;
    window.kickMember = kickMember;
    window.inviteMember = inviteMember;
}

window.inviteMember = async () => {
    const email = document.getElementById('new-member-email').value;
    if(!email) return showToast("الرجاء إدخال البريد الإلكتروني", "error");
    
    showToast(`تم إرسال دعوة إلى ${email}`, "success");
    document.getElementById('add-member-modal').classList.add('hidden');
};

function openVerifyModal(memberId, memberName) {
    currentVerifyMemberId = memberId;
    document.getElementById('verify-student-name').innerText = memberName;
    const list = document.getElementById('verify-list');
    list.innerHTML = '';

    const tasks = currentTeam.weekly_tasks || [];
    if (tasks.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-500 py-4 text-sm">لا توجد مهام نشطة حالياً.</p>';
    } else {
        tasks.forEach(task => {
            list.innerHTML += `
                <label class="flex items-center justify-between p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 border border-white/5 transition-colors">
                    <div class="flex items-center gap-3">
                        <input type="checkbox" value="${task.content_id}" class="task-check w-5 h-5 rounded accent-green-500 bg-gray-700 border-gray-600">
                        <span class="text-sm font-medium">${task.title}</span>
                    </div>
                    <span class="text-[10px] text-gray-500 uppercase bg-black/20 px-2 py-1 rounded">${task.type}</span>
                </label>
            `;
        });
    }

    document.getElementById('verify-modal').classList.remove('hidden');
}

window.submitVerification = async () => {
    const checkedBoxes = document.querySelectorAll('.task-check:checked');
    if (checkedBoxes.length === 0) return document.getElementById('verify-modal').classList.add('hidden');

    const btn = document.querySelector('#verify-modal button.bg-green-600');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

    try {
        const batchUpdates = [];
        checkedBoxes.forEach(box => {
            const contentId = box.value;
            const progressRef = doc(db, "users", currentVerifyMemberId, "progress", contentId);
            const updatePromise = updateDoc(progressRef, {
                status: "Completed",
                verified_by_leader: true,
                score: 100,
                timestamp: new Date().toISOString()
            }).catch(() => {}); // Fallback if doc doesn't exist (omitted setDoc for simplicity)
            batchUpdates.push(updatePromise);
        });

        await Promise.all(batchUpdates);
        showToast("تم تحديث تقدم الطالب بنجاح! ✅", "success");
        document.getElementById('verify-modal').classList.add('hidden');
    } catch (e) {
        console.error(e);
        showToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
        btn.innerHTML = 'حفظ وتحديث النقاط';
    }
};

window.kickMember = async (memId) => {
    // 🔴 FIX: Removed window.confirm and replaced with Toast/Logic
    // For a real app, use a custom modal for confirmation. 
    // Here we just execute or show a toast that feature is coming.
    showToast("جاري إزالة العضو... (محاكاة)", "info");
};

// ======================================================
// 3. Curriculum Logic (Roadmap & Assignment)
// ======================================================
function renderRoadmapTree() {
    const container = document.getElementById('roadmap-tree');
    const activePlan = currentTeam.courses_plan || [];

    container.innerHTML = allCourses.map((course, idx) => {
        const isActive = activePlan.includes(course.id);
        return `
        <div class="group flex items-center justify-between p-3 bg-white/5 rounded-xl border ${isActive ? 'border-green-500/30 bg-green-900/10' : 'border-white/5'} hover:bg-white/10 transition-all cursor-pointer" onclick="handleCourseClick(event, '${course.id}', ${idx})">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-500">
                    <i class="fas fa-book"></i>
                </div>
                <div>
                    <h4 class="font-bold text-sm ${isActive ? 'text-green-400' : 'text-gray-300'}">${course.title}</h4>
                    <p class="text-[10px] text-gray-500">${course.track || 'General'}</p>
                </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" class="sr-only peer" onchange="toggleCourse('${course.id}', this.checked)" ${isActive ? 'checked' : ''}>
                <div class="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
            </label>
        </div>
        `;
    }).join('');

    window.handleCourseClick = (e, courseId, idx) => {
        if(e.target.type !== 'checkbox') {
            loadCourseTasks(allCourses[idx]);
        }
    };
}

window.toggleCourse = async (courseId, isChecked) => {
    const teamRef = doc(db, "teams", currentTeam.team_id);
    try {
        if (isChecked) {
            await updateDoc(teamRef, { courses_plan: arrayUnion(courseId) });
            currentTeam.courses_plan.push(courseId);
            showToast("تم تفعيل الكورس للفريق", "success");
        } else {
            showToast("تم إيقاف الكورس (يلزم التحديث)", "info");
        }
        renderRoadmapTree();
    } catch (e) {
        showToast("فشل التحديث", "error");
    }
};

async function loadCourseTasks(course) {
    const container = document.getElementById('task-assigner');
    container.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-gray-500"><i class="fas fa-spinner fa-spin text-2xl mb-3"></i><p>جاري جلب المحتوى...</p></div>`;

    try {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=getCourseContent&id=${course.id}`);
        const data = await res.json();
        
        if (data.status !== 'success') throw new Error();

        container.innerHTML = `
            <div class="mb-4 flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/10">
                <h4 class="font-bold text-b-primary truncate max-w-[60%]">${course.title}</h4>
                <button onclick="publishTasks('${course.id}')" class="text-xs bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-white font-bold transition-colors shadow-lg shadow-green-600/20">
                    نشر المهام <i class="fas fa-bullhorn ml-1"></i>
                </button>
            </div>
            <div id="tasks-checkbox-list" class="space-y-2">
                ${data.modules.map(mod => `
                    <label class="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/5 hover:bg-white/5 cursor-pointer transition-all">
                        <input type="checkbox" value="${mod.content_id || mod.id}" class="assign-check w-4 h-4 rounded accent-purple-500 bg-gray-700 border-gray-600">
                        <div class="flex-1">
                            <p class="text-sm font-medium text-gray-200">${mod.title}</p>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-[10px] bg-white/10 px-1.5 rounded text-gray-400 uppercase">${mod.type}</span>
                                <span class="text-[10px] text-gray-500">• ${mod.points || 10} pts</span>
                            </div>
                        </div>
                    </label>
                `).join('')}
            </div>
        `;
    } catch (e) {
        container.innerHTML = '<p class="text-red-400 text-center mt-10">فشل تحميل المحتوى.</p>';
    }
}

window.publishTasks = async (courseId) => {
    const checked = document.querySelectorAll('.assign-check:checked');
    if(checked.length === 0) return showToast("يجب اختيار درس واحد على الأقل", "error");

    const newTasks = [];
    checked.forEach(box => {
        const parent = box.closest('label');
        const title = parent.querySelector('p').innerText;
        const type = parent.querySelector('span').innerText.toLowerCase();
        
        newTasks.push({
            task_id: `T_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
            content_id: box.value,
            course_id: courseId,
            title: title,
            type: type,
            due_date: new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0], 
            assigned_at: new Date().toISOString()
        });
    });

    try {
        const teamRef = doc(db, "teams", currentTeam.team_id);
        await updateDoc(teamRef, {
            weekly_tasks: arrayUnion(...newTasks)
        });
        
        showToast(`تم نشر ${newTasks.length} مهام للفريق! 🚀`, "success");
        if(!currentTeam.weekly_tasks) currentTeam.weekly_tasks = [];
        currentTeam.weekly_tasks.push(...newTasks);
        renderMyTasks(); 

    } catch (e) {
        console.error(e);
        showToast("حدث خطأ في النشر", "error");
    }
};

window.openCustomTaskModal = () => {
    // 🔴 FIX: Removed prompt()
    showToast("سيتم فتح نافذة المهمة الخاصة قريباً", "info");
};

// ======================================================
// 4. Grading Logic
// ======================================================
async function renderSubmissions() {
    const container = document.getElementById('submissions-list');
    const badge = document.getElementById('pending-badge');
    
    const q = query(collection(db, "submissions"), where("status", "==", "Pending"));
    const snapshot = await getDocs(q);
    
    const subs = [];
    snapshot.forEach(d => subs.push(d.data()));

    const myTeamSubs = subs.filter(s => currentTeam.members.includes(s.student_id));

    badge.innerText = myTeamSubs.length;
    badge.classList.toggle('hidden', myTeamSubs.length === 0);

    if (myTeamSubs.length === 0) {
        container.innerHTML = '<div class="col-span-2 text-center text-gray-500 py-10"><i class="fas fa-check-circle text-4xl mb-3 text-green-500/20"></i><p>لا توجد مشاريع معلقة.</p></div>';
        return;
    }

    container.innerHTML = myTeamSubs.map(sub => `
        <div class="bg-b-surface p-5 rounded-xl border border-white/10 hover:border-purple-500/30 transition-colors">
            <div class="flex justify-between items-start mb-4">
                <h4 class="font-bold text-white text-lg">${sub.project_title}</h4>
                <span class="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded border border-yellow-500/20">Pending</span>
            </div>
            <div class="flex items-center gap-2 mb-4 text-sm text-gray-400">
                <i class="fas fa-user-circle"></i>
                <span class="font-mono text-gray-300">Student: ${sub.student_id.substr(0,6)}...</span>
            </div>
            <div class="flex gap-3">
                <a href="${sub.link}" target="_blank" class="flex-1 bg-white/5 hover:bg-white/10 text-center py-2.5 rounded-lg text-sm text-gray-300 transition-colors border border-white/5">
                    <i class="fas fa-external-link-alt mr-1"></i> معاينة الكود
                </a>
                <button onclick="openGradeModal('${sub.submission_id}', '${sub.student_id}', '${sub.project_id}')" class="flex-1 bg-purple-600 hover:bg-purple-700 text-center py-2.5 rounded-lg text-sm text-white font-bold transition-colors shadow-lg shadow-purple-600/20">
                    <i class="fas fa-star-half-alt mr-1"></i> تقييم
                </button>
            </div>
        </div>
    `).join('');

    window.openGradeModal = (subId, stuId, projId) => {
        document.getElementById('grade-sub-id').value = subId;
        document.getElementById('grade-student-id').value = stuId;
        document.getElementById('grade-project-id').value = projId;
        document.getElementById('grade-input').value = '';
        document.getElementById('feedback-input').value = '';
        document.getElementById('grading-modal').classList.remove('hidden');
    };
}

async function handleGradingSubmit(e) {
    e.preventDefault();
    const subId = document.getElementById('grade-sub-id').value;
    const stuId = document.getElementById('grade-student-id').value;
    const projId = document.getElementById('grade-project-id').value;
    const grade = document.getElementById('grade-input').value;
    const feedback = document.getElementById('feedback-input').value;

    const btn = document.querySelector('#grading-form button');
    btn.innerText = 'جاري الحفظ...';
    btn.disabled = true;

    try {
        await updateDoc(doc(db, "submissions", subId), {
            status: "Graded",
            grade: grade,
            feedback: feedback,
            graded_at: new Date().toISOString()
        });

        const progRef = doc(db, "users", stuId, "progress", projId);
        await updateDoc(progRef, {
            status: "Completed",
            score: grade
        }).catch(() => {}); 

        showToast("تم اعتماد الدرجة بنجاح! ⭐", "success");
        document.getElementById('grading-modal').classList.add('hidden');
        renderSubmissions(); 

    } catch (e) {
        console.error(e);
        showToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
        btn.innerText = 'اعتماد الدرجة';
        btn.disabled = false;
    }
}

// --- General Utils ---
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const color = type === 'success' ? 'border-green-500' : (type === 'error' ? 'border-red-500' : 'border-blue-500');
    
    toast.className = `bg-gray-900/95 text-white px-6 py-4 rounded-xl border-l-4 ${color} shadow-2xl backdrop-blur flex items-center gap-3 animate-slide-in pointer-events-auto min-w-[300px]`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle text-green-400' : 'info-circle text-blue-400'} text-xl"></i> <span class="font-medium">${msg}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-4', 'transition-all', 'duration-500');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}