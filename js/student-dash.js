import { 
    auth, db, doc, getDoc, getDocs, collection, query, where, addDoc, serverTimestamp, onAuthStateChanged 
} from './firebase-config.js';

import { initBadgesSystem } from './badges-handler.js';
import { initTeamBadgesSystem } from './team-badges-handler.js';
import { initLeaderboard } from './leaderboard-handler.js';
import { initSettingsModal, openSettings } from './settings-handler.js';
import { initNotificationsSystem } from './notifications-handler.js';
import { RANKS_DATA } from './badges-data.js';

let currentUser = null;
let currentTeam = null;
let allData = { courses: [], tree: [], contents: [], projects: [], quizzes: [] }; 
let lookupData = { projects: {}, quizzes: {}, contents: [] }; 
let userSubmissions = {}; 

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyfXoESIoTAIbIofv3PGdZdD65ktxXSuX0Rb-WOtoeRccJFbB5PzJTSDu4DDVSPNSW3/exec";

window.openSettings = openSettings;
// =========================================================
// 1. INITIALIZATION
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await initStudentDash(user.uid);
            initSettingsModal();
        } else {
            window.location.href = "auth.html";
        }
    });
});

async function initStudentDash(uid) {
    try {
        console.log("🚀 Initializing Student Dashboard...");
        
        // 1. جلب بيانات المستخدم + سجل الإنجاز
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) return;
        let userData = userDoc.data();

        // أ) جلب سجل الإنجاز (الفيديوهات والكويزات)
        userData.content_states = {}; 
        const statesSnapshot = await getDocs(collection(db, "users", uid, "content_states"));
        statesSnapshot.forEach(doc => { userData.content_states[doc.id] = doc.data(); });

        // ب) 🔥 جلب سجل التسليمات (المشاريع) لمعرفة الدرجات
        const subsSnapshot = await getDocs(query(collection(db, "submissions"), where("student_id", "==", uid)));
        subsSnapshot.forEach(doc => { userSubmissions[doc.data().project_id] = doc.data(); });

        console.log("📂 User Data Loaded:", { states: userData.content_states, submissions: userSubmissions });

        // 2. جلب المنهج
        await fetchCurriculumData();

        // 3. التعامل مع الفريق
        const teamId = userData.team_id || userData.system_info?.team_id;

        if (teamId) {
            const teamDoc = await getDoc(doc(db, "teams", teamId));
            if (teamDoc.exists()) {
                currentTeam = { id: teamDoc.id, ...teamDoc.data() };
                
                updateHeaderInfo(userData, currentTeam);
                toggleTabs('team');
                
                // تمرير البيانات للدالة الرئيسية
                await renderOverview(userData, currentTeam); 
                renderStudentTasks(userData, currentTeam);   
                
                initTeamBadgesSystem(teamId); 
                initNotificationsSystem(teamId, uid, 'student');
            }
        } else {
            updateHeaderInfo(userData, {}); 
            toggleTabs('solo');
            renderSoloOverview(userData);
            loadAvailableTeams();
        }

        renderStudentTree(); 
        initBadgesSystem(uid); 
        initLeaderboard();     

    } catch (e) { console.error("Init Error:", e); }
}

function toggleTabs(mode) {
    const teamTabs = ['btn-squad', 'btn-my-plan', 'btn-team-badges'];
    const soloTabs = ['btn-find-team'];
    if (mode === 'team') {
        teamTabs.forEach(id => document.getElementById(id)?.classList.remove('hidden'));
        soloTabs.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    } else {
        teamTabs.forEach(id => document.getElementById(id)?.classList.add('hidden'));
        soloTabs.forEach(id => document.getElementById(id)?.classList.remove('hidden'));
    }
}

function resolveImageUrl(url, type = 'user') {
    if (!url || url.includes('placeholder')) {
        return type === 'team' 
            ? "https://ui-avatars.com/api/?name=Team&background=0D8ABC&color=fff&size=128" 
            : "https://ui-avatars.com/api/?name=User&background=random&size=128";
    }
    return url;
}


