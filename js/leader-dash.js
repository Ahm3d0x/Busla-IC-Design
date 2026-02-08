import { 
    auth, db, doc, getDoc,addDoc, getDocs, updateDoc, setDoc, deleteDoc, writeBatch, // 👈 تأكد من وجود دول
    arrayUnion, arrayRemove, query, where, collection, onAuthStateChanged, signOut, serverTimestamp 
} from './firebase-config.js';
import { getTeamData } from './team-system.js';
import { initSettingsModal, openSettings } from './settings-handler.js';
import { initBadgesSystem } from './badges-handler.js';
import { initTeamBadgesSystem } from './team-badges-handler.js';
import { initLeaderboard } from './leaderboard-handler.js';
import { initTeamSettingsModal, openTeamSettings } from './team-settings-handler.js'; 
import { initNotificationsSystem } from './notifications-handler.js';
import { RANKS_DATA } from './badges-data.js';
import { TEAM_RANKS_DATA } from './team-badges-data.js';
function updateHeaderInfo(user, team) {
    const safeText = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.innerText = txt;
    };

    // 1. تجهيز البيانات الأساسية
    const userPoints = user.gamification?.total_points || 0;
    const teamPoints = team.total_score || 0;

    // 2. دالة داخلية لجلب اللقب بناءً على النقاط
    const getBadgeTitle = (points, dataSet) => {
        let title = dataSet[0].title;
        for (let i = 0; i < dataSet.length; i++) {
            if (points >= dataSet[i].points_required) {
                title = dataSet[i].title;
            } else {
                break;
            }
        }
        return title;
    };

    // 3. تحديث ألقاب البادجات
    safeText('header-user-badge', getBadgeTitle(userPoints, RANKS_DATA));
    safeText('sidebar-team-badge', getBadgeTitle(teamPoints, TEAM_RANKS_DATA));

    // --- بقية الكود الأصلي الخاص بك بدون تغيير ---
    const userName = user.personal_info?.full_name || user.full_name || "مستخدم Busla";
    const teamName = team.info?.name || team.team_name || "فريقي";
    const leaderName = team.leader_name || user.personal_info?.full_name || "القائد";

    safeText('sidebar-team-name', teamName);
    safeText('sidebar-leader-name', leaderName);
    safeText('header-user-name', userName);
    safeText('my-points', userPoints);
    safeText('stat-team-score', teamPoints);

    // تحديث الصور كما هي في كودك الأصلي
    const sidebarLogoEl = document.getElementById('sidebar-team-logo');
    if(sidebarLogoEl) {
        let rawTeamLogo = team.info?.logo_url || team.logo_url;
        sidebarLogoEl.src = resolveImageUrl(rawTeamLogo, 'team');
    }

    const headerAvatarEl = document.getElementById('header-user-avatar');
    if(headerAvatarEl) {
        const rawUserAvatar = user.personal_info?.photo_url || user.photo_url;
        headerAvatarEl.src = rawUserAvatar ? resolveImageUrl(rawUserAvatar, 'user') : "../assets/icons/icon.jpg";
    }
}

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
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyfXoESIoTAIbIofv3PGdZdD65ktxXSuX0Rb-WOtoeRccJFbB5PzJTSDu4DDVSPNSW3/exec';
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

        // 1. أولاً: نجلب بيانات الفريق (التصحيح هنا)
        currentTeam = await getTeamData(teamId);
        
        if (!currentTeam) {
            console.error("Team data fetch failed");
            return;
        }

        // تعيين الـ ID بشكل صريح لضمان وجوده
        currentTeam.team_id = teamId;
        
        // 2. ثانياً: نستدعي دالة رسم السكواد ونمرر لها بيانات الفريق الصحيحة
        // (كان الخطأ هنا أنك تمرر teamData وهو غير معرف)
        renderSquadTab(currentTeam);   
        
        // 3. تحديث الهيدر
        updateHeaderInfo(currentUserData, currentTeam);

        // 4. بقية منطق الكاش والسيرفر كما هو
        const hasCache = loadFromCache();
        if (hasCache) {
            console.log("⚡ Rendering from Cache immediately...");
            renderAllTabs(); 
        } else {
            console.log("⚠️ No cache found, waiting for server...");
        }
        
        await fetchDataFromServer();
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
async function renderSquadTab(teamData) {
    if (!teamData) return;

    // فقط تحديث قائمة الأعضاء وتحديث عداد الطلبات (للبادج الأحمر)
    await renderTeamMembers(teamData); 
    
    // تحديث بادج الطلبات في الزر
    const requestsCount = (teamData.requests || []).length;
    const badge = document.getElementById('requests-badge');
    if (badge) {
        badge.innerText = requestsCount;
        badge.classList.toggle('hidden', requestsCount === 0);
    }
}
window.openInviteModal = () => {
    document.getElementById('invite-member-modal').classList.remove('hidden');
    document.getElementById('invite-email-input').value = ''; // Reset input
};

