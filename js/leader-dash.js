import { 
    auth, db, doc, getDoc, getDocs, updateDoc, setDoc, deleteDoc, writeBatch, // 👈 تأكد من وجود دول
    arrayUnion, arrayRemove, query, where, collection, onAuthStateChanged, signOut, serverTimestamp 
} from './firebase-config.js';
import { getTeamData } from './team-system.js';
import { initSettingsModal, openSettings } from './settings-handler.js';
import { initBadgesSystem } from './badges-handler.js';
import { initTeamBadgesSystem } from './team-badges-handler.js';
import { initLeaderboard } from './leaderboard-handler.js';
import { initTeamSettingsModal, openTeamSettings } from './team-settings-handler.js'; 
import { initNotificationsSystem } from './notifications-handler.js';
document.addEventListener('DOMContentLoaded', () => {

});
document.addEventListener('DOMContentLoaded', () => {
    initSettingsModal();
    const settingsBtn = document.getElementById('open-settings-btn'); 
    if(settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openSettings();
        });
    }
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


    initTeamSettingsModal();

    // 2. ربط الزر
    const teamSettingsBtn = document.getElementById('open-team-settings-btn');
    if (teamSettingsBtn) {
        teamSettingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // 🔒 التحقق من أن المستخدم هو الليدر
            const isLeader = currentUserData?.uid === currentTeam?.leader_id;
            
            if (currentTeam && currentTeam.team_id) {
                openTeamSettings(currentTeam.team_id, isLeader);
            } else {
                // Fallback لو الداتا لسه بتحمل
                showToast("انتظر تحميل البيانات...", "info");
            }
        });
    }

});
// --- Configuration ---
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyndLl7n0L4DVCIaaVwD5wIhx5JotZMiNUEm9b8IaUQCUgFxKtNX_oC9FsvA1uyJ9JJ/exec';
const CACHE_KEY = 'busla_lms_v6';
let lookupData = { projects: {}, quizzes: {}, videos: {} };
// --- State Management ---
let currentUser = null;
let currentTeam = null;
let currentUserData = null;
let allData = { phases: [], courses: [], tree: [] };
let selectedAssignCourse = null;
let expandedNodes = new Set(); // Persist expanded tree nodes

// --- Initialization ---