function updateHeaderInfo(user, team) {
    const safeText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    const xp = user.gamification?.total_points || 0;
    
    // Rank Logic
    let rankTitle = "مبتدئ";
    if (RANKS_DATA) {
        for(let r of RANKS_DATA) { if(xp >= r.points_required) rankTitle = r.title; else break; }
    }

    safeText('header-user-badge', rankTitle);
    safeText('sidebar-team-name', team.info?.name || "مساحة الطالب");
    
    // 🔥 إصلاح اسم الطالب في كل مكان
    const firstName = user.personal_info?.full_name?.split(' ')[0] || "طالب";
    const fullName = user.personal_info?.full_name || "طالب مجتهد";
    
    safeText('header-user-name', firstName); 
    safeText('sidebar-user-name', fullName);
    
    const logoEl = document.getElementById('sidebar-team-logo');
    if(logoEl) logoEl.src = resolveImageUrl(team.info?.logo_url || user.personal_info?.photo_url, 'team');
}


// =========================================================
// 2. RENDER OVERVIEW (منطق الفلترة الجديد)
// =========================================================
async function renderOverview(user, team) {
    // 1. تحديث الكروت الإحصائية (كما هي)
    const xp = user.gamification?.total_points || 0;
    safeSetText('stat-my-xp', xp.toLocaleString());

    if(team.total_score !== undefined) {
        safeSetText('stat-team-score', team.total_score.toLocaleString());
    } else {
        safeSetText('stat-team-score', "-");
    }

    let myRankStr = "-";
    if (team.members && team.members.length > 0) {
        try {
            const memberPromises = team.members.map(uid => getDoc(doc(db, "users", uid)));
            const memberSnapshots = await Promise.all(memberPromises);
            const sortedMembers = memberSnapshots
                .map(snap => ({ uid: snap.id, points: snap.exists() ? (snap.data().gamification?.total_points || 0) : 0 }))
                .sort((a, b) => b.points - a.points);
            const myRankIndex = sortedMembers.findIndex(m => m.uid === user.uid);
            myRankStr = myRankIndex !== -1 ? `#${myRankIndex + 1}` : "-";
        } catch(e) {}
    }
    
    const rankEl = document.getElementById('stat-my-rank');
    if(rankEl) rankEl.innerText = myRankStr;
    const badgeEl = document.getElementById('overview-rank-badge');
    if(badgeEl) badgeEl.innerText = `RANK ${myRankStr}`;

    renderWeekInfo(myRankStr);

    // 🔥🔥🔥 الفلترة الجديدة حسب طلبك 🔥🔥🔥
    const allTasks = team.weekly_tasks || [];
    const weekCycle = getCurrentWeekCycle(); 
    
    const filteredTasks = allTasks.filter(task => {
        // أ) تحديد حالة الإنجاز (بكل الطرق الممكنة)
        let isCompleted = false;

        if (task.type === 'project') {
            const sub = userSubmissions[String(task.content_id)];
            isCompleted = !!sub; 
        } else {
            let state = user.content_states?.[task.content_id];
            if (!state && task.type === 'video') state = user.content_states?.[`video_${task.content_id}`];
            if (!state) state = user.content_states?.[String(task.content_id)];
            
            isCompleted = state?.is_completed === true;
        }

        // ب) تحديد تاريخ المهمة
        const taskDate = new Date(task.due_date || task.week_id || task.created_at);
        taskDate.setHours(0,0,0,0);
        
        // ج) تطبيق القواعد
        const isCurrentWeek = taskDate >= weekCycle.start && taskDate <= weekCycle.end;
        const isPast = taskDate < weekCycle.start;

        // القاعدة 1: لو المهمة في الأسبوع الحالي -> اظهرها دائماً (مكتملة أو لأ)
        if (isCurrentWeek) return true;

        // القاعدة 2: لو المهمة قديمة -> اظهرها فقط لو مش مكتملة (عليك متأخرات)
        if (isPast) return !isCompleted;

        return false; // المهام المستقبلية
    });

    // الترتيب: المتأخر أولاً، ثم الحالي
    filteredTasks.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    // تحديث العداد
    // ملاحظة: العداد الآن يعرض المهام المطلوبة منك (الحالية + المتأخرة)
    // لو عايز العداد يستبعد المكتمل، ممكن نففلتر تاني للعداد بس، لكن كده منطقي عشان يبين حجم شغل الأسبوع
    safeSetText('stat-active-tasks', filteredTasks.length);
    
    // رسم القائمة
    renderFocusList(filteredTasks, user);
    renderActiveCourses(team.courses_plan || []);
}