window.openSentInvitesModal = () => {
    document.getElementById('sent-invites-modal').classList.remove('hidden');
    renderSentInvitesList(); // Fetch and render
};

window.openRequestsModal = () => {
    document.getElementById('requests-modal').classList.remove('hidden');
    renderRequestsList(); // Fetch and render
};
window.sendTeamInvitation = async () => {
    const emailInput = document.getElementById('invite-email-input');
    const btn = document.getElementById('btn-send-invite');
    const email = emailInput.value.trim();

    if (!email) return showToast("يرجى إدخال البريد الإلكتروني", "error");

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';

    try {
        // 1. البحث عن المستخدم بواسطة الإيميل
        // ملاحظة: نفترض أن الإيميل موجود في personal_info.email أو email مباشرة
        // سنبحث في الاثنين للأمان
        const usersRef = collection(db, "users");
        
        // Query 1: Check personal_info.email
        const q1 = query(usersRef, where("personal_info.email", "==", email));
        let snapshot = await getDocs(q1);

        // Fallback: Check root email field if not found
        if (snapshot.empty) {
            const q2 = query(usersRef, where("email", "==", email));
            snapshot = await getDocs(q2);
        }

        if (snapshot.empty) {
            throw new Error("هذا البريد الإلكتروني غير مسجل في المنصة.");
        }

        const targetUserDoc = snapshot.docs[0];
        const targetUserData = targetUserDoc.data();
        const targetUid = targetUserDoc.id;

        // 2. التحقق مما إذا كان المستخدم بالفعل في فريق
        if (targetUserData.system_info?.team_id) {
            throw new Error("هذا الطالب عضو بالفعل في فريق آخر.");
        }

        // 3. التحقق من عدم وجود دعوة سابقة (لتجنب التكرار)
        const invitesRef = collection(db, "team_invitations");
        const existingInviteQ = query(invitesRef, 
            where("to_uid", "==", targetUid), 
            where("from_team_id", "==", currentTeam.team_id),
            where("status", "==", "pending")
        );
        const existingSnap = await getDocs(existingInviteQ);
        if (!existingSnap.empty) {
            throw new Error("لقد قمت بإرسال دعوة لهذا الطالب مسبقاً وهي قيد الانتظار.");
        }

        // 4. تجهيز بيانات الدعوة الكاملة
        const inviteData = {
            to_uid: targetUid,
            to_email: email,
            to_name: targetUserData.personal_info?.full_name || "طالب",
            from_team_id: currentTeam.team_id,
            from_leader_id: currentUser.uid,
            status: 'pending',
            created_at: serverTimestamp(),
            // تخزين بيانات الفريق للعرض عند الطالب
            team_snapshot: {
                name: currentTeam.info?.name || "فريق بلا اسم",
                leader_name: currentUserData.personal_info?.full_name || "غير معروف",
                rank: "Newbie", // يمكن جلب الرتبة الحالية
                members_count: (currentTeam.members || []).length,
                university: currentTeam.info?.university || "غير محدد",
                governorate: currentTeam.info?.governorate || "غير محدد",
                logo: currentTeam.info?.logo_url || null
            }
        };

        // 5. حفظ الدعوة في كولكشن منفصل "team_invitations" لتسهيل البحث
        await addDoc(invitesRef, inviteData);

        showToast("تم إرسال الدعوة بنجاح!", "success");
        closeModal('invite-member-modal');

    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'إرسال الدعوة';
    }
};
async function renderSentInvitesList() {
    const container = document.getElementById('sent-invites-list');
    container.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-500"><i class="fas fa-spinner fa-spin"></i> تحميل...</td></tr>';

    try {
        const invitesRef = collection(db, "team_invitations");
        const q = query(invitesRef, where("from_team_id", "==", currentTeam.team_id));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-500">لا توجد دعوات مرسلة حالياً.</td></tr>';
            return;
        }

        let html = '';
        snapshot.forEach(docSnap => {
            const invite = docSnap.data();
            const inviteId = docSnap.id;
            
            // لا نعرض الدعوات المقبولة (Accepted) لأنها انتهت، نعرض (Pending, Rejected)
            if (invite.status === 'accepted') return; 

            const date = invite.created_at ? new Date(invite.created_at.seconds * 1000).toLocaleDateString('ar-EG') : '-';
            
            let statusBadge = '';
            if (invite.status === 'pending') statusBadge = '<span class="bg-yellow-500/20 text-yellow-500 text-xs px-2 py-1 rounded border border-yellow-500/20">قيد الانتظار</span>';
            if (invite.status === 'rejected') statusBadge = '<span class="bg-red-500/20 text-red-500 text-xs px-2 py-1 rounded border border-red-500/20">مرفوضة</span>';

            html += `
            <tr class="hover:bg-white/5 transition border-b border-white/5 last:border-0">
                <td class="p-4 font-bold text-white">${invite.to_name} <br><span class="text-[10px] text-gray-500 font-mono">${invite.to_email}</span></td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4 text-xs text-gray-400 font-mono">${date}</td>
                <td class="p-4">
                    <button onclick="cancelInvitation('${inviteId}')" class="text-red-400 hover:text-red-300 text-xs font-bold bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded transition-all">
                        <i class="fas fa-trash-alt"></i> إلغاء
                    </button>
                </td>
            </tr>
            `;
        });

        container.innerHTML = html || '<tr><td colspan="4" class="p-6 text-center text-gray-500">سجل الدعوات نظيف.</td></tr>';

    } catch (e) {
        console.error(e);
        container.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-red-500">فشل تحميل البيانات.</td></tr>';
    }
}
function renderRequestsList() {
    const container = document.getElementById('requests-list-container');
    const requests = currentTeam.requests || [];

    if (requests.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-500 border border-white/5 border-dashed rounded-xl">لا توجد طلبات انضمام جديدة.</div>`;
        return;
    }

    container.innerHTML = requests.map(req => `
        <div class="bg-black/30 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500">
                    <i class="fas fa-user"></i>
                </div>
                <div>
                    <h4 class="font-bold text-white text-sm">${req.name || 'مستخدم'}</h4>
                    <p class="text-[10px] text-gray-400">يرغب في الانضمام</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="handleRequestAction('${currentTeam.team_id}', '${req.uid}', '${req.name}', 'accept')" 
                        class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all">
                    قبول
                </button>
                <button onclick="handleRequestAction('${currentTeam.team_id}', '${req.uid}', '${req.name}', 'reject')" 
                        class="px-4 py-2 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 rounded-lg text-xs font-bold transition-all border border-white/5">
                    رفض
                </button>
            </div>
        </div>
    `).join('');
}
async function renderTeamMembers(teamData) {
    const container = document.getElementById('squad-list-container');
    const countDisplay = document.getElementById('squad-count-display');
    
    if (!teamData.members || teamData.members.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500 border border-white/5 border-dashed rounded-2xl">لا يوجد أعضاء في الفريق حالياً</div>`;
        return;
    }

    if(countDisplay) countDisplay.innerText = teamData.members.length;

    try {
        const memberPromises = teamData.members.map(uid => getDoc(doc(db, "users", uid)));
        const snapshots = await Promise.all(memberPromises);

        let members = [];
        snapshots.forEach(snap => {
            if (snap.exists()) {
                members.push({ uid: snap.id, ...snap.data() });
            }
        });

        // ترتيب الأعضاء حسب النقاط
        members.sort((a, b) => (b.gamification?.total_points || 0) - (a.gamification?.total_points || 0));

        container.innerHTML = members.map((member, index) => {
            const points = member.gamification?.total_points || 0;
            const rankData = getRankDataForMember(points);
            const isLeader = teamData.leader_id === member.uid;
            const isMe = auth.currentUser.uid === member.uid;
            const canKick = (auth.currentUser.uid === teamData.leader_id) && !isMe;
            
            // ✅✅✅ التصحيح هنا: قراءة البيانات الأكاديمية بشكل صحيح ✅✅✅
            // نتحقق من academic_info أولاً، ثم personal_info كبديل، ثم الجذور
            const academic = member.academic_info || {};
            const personal = member.personal_info || {};
            
            const university = academic.university || personal.university || member.university || "جامعة غير محددة";
            const college = academic.faculty || personal.faculty || member.faculty || "";
            const fullName = academic.full_name || personal.full_name || member.full_name || "عضو مجهول";
            const photo = resolveImageUrl(personal.photo_url || member.photo_url);

            return `
            <div class="group flex flex-col md:flex-row items-center bg-white/5 border border-white/5 rounded-3xl p-5 relative overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-white/20 hover:shadow-2xl hover:shadow-black/50">
                
                <div class="absolute right-0 top-0 bottom-0 w-1.5 transition-all duration-500 bg-gradient-to-b from-${index < 3 ? 'yellow-500' : 'transparent'} to-transparent group-hover:h-full"></div>
                
                <div class="hidden md:flex items-center justify-center w-14 text-3xl font-black text-white/5 font-mono group-hover:text-white/20 transition-colors">
                    #${index + 1}
                </div>

                <div class="relative mb-4 md:mb-0 md:ml-8 flex-shrink-0">
                    <div class="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-[${rankData.stage_color}] to-transparent relative">
                        <img src="${photo}" class="w-full h-full rounded-full object-cover border-4 border-black bg-black" alt="Avatar">
                    </div>
                    <div class="absolute -bottom-2 -right-2 w-12 h-12 bg-black rounded-full flex items-center justify-center border-2 border-[${rankData.stage_color}] shadow-[0_0_15px_${rankData.stage_color}40] z-10">
                        <img src="../assets/user-badge/lv${rankData.level}.png" class="w-12  h-12 rounded-[34%] object-contain">
                    </div>
                </div>

                <div class="flex-1 text-center md:text-right space-y-1.5 min-w-0">
                    <div class="flex items-center justify-center md:justify-start gap-3">
                        <h4 class="text-white font-bold text-xl truncate tracking-tight">${fullName}</h4>
                        ${isLeader ? `<span class="px-2.5 py-0.5 bg-yellow-500/20 text-yellow-500 text-[10px] rounded-full border border-yellow-500/30 font-bold uppercase"><i class="fas fa-crown mr-1"></i> LEADER</span>` : ''}
                    </div>
                    
                    <div class="text-xs font-bold tracking-widest uppercase opacity-90" style="color: ${rankData.stage_color}">
                        ${rankData.title}
                    </div>

                    <div class="flex items-center justify-center md:justify-start gap-2 text-xs text-gray-400 mt-1">
                        <i class="fas fa-university text-gray-500"></i>
                        <span>${university} ${college ? `• ${college}` : ''}</span>
                    </div>
                </div>

                <div class="flex items-center gap-6 mt-6 md:mt-0 pl-4 border-l border-white/5 ml-4">
                    <div class="text-center px-2">
                        <span class="block text-[9px] text-gray-500 uppercase tracking-widest mb-0.5">نقاط الخبرة</span>
                        <span class="font-mono font-black text-2xl text-white tracking-wider">${points.toLocaleString()} <span class="text-[10px] text-b-primary">XP</span></span>
                    </div>
                    
                    ${canKick ? `
                    <button onclick="confirmKickMember('${teamData.id}', '${member.uid}', '${fullName}')" 
                            class="w-10 h-10 rounded-xl bg-red-500/5 text-red-500 border border-red-500/10 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center" title="طرد">
                        <i class="fas fa-user-times"></i>
                    </button>
                    ` : '<div class="w-10"></div>'}
                </div>
            </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Error rendering members:", error);
    }
}
window.confirmKickMember = (teamId, memberUid, memberName) => {
    openConfirmModal(
        `هل أنت متأكد من استبعاد "${memberName}"؟ سيحتفظ بنقاطه كاملة، وسيحتفظ الفريق بنقاطه أيضاً.`,
        async () => {
            try {
                // 1. إزالة من مصفوفة الفريق (بدون تعديل total_score)
                await updateDoc(doc(db, "teams", teamId), {
                    members: arrayRemove(memberUid)
                });

                // 2. تحديث ملف المستخدم
                await updateDoc(doc(db, "users", memberUid), {
                    "system_info.team_id": null
                });

                showToast(`تم استبعاد ${memberName} بنجاح`, 'success');
                setTimeout(() => location.reload(), 1000);
            } catch (error) {
                console.error("Kick Error:", error);
                showToast("فشل تنفيذ الأمر", 'error');
            }
        }
    );
};
window.confirmLeaveTeam = async () => {
    const newLeaderId = document.getElementById('new-leader-select').value;
    
    // يجب اختيار قائد إلا إذا كنت وحدك في الفريق
    const isSolo = (!currentTeam.members || currentTeam.members.length <= 1);
    
    if (!isSolo && !newLeaderId) return showToast("يجب اختيار قائد جديد قبل المغادرة", "error");

    try {
        const teamRef = doc(db, "teams", currentTeam.team_id);
        const meRef = doc(db, "users", currentUser.uid);

        // 1. إذا كان هناك قائد جديد، قم بترقيته
        if (newLeaderId) {
            const newLeaderRef = doc(db, "users", newLeaderId);
            await updateDoc(newLeaderRef, { role: "Leader" });
            await updateDoc(teamRef, { leader_id: newLeaderId });
        }

        // 2. إزالة نفسي من الأعضاء (بدون خصم نقاط)
        await updateDoc(teamRef, {
            members: arrayRemove(currentUser.uid)
        });

        // 3. تحديث حالتي إلى طالب حر
        await updateDoc(meRef, { 
            role: "Student", 
            "system_info.team_id": null 
        });

        showToast("غادرت الفريق بنجاح", "success");
        setTimeout(() => window.location.href = "student-dash.html", 1500);

    } catch (e) {
        console.error(e);
        showToast("حدث خطأ أثناء المغادرة", "error");
    }
};
function renderJoinRequests(teamData) {
    const section = document.getElementById('requests-section');
    const container = document.getElementById('requests-container');
    const countBadge = document.getElementById('requests-count');
    
    const requests = teamData.requests || [];

    if (requests.length === 0) {
container.innerHTML = `<div class="col-span-full text-center py-8 text-gray-600 border border-white/5 border-dashed rounded-xl">لا توجد طلبات انضمام جديدة حالياً</div>`;
        return;
    }

    section.classList.remove('hidden');
    if(countBadge) countBadge.innerText = requests.length;
    
    container.innerHTML = requests.map(req => `
        <div class="bg-b-surface border border-yellow-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-slide-in relative overflow-hidden group">
            <div class="absolute inset-0 bg-yellow-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            
            <div class="flex items-center gap-4 z-10">
                <div class="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500 text-xl border border-yellow-500/20 shadow-inner">
                    <i class="fas fa-user-clock"></i>
                </div>
                <div>
                    <h4 class="font-bold text-white text-base">${req.name || 'مستخدم'}</h4>
                    <p class="text-xs text-gray-400 mt-0.5">يرغب في الانضمام لفريقك</p>
                </div>
            </div>

            <div class="flex gap-2 w-full sm:w-auto z-10">
                <button onclick="handleRequestAction('${teamData.id}', '${req.uid}', '${req.name}', 'accept')" 
                        class="flex-1 sm:flex-none py-2 px-4 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-600 hover:text-white transition-all font-bold text-sm">
                    <i class="fas fa-check mr-1"></i> قبول
                </button>
                <button onclick="handleRequestAction('${teamData.id}', '${req.uid}', '${req.name}', 'reject')" 
                        class="flex-1 sm:flex-none py-2 px-4 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-600 hover:text-white transition-all font-bold text-sm">
                    <i class="fas fa-times mr-1"></i> رفض
                </button>
            </div>
        </div>
    `).join('');
}

// ==========================================
// 4. SENT INVITES (الدعوات المرسلة)
// ==========================================
function renderSentInvites(teamData) {
    const section = document.getElementById('invites-section');
    const container = document.getElementById('invites-container');
    
    const invites = teamData.sent_invites || [];
    const pendingInvites = invites.filter(inv => inv.status === 'pending');

    if (pendingInvites.length === 0) {
container.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">لم تقم بإرسال دعوات نشطة حالياً.</td></tr>`;
        return;
    }

    section.classList.remove('hidden');
    
    container.innerHTML = pendingInvites.map(inv => `
        <tr class="hover:bg-white/5 transition border-b border-white/5 last:border-0 group">
            <td class="p-4">
                <div class="font-bold text-white flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-400">
                        <i class="fas fa-user"></i>
                    </div>
                    ${inv.name || 'مستخدم غير معروف'}
                </div>
            </td>
            <td class="p-4">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20 uppercase tracking-wide">
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                    Waiting
                </span>
            </td>
            <td class="p-4 text-xs font-mono text-gray-500 dir-ltr text-right">
                ${inv.timestamp ? new Date(inv.timestamp.seconds * 1000).toLocaleDateString('en-GB') : '-'}
            </td>
            <td class="p-4 text-left">
                <button onclick="cancelInvitation('${teamData.id}', '${inv.uid}')" 
                        class="text-gray-500 hover:text-red-400 text-xs font-bold py-1 px-3 rounded-lg hover:bg-red-500/10 transition-all flex items-center gap-1 ml-auto">
                    <i class="fas fa-trash-alt"></i> إلغاء
                </button>
            </td>
        </tr>
    `).join('');
}

// دالة مساعدة لحساب الرتبة (تأكد من وجودها أيضاً)
function getRankDataForMember(points) {
    let rank = RANKS_DATA[0];
    for (let i = 0; i < RANKS_DATA.length; i++) {
        if (points >= RANKS_DATA[i].points_required) {
            rank = RANKS_DATA[i];
        } else {
            break;
        }
    }
    return rank;
}
// -- Action: Handle Join Request (Accept/Reject) --
window.handleRequestAction = async (teamId, userId, userName, action) => {
    try {
        const teamRef = doc(db, "teams", teamId);
        const userRef = doc(db, "users", userId);

        if (action === 'accept') {
            // قبول: إضافة للعضوية + إزالة من الطلبات + تحديث بيانات المستخدم
            await runTransaction(db, async (transaction) => {
                const teamDoc = await transaction.get(teamRef);
                if (!teamDoc.exists()) throw "Team not found";
                
                // 1. Remove request object (We filter by UID roughly)
                const teamData = teamDoc.data();
                const requests = teamData.requests || [];
                const reqToRemove = requests.find(r => r.uid === userId);
                
                transaction.update(teamRef, {
                    members: arrayUnion(userId),
                    requests: arrayRemove(reqToRemove)
                });

                transaction.update(userRef, {
                    "system_info.team_id": teamId,
                    "system_info.joined_team_at": serverTimestamp()
                });
            });
            showCustomToast(`تم قبول ${userName} في الفريق!`, 'success');
        } else {
            // رفض: إزالة من الطلبات فقط
            const teamSnap = await getDoc(teamRef);
            const requests = teamSnap.data().requests || [];
            const reqToRemove = requests.find(r => r.uid === userId);
            
            await updateDoc(teamRef, {
                requests: arrayRemove(reqToRemove)
            });
            showCustomToast(`تم رفض طلب ${userName}`, 'neutral');
        }
        
        // Reload Dashboard to reflect changes
        // ملاحظة: الأفضل استدعاء initDashboard(user.uid) بدل إعادة التحميل الكامل
        location.reload(); 

    } catch (e) {
        console.error("Request Action Error:", e);
        alert("حدث خطأ أثناء تنفيذ الإجراء");
    }
};

// إلغاء الدعوة (النسخة المصححة باستخدام المودال المخصص)
window.cancelInvitation = (inviteId) => {
    // نستخدم دالة openConfirmModal الموجودة في ملفك بدلاً من window.confirm
    openConfirmModal(
        "هل أنت متأكد تماماً من إلغاء هذه الدعوة وحذفها؟ لا يمكن التراجع عن هذا الإجراء.",
        async () => {
            try {
                // تنفيذ الحذف بعد التأكيد
                await deleteDoc(doc(db, "team_invitations", inviteId));
                
                showToast("تم إلغاء الدعوة بنجاح", "success");
                
                // إغلاق المودال وتحديث القائمة
                closeConfirmModal();
                renderSentInvitesList(); 
            } catch (e) {
                console.error("Cancel Error:", e);
                showToast("حدث خطأ أثناء محاولة الإلغاء", "error");
            }
        }
    );
};
// ==========================================
// 2. KICK MEMBER LOGIC (Strict & No Penalty)
// ==========================================
window.confirmKickMember = (teamId, memberUid, memberName) => {
    // استخدام المودال الموجود لديك بالفعل
    window.openConfirmModal(
        `تحذير هام: هل أنت متأكد تماماً من طرد العضو "${memberName}"؟ سيتم إزالته من الفريق فوراً، ولكنه سيحتفظ بنقاطه ولن تتأثر نقاط الفريق.`,
        async () => {
            try {
                // تنفيذ عملية الطرد
                // 1. إزالة من قائمة أعضاء الفريق (دون المساس بالـ total_score)
                await updateDoc(doc(db, "teams", teamId), {
                    members: arrayRemove(memberUid)
                });

                // 2. إزالة معرف الفريق من ملف المستخدم
                await updateDoc(doc(db, "users", memberUid), {
                    "system_info.team_id": null
                });

                // إغلاق المودال وتحديث الواجهة
                document.getElementById('confirm-modal').classList.add('hidden');
                
                // إعادة تحميل الصفحة أو تحديث القائمة
                location.reload(); 

            } catch (error) {
                console.error("Kick Error:", error);
                alert("حدث خطأ أثناء محاولة الطرد.");
            }
        }
    );
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

// ==========================================
// RENDER SQUAD (FIXED - إصلاح مشكلة عدم ظهور الأعضاء)
// ==========================================
async function renderSquad() {
    const list = document.getElementById('squad-list');
    const select = document.getElementById('new-leader-select'); // القائمة المنسدلة
    
    // التحقق من وجود العناصر
    if(!list) return;
    
    // 1. تنظيف القوائم وعرض حالة التحميل
    list.innerHTML = '';
    if(select) {
        select.innerHTML = '<option value="" disabled selected>جاري البحث عن أعضاء...</option>';
        select.disabled = true;
    }

    // التحقق من وجود بيانات الفريق
    if(!currentTeam || !currentTeam.members || currentTeam.members.length === 0) {
        if(select) select.innerHTML = '<option value="" disabled>لا يوجد أعضاء في الفريق</option>';
        return;
    }

    try {
        // 2. جلب بيانات كل الأعضاء بالتوازي (ننتظر اكتمال الجميع)
        // هذا هو الجزء الذي يحل المشكلة بدلاً من forEach
        const memberPromises = currentTeam.members.map(async (mid) => {
            try {
                const snap = await getDoc(doc(db, "users", mid));
                if(snap.exists()) {
                    return { id: mid, ...snap.data() };
                }
            } catch(e) { 
                console.error(`Error fetching user ${mid}:`, e); 
            }
            return null;
        });

        // انتظار وصول كافة البيانات
        const membersData = (await Promise.all(memberPromises)).filter(m => m !== null);

        // 3. الآن نبدأ في ملء القائمة (لأن البيانات أصبحت جاهزة)
        if(select) {
            select.innerHTML = '<option value="" disabled selected>-- اختر قائداً جديداً --</option>';
            select.disabled = false;
        }

        let candidatesFound = 0;

        membersData.forEach(member => {
            const name = member.personal_info?.full_name || member.full_name || "عضو مجهول";
            const points = member.gamification?.total_points || member.total_points || 0;
            const photo = resolveImageUrl(member.personal_info?.photo_url || member.photo_url, 'user');
            
            const isMe = member.id === currentUser.uid;
            const isLeader = member.id === currentTeam.leader_id;

            // أ) رسم العضو في قائمة الفريق (الجدول)
            const memberRow = document.createElement('div');
            memberRow.className = "p-4 flex justify-between items-center hover:bg-white/5 transition-colors border-b border-white/5 last:border-0";
            memberRow.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full bg-gray-800 border border-white/10 overflow-hidden">
                        <img src="${photo}" class="w-full h-full object-cover" onerror="this.src='../assets/icons/icon.jpg'">
                    </div>
                    <div>
                        <h4 class="font-bold text-sm text-white flex items-center gap-2">
                            ${name} 
                            ${isMe ? '<span class="text-[10px] bg-white/10 px-1.5 rounded text-gray-400">أنت</span>' : ''}
                            ${isLeader ? '<i class="fas fa-crown text-yellow-500 text-xs" title="القائد"></i>' : ''}
                        </h4>
                        <p class="text-[10px] text-gray-500 font-mono">${points} XP</p>
                    </div>
                </div>
                ${(!isMe && !isLeader) ? `
                    <button onclick="confirmKickMember('${currentTeam.team_id}', '${member.id}', '${name}')" 
                            class="text-red-400 hover:text-red-500 text-xs px-3 py-1.5 border border-red-500/20 hover:bg-red-500/10 rounded transition-all">
                        طرد
                    </button>` : ''
                }
            `;
            list.appendChild(memberRow);

            // ب) إضافة العضو لقائمة اختيار القائد (Dropdown)
            // الشرط: أن يكون العضو ليس "أنا" (لأنني أنا المغادر)
            if (!isMe && select) {
                const option = document.createElement('option');
                option.value = member.id;
                option.text = `${name} (${points} XP)`;
                select.appendChild(option);
                candidatesFound++;
            }
        });

        // إذا لم يوجد مرشحين (أنت وحدك في الفريق)
        if (select && candidatesFound === 0) {
            select.innerHTML = '<option value="" disabled selected>لا يوجد أعضاء آخرين</option>';
            select.disabled = true;
        }

    } catch (e) {
        console.error("Squad Render Error:", e);
        if(select) select.innerHTML = '<option>خطأ في التحميل</option>';
    }
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
// ==========================================
// OPEN LEAVE MODAL & POPULATE SELECT
// ==========================================
window.openLeaveTeamModal = async () => {
    const modal = document.getElementById('leave-team-modal');
    const select = document.getElementById('new-leader-select');
    
    // 1. إظهار المودال
    if (modal) modal.classList.remove('hidden');
    
    if (!select) return;

    // 2. إعادة تعيين القائمة (Reset)
    select.innerHTML = '<option value="" disabled selected>جاري تحميل المرشحين...</option>';
    select.disabled = true;

    // التحقق من وجود الفريق
    if (!currentTeam || !currentTeam.members) {
        select.innerHTML = '<option value="" disabled>لا توجد بيانات للفريق</option>';
        return;
    }

    try {
        // 3. جلب بيانات الأعضاء (باستثناء القائد الحالي/أنت)
        const otherMembersIds = currentTeam.members.filter(uid => uid !== currentUser.uid);

        if (otherMembersIds.length === 0) {
            select.innerHTML = '<option value="" disabled selected>أنت العضو الوحيد (لا يلزم اختيار بديل)</option>';
            // لا نعيد تفعيل القائمة لأنها فارغة، ولكن الكود في confirmLeaveTeam سيتعامل مع حالة isSolo
            return;
        }

        // جلب التفاصيل من قاعدة البيانات
        const promises = otherMembersIds.map(uid => getDoc(doc(db, "users", uid)));
        const snapshots = await Promise.all(promises);

        // 4. ملء القائمة
        select.innerHTML = '<option value="" disabled selected>-- اختر القائد الجديد --</option>';
        
        snapshots.forEach(snap => {
            if (snap.exists()) {
                const data = snap.data();
                const name = data.personal_info?.full_name || data.full_name || "عضو مجهول";
                const points = data.gamification?.total_points || 0;
                
                const option = document.createElement('option');
                option.value = snap.id;
                option.text = `${name} (${points} XP)`;
                select.appendChild(option);
            }
        });

        // تفعيل القائمة للاختيار
        select.disabled = false;

    } catch (error) {
        console.error("Error loading candidates:", error);
        select.innerHTML = '<option value="" disabled>حدث خطأ في التحميل</option>';
    }
};
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