// ==========================================
// 1. DATA FETCHING (Network First -> Update Cache)
// ==========================================
async function fetchDataFromServer() {
    try {
        console.log("🚀 Fetching Fresh Data from Server...");
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getFullCurriculum`);
        const json = await response.json();
        
        if (json.status === "error") {
            showToast("Server Error: " + json.message, "error");
            return;
        }

        // 1. Store Raw Data
        allData.tree = json.tree || [];
        allData.phases = json.phases || [];
        allData.projects = json.projects || [];
        allData.quizzes = json.quizzes || [];
        
        // نحفظ المحتوى الخام للكاش عشان نستخدمه في التعيين
        allData.rawContents = json.contents || []; 

        // 2. Process Courses (Calculate Stats Locally)
        const rawCourses = json.courses || [];
        const rawContents = json.contents || [];

        allData.courses = rawCourses.map(course => {
            const courseContents = rawContents.filter(c => String(c.course_id) === String(course.course_id) && c.status !== 'removed');
            
            const videoCount = courseContents.filter(c => c.type === 'video').length;
            let totalSeconds = 0;
            let instructor = course.Author || ""; 

            courseContents.forEach(c => {
                if(c.type === 'video') {
                    totalSeconds += parseDurationToSeconds(c.Duration);
                    if (!instructor && c.Author) instructor = c.Author;
                }
            });

            return {
                ...course,
                real_video_count: videoCount,
                real_total_duration: formatSecondsToTime(totalSeconds),
                instructor: instructor || "فريق العمل",
                image_url: course.image_url 
            };
        });

        // 3. Populate Lookup Tables (For instant access)
        if (json.projects) json.projects.forEach(p => lookupData.projects[String(p.project_id)] = p);
        if (json.quizzes) json.quizzes.forEach(q => lookupData.quizzes[String(q.quiz_id)] = q);
        lookupData.contents = rawContents; 

        // 🔥🔥🔥 الخطوة الأهم: حفظ البيانات الجديدة في الكاش للمرة القادمة 🔥🔥🔥
        localStorage.setItem(CACHE_KEY, JSON.stringify(allData));
        console.log("✅ Data Updated & Cached");

    } catch (error) {
        console.error("Fetch Error:", error);
        // لا تظهر رسالة خطأ مزعجة إذا كان الكاش يعمل، فقط في الكونسول
        if (!allData.courses || allData.courses.length === 0) {
             showToast("فشل الاتصال بالسيرفر", "error");
        }
    }
}
// Mobile Menu Toggle (تم التحديث ليتوافق مع الاتجاه الصحيح)
    const menuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            // لإظهار القائمة: نزيل كلاس الإزاحة (فتعود لمكانها الطبيعي 0)
            sidebar.classList.remove('translate-x-full'); 
            overlay.classList.remove('hidden'); 
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            // لإخفاء القائمة: نضيف كلاس الإزاحة لليمين
            sidebar.classList.add('translate-x-full'); 
            overlay.classList.add('hidden'); 
        });
    }
function parseDurationToSeconds(duration) {
    if (!duration) return 0;
    const str = String(duration);
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function formatSecondsToTime(totalSeconds) {
    if (!totalSeconds) return "00:00:00";
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return (h > 0 ? h + ":" : "") + (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
}
async function initDashboard(uid) {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (!userDoc.exists()) throw new Error("User profile not found");
        
        currentUserData = userDoc.data();
        const teamId = currentUserData.team_id || currentUserData.system_info?.team_id;

        if (!teamId) {
            window.location.href = "student-dash.html";
            return;
        }

        currentTeam = await getTeamData(teamId);
        currentTeam.team_id = teamId;
        
        // 1. تحديث الهيدر فوراً
        updateHeaderInfo(currentUserData, currentTeam);

        // 🔥 2. استراتيجية الكاش أولاً (Stale-While-Revalidate) 🔥
        const hasCache = loadFromCache();
        if (hasCache) {
            console.log("⚡ Rendering from Cache immediately...");
            renderAllTabs(); // ارسم الموقع فوراً للمستخدم
        } else {
            console.log("⚠️ No cache found, waiting for server...");
        }

        // 3. طلب البيانات الحديثة في الخلفية (بدون تجميد الشاشة)
        // نستخدم await هنا لضمان تحديث البيانات، لكن المستخدم يرى النسخة القديمة بالفعل
        await fetchDataFromServer();
        
        // 4. إعادة الرسم بالبيانات الحديثة
        console.log("🔄 Re-rendering with fresh data...");
        renderAllTabs();

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
// 5. UNIFIED MODAL (Instant Load & Correct Data) ⚡
// ==========================================
window.openUnifiedTaskModal = (taskId) => {
    // 1. العثور على المهمة بالـ ID الفريد الجديد
    const task = currentTeam.weekly_tasks.find(t => t.task_id === taskId);
    if (!task) {
        console.error("Task not found:", taskId);
        return;
    }

    const modal = document.getElementById('unified-task-modal');
    const type = task.type || 'video';
    
    modal.classList.remove('hidden');
    
    // 🔥 جلب البيانات الصحيحة بناءً على النوع والـ ID 🔥
    let details = {};
    
    if (type === 'quiz') {
        // البحث في كاش الكويزات
        details = lookupData.quizzes[String(task.content_id)];
        if (!details) console.warn("Quiz details not found in cache for ID:", task.content_id);
    } else if (type === 'project') {
        // البحث في كاش المشاريع
        details = lookupData.projects[String(task.content_id)];
        if (!details) console.warn("Project details not found in cache for ID:", task.content_id);
    } else {
        // للفيديو: نستخدم بيانات المهمة نفسها + البحث عن تفاصيل إضافية في المحتوى
        const contentDetails = (lookupData.contents || []).find(c => String(c.content_id) === String(task.content_id) && c.type === 'video');
        details = contentDetails || task; 
    }

    // إذا لم نجد تفاصيل (fallback)، نستخدم بيانات المهمة الأساسية
    const finalDetails = details || task;

    updateModalContent(task, finalDetails, type);
};
// ==========================================
// تحديث محتوى المودال (النسخة الآمنة والمعدلة)
// ==========================================
function updateModalContent(task, details, type) {
    const styles = {
        video: { 
            class: 'from-b-primary/20', icon: 'fa-play', color: 'text-b-primary', 
            label: 'محاضرة / فيديو', btnText: 'مشاهدة الدرس', btnIcon: 'fa-play', btnColor: 'bg-b-primary hover:bg-teal-700' 
        },
        quiz: { 
            class: 'from-yellow-500/20', icon: 'fa-clipboard-question', color: 'text-yellow-500', 
            label: 'اختبار (Quiz)', btnText: 'بدء الاختبار', btnIcon: 'fa-pencil-alt', btnColor: 'bg-yellow-600 hover:bg-yellow-700' 
        },
        project: { 
            class: 'from-purple-500/20', icon: 'fa-laptop-code', color: 'text-purple-500', 
            label: 'مشروع عملي', btnText: 'تسليم المشروع', btnIcon: 'fa-upload', btnColor: 'bg-purple-600 hover:bg-purple-700' 
        }
    };
    const style = styles[type] || styles.video;

    // 1. الهيدر
    const headerBg = document.getElementById('modal-header-bg');
    headerBg.className = `p-6 border-b border-white/10 bg-gradient-to-r ${style.class} to-transparent`;
    document.getElementById('modal-type-icon').className = `fas ${style.icon} ${style.color}`;
    document.getElementById('modal-type-badge').innerText = style.label;
    document.getElementById('modal-type-badge').className = `text-[10px] uppercase font-bold tracking-wider bg-black/40 px-2 py-1 rounded border border-white/5 ${style.color}`;

    // 2. تحضير المتغيرات
    let mainTitle = details.title || task.title || "بدون عنوان";
    let subTitle = ""; 
    let description = "";
    let gridHtml = "";

    // دالة مساعدة
    const addGridItem = (label, value, iconClass) => {
        if(!value && value !== 0) return;
        gridHtml += `
            <div class="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col justify-between h-full">
                <p class="text-[10px] text-gray-500 mb-1">${label}</p>
                <p class="font-bold text-white text-sm line-clamp-2">
                    <i class="fas ${iconClass} ${style.color} ml-1 opacity-70"></i> ${value}
                </p>
            </div>`;
    };

    // --- المنطق حسب النوع ---

    if (type === 'project') {
        mainTitle = details.title || task.title; 
        const relatedLessonName = getRelatedLessonName(task.content_id, 'project'); 
        subTitle = relatedLessonName ? `مشروع لدرس: ${relatedLessonName}` : `تابع لكورس: ${getCourseNameById(task.course_id)}`;
        
        // 🔥 تحويل الوصف لنص لتجنب الأخطاء
        description = details.description ? String(details.description) : (task.description || "لا يوجد وصف.");
        
        addGridItem("الدرجة العظمى", `${details.max_points || 0} نقطة`, "fa-star");

    } else if (type === 'quiz') {
        mainTitle = details.title || task.title;
        const relatedLessonName = getRelatedLessonName(task.content_id, 'quiz');
        subTitle = relatedLessonName ? `مرتبط بدرس: ${relatedLessonName}` : `تابع لكورس: ${getCourseNameById(task.course_id)}`;
        
        // 🔥 قراءة الوصف من الشيت وتحويله لنص
        // إذا كان العمود فارغاً، نضع النص الافتراضي
        description = details.description ? String(details.description) : "اختبار لتقييم الفهم.";

        addGridItem("عدد الأسئلة", `${details.questions_to_show || '?'} سؤال`, "fa-list-ol");
        addGridItem("المحاولات", details.Attempts || "غير محدود", "fa-redo");
        addGridItem("الدرجة", `${details.max_points || 0} نقطة`, "fa-trophy");

    } else {
        // Video
        mainTitle = details.title || task.title;
        const courseName = getCourseNameById(task.course_id);
        subTitle = `ضمن كورس: ${courseName}`;
        
        // 🔥 تحويل الوصف لنص
        description = details.description || details.Note || task.description || "لا يوجد وصف.";
        description = String(description); // تأكيد التحويل

        let authorName = details.Author || "فريق العمل";
        if (!details.Author || details.Author === "Busla Team") {
             const courseInfo = getCourseInfoById(task.course_id);
             if (courseInfo && courseInfo.instructor) authorName = courseInfo.instructor;
        }

        const duration = formatDuration(details.Duration || details.duration || task.duration);
        const points = details.base_points || 10;

        addGridItem("المحاضر", authorName, "fa-chalkboard-teacher");
        addGridItem("المدة", duration, "fa-clock");
        addGridItem("النقاط", `${points} XP`, "fa-star");
        addGridItem("المصدر", "فيديو مسجل", "fa-video");
    }

    // 3. التطبيق على الواجهة
    document.getElementById('modal-title').innerText = mainTitle;
    
    const subEl = document.getElementById('modal-subtitle');
    if(subEl) subEl.innerText = subTitle;

    // 🔥 الحل النهائي للمشكلة هنا: التعامل الآمن مع النصوص
    const descEl = document.getElementById('modal-desc');
    // نتأكد أن المتغير description هو نص (String) قبل استخدام replace
    descEl.innerHTML = description ? String(description).replace(/\n/g, '<br>') : "لا يوجد وصف.";
    
    document.getElementById('modal-details-grid').innerHTML = gridHtml;

    const btn = document.getElementById('modal-action-btn');
    btn.href = `course-player.html?id=${task.course_id}&content=${task.content_id}&task_id=${task.task_id}`;
    btn.innerHTML = `<i class="fas ${style.btnIcon}"></i> <span>${style.btnText}</span>`;
    btn.className = `flex-1 py-3.5 rounded-xl font-bold text-center flex items-center justify-center gap-2 transition-all shadow-lg text-white ${style.btnColor} hover:-translate-y-0.5`;
}

function resolveImageUrl(url, type = 'course') {
    if (!url || url.trim() === "" || url === "null" || url === "undefined") {
        if (type === 'team') {
            return '../assets/icons/icon.jpg';
        } else if (type === 'user') {
            return '../assets/icons/icon.jpg';
        } else {
            return '../assets/icons/icon.jpg';
        }
    }
    if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
        const idMatch = url.match(/\/d\/([-\w]{25,})/) || url.match(/id=([-\w]{25,})/);
        if (idMatch && idMatch[1]) {
            return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
        }
    }

    if (url.includes('dropbox.com')) {
        return url.replace('?dl=0', '?raw=1');
    }
    return url;
}
function getRelatedLessonName(contentId, type) {
    if (!lookupData.contents) return null;
    
    // البحث في كل المحتويات عن فيديو مرتبط بهذا الـ ID
    // في شيت Course_Contents، العمود related_quiz_id أو related_project_id يحتوي على الـ ID
    const parentVideo = lookupData.contents.find(c => {
        if (type === 'quiz') return String(c.related_quiz_id) === String(contentId);
        if (type === 'project') return String(c.related_project_id) === String(contentId);
        return false;
    });

    return parentVideo ? parentVideo.title : null;
}

// دالة مساعدة لجلب بيانات الكورس كاملة
function getCourseInfoById(courseId) {
    return allData.courses.find(c => String(c.course_id) === String(courseId));
}
function getCourseNameById(courseId) {
    if(!allData.courses) return "Unknown";
    const course = allData.courses.find(c => String(c.course_id) === String(courseId)) || 
                   allData.tree.find(c => String(c.id) === String(courseId));
    return course ? (course.title || course.Title) : "General Course";
}

function renderModalSkeleton(type) {
    document.getElementById('modal-title').innerText = "Loading...";
    const sub = document.getElementById('modal-subtitle');
    if(sub) sub.innerText = "...";
    document.getElementById('modal-desc').innerText = "Fetching details...";
    document.getElementById('modal-details-grid').innerHTML = `<div class="h-20 bg-white/5 rounded-xl animate-pulse"></div>`;
}
async function renderTeamOverview(tasks) {
    const container = document.getElementById('overview-container');
    if (!container) return;
    container.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-600 bg-white/5 rounded-2xl border border-white/5 border-dashed">
                <i class="fas fa-clipboard-list text-5xl mb-4 opacity-50"></i>
                <p>لا توجد مهام نشطة لهذا الأسبوع.</p>
                <button onclick="switchTab('assignments')" class="mt-4 text-b-primary hover:text-white text-sm font-bold underline">
                    + إضافة مهام جديدة
                </button>
            </div>`;
        return;
    }

    const currentWeek = getCurrentWeekCycle();
    // ترتيب: الأحدث أولاً
    tasks.sort((a, b) => getSafeDate(b.created_at) - getSafeDate(a.created_at));

    const currentWeekTasks = tasks.filter(t => t.week_id === currentWeek.id);

    if (currentWeekTasks.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-center py-4">لا توجد مهام في الأسبوع الحالي.</p>`;
        return;
    }

    currentWeekTasks.forEach(task => {
        // تحديد الستايل بناءً على النوع
        let typeConfig = {
            icon: 'fa-play', color: 'text-b-primary', bg: 'bg-b-primary/10', border: 'border-l-b-primary', label: 'فيديو'
        };
        
        if (task.type === 'quiz') {
            typeConfig = { icon: 'fa-clipboard-question', color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-l-yellow-500', label: 'كويز' };
        } else if (task.type === 'project') {
            typeConfig = { icon: 'fa-code-branch', color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-l-purple-500', label: 'مشروع' };
        }

        const canDelete = (!task.stats || task.stats.started_count === 0);
        const title = task.title || "مهمة بدون عنوان";

        const html = `
            <div class="bg-b-surface border border-white/10 border-l-4 ${typeConfig.border} rounded-xl p-4 flex justify-between items-center group hover:bg-white/5 transition-all relative shadow-sm hover:shadow-md">
                
                <div class="flex items-center gap-4 flex-1 cursor-pointer" onclick="openUnifiedTaskModal('${task.task_id}')">
                    <div class="w-12 h-12 rounded-xl ${typeConfig.bg} ${typeConfig.color} flex items-center justify-center text-xl shadow-inner">
                        <i class="fas ${typeConfig.icon}"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[10px] ${typeConfig.color} bg-white/5 px-1.5 rounded border border-white/5">${typeConfig.label}</span>
                            ${task.duration ? `<span class="text-[10px] text-gray-500"><i class="far fa-clock ml-1"></i>${formatDuration(task.duration)}</span>` : ''}
                        </div>
                        <h4 class="font-bold text-white text-base line-clamp-1 group-hover:text-b-primary transition-colors">
                            ${title}
                        </h4>
                    </div>
                </div>

                <div class="flex items-center gap-2 mr-4">
                     <a href="course-player.html?id=${task.course_id}&content=${task.content_id}&task_id=${task.task_id}" 
                        class="w-10 h-10 rounded-lg bg-white/5 hover:bg-b-primary text-gray-400 hover:text-white flex items-center justify-center transition-all"
                        title="فتح المهمة">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                    
                    ${canDelete ? `
                        <button onclick="deleteTask('${task.task_id}', '${task.week_id}')" 
                                class="w-10 h-10 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-all flex items-center justify-center"
                                title="حذف">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    ` : `
                        <div class="w-10 h-10 flex items-center justify-center text-gray-600 cursor-help" title="جاري العمل عليها">
                            <i class="fas fa-lock"></i>
                        </div>
                    `}
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
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

    // 1. تجهيز البيانات
    const userName = user.personal_info?.full_name || user.full_name || "مستخدم Busla";
    const userPoints = user.gamification?.total_points || user.total_points || 0;
    const teamName = team.info?.name || team.team_name || "فريقي";
    const leaderName = team.leader_name || user.personal_info?.full_name || "القائد"; // اسم القائد (غالباً هو المستخدم الحالي هنا)

    // 2. صور (Team Logo & User Avatar)
    // - لوجو الفريق من الفايربيز
    let rawTeamLogo = null;
    if (team.info && team.info.logo_url) rawTeamLogo = team.info.logo_url;
    else if (team.logo_url) rawTeamLogo = team.logo_url;
    const teamLogoUrl = resolveImageUrl(rawTeamLogo, 'team');

    // - صورة المستخدم (حالياً افتراضية أو بوصلة، مستقبلاً من user.photo_url)
    const rawUserAvatar = user.personal_info?.photo_url || user.photo_url;
    // نستخدم صورة البوصلة كبديل افتراضي لليوزر
    const defaultUserAvatar = "../assets/icons/icon.jpg"; 
    const userAvatarUrl = rawUserAvatar ? resolveImageUrl(rawUserAvatar, 'user') : defaultUserAvatar;


    // 3. تحديث الـ DOM (واجهة المستخدم)

    // --- منطقة السايدبار (Team Profile) ---
    safeText('sidebar-team-name', teamName);
    safeText('sidebar-leader-name', leaderName);
    
    const sidebarLogoEl = document.getElementById('sidebar-team-logo');
    if(sidebarLogoEl) {
        sidebarLogoEl.src = teamLogoUrl;
        sidebarLogoEl.onerror = function() { 
            this.onerror = null; 
            this.src = `../assets/icons/icon.jpg`; 
        };
    }

    // --- منطقة الهيدر (User Profile) ---
    safeText('header-user-name', userName);
    safeText('my-points', userPoints);
    safeText('stat-team-score', team.total_score || 0);

    const headerAvatarEl = document.getElementById('header-user-avatar');
    if(headerAvatarEl) {
        headerAvatarEl.src = userAvatarUrl;
        headerAvatarEl.onerror = function() {
            this.onerror = null;
            this.src = defaultUserAvatar;
        };
    }

    // --- منطقة البادجات (Placeholder للمستقبل) ---
    const badgesContainer = document.getElementById('sidebar-badges-container');
    if(badgesContainer) {
        // مثال: لو الفريق معدي 1000 نقطة نديله بادج
        if ((team.total_score || 0) > 1000) {
            badgesContainer.innerHTML = `
                <div class="w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/50 flex items-center justify-center text-yellow-500 text-xs" title="فريق ذهبي">
                    <i class="fas fa-medal"></i>
                </div>
            `;
        } else {
            badgesContainer.innerHTML = ''; // فاضي حالياً
        }
    }
}
function loadFromCache() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            console.log("📂 Loading from Cache...");
            allData = JSON.parse(cached);
            
            // 🔥 إعادة بناء قواميس البحث السريع من الكاش فوراً
            lookupData = { projects: {}, quizzes: {}, videos: {}, contents: [] }; // تصفير
            
            if (allData.projects) allData.projects.forEach(p => lookupData.projects[String(p.project_id)] = p);
            if (allData.quizzes) allData.quizzes.forEach(q => lookupData.quizzes[String(q.quiz_id)] = q);
            
            // إذا كنا قد حفظنا المحتوى الخام سابقاً (سنضيف حفظه الآن)
            if (allData.rawContents) lookupData.contents = allData.rawContents;

            return true; // نجح التحميل
        } catch (e) {
            console.error("Cache corrupted, clearing...", e);
            localStorage.removeItem(CACHE_KEY);
            return false;
        }
    }
    return false;
}

function renderAllTabs() {
    renderOverview();
    renderRoadmapTree();
    renderAssignments();
    renderSquad();
    renderGrading();
}

function renderOverview() {
    if (!currentTeam) return;
    
    renderWeekInfo(); 

    const activeIds = currentTeam.courses_plan || [];
    const tasks = currentTeam.weekly_tasks || [];

    // تحديث العدادات العلوية
    const statMembers = document.getElementById('stat-members-count');
    const statCourses = document.getElementById('stat-active-courses');
    const statTasks = document.getElementById('stat-active-tasks');

    // نحاول جلب عدد الأعضاء الحقيقي إذا توفرت الدالة، وإلا 0
    if (statMembers) statMembers.innerText = `${(currentTeam.members || []).length} / 5`;
    if (statCourses) statCourses.innerText = activeIds.length;
    if (statTasks) statTasks.innerText = tasks.length;

    // 1. رسم المهام
    renderTeamOverview(tasks);
    
    // 2. رسم الكورسات النشطة (الجديد)
    renderActiveCourses(activeIds);
}
function renderActiveCourses(activeIds) {
    const container = document.getElementById('active-courses-container');
    if (!container) return;
    
    container.innerHTML = '';

    if (!activeIds || activeIds.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-gray-500 bg-white/5 rounded-xl border border-white/5 border-dashed"><p>لا توجد كورسات نشطة.</p></div>`;
        return;
    }

    activeIds.forEach(courseId => {
        // Find in loaded data
        const courseData = allData.courses.find(c => String(c.course_id) === String(courseId)) || 
                           allData.tree.find(c => String(c.id) === String(courseId));

        const title = courseData ? (courseData.title || courseData.Title) : "كورس محدد";
        
let img = resolveImageUrl(courseData.image_url, 'course');

        const track = courseData ? (courseData.what_you_will_learn || "مسار تعليمي") : "Digital IC";

        const html = `
            <a href="course-player.html?id=${courseId}" 
               class="block bg-b-surface border border-white/10 rounded-xl overflow-hidden hover:border-purple-500/50 transition-all group relative mb-4">
                <div class="h-28 overflow-hidden relative">
                    <img src="${img}" alt="${title}" class="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500">
                    <div class="absolute inset-0 bg-gradient-to-t from-b-surface via-transparent to-transparent"></div>
                </div>
                <div class="p-4 relative -mt-6">
                    <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white shadow-lg border-2 border-b-surface mb-2">
                        <i class="fas fa-book-open text-sm"></i>
                    </div>
                    <h4 class="font-bold text-white text-base mb-1 group-hover:text-purple-400 transition-colors line-clamp-1">${title}</h4>
                    <span class="text-xs text-gray-400">اضغط للمتابعة &larr;</span>
                </div>
            </a>
        `;
        container.innerHTML += html;
    });
}
function renderRelatedItem(item, type, courseId, currentTasks) {
    let relatedId = null;
    let label = '';
    let icon = '';
    let realTitle = '';

    if (type === 'quiz') {
        relatedId = item['related_quiz_id'] || item['related_quiz'] || item['quiz_id']; 
        label = 'كويز';
        icon = 'fa-clipboard-question';
        // جلب الاسم الحقيقي
        const cached = lookupData.quizzes[String(relatedId)];
        realTitle = cached ? cached.title : (item['quiz_title'] || `كويز تابع للدرس`);
    } else if (type === 'project') {
        relatedId = item['related_project_id'] || item['related_project'] || item['project_id'];
        label = 'مشروع';
        icon = 'fa-laptop-code';
        // جلب الاسم الحقيقي
        const cached = lookupData.projects[String(relatedId)];
        realTitle = cached ? cached.title : (item['project_title'] || `مشروع عملي`);
    }

    const relatedIdString = String(relatedId).trim();
    if (!relatedIdString || relatedIdString === "0" || relatedIdString === "undefined" || relatedIdString === "null" || relatedIdString === "") return '';

    // التحقق المزدوج (ID + Course + Type)
    const isAssigned = currentTasks.some(t => 
        String(t.content_id) === relatedIdString && 
        String(t.course_id) === String(courseId) &&
        t.type === type
    );

    return `
        <label class="flex items-center gap-3 p-2 mt-1 hover:bg-white/5 cursor-pointer transition-colors rounded-lg ${isAssigned ? 'opacity-50' : ''} border-r-2 border-r-gray-700 pr-3 mr-4">
            <div class="pt-1">
                <input type="checkbox" 
                       value="${relatedIdString}" 
                       data-type="${type}" 
                       data-title="${realTitle}" 
                       data-parent-title="${item.title}" 
                       data-course-id="${courseId}"
                       class="task-check w-3 h-3 accent-yellow-500 bg-gray-700 border-gray-600 rounded"
                       ${isAssigned ? 'checked disabled' : ''}>
            </div>
            <div class="flex items-center gap-2 text-xs text-gray-400 group-hover:text-white">
                <i class="fas ${icon} ${type === 'quiz' ? 'text-yellow-500' : 'text-purple-500'}"></i>
                <span>${label}:</span>
                <span class="text-gray-300 font-bold truncate max-w-[200px]">${realTitle}</span>
                ${isAssigned ? '<span class="text-[9px] text-green-500 font-bold ml-1">(مضاف)</span>' : ''}
            </div>
        </label>
    `;
}
// ==========================================
// رسم شجرة المنهج (نسخة High Contrast)
// ==========================================
function renderRoadmapTree() {
    const container = document.getElementById('roadmap-tree-container');
    if (!container) return;
    container.innerHTML = '';

    if (!allData.tree || allData.tree.length === 0) {
        if (allData.phases && allData.phases.length > 0) {
            // Fallback logic could go here if tree is missing but phases exist
        } else {
            container.innerHTML = '<div class="text-center py-10 text-gray-500">لا توجد بيانات. تأكد من تفعيل المراحل.</div>';
            return;
        }
    }

    allData.tree.forEach((phase) => {
        const phaseId = String(phase.id).trim();
        
        // 🎨 زيادة سمك الخط ووضوح اللون
        const phaseEl = document.createElement('div');
        phaseEl.className = "mb-8 border-l-4 border-white/10 pl-6 relative"; 

        phaseEl.innerHTML = `
            <div class="absolute -left-[11px] top-0 w-5 h-5 bg-b-primary rounded-full border-4 border-black box-content shadow-[0_0_10px_rgba(0,106,103,0.5)]"></div>
            
            <div class="flex items-center justify-between mb-5 select-none group">
                <div class="cursor-pointer flex-1" onclick="window.showDetails('phase', '${phaseId}')">
                    <h3 class="font-bold text-xl text-white group-hover:text-b-primary transition-colors">${phase.title}</h3>
                    <span class="text-xs text-gray-400 font-mono mt-1 block">${phase.module_time || ''}</span>
                </div>
                <div class="p-2 cursor-pointer hover:bg-white/10 rounded-full transition-all" onclick="window.togglePhaseContent('${phaseId}')">
                    <i class="fas fa-chevron-down text-white transition-transform duration-300" id="icon-phase-${phaseId}"></i>
                </div>
            </div>
            
            <div id="content-phase-${phaseId}" class="space-y-4"></div>
        `;

        const itemsContainer = phaseEl.querySelector(`#content-phase-${phaseId}`);

        if (!phase.courses || phase.courses.length === 0) {
            itemsContainer.innerHTML = '<p class="text-sm text-gray-600 italic pl-2">لا يوجد محتوى في هذه المرحلة.</p>';
        } else {
            phase.courses.forEach(course => {
                const courseId = String(course.id).trim();
                const isActive = (currentTeam.courses_plan || []).includes(courseId);
                const hasChildren = course.sections && course.sections.length > 0;
                const isExpanded = expandedNodes.has(courseId);

                // 🎨 تصميم الكارت (High Contrast)
                const itemHTML = document.createElement('div');
                itemHTML.className = `rounded-xl overflow-hidden border-2 transition-all duration-300 shadow-sm ${isActive ? 'border-green-500/40 bg-green-900/10' : 'border-white/10 bg-black/40 hover:border-white/30'}`;

                itemHTML.innerHTML = `
                    <div class="p-4 flex items-center justify-between cursor-pointer select-none"
                         onclick="window.handleItemClick('course', '${courseId}', ${hasChildren})">
                        
                        <div class="flex items-center gap-4 overflow-hidden flex-1">
                            <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-black/40 border border-white/10 shrink-0 text-lg shadow-inner">
                                ${isActive ? '<i class="fas fa-check-circle text-green-400 text-xl"></i>' : '<i class="fas fa-book text-purple-400"></i>'}
                            </div>
                            <div class="truncate flex-1">
                                <h4 class="font-bold text-base ${isActive ? 'text-white' : 'text-gray-200'} truncate">${course.title}</h4>
                                <div class="flex items-center gap-3 mt-1">
                                    <span class="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono">
                                        ${hasChildren ? course.sections.length + ' أقسام' : 'كورس كامل'}
                                    </span>
                                    ${course.real_video_count ? `<span class="text-[10px] text-blue-400"><i class="fas fa-video ml-1"></i>${course.real_video_count}</span>` : ''}
                                </div>
                            </div>
                        </div>

                        <div class="flex items-center gap-2 pl-2">
                            <div class="relative flex items-center justify-center p-2 rounded-full hover:bg-white/10" onclick="event.stopPropagation()">
                                <input type="checkbox" 
                                       class="appearance-none w-6 h-6 rounded-lg border-2 border-gray-600 bg-black checked:bg-green-500 checked:border-green-500 transition-all cursor-pointer"
                                       ${isActive ? 'checked' : ''} 
                                       onchange="window.toggleActivate('${courseId}', this.checked)">
                                <i class="fas fa-check text-white text-xs absolute pointer-events-none opacity-0 ${isActive ? 'opacity-100' : ''}"></i>
                            </div>
                            
                            ${hasChildren ? `
                                <div class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors" 
                                     onclick="event.stopPropagation(); window.toggleCourseContent('${courseId}')">
                                    <i class="fas fa-chevron-down text-gray-400 ${isExpanded ? 'rotate-180' : ''}" id="icon-${courseId}"></i>
                                </div>` : ''} 
                        </div>
                    </div>
                    
                    ${hasChildren ? `
                    <div id="details-${courseId}" class="${isExpanded ? '' : 'hidden'} border-t border-white/10 bg-black/30 p-3 space-y-2">
                        ${course.sections.map(sec => {
                            const secId = String(sec.id);
                            const secActive = (currentTeam.courses_plan || []).includes(secId);
                            return `
                            <div class="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 ml-6 cursor-pointer border border-transparent hover:border-white/10 transition-colors ${secActive ? 'bg-green-900/20 border-green-500/20' : ''}" 
                                 onclick="window.showDetails('section', '${secId}', '${course.title}'); event.stopPropagation();">
                                
                                <div class="flex items-center gap-3 overflow-hidden">
                                    <i class="fas fa-level-up-alt rotate-90 text-gray-600 text-xs shrink-0"></i>
                                    <span class="text-sm text-gray-300 ${secActive ? 'text-white font-bold' : ''} truncate">${sec.title}</span>
                                </div>

                                <div class="relative flex items-center justify-center" onclick="event.stopPropagation()">
                                    <input type="checkbox" 
                                           class="appearance-none w-5 h-5 rounded border border-gray-600 bg-black checked:bg-green-500 checked:border-green-500 transition-all cursor-pointer"
                                           ${secActive ? 'checked' : ''} 
                                           onchange="window.toggleActivate('${secId}', this.checked); event.stopPropagation();">
                                    <i class="fas fa-check text-white text-[10px] absolute pointer-events-none opacity-0 ${secActive ? 'opacity-100' : ''}"></i>
                                </div>
                            </div>`
                        }).join('')}
                    </div>` : ''}
                `;
                itemsContainer.appendChild(itemHTML);
            });
        }
        container.appendChild(phaseEl);
    });
}
function renderAssignments() {
    const list = document.getElementById('assign-courses-list');
    const activeIds = currentTeam.courses_plan || [];
    
    if (activeIds.length === 0) {
        list.innerHTML = `<p class="text-center text-gray-500 text-xs py-10">قم بتفعيل الكورسات من خريطة التعلم أولاً.</p>`;
        return;
    }

    const activeItems = allData.courses.filter(c => activeIds.includes(String(c.course_id || c.id)));
    
    list.innerHTML = activeItems.map(item => {
        const stats = [];
        if(item.real_video_count) stats.push(`${item.real_video_count} فيديو`);
        const subInfo = stats.length > 0 ? stats.join(' • ') : (item['Module Time'] || '');
        const itemId = String(item.course_id || item.id);

        return `
        <div id="course-card-${itemId}" onclick="window.loadAssignContent('${itemId}')" 
             class="course-card bg-white/5 p-3 rounded-lg border border-white/10 cursor-pointer hover:bg-white/10 hover:border-b-primary transition-all group mb-2 relative overflow-hidden">
            <div class="absolute left-0 top-0 bottom-0 w-1 bg-b-primary opacity-0 transition-opacity active-indicator"></div>
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
    
    // Highlight Active Card
    document.querySelectorAll('.course-card').forEach(el => {
        el.classList.remove('bg-white/10', 'border-b-primary');
        el.querySelector('.active-indicator')?.classList.add('opacity-0');
    });
    const activeCard = document.getElementById(`course-card-${cid}`);
    if(activeCard) {
        activeCard.classList.add('bg-white/10', 'border-b-primary');
        activeCard.querySelector('.active-indicator')?.classList.remove('opacity-0');
    }

    const cont = document.getElementById('assign-content-list');
    cont.innerHTML = `<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-b-primary text-2xl"></i></div>`;
    
    // 🔥 Use Cached Data instead of Fetching 🔥
    // Filter contents from the huge list we already have
    const courseContents = (lookupData.contents || []).filter(c => String(c.course_id) === String(cid) && c.status !== 'removed');
    // Sort
    courseContents.sort((a,b) => a.order_index - b.order_index);

    const currentTasks = currentTeam.weekly_tasks || [];

    if (courseContents.length > 0) {
        let html = '';
        courseContents.forEach(m => {
            const contentId = String(m.content_id);
            const isAssigned = currentTasks.some(t => String(t.content_id) === contentId && t.type === 'video');
            const title = m.title || 'بدون عنوان';
            
            html += `
            <div class="mb-2 border-b border-white/5 pb-2">
                <label class="flex items-start gap-3 p-3 hover:bg-white/5 cursor-pointer transition-colors group ${isAssigned ? 'bg-green-900/10 border-l-2 border-l-green-500' : ''}">
                    <div class="pt-1">
                        <input type="checkbox" value="${contentId}" data-type="video" data-title="${title}" data-course-id="${cid}" class="task-check w-4 h-4 accent-b-primary bg-gray-700 border-gray-600 rounded" ${isAssigned ? 'checked disabled' : ''}>
                    </div>
                    <div class="flex-1 min-w-0">
                        <span class="text-sm font-medium ${isAssigned ? 'text-green-300' : 'text-gray-300'} group-hover:text-white transition-colors truncate">${title}</span>
                        ${isAssigned ? '<span class="text-[9px] text-green-400 bg-green-900/20 px-1.5 rounded mr-2">منشور</span>' : ''}
                    </div>
                </label>
                <div class="mr-6 space-y-1 border-r border-white/10 pr-2">
                    ${renderRelatedItem(m, 'quiz', cid, currentTasks)}
                    ${renderRelatedItem(m, 'project', cid, currentTasks)}
                </div>
            </div>`;
        });
        cont.innerHTML = html;
        const btn = document.getElementById('publish-btn');
        if(btn) btn.disabled = false;
    } else {
        cont.innerHTML = `<p class="text-center text-gray-500 py-10">لا يوجد محتوى.</p>`;
    }
};
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
            const type = box.getAttribute('data-type') || 'video'; // video, quiz, project
            const title = box.getAttribute('data-title');
            const desc = box.getAttribute('data-desc');
            const duration = box.getAttribute('data-duration');
            const courseId = box.getAttribute('data-course-id');

            // 🔥 الإصلاح الجذري: دمج النوع في الـ ID لمنع التكرار
            // القديم: teamId_1 (كان يسبب تضارب)
            // الجديد: teamId_video_1, teamId_quiz_1
            const taskId = `${teamId}_${type}_${contentId}`; 
            
            const taskRef = doc(db, "teams", teamId, "tasks", taskId);

            const taskData = {
                task_id: taskId,
                content_id: contentId,
                course_id: courseId,
                title: title,
                description: desc,
                duration: duration,
                type: type,
                week_id: weekCycle.id,
                created_at: now,
                due_date: due,
                assigned_by: currentUser.uid,
                leader_name: currentUserData.personal_info.full_name,
                status: 'active',
                stats: { total_students: 0, started_count: 0, completed_count: 0 }
            };

            batch.set(taskRef, taskData);
            
            // إضافة للمصفوفة (Array Union)
            const teamRef = doc(db, "teams", teamId);
            batch.update(teamRef, { weekly_tasks: arrayUnion(taskData) });
            
            newTasksLocal.push(taskData);
            count++;
        });

        await batch.commit();

        if (!currentTeam.weekly_tasks) currentTeam.weekly_tasks = [];
        currentTeam.weekly_tasks.push(...newTasksLocal);

        showToast(`تم نشر ${count} مهمة بنجاح`, "success");
        if(selectedAssignCourse) loadAssignContent(selectedAssignCourse); // إعادة تحميل القائمة لتحديث الحالة
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

// ==========================================
// عرض التفاصيل (نسخة مفصلة ومنظمة)
// ==========================================
window.showDetails = (type, id, parentTitle = "") => {
    const ph = document.getElementById('node-details-placeholder');
    const ct = document.getElementById('node-details-content');
    
    ph.classList.add('hidden');
    ct.classList.remove('hidden');

    let item;
    if (type === 'phase') {
        item = allData.phases.find(p => String(p.phase_id || p.id) === String(id));
    } else {
        item = allData.courses.find(c => String(c.course_id || c.id) === String(id));
        // لو لم نجده في القائمة الرئيسية، نبحث داخل الشجرة (للسكاشن الفرعية)
        if (!item) {
            allData.tree.forEach(p => {
                p.courses.forEach(c => {
                    if (c.sections) {
                        const sec = c.sections.find(s => String(s.id) === String(id));
                        if (sec) item = sec;
                    }
                });
            });
        }
    }

    if (!item) return;

    // دالة مساعدة لتعيين النص بأمان
    const setText = (eid, txt) => {
        const el = document.getElementById(eid);
        if(el) el.innerText = txt || '--'; // استخدام شرطتين بدل "غير محدد" لشكل أنظف
    };

    // 1. البيانات الأساسية
    setText('detail-title', item.title);
    setText('detail-desc', item.description || item.desc || "لا يوجد وصف متاح.");
    
    // نوع العنصر (Badge)
    const typeLabel = type === 'phase' ? 'مرحلة تعليمية' : (item.type || 'كورس تدريبي');
    setText('detail-type', typeLabel);

    // 2. تعبئة شبكة المعلومات (Grid) - كل معلومة لوحدها 💎
    
    // أ. المحاضر (Instructor)
    setText('detail-instructor', item.instructor || item.Author || "فريق Busla");

    // ب. المدة الفعلية (Real Duration)
    const realDur = item.real_total_duration && item.real_total_duration !== "00:00:00" 
                    ? item.real_total_duration 
                    : "00:00:00";
    setText('detail-duration', realDur);

    // ج. عدد الفيديوهات (Count)
    const vidCount = item.real_video_count ? `${item.real_video_count} درس` : "0 درس";
    setText('detail-videos', vidCount);

    // د. الخطة الزمنية (Estimated)
    const planTime = item['Module Time'] || item.module_time || "غير محدد";
    setText('detail-plan-time', planTime);

    // 3. عرض الأقسام الإضافية فقط عند وجود محتوى
    const showSection = (contId, txtId, content) => {
        const cont = document.getElementById(contId);
        const txt = document.getElementById(txtId);
        if (content && content !== 'None' && content !== 'no' && content.trim() !== "") {
            cont.classList.remove('hidden');
            if(txt) txt.innerText = content;
        } else {
            cont.classList.add('hidden');
        }
    };

    showSection('detail-prereq-container', 'detail-prereq', item.prerequisites);
    showSection('detail-learn-container', 'detail-learn', item.what_you_will_learn);
    showSection('detail-tools-container', 'detail-tools', item.tools_required || item.tools);
    showSection('detail-notes-container', 'detail-notes', item.Note);

    // 4. الصورة
    const imgEl = document.getElementById('detail-img');
    let img = resolveImageUrl(item.image_url, 'course');
    if (imgEl) {
        imgEl.src = (item.image_url && item.image_url.startsWith('http')) 
                    ? img 
                    : '../assets/images/1.jpg';
    }

    // 5. التحكم في زر التفعيل
    const toggleArea = document.getElementById('course-action-area');
    if (type === 'phase') {
        toggleArea.classList.add('hidden');
    } else {
        toggleArea.classList.remove('hidden');
        const chk = document.getElementById('course-toggle-btn');
        if(chk) {
            // إزالة المستمعين القدامى
            const newChk = chk.cloneNode(true);
            chk.parentNode.replaceChild(newChk, chk);
            
            // تعيين الحالة الحالية
            newChk.checked = (currentTeam.courses_plan || []).includes(String(id));
            
            // إضافة المستمع الجديد
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

// ==========================================
// دالة التنقل بين التبويبات (نسخة آمنة)
// ==========================================
window.switchTab = function(id) {
    // 1. إخفاء كل المحتوى
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    
    // 2. إلغاء تفعيل كل الأزرار
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('bg-b-primary/10', 'text-b-primary', 'font-bold');
        b.classList.add('text-gray-400');
    });

    // 3. تفعيل المحتوى المطلوب (مع فحص الأمان)
    const activeContent = document.getElementById(id);
    if (activeContent) {
        activeContent.classList.add('active');
    } else {
        console.warn(`Tab content with id '${id}' not found!`);
    }

    // 4. تفعيل الزر المطلوب (مع فحص الأمان)
    const activeBtn = document.getElementById('btn-' + id);
    if (activeBtn) {
        activeBtn.classList.add('bg-b-primary/10', 'text-b-primary', 'font-bold');
        activeBtn.classList.remove('text-gray-400');
    } else {
        console.warn(`Button with id 'btn-${id}' not found!`);
    }
    if (id === 'rank') {
        initBadgesSystem();
    }
    if (id === 'team-rank') {
        initTeamBadgesSystem();
    }
    if (id === 'leaderboard') {
        initLeaderboard();
    }
    if (id === 'announcements') {
        if (currentUserData && currentUserData.system_info.team_id) {
            initNotificationsSystem(currentUserData.system_info.team_id);
        } else {
            showToast("جاري تحميل بيانات الفريق...", "info");
        }
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