// =========================================================
// RENDER FOCUS LIST (تحديث الشكل لإظهار المكتمل)
// =========================================================
function renderFocusList(tasks, user) {
    const list = document.getElementById('overview-focus-list');
    if (!list) return;

    if (!tasks || tasks.length === 0) {
        list.innerHTML = `<div class="text-center py-12 text-gray-500 flex flex-col items-center"><i class="fas fa-check-circle text-4xl mb-2 text-green-500/50"></i><p>لا توجد مهام مطلوبة حالياً</p></div>`;
        return;
    }

    list.innerHTML = tasks.map(task => {
        // 1. إعادة حساب حالة الإنجاز لتحديد الشكل (Checkmark vs Arrow)
        let isCompleted = false;
        if (task.type === 'project') {
            const sub = userSubmissions[String(task.content_id)];
            isCompleted = !!sub; 
        } else {
            let state = user.content_states?.[task.content_id];
            if (!state && task.type === 'video') state = user.content_states?.[`video_${task.content_id}`];
            if (!state) state = user.content_states?.[String(task.content_id)];
            isCompleted = state?.is_completed === true;
        }

        // 2. تحديد الألوان والأيقونات
        let iconClass = 'fa-circle text-gray-500';
        let typeLabel = 'مهمة';
        if (task.type === 'video') { iconClass = 'fa-play text-blue-400'; typeLabel = 'فيديو'; }
        if (task.type === 'quiz') { iconClass = 'fa-question text-purple-400'; typeLabel = 'كويز'; }
        if (task.type === 'project') { iconClass = 'fa-code text-yellow-400'; typeLabel = 'مشروع'; }

        // تصميم المكتمل vs غير المكتمل
        const cardStyle = isCompleted 
            ? "border-green-500/30 bg-green-900/10 hover:bg-green-900/20" // الأخضر للمكتمل
            : "border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20"; // العادي

        const statusBadge = isCompleted
            ? `<div class="flex items-center gap-1 text-green-400 text-xs font-bold bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20 shadow-sm"><i class="fas fa-check"></i> <span>مكتمل</span></div>`
            : `<div class="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-gray-500 group-hover:border-b-primary group-hover:text-b-primary transition-all"><i class="fas fa-arrow-left"></i></div>`;

        return `
        <div onclick="openUnifiedTaskModal('${task.task_id}')" 
             class="flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer group mb-2 ${cardStyle}">
            
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg bg-black/40 flex items-center justify-center text-sm shadow-inner group-hover:scale-110 transition-transform">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div>
                    <h4 class="text-sm font-bold ${isCompleted ? 'text-gray-300 line-through decoration-green-500/50' : 'text-white'} line-clamp-1 group-hover:text-b-primary transition-colors">${task.title}</h4>
                    <p class="text-[10px] text-gray-400 flex items-center gap-2">
                        <span class="bg-white/5 px-1.5 rounded">${typeLabel}</span>
                        <span>${task.due_date ? 'ينتهي: ' + new Date(task.due_date).toLocaleDateString('ar-EG') : ''}</span>
                    </p>
                </div>
            </div>
            
            ${statusBadge}
        </div>`;
    }).join('');
}

function renderActiveCourses(activeIds) {
    const container = document.getElementById('active-courses-container');
    if (!container) return;
    
    if (!activeIds || activeIds.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-gray-500 bg-white/5 rounded-xl border border-white/5 border-dashed"><p>لا توجد كورسات نشطة.</p></div>`;
        return;
    }

    container.innerHTML = activeIds.map(courseId => {
        const c = allData.courses.find(i => String(i.course_id) === String(courseId));
        if(!c) return '';
        
        return `
        <a href="course-player.html?id=${courseId}" class="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/5 hover:border-white/20 hover:bg-white/5 transition-all group">
            <img src="${resolveImageUrl(c.image_url, 'course')}" class="w-12 h-12 rounded-lg object-cover bg-black opacity-80 group-hover:opacity-100">
            <div class="flex-1 min-w-0">
                <h4 class="text-sm font-bold text-gray-200 group-hover:text-white truncate">${c.title}</h4>
                <p class="text-[10px] text-gray-500">اضغط للمتابعة</p>
            </div>
            <i class="fas fa-play text-[10px] text-gray-600 group-hover:text-b-primary"></i>
        </a>`;
    }).join('');
}

window.openUnifiedTaskModal = (taskId) => {
    // 1. العثور على المهمة من قائمة مهام الفريق
    const task = currentTeam.weekly_tasks.find(t => t.task_id === taskId);
    if (!task) {
        console.error("Task not found:", taskId);
        return;
    }

    const modal = document.getElementById('unified-task-modal');
    modal.classList.remove('hidden');
    
    const type = task.type || 'video';
    let details = {};

    // 2. البحث عن التفاصيل في الفهرس (Lookup)
    // نستخدم String() لضمان تطابق الأنواع
    if (type === 'quiz') {
        details = lookupData.quizzes[String(task.content_id)] || {};
    } else if (type === 'project') {
        details = lookupData.projects[String(task.content_id)] || {};
    } else {
        // الفيديو
        details = (lookupData.contents || []).find(c => String(c.content_id) === String(task.content_id)) || {};
    }

    // 3. دمج البيانات (الأولوية للتفاصيل القادمة من الداتابيز، ثم بيانات المهمة)
    // هذا يضمن أن الدرجات والمدة تأتي من الشيت الأصلي
    const finalDetails = { ...task, ...details }; 
    
    updateModalContent(task, finalDetails, type);
};
function updateModalContent(task, details, type) {
    const styles = {
        video: { class: 'from-b-primary/20', icon: 'fa-play-circle', color: 'text-b-primary', label: 'محاضرة فيديو', btnText: 'مشاهدة الدرس', btnIcon: 'fa-play', btnColor: 'bg-b-primary hover:bg-teal-700' },
        quiz: { class: 'from-yellow-500/20', icon: 'fa-clipboard-list', color: 'text-yellow-500', label: 'اختبار تقييمي', btnText: 'بدء الاختبار', btnIcon: 'fa-pencil-alt', btnColor: 'bg-yellow-600 hover:bg-yellow-700' },
        project: { class: 'from-purple-500/20', icon: 'fa-laptop-code', color: 'text-purple-500', label: 'مشروع عملي', btnText: 'تفاصيل المشروع', btnIcon: 'fa-upload', btnColor: 'bg-purple-600 hover:bg-purple-700' },
        custom: { class: 'from-gray-500/20', icon: 'fa-star', color: 'text-gray-400', label: 'مهمة خاصة', btnText: 'إنجاز المهمة', btnIcon: 'fa-check', btnColor: 'bg-gray-600 hover:bg-gray-700' }
    };
    
    // التعامل مع المهام الخاصة
    const isCustom = task.is_custom || type === 'custom';
    const style = styles[isCustom ? 'custom' : type] || styles.video;

    // 1. UI Updates
    document.getElementById('modal-header-bg').className = `p-6 border-b border-white/10 bg-gradient-to-r ${style.class} to-transparent`;
    document.getElementById('modal-type-icon').className = `fas ${style.icon} ${style.color}`;
    
    const badge = document.getElementById('modal-type-badge');
    badge.innerText = style.label;
    badge.className = `text-[10px] uppercase font-bold tracking-wider bg-black/40 px-2 py-1 rounded border border-white/5 ${style.color}`;

    // 2. العنوان والكورس
    document.getElementById('modal-title').innerText = details.title || task.title || "بدون عنوان";
    
    const courseName = getCourseNameById(task.course_id);
    document.getElementById('modal-subtitle').innerText = isCustom ? "مهمة إضافية للفريق" : `تابع للكورس: ${courseName}`;

    // 3. الوصف
    const descEl = document.getElementById('modal-desc');
    // البحث عن الوصف في كل الحقول المحتملة
    const descText = details.description || details.Description || details.Note || task.description || "لا يوجد وصف متاح.";
    descEl.innerHTML = String(descText).replace(/\n/g, '<br>');

    // 4. الشبكة (Grid) - معالجة البيانات بدقة
    const grid = document.getElementById('modal-details-grid');
    let gridHtml = '';
    
    const addCard = (label, value, icon) => {
        if(value === undefined || value === null || value === "") return;
        gridHtml += `
        <div class="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col justify-center items-center text-center hover:bg-white/5 transition-all">
            <p class="text-[10px] text-gray-500 mb-1">${label}</p>
            <p class="font-bold text-white text-sm flex items-center gap-2">
                <i class="fas ${icon} ${style.color} opacity-70"></i> ${value}
            </p>
        </div>`;
    };

    // --- منطق استخراج البيانات (Data Extraction Logic) ---
    
    // أ) النقاط (Points):
    // نبحث في points (شيت المهام) ثم base_points (شيت المحتوى) ثم Max Points (شيت الكويز)
    // إذا كانت المهمة custom، غالباً ليس لها نقاط ثابتة إلا لو الليدر حددها
    let points = details.points || details.base_points || details['Max Points'] || details.max_points;
    if (points === undefined && !isCustom) points = 0; // فقط لو مش كاستم نحط صفر، الكاستم ممكن يبقا من غير نقاط
    if (points !== undefined) addCard("الدرجة / النقاط", `${points} XP`, "fa-star");

    // ب) المدة (Duration):
    // نبحث عن duration (صغيرة) أو Duration (كبيرة)
    const rawDuration = details.Duration || details.duration || task.duration;
    if (rawDuration) addCard("المدة", formatDuration(rawDuration), "fa-clock");

    // ج) التاريخ:
    if (task.due_date) {
        addCard("تاريخ التسليم", new Date(task.due_date).toLocaleDateString('ar-EG'), "fa-calendar-alt");
    }

    // د) تفاصيل خاصة بالكويز:
    if (type === 'quiz') {
        // عدد الأسئلة
        const qCount = details.questions_count || details.questions_to_show || details['Questions Count'];
        addCard("عدد الأسئلة", qCount ? `${qCount} سؤال` : "غير محدد", "fa-list-ol");
        
        // المحاولات (الحل لمشكلة اللانهائية)
        // إذا كانت القيمة فارغة أو 0 نعتبرها غير محدود، وإلا نعرض الرقم
        const attempts = details.attempts || details.Attempts || details['Allowed Attempts'];
        const attemptsText = (attempts && attempts != 0) ? `${attempts} محاولات` : "غير محدود";
        addCard("المحاولات المتاحة", attemptsText, "fa-redo");
    }

    // هـ) تفاصيل الفيديو:
    if (type === 'video') {
        const instructor = details.Author || details.instructor || "فريق Busla";
        addCard("المحاضر", instructor, "fa-chalkboard-teacher");
    }

    grid.innerHTML = gridHtml;

    // 5. زر الإجراء
    const btn = document.getElementById('modal-action-btn');
    const isDone = currentUser?.content_states?.[task.content_id]?.is_completed || false;

    if (isDone) {
        btn.className = `flex-1 py-3.5 rounded-xl font-bold text-center flex items-center justify-center gap-2 transition-all shadow-lg text-white bg-green-600 hover:bg-green-700 cursor-default`;
        btn.innerHTML = `<i class="fas fa-check-circle"></i> <span>تم الإنجاز</span>`;
        btn.href = "#"; 
    } else {
        // إذا كانت مهمة خاصة، لا يوجد رابط كورس بلاير
        if (isCustom) {
            btn.href = "#";
            btn.onclick = () => alert("هذه مهمة يدوية. قم بتأكيدها مع القائد.");
            btn.innerHTML = `<i class="fas fa-check"></i> <span>تسجيل كمنجز</span>`;
        } else {
            btn.href = `course-player.html?id=${task.course_id}&content=${task.content_id}&task_id=${task.task_id}`;
            btn.innerHTML = `<i class="fas ${style.btnIcon}"></i> <span>${style.btnText}</span>`;
            btn.onclick = null;
        }
        btn.className = `flex-1 py-3.5 rounded-xl font-bold text-center flex items-center justify-center gap-2 transition-all shadow-lg text-white ${style.btnColor}`;
    }
}
// =========================================================
// 4. DATA FETCHING (With Indexing Fix)
// =========================================================
async function fetchCurriculumData() {
    const cached = localStorage.getItem('curriculum_cache');
    
    const processData = (json) => {
        allData = json;
        // 🔥🔥 بناء الفهرس (Lookup) لضمان العثور على التفاصيل 🔥🔥
        lookupData = { projects: {}, quizzes: {}, contents: [] };
        
        if (json.projects) json.projects.forEach(p => lookupData.projects[String(p.project_id)] = p);
        if (json.quizzes) json.quizzes.forEach(q => lookupData.quizzes[String(q.quiz_id)] = q);
        if (json.contents) lookupData.contents = json.contents;
        
        renderStudentTree();
    };

    if (cached) {
        processData(JSON.parse(cached));
    }

    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getFullCurriculum`);
        const json = await response.json();
        if (json.status !== 'error') {
            localStorage.setItem('curriculum_cache', JSON.stringify(json));
            processData(json);
        }
    } catch (e) { console.error("Fetch Error:", e); }
}

function renderStudentTree() {
    const container = document.getElementById('curriculum-tree-container');
    if (!container || !allData?.phases) return;
    container.innerHTML = ''; 
    const treeWrapper = document.createElement('div');
    treeWrapper.className = 'relative pl-8 border-l-2 border-white/10 ml-4 space-y-12 py-8';

    allData.phases.forEach((phase) => {
        const phaseEl = document.createElement('div');
        phaseEl.className = 'relative';
        phaseEl.innerHTML = `
            <div class="absolute -left-[41px] top-0 w-5 h-5 rounded-full border-4 border-b-bg bg-b-primary shadow-[0_0_10px_rgba(0,106,103,0.5)]"></div>
            <div class="ml-6">
                <h3 class="text-2xl font-bold text-white mb-2">${phase.title}</h3>
                <p class="text-sm text-gray-400 mb-6">${phase.description || ''}</p>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    ${getCoursesForPhase(phase.phase_id, allData.courses)}
                </div>
            </div>`;
        treeWrapper.appendChild(phaseEl);
    });
    container.appendChild(treeWrapper);
}

function getCoursesForPhase(phaseId, courses) {
    return courses.filter(c => String(c.phase_id) === String(phaseId)).map(course => `
        <div onclick="window.openCourseModal('${course.course_id}')" class="group bg-b-surface border border-white/10 rounded-xl p-4 cursor-pointer hover:border-b-primary hover:bg-white/5 transition-all">
            <div class="flex gap-4">
                <img src="${resolveImageUrl(course.image_url, 'course')}" class="w-20 h-20 rounded-lg object-cover bg-black opacity-80 group-hover:opacity-100">
                <div class="flex-1">
                    <h4 class="font-bold text-white text-sm mb-1 group-hover:text-b-primary">${course.title}</h4>
                    <p class="text-[10px] text-gray-500 line-clamp-2">${course.description || '...'}</p>
                </div>
            </div>
        </div>
    `).join('');
}

// Helpers for Solo Mode
function renderSoloOverview(user) {
    document.getElementById('stat-my-xp').innerText = user.gamification?.total_points || 0;
    document.getElementById('stat-active-tasks').innerText = "0";
    document.getElementById('stat-team-score').innerText = "-";
    document.getElementById('stat-my-rank').innerText = "Solo";
    document.getElementById('overview-focus-list').innerHTML = '<p class="text-center text-gray-500 py-10">انضم لفريق لتفعيل المهام.</p>';
}

function renderStudentTasks(user, team) { /* Logic same as overview, reused */ }
async function renderSquad(team) { /* Logic for squad tab */ }
async function loadAvailableTeams() { /* Logic for marketplace */ }

// Course Details Modal (from Tree)
window.openCourseModal = (courseId) => {
    const c = allData.courses.find(x => String(x.course_id) === String(courseId));
    if(!c) return;
    document.getElementById('modal-course-title').innerText = c.title;
    document.getElementById('modal-course-desc').innerText = c.description;
    document.getElementById('modal-course-playlist').href = c.playlist_url;
    
    const contents = allData.contents?.filter(co => String(co.course_id) === String(courseId)) || [];
    const list = document.getElementById('modal-course-content-list');
    list.innerHTML = contents.map(item => `<li class="py-1 border-b border-white/5 flex justify-between"><span>${item.title}</span><span class="text-[10px] text-gray-500 uppercase">${item.type}</span></li>`).join('');

    document.getElementById('course-details-modal').classList.remove('hidden');
};
// --- Helper Functions ---

// دالة تنسيق الوقت (لحل مشكلة اختفاء مدة الفيديو)
function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return 'غير محدد';
    // لو الرقم جاي كنص فيه نقطتين (مثلاً "10:30") رجعه زي ما هو
    if (String(seconds).includes(':')) return seconds;
    
    const secNum = parseInt(seconds, 10);
    if (isNaN(secNum)) return 'غير محدد';

    const hours = Math.floor(secNum / 3600);
    const minutes = Math.floor((secNum - (hours * 3600)) / 60);
    const secs = secNum - (hours * 3600) - (minutes * 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// دالة جلب اسم الكورس
function getCourseNameById(courseId) {
    if (!allData.courses) return "غير محدد";
    const course = allData.courses.find(c => String(c.course_id) === String(courseId));
    return course ? course.title : "عام";
}

function getCurrentWeekCycle() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // Sunday=0, ..., Saturday=6
    
    // معادلة العودة ليوم السبت الماضي (أو الحالي)
    // لو اليوم السبت (6) -> نرجع 0 يوم. لو الأحد (0) -> نرجع 1 يوم.
    const daysSinceSaturday = (dayOfWeek + 1) % 7;
    
    const start = new Date(now);
    start.setDate(now.getDate() - daysSinceSaturday);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6); // نهاية الأسبوع يوم الجمعة
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
}

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.innerText = text;
    } else {
        console.warn(`Element with ID '${id}' not found via safeSetText`);
    }
}


function renderWeekInfo(currentRank) {
    const headerContainer = document.getElementById('week-header-info');
    if (!headerContainer) return;

    const week = getCurrentWeekCycle();
    const now = new Date();
    
    const daysAr = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const currentDayName = daysAr[now.getDay()];

    const options = { month: 'long', day: 'numeric' };
    const startStr = week.start.toLocaleDateString('ar-EG', options);
    const endStr = week.end.toLocaleDateString('ar-EG', options);

    headerContainer.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-center bg-gradient-to-r from-b-primary/20 to-black/40 p-4 rounded-xl border border-b-primary/30 shadow-lg relative overflow-hidden">
            <div class="absolute top-0 right-0 w-32 h-32 bg-b-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>

            <div class="flex items-center gap-5 mb-4 md:mb-0 relative z-10">
                <div class="w-14 h-14 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-b-primary text-2xl shadow-inner">
                    <i class="fas fa-calendar-week"></i>
                </div>
                <div>
                    <h3 class="font-bold text-white text-xl">الأسبوع الحالي</h3>
                    <p class="text-sm text-gray-300 mt-1">
                        من <span class="text-white font-bold mx-1">${startStr}</span> 
                        إلى <span class="text-white font-bold mx-1">${endStr}</span>
                    </p>
                </div>
            </div>

            <div class="flex items-center gap-4 relative z-10 w-full md:w-auto">
                <div class="flex-1 md:flex-none bg-black/40 px-5 py-2.5 rounded-xl border border-white/5 text-center">
                    <p class="text-[10px] text-gray-400 uppercase tracking-wider mb-1">اليوم</p>
                    <p class="font-bold text-white text-lg">${currentDayName}</p>
                </div>
                <div class="flex-1 md:flex-none bg-black/40 px-5 py-2.5 rounded-xl border border-white/5 text-center">
                    <p class="text-[10px] text-gray-400 uppercase tracking-wider mb-1">الترتيب</p>
                    <p class="font-bold text-white text-lg text-yellow-500">${currentRank}</p>
                </div>
            </div>
        </div>
    `;
}
