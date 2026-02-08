import { 
    auth, db, doc, getDoc, setDoc, updateDoc, arrayUnion, 
    onAuthStateChanged, increment, serverTimestamp, 
    collection, query, where, orderBy, getDocs, addDoc 
} from './firebase-config.js';

// --- Configuration ---
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyfXoESIoTAIbIofv3PGdZdD65ktxXSuX0Rb-WOtoeRccJFbB5PzJTSDu4DDVSPNSW3/exec";

// --- Global State ---
let courseId = null;
let currentTaskId = null;
let currentContent = null;
let allCurriculumData = null;
let courseContents = [];      
let player = null; 
let progressInterval = null; 
let dbSaveInterval = null;   
let userUid = null;
let selectedQuality = 'hd720';
let captionsRetryCount = 0;
let currentUserTeamId = null;
let currentPlayerControlsState = 0; 

// --- Quiz State ---
let currentQuizState = {
    questions: [],
    userAnswers: {},
    currentIndex: 0,
    uniqueId: null,
    isReviewMode: false,
    metaData: null
};

// --- 1. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initSpeedOptions();

    const urlParams = new URLSearchParams(window.location.search);
    courseId = urlParams.get('id');
    currentTaskId = urlParams.get('task_id'); 

    if (!courseId) {
        showToast("لم يتم تحديد كورس!", "error");
        setTimeout(() => window.location.href = "student-dash.html", 2000);
        return;
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            userUid = user.uid;
            initPlayer();
        } else {
            window.location.href = "auth.html";
        }
    });

    setupEventListeners();
});

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

function getUniqueId(type, id) {
    if (!id) return null;
    return `${type}_${id}`;
}

function initSpeedOptions() {
    const select = document.getElementById('playback-speed');
    if (!select) return;
    select.innerHTML = '';
    for (let i = 0.5; i <= 3.5; i += 0.1) {
        let val = parseFloat(i.toFixed(1));
        let opt = document.createElement('option');
        opt.value = val;
        opt.text = val + 'x';
        if (val === 1) opt.selected = true;
        select.appendChild(opt);
    }
}

function setupEventListeners() {
    document.getElementById('btn-restart').onclick = () => {
        if(player && player.seekTo) {
            player.seekTo(0);
            player.playVideo();
            showToast("تمت إعادة البدء");
        }
    };

    document.getElementById('btn-rewind').onclick = () => {
        if(player && player.getCurrentTime) {
            const curr = player.getCurrentTime();
            player.seekTo(Math.max(0, curr - 10));
            showToast("رجوع 10 ثواني");
        }
    };

    const btnFull = document.getElementById('btn-fullscreen');
    if(btnFull) btnFull.onclick = toggleFullscreen;

    const btnCap = document.getElementById('btn-captions');
    if(btnCap) btnCap.onclick = (e) => {
        e.stopPropagation();
        closeAllMenus();
        updateCaptionsMenu(); 
        document.getElementById('captions-menu').classList.toggle('hidden');
    };

    const btnQual = document.getElementById('btn-quality');
    if(btnQual) btnQual.onclick = (e) => {
        e.stopPropagation();
        closeAllMenus();
        updateQualityMenu();
        document.getElementById('quality-menu').classList.toggle('hidden');
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#btn-captions') && !e.target.closest('#captions-menu') &&
            !e.target.closest('#btn-quality') && !e.target.closest('#quality-menu')) {
            closeAllMenus();
        }
    });
}

function closeAllMenus() {
    document.getElementById('captions-menu')?.classList.add('hidden');
    document.getElementById('quality-menu')?.classList.add('hidden');
}

window.showToast = (message, type = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const colors = type === 'error' ? 'border-red-500 text-red-400' : type === 'success' ? 'border-green-500 text-green-400' : 'border-blue-500 text-blue-400';
    const icon = type === 'error' ? 'fa-exclamation-circle' : type === 'success' ? 'fa-check-circle' : 'fa-info-circle';
    toast.className = `bg-b-surface/95 backdrop-blur border-r-4 ${colors} px-6 py-4 rounded-l-xl shadow-2xl flex items-center gap-3 animate-slide-in pointer-events-auto min-w-[300px]`;
    toast.innerHTML = `<i class="fas ${icon} text-xl"></i><span class="font-bold text-sm text-white">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
};

// --- CORE LOGIC ---
async function initPlayer() {
    try {
        await fetchUserDataAndRank();

        const response = await fetch(`${APPS_SCRIPT_URL}?action=getFullCurriculum`);
        const data = await response.json();
        
        if (!data) throw new Error("فشل في جلب البيانات");
        allCurriculumData = data;

        const coursesList = allCurriculumData.courses || allCurriculumData.Courses || [];
        const courseData = coursesList.find(c => c.course_id == courseId);
        if (courseData) document.getElementById('course-title').innerText = courseData.title;

        const contentsList = allCurriculumData.contents || allCurriculumData.Course_Contents || [];
        courseContents = contentsList
            .filter(c => c.course_id == courseId)
            .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

        const progressRef = doc(db, "users", userUid, "courses_progress", String(courseId));
        const progressSnap = await getDoc(progressRef);
        const userProgress = progressSnap.exists() ? progressSnap.data() : { completed_items: [], points: 0 };

        document.getElementById('stat-points').innerText = userProgress.points || 0;
        
        renderSidebar(courseContents, userProgress.completed_items || []);
        
        if (currentTaskId) {
            const parts = currentTaskId.split('_');
            const targetContentId = parts[parts.length - 1]; 
            const targetContent = courseContents.find(c => String(c.content_id) === String(targetContentId));
            if (targetContent) loadContent(targetContent);
            else if (courseContents.length > 0) loadContent(courseContents[0]);
        } else {
            if (courseContents.length > 0) loadContent(courseContents[0]);
        }

    } catch (err) {
        console.error("Initialization Error:", err);
        showToast("حدث خطأ في تحميل البيانات", "error");
    }
}

async function fetchUserDataAndRank() {
    try {
        const userDocRef = doc(db, "users", userUid);
        const userSnap = await getDoc(userDocRef);
        
        if (!userSnap.exists()) return;
        const userData = userSnap.data();

        const name = userData.personal_info?.full_name || "طالب";
        const photo = resolveImageUrl(userData.personal_info?.photo_url);
        const rankTitle = userData.gamification?.current_rank || "Newbie";
        
        const elName = document.getElementById('user-name');
        const elAvatar = document.getElementById('user-avatar');
        const elRank = document.getElementById('user-rank-title');

        if(elName) elName.innerText = name;
        if(elAvatar) elAvatar.src = photo;
        if(elRank) elRank.innerText = rankTitle;

        currentUserTeamId = userData.system_info?.team_id;
        if (currentUserTeamId) {
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("system_info.team_id", "==", currentUserTeamId));
            const teamMembersSnap = await getDocs(q);
            
            let membersList = [];
            teamMembersSnap.forEach(doc => {
                const d = doc.data();
                membersList.push({ uid: doc.id, points: d.gamification?.total_points || 0 });
            });

            membersList.sort((a, b) => b.points - a.points);
            const myRank = membersList.findIndex(m => m.uid === userUid) + 1;
            const totalMembers = membersList.length;

            const elRankDisplay = document.getElementById('team-rank-display');
            const elTotalMembers = document.getElementById('team-total-members');
            
            if(elRankDisplay) elRankDisplay.innerText = `#${myRank}`;
            if(elTotalMembers) elTotalMembers.innerText = `/ ${totalMembers}`;
        }
    } catch (e) { console.error(e); }
}

// --- Task & Stats Tracking ---
async function recordTaskStart(contentId) {
    if (!currentUserTeamId || !contentId) return;
    let targetTaskId = currentTaskId;

    if (!targetTaskId) {
        try {
            const tasksRef = collection(db, "teams", currentUserTeamId, "tasks");
            const q = query(tasksRef, where("content_id", "==", String(contentId)));
            const snap = await getDocs(q);
            if (!snap.empty) targetTaskId = snap.docs[0].id;
        } catch (e) { console.error("Error searching task", e); }
    }

    if (!targetTaskId) return;

    const viewerRef = doc(db, "teams", currentUserTeamId, "tasks", targetTaskId, "viewers", userUid);
    try {
        const viewerSnap = await getDoc(viewerRef);
        if (!viewerSnap.exists()) {
            await setDoc(viewerRef, { uid: userUid, started_at: serverTimestamp() });
            const taskRef = doc(db, "teams", currentUserTeamId, "tasks", targetTaskId);
            await updateDoc(taskRef, { "stats.started_count": increment(1) });
        }
    } catch (e) { console.error(e); }
}

async function updateTeamTaskStats(contentId) {
    if (!currentUserTeamId || !contentId) return;
    let targetTaskId = currentTaskId;
    if (!targetTaskId) {
        try {
            const tasksRef = collection(db, "teams", currentUserTeamId, "tasks");
            const q = query(tasksRef, where("content_id", "==", String(contentId)));
            const snap = await getDocs(q);
            if (!snap.empty) targetTaskId = snap.docs[0].id;
        } catch (e) { console.error("Error searching task", e); }
    }

    if (!targetTaskId) return;

    const completerRef = doc(db, "teams", currentUserTeamId, "tasks", targetTaskId, "completers", userUid);
    try {
        const completerSnap = await getDoc(completerRef);
        if (!completerSnap.exists()) {
            await setDoc(completerRef, { uid: userUid, completed_at: serverTimestamp() });
            const taskRef = doc(db, "teams", currentUserTeamId, "tasks", targetTaskId);
            await updateDoc(taskRef, { "stats.completed_count": increment(1) });
        }
    } catch (e) { console.error("Error updating task stats", e); }
}

// --- STATE MANAGEMENT ---
async function getContentState(uniqueId) {
    const stateRef = doc(db, "users", userUid, "content_states", String(uniqueId));
    const snap = await getDoc(stateRef);
    return snap.exists() ? snap.data() : null;
}

async function saveContentState(uniqueId, data) {
    const stateRef = doc(db, "users", userUid, "content_states", String(uniqueId));
    await setDoc(stateRef, {
        ...data,
        last_updated: serverTimestamp()
    }, { merge: true });
}

// --- LOAD CONTENT ---
async function loadContent(item) {
    if (!item) return;
    
    // Save previous video state
    if (currentContent && currentContent.type === 'video' && player && typeof player.getCurrentTime === 'function') {
        await saveVideoState(true);
    }
    
    currentContent = item;
    updateVideoHeader(item);
    recordTaskStart(item.content_id);

    const progressRef = doc(db, "users", userUid, "courses_progress", String(courseId));
    getDoc(progressRef).then(snap => {
        const ids = snap.exists() ? snap.data().completed_items : [];
        renderSidebar(courseContents, ids);
    });

    document.querySelectorAll('.content-view').forEach(el => el.classList.add('hidden'));
    const progressPanel = document.getElementById('video-progress-panel');
    
    if (item.type === 'video') {
        document.getElementById('view-video').classList.remove('hidden');
        document.getElementById('video-header').classList.remove('hidden');
        if (progressPanel) progressPanel.classList.remove('hidden');

        const uniqueVideoId = getUniqueId('video', item.content_id);
        const savedState = await getContentState(uniqueVideoId);
        
        const startTime = savedState?.current_time || 0;
        const isCompleted = savedState?.is_completed || false;
        const savedSpeed = savedState?.playback_speed || 1;

        if (item.video_id) {
            loadVideo(item.video_id, startTime, isCompleted, savedSpeed);
        }
        
        const timeDisplay = document.getElementById('saved-time-display');
        const progBar = document.getElementById('saved-progress-bar');
        if(timeDisplay) timeDisplay.innerText = formatTime(startTime);
        if(progBar) progBar.style.width = '0%'; 

    } else if (item.type === 'quiz') {
        document.getElementById('view-quiz').classList.remove('hidden');
        if (progressPanel) progressPanel.classList.add('hidden');

        const qId = item.real_id || item.related_quiz_id;
        const uniqueQuizId = getUniqueId('quiz', qId); 
        loadQuizWithState(qId, uniqueQuizId);

    } else if (item.type === 'project') {
        document.getElementById('view-project').classList.remove('hidden');
        if (progressPanel) progressPanel.classList.add('hidden');

        const pId = item.real_id || item.related_project_id;
        loadProjectFromData(pId);
    }
}

// --- VIDEO PLAYER LOGIC ---
function loadVideo(videoId, startSeconds = 0, isCompleted = false, savedSpeed = 1) {
    if (!videoId) return;

    // ✅ FIX: التحقق من تحميل مكتبة يوتيوب أولاً
    // إذا لم تكن المكتبة جاهزة، انتظر 500ms وحاول مرة أخرى
    if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
        console.warn("YouTube API not ready yet. Retrying in 500ms...");
        setTimeout(() => loadVideo(videoId, startSeconds, isCompleted, savedSpeed), 500);
        return;
    }
    
    // تنظيف رابط الفيديو
    if (videoId.includes('v=')) videoId = videoId.split('v=')[1];
    if (videoId.includes('&')) videoId = videoId.split('&')[0];
    if (videoId.includes('youtu.be/')) videoId = videoId.split('youtu.be/')[1];

    const desiredControlsState = isCompleted ? 1 : 0;

    const playerVars = {
        'controls': desiredControlsState, 
        'disablekb': isCompleted ? 0 : 1,
        'rel': 0, 
        'modestbranding': 1,
        'origin': window.location.origin, 
        'enablejsapi': 1,
        'cc_load_policy': 1,
        'playsinline': 1,
        'start': Math.floor(startSeconds)
    };

    // التحكم في الطبقة الشفافة
    const overlay = document.getElementById('video-overlay');
    if (isCompleted) {
        overlay.classList.add('hidden');
        overlay.style.pointerEvents = "none";
    } else {
        overlay.classList.remove('hidden');
        overlay.style.pointerEvents = "auto";
    }

    // تدمير المشغل إذا تغيرت حالة التحكم
    if (player && (typeof player.destroy === 'function') && (currentPlayerControlsState !== desiredControlsState)) {
        player.destroy();
        player = null;
    }

    if (player && typeof player.loadVideoById === 'function') {
        // --- الحالة 1: المشغل موجود (تحديث الفيديو فقط) ---
        player.loadVideoById({
            'videoId': videoId,
            'startSeconds': startSeconds,
            'suggestedQuality': selectedQuality
        });
        
        const numericSpeed = parseFloat(savedSpeed) || 1;
        player.setPlaybackRate(numericSpeed);
        
        const speedSelect = document.getElementById('playback-speed');
        if (speedSelect) {
            speedSelect.value = numericSpeed;
        }

    } else {
        // --- الحالة 2: إنشاء مشغل جديد ---
        currentPlayerControlsState = desiredControlsState;
        try {
            player = new YT.Player('youtube-player', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                host: 'https://www.youtube.com',
                playerVars: playerVars,
                events: {
                    'onReady': (e) => onPlayerReady(e, savedSpeed),
                    'onStateChange': onPlayerStateChange,
                    'onApiChange': onPlayerApiChange,
                    'onError': (e) => console.error("YouTube Player Error:", e)
                }
            });
        } catch (e) {
            console.error("Error creating YouTube player:", e);
        }
    }
}
function onPlayerReady(event, savedSpeed) {
    if (typeof player.loadModule === 'function') player.loadModule('captions');

    document.getElementById('btn-play').onclick = () => {
        const state = player.getPlayerState();
        if (state === 1) player.pauseVideo();
        else player.playVideo();
    };
    
    const speedSelect = document.getElementById('playback-speed');
    if(speedSelect) {
        speedSelect.value = savedSpeed;
        speedSelect.onchange = (e) => {
            player.setPlaybackRate(parseFloat(e.target.value));
        };
    }
    player.setPlaybackRate(savedSpeed);
    player.setPlaybackQuality(selectedQuality);
    
    clearInterval(progressInterval);
    clearInterval(dbSaveInterval);
    progressInterval = setInterval(trackVideoProgress, 1000); 
    dbSaveInterval = setInterval(() => saveVideoState(false), 60000); 
}

async function saveVideoState(isFinal = false) {
    if (!player || typeof player.getCurrentTime !== 'function' || !currentContent || currentContent.type !== 'video') return;

    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();
    const speed = player.getPlaybackRate();
    if (!duration || duration === 0) return;

    const isNowCompleted = (currentTime / duration) >= 0.90;
    const dataToSave = {
        current_time: currentTime,
        duration: duration,
        playback_speed: speed,
        last_viewed: serverTimestamp(),
        title: currentContent.title
    };

    if (isNowCompleted) dataToSave.is_completed = true;

    const uniqueVideoId = getUniqueId('video', currentContent.content_id);
    await saveContentState(uniqueVideoId, dataToSave);

    if (isNowCompleted) {
        const points = parseInt(currentContent.base_points) || 10;
        await markContentComplete('video', currentContent.content_id, points);
        
        const overlay = document.getElementById('video-overlay');
        overlay.classList.add('hidden');
        overlay.style.pointerEvents = "none";
        currentPlayerControlsState = 1; 
    }
}

async function trackVideoProgress() {
    if (!player || !player.getDuration) return;
    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();
    if (duration === 0) return;

    document.getElementById('time-current').innerText = formatTime(currentTime);
    document.getElementById('time-duration').innerText = formatTime(duration);

    const percent = (currentTime / duration) * 100;
    const savedBar = document.getElementById('saved-progress-bar');
    const savedTxt = document.getElementById('saved-time-display');
    if(savedBar) savedBar.style.width = `${percent}%`;
    if(savedTxt) savedTxt.innerText = formatTime(currentTime);

    if (percent >= 90) {
        if (!player.lastSave || Date.now() - player.lastSave > 5000) {
            saveVideoState(true);
            player.lastSave = Date.now();
        }
    }
}

async function loadQuizWithState(quizId, uniqueContentId) {
    const quizzesList = allCurriculumData.quizzes || allCurriculumData.Quizzes || [];
    const quizData = quizzesList.find(q => String(q.quiz_id) === String(quizId));
    
    if (!quizData) { 
        document.getElementById('quiz-questions-container').innerHTML = '<p class="text-center">بيانات الاختبار غير متوفرة</p>';
        return; 
    }

    const savedState = await getContentState(uniqueContentId);
    
    currentQuizState.metaData = quizData;
    currentQuizState.uniqueId = uniqueContentId;
    currentQuizState.userAnswers = savedState?.user_answers || {};
    
    // ✅ تصحيح قراءة عدد المحاولات (قراءة Attempts أو attempts)
    const maxAttempts = parseInt(quizData.Attempts) || parseInt(quizData.attempts) || 3; 
    
    const currentAttempts = savedState?.attempts_count || 0;
    const isPassed = savedState?.passed || false;

    updateQuizHeaderStats(quizData, savedState);

    // التحقق من المحاولات
    if (isPassed || currentAttempts >= maxAttempts) {
        currentQuizState.isReviewMode = true;
    } else {
        currentQuizState.isReviewMode = false;
    }

    // ... (باقي كود جلب الأسئلة كما هو) ...
    // ...
    // ...
    let questionsToRender = [];
    if (savedState && savedState.questions && savedState.questions.length > 0) {
        questionsToRender = savedState.questions;
    } else {
        const allQuestions = allCurriculumData.quiz_questions || allCurriculumData.Quiz_Questions || [];
        const filtered = allQuestions.filter(q => String(q.quiz_id) === String(quizId));
        
        if (filtered.length === 0) {
            document.getElementById('quiz-questions-container').innerHTML = '<div class="text-center py-10">لا توجد أسئلة.</div>';
            return;
        }

        const shuffled = filtered.sort(() => 0.5 - Math.random());
        const showCount = parseInt(quizData.questions_to_show) || 5;
        questionsToRender = shuffled.slice(0, showCount);

        await saveContentState(uniqueContentId, {
            questions: questionsToRender,
            status: 'Started',
            attempts_count: 0 
        });
    }

    currentQuizState.questions = questionsToRender;
    currentQuizState.currentIndex = 0;

    if (currentQuizState.isReviewMode) {
        showQuizReview(); 
    } else {
        renderCurrentQuestion(); 
    }
}

function updateQuizHeaderStats(quizData, savedState = null) {
    const titleEl = document.getElementById('quiz-title');
    const descEl = document.getElementById('quiz-desc');
    
    if(titleEl) titleEl.innerText = quizData.title;
    
    // ✅ تصحيح قراءة عدد المحاولات هنا أيضاً
    const maxAttempts = parseInt(quizData.Attempts) || parseInt(quizData.attempts) || 3;
    const usedAttempts = savedState?.attempts_count || 0;
    
    let statusText = `الدرجة: ${quizData.max_points || 0} XP | المحاولات: ${usedAttempts} / ${maxAttempts}`;
    
    // ... (باقي الدالة كما هي بدون تغيير) ...
    let progressWidth = "0%";
    let progressColor = "bg-yellow-500";
    let scoreDisplay = "";

    if (savedState && (savedState.passed || usedAttempts >= maxAttempts)) {
        const score = savedState.last_score || 0;
        const total = currentQuizState.questions.length || parseInt(quizData.questions_to_show) || 0;
        const percent = total > 0 ? Math.round((score / total) * 100) : 0;
        
        const resultText = savedState.passed ? "ناجح" : "لم تجتز";
        const resultColor = savedState.passed ? "text-green-400" : "text-red-400";
        
        statusText = `${resultText} (${percent}%) | المحاولات: ${usedAttempts} / ${maxAttempts}`;
        scoreDisplay = `<span class="${resultColor} font-bold ml-2">الدرجة: ${score}/${total}</span>`;
        progressWidth = "100%";
        progressColor = savedState.passed ? "bg-green-500" : "bg-red-500";
    }
    
    if(descEl) {
        descEl.innerHTML = `
            <div class="flex justify-between items-end">
                <div><span class="text-gray-400 text-xs">${quizData.description || ''}</span></div>
                <div class="text-sm">${scoreDisplay}</div>
            </div>
            <div class="mt-4 bg-gray-800 rounded-full h-2 w-full overflow-hidden border border-white/5">
                <div id="quiz-progress-bar" class="${progressColor} h-full w-0 transition-all duration-500" style="width: ${progressWidth}"></div>
            </div>
            <div class="flex justify-between text-[10px] text-gray-400 mt-1">
                <span id="quiz-progress-text">${savedState?.is_completed ? "منتهي" : "جاري الحل..."}</span>
                <span>${statusText}</span>
            </div>
        `;
    }
}

function renderCurrentQuestion() {
    const container = document.getElementById('quiz-questions-container');
    container.innerHTML = '';
    
    const q = currentQuizState.questions[currentQuizState.currentIndex];
    if (!q) return;

    const total = currentQuizState.questions.length;
    const currentAns = currentQuizState.userAnswers[q.question_id];

    // Update internal bar
    const progBar = document.getElementById('quiz-progress-bar');
    const progTxt = document.getElementById('quiz-progress-text');
    if(progBar) progBar.style.width = `${((currentQuizState.currentIndex + 1) / total) * 100}%`;
    if(progTxt) progTxt.innerText = `السؤال ${currentQuizState.currentIndex + 1} من ${total}`;

    const html = `
        <div class="question-block animate-fade-in">
            <h3 class="font-bold text-xl text-white mb-6 leading-relaxed">
                <span class="text-yellow-500 ml-2">#${currentQuizState.currentIndex + 1}</span> ${q.question_text}
            </h3>
            <div class="space-y-3">
                ${['a', 'b', 'c', 'd'].map(opt => {
                    const optText = q[`option_${opt}`];
                    if (!optText) return '';
                    const isChecked = currentAns === opt ? 'checked' : '';
                    const activeClass = isChecked ? 'border-yellow-500 bg-yellow-500/10' : 'border-white/10 bg-black/40 hover:bg-white/5';
                    return `<label class="flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${activeClass}" onclick="selectAnswer('${q.question_id}', '${opt}')"><div class="w-6 h-6 rounded-full border-2 flex items-center justify-center ${isChecked ? 'border-yellow-500' : 'border-gray-500'}">${isChecked ? '<div class="w-3 h-3 bg-yellow-500 rounded-full"></div>' : ''}</div><span class="text-sm text-gray-200">${optText}</span></label>`;
                }).join('')}
            </div>
        </div>
        <div class="flex justify-between items-center mt-8 pt-6 border-t border-white/10">
            <button onclick="prevQuestion()" class="px-6 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-50" ${currentQuizState.currentIndex === 0 ? 'disabled' : ''}>السابق</button>
            ${currentQuizState.currentIndex === total - 1 ? 
                `<button onclick="submitQuiz()" class="px-8 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold shadow-lg">إنهاء وإرسال</button>` : 
                `<button onclick="nextQuestion()" class="px-6 py-2 rounded-lg bg-b-primary hover:bg-teal-600 text-white font-bold">التالي</button>`
            }
        </div>
    `;
    container.innerHTML = html;
    const oldBtn = document.getElementById('btn-submit-quiz');
    if(oldBtn) oldBtn.classList.add('hidden');
}

window.selectAnswer = (qId, option) => {
    currentQuizState.userAnswers[qId] = option;
    renderCurrentQuestion();
    saveContentState(currentQuizState.uniqueId, { user_answers: currentQuizState.userAnswers });
};

window.nextQuestion = () => {
    if (currentQuizState.currentIndex < currentQuizState.questions.length - 1) {
        currentQuizState.currentIndex++;
        renderCurrentQuestion();
    }
};

window.prevQuestion = () => {
    if (currentQuizState.currentIndex > 0) {
        currentQuizState.currentIndex--;
        renderCurrentQuestion();
    }
};
async function submitQuiz() {
    let score = 0;
    const questions = currentQuizState.questions;
    
    // 1. حساب الدرجة
    questions.forEach(q => {
        const userAns = currentQuizState.userAnswers[q.question_id];
        if (userAns && String(userAns).toLowerCase() === String(q.correct_answer).toLowerCase()) {
            score++;
        }
    });

    const total = questions.length;
    const passingScore = Math.ceil(total * 0.6); 
    const isPassed = score >= passingScore;

    // 2. تحديث البيانات
    const currentState = await getContentState(currentQuizState.uniqueId);
    const previousAttempts = currentState?.attempts_count || 0;
    const newAttemptsCount = previousAttempts + 1;

    const attemptLog = {
        score: score,
        total: total,
        passed: isPassed,
        timestamp: new Date(),
        answers: currentQuizState.userAnswers
    };

    const newState = {
        last_score: score,
        passed: isPassed, 
        is_completed: isPassed ? true : (currentState?.is_completed || false), 
        status: isPassed ? 'Passed' : 'Failed',
        user_answers: currentQuizState.userAnswers,
        attempts_count: newAttemptsCount,
        attempts_history: arrayUnion(attemptLog)
    };

    await saveContentState(currentQuizState.uniqueId, newState);
    
    if (currentQuizState.metaData) updateQuizHeaderStats(currentQuizState.metaData, newState);

    // 3. معالجة النقاط
    if (isPassed) {
        const qId = currentQuizState.uniqueId.split('_')[1];
        const points = parseInt(currentQuizState.metaData.max_points) || 20;
        
        await markContentComplete('quiz', qId, points); 
        
        showToast(`أحسنت! نجحت من المحاولة ${newAttemptsCount}`, "success");
    } else {
        // ✅ تصحيح قراءة عدد المحاولات هنا
        const maxAttempts = parseInt(currentQuizState.metaData.Attempts) || parseInt(currentQuizState.metaData.attempts) || 3;
        const left = maxAttempts - newAttemptsCount;
        
        if (left > 0) {
            showToast(`لم تجتز. باقي لك ${left} محاولات.`, "warning");
        } else {
            showToast(`لقد استنفدت جميع المحاولات.`, "error");
        }
    }

    currentQuizState.isReviewMode = true;
    showQuizReview();
}

// ربط الدالة بالنافذة
window.submitQuiz = submitQuiz;

function showQuizReview() {
    const container = document.getElementById('quiz-questions-container');
    const questions = currentQuizState.questions;
    const oldBtn = document.getElementById('btn-submit-quiz');
    if(oldBtn) oldBtn.classList.add('hidden');
    
    // ✅ تصحيح قراءة عدد المحاولات هنا أيضاً
    const maxAttempts = parseInt(currentQuizState.metaData.Attempts) || parseInt(currentQuizState.metaData.attempts) || 3;

    getContentState(currentQuizState.uniqueId).then(state => {
        const attempts = state?.attempts_count || 0;
        const passed = state?.passed || false;
        const canRetry = !passed && (attempts < maxAttempts);

        let html = `<div class="space-y-8 animate-fade-in">`;
        
        questions.forEach((q, idx) => {
            const userAns = currentQuizState.userAnswers[q.question_id];
            const correctAns = String(q.correct_answer).toLowerCase();
            const isCorrect = userAns && String(userAns).toLowerCase() === correctAns;
            
            html += `
            <div class="bg-black/20 p-6 rounded-xl border ${isCorrect ? 'border-green-500/30' : 'border-red-500/30'}">
                <div class="flex justify-between items-start mb-4">
                    <h4 class="font-bold text-white text-lg">س${idx + 1}: ${q.question_text}</h4>
                    <span class="${isCorrect ? 'text-green-400' : 'text-red-400'} text-xl">
                        <i class="fas ${isCorrect ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                    </span>
                </div>
                <div class="space-y-2 mb-4">
                    ${['a', 'b', 'c', 'd'].map(opt => {
                        const optText = q[`option_${opt}`];
                        if (!optText) return '';
                        let styleClass = "border-white/10 text-gray-400";
                        if (opt === correctAns) styleClass = "bg-green-900/20 border-green-500 text-green-300 font-bold";
                        else if (opt === userAns && !isCorrect) styleClass = "bg-red-900/20 border-red-500 text-red-300 line-through";
                        
                        return `<div class="p-3 rounded-lg border ${styleClass} text-sm">
                            <span class="uppercase font-bold mr-2">${opt})</span> ${optText}
                        </div>`;
                    }).join('')}
                </div>
                ${!isCorrect && q.hint ? `<div class="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-xs text-blue-200"><i class="fas fa-lightbulb text-yellow-400 mr-1"></i> <strong>تلميح:</strong> ${q.hint}</div>` : ''}
            </div>`;
        });

        html += `</div>`;

        html += `<div class="mt-8 flex justify-center gap-4">`;
        
        if (canRetry) {
            html += `
            <button onclick="retryQuiz()" class="px-8 py-3 rounded-xl bg-b-primary hover:bg-teal-600 text-white font-bold shadow-lg shadow-teal-900/20">
                <i class="fas fa-redo mr-2"></i> إعادة المحاولة (${maxAttempts - attempts} متبقية)
            </button>`;
        } else if (passed) {
            html += `<div class="text-green-400 font-bold px-6 py-3 border border-green-500/30 rounded-xl bg-green-500/10">✨ لقد اجتزت هذا الاختبار بنجاح</div>`;
        } else {
            html += `<div class="text-red-400 font-bold px-6 py-3 border border-red-500/30 rounded-xl bg-red-500/10">🔒 لقد استنفدت جميع المحاولات</div>`;
        }

        html += `
            <button onclick="location.reload()" class="px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold">
                العودة للقائمة
            </button>
        </div>`;

        container.innerHTML = html;
    });
}
// دالة إعادة المحاولة (Reset)
window.retryQuiz = () => {
    // تصفير الإجابات محلياً فقط (الأسئلة تظل كما هي)
    currentQuizState.userAnswers = {};
    currentQuizState.currentIndex = 0;
    currentQuizState.isReviewMode = false;
    
    // إعادة رسم السؤال الأول
    renderCurrentQuestion();
    
    // تحديث الهيدر
    document.getElementById('quiz-progress-bar').style.width = '0%';
    document.getElementById('quiz-progress-text').innerText = 'محاولة جديدة...';
    
    // إظهار زر التسليم مرة أخرى
    const oldBtn = document.getElementById('btn-submit-quiz');
    if(oldBtn) {
        oldBtn.classList.remove('hidden');
        oldBtn.innerText = "تسليم الإجابات";
        oldBtn.classList.remove('bg-gray-600');
    }
}

// ✅✅✅ دالة الإكمال المصححة والكاملة ✅✅✅
async function markContentComplete(type, contentId, points) {
    if (!userUid || !courseId) return;
    
    // 1. استخدام Unique ID
    const uniqueId = getUniqueId(type, contentId);
    const userRef = doc(db, "users", userUid, "courses_progress", String(courseId));
    
    try {
        // --- تحديث حالة المهمة في الفريق ---
        await updateTeamTaskStats(contentId);

        // --- التحقق من التكرار ---
        const docSnap = await getDoc(userRef);
        let currentData = docSnap.exists() ? docSnap.data() : { completed_items: [], points: 0 };
        
        if ((currentData.completed_items || []).includes(uniqueId)) {
            renderSidebar(courseContents, currentData.completed_items); 
            return; 
        }

        // --- تحديث الطالب ---
        await setDoc(userRef, {
            completed_items: arrayUnion(uniqueId),
            points: increment(points),
            last_updated: serverTimestamp()
        }, { merge: true });

        await updateDoc(doc(db, "users", userUid), { "gamification.total_points": increment(points) });

        // --- تحديث الفريق (نقاط + سجل) ---
        if (currentUserTeamId) {
            const teamRef = doc(db, "teams", currentUserTeamId);
            await updateDoc(teamRef, {
                total_score: increment(points)
            });

            // إضافة سجل في Log الفريق
            const userName = document.getElementById('user-name').innerText || "عضو";
            const taskTitle = currentContent ? currentContent.title : "مهمة";

            await addDoc(collection(db, "teams", currentUserTeamId, "point_logs"), {
                member_uid: userUid,
                member_name: userName,
                action_type: "complete_content",
                content_type: type,
                content_title: taskTitle,
                points_earned: points,
                timestamp: serverTimestamp()
            });
        }
        
        // --- تحديث الواجهة ---
        currentData.completed_items.push(uniqueId);
        currentData.points = (currentData.points || 0) + points;
        
        renderSidebar(courseContents, currentData.completed_items);
        document.getElementById('stat-points').innerText = currentData.points;
        fetchUserDataAndRank();
        showToast(`تم إكمال العنصر (+${points} XP)`, "success");

    } catch (e) { console.error("Error saving progress:", e); }
}


function renderSidebar(contents, completedIds) {
    const container = document.getElementById('playlist-container');
    if (!container) return;
    container.innerHTML = '';
    let totalItems = 0; let completedCount = 0;
    contents.forEach((item) => {
        renderSidebarItem(container, item, completedIds, false);
        totalItems++;
        if (isItemCompleted(item.content_id, 'video', completedIds)) completedCount++;
        if (item.related_quiz_id) {
            const quizzes = allCurriculumData.quizzes || allCurriculumData.Quizzes || [];
            const quizMeta = quizzes.find(q => String(q.quiz_id) === String(item.related_quiz_id));
            if (quizMeta) {
                const quizItem = { content_id: `quiz_${item.related_quiz_id}`, real_id: item.related_quiz_id, title: `اختبار: ${quizMeta.title}`, type: 'quiz', Duration: 'Quiz', related_quiz_id: item.related_quiz_id };
                renderSidebarItem(container, quizItem, completedIds, true);
                totalItems++;
                if (isItemCompleted(item.related_quiz_id, 'quiz', completedIds)) completedCount++;
            }
        }
        if (item.related_project_id) {
            const projects = allCurriculumData.projects || allCurriculumData.Projects || [];
            const projMeta = projects.find(p => String(p.project_id) === String(item.related_project_id));
            if (projMeta) {
                const projItem = { content_id: `proj_${item.related_project_id}`, real_id: item.related_project_id, title: `مشروع: ${projMeta.title}`, type: 'project', Duration: 'Project', related_project_id: item.related_project_id };
                renderSidebarItem(container, projItem, completedIds, true);
                totalItems++;
                if (isItemCompleted(item.related_project_id, 'project', completedIds)) completedCount++;
            }
        }
    });
    const percent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;
    updateProgressBar(percent);
}

function renderSidebarItem(container, item, completedIds, isChild) {
    const typeToCheck = item.type === 'quiz' ? 'quiz' : (item.type === 'project' ? 'project' : 'video');
    const idToCheck = item.real_id || item.content_id;
    const isCompleted = isItemCompleted(idToCheck, typeToCheck, completedIds);
    let isActive = false;
    if (currentContent) {
        if (currentContent.content_id === item.content_id) isActive = true;
        if (currentContent.real_id && currentContent.real_id == item.real_id) isActive = true;
    }
    const el = document.createElement('div');
    const baseClasses = "p-3 rounded-lg cursor-pointer flex items-center gap-3 transition-all hover:bg-white/5 relative";
    const childClasses = isChild ? "ml-4 mr-2 border-r-2 border-white/10 bg-white/5 mt-1 mb-2 scale-95" : "mb-1";
    const activeClasses = isActive ? "bg-white/10 border-r-4 border-b-primary shadow-inner" : "";
    el.className = `${baseClasses} ${childClasses} ${activeClasses}`;
    el.onclick = () => loadContent(item);
    let iconClass = 'fa-play-circle';
    if (item.type === 'quiz') iconClass = 'fa-clipboard-question text-yellow-500';
    if (item.type === 'project') iconClass = 'fa-laptop-code text-purple-500';
    const connector = isChild ? `<div class="absolute -right-3 top-1/2 w-2 h-[1px] bg-white/20"></div>` : '';
    let statusIcon = isCompleted ? '<i class="fas fa-check-circle text-green-500 text-xs"></i>' : '<i class="far fa-circle text-gray-600 text-xs"></i>';
    el.innerHTML = `${connector}<div class="text-lg ${item.type === 'video' ? 'text-b-primary' : ''}"><i class="fas ${iconClass}"></i></div><div class="flex-1"><h4 class="text-sm font-semibold line-clamp-1 ${isChild ? 'text-gray-300' : 'text-white'}">${item.title}</h4><div class="flex justify-between items-center mt-1"><span class="text-[10px] text-gray-500">${item.Duration || item.type}</span>${statusIcon}</div></div>`;
    container.appendChild(el);
}

function isItemCompleted(id, type, completedList) {
    if (!completedList) return false;
    const uniqueId = getUniqueId(type, id);
    return completedList.includes(uniqueId);
}

function updateVideoHeader(item) {
    const courseTitleEl = document.getElementById('header-course-title');
    const authorEl = document.getElementById('header-author');
    const videoTitleEl = document.getElementById('header-video-title');
    const noteContainer = document.getElementById('header-note-container');
    const noteText = document.getElementById('header-note-text');
    const pointsBadge = document.getElementById('header-points-badge');
    const pointsText = document.getElementById('header-points-text');
    const coursesList = allCurriculumData?.courses || allCurriculumData?.Courses || [];
    const courseData = coursesList.find(c => c.course_id == courseId);
    if(courseTitleEl) courseTitleEl.innerText = courseData ? courseData.title : "الكورس";
    if(authorEl) authorEl.innerText = item.Author || "Busla Team";
    if(videoTitleEl) videoTitleEl.innerText = item.title || "فيديو بدون عنوان";
    const points = parseInt(item.base_points) || 0; 
    if(points > 0 && pointsBadge) {
        pointsBadge.classList.remove('hidden'); pointsBadge.classList.add('flex');
        if(pointsText) pointsText.innerText = points;
    } else if(pointsBadge) {
        pointsBadge.classList.add('hidden'); pointsBadge.classList.remove('flex');
    }
    const rawNote = item.Note || item.note || "";
    const cleanNote = rawNote.toString().trim();
    if(noteContainer && noteText) {
        if(cleanNote !== "" && cleanNote !== "لاحقا" && cleanNote.toLowerCase() !== "undefined") {
            noteContainer.classList.remove('hidden'); noteText.innerText = cleanNote;
        } else { noteContainer.classList.add('hidden'); }
    }
}

async function loadProjectFromData(projectId) {
    // العثور على بيانات المشروع
    const projectsList = allCurriculumData.projects || allCurriculumData.Projects || [];
    const projectData = projectsList.find(p => String(p.project_id) === String(projectId));
    
    if (!projectData) {
        console.error("Project not found:", projectId);
        return;
    }

    // حفظ المشروع الحالي في الذاكرة
    currentContent = { ...projectData, type: 'project', content_id: projectId };

    // جلب حالة التسليم من الداتابيز (submission)
    const submissionRef = doc(db, "submissions", `${userUid}_${projectId}`);
    const subSnap = await getDoc(submissionRef);
    const submissionData = subSnap.exists() ? subSnap.data() : null;

    // استدعاء دالة الرسم
    renderProjectUI(projectData, submissionData);
}
function renderProjectUI(projectData, submissionData) {
    // أ) تعبئة الهيدر
    document.getElementById('project-title').innerText = projectData.title;
    document.getElementById('project-desc').innerHTML = projectData.description || "لا يوجد وصف.";
    document.getElementById('project-max-points').innerText = projectData.max_points || 100;

    // اسم الدرس التابع له (اختياري)
    const relatedLesson = courseContents.find(c => String(c.related_project_id) === String(projectData.project_id));
    const lessonTag = document.getElementById('project-lesson-tag');
    if (relatedLesson) {
        lessonTag.innerText = `تابع لدرس: ${relatedLesson.title}`;
        lessonTag.classList.remove('hidden');
    } else {
        lessonTag.classList.add('hidden');
    }

    // زر المتطلبات الخارجية
    const reqBtn = document.getElementById('btn-project-requirements');
    if (projectData.requirements_url) {
        reqBtn.href = projectData.requirements_url;
        reqBtn.classList.remove('hidden');
        reqBtn.classList.add('flex');
    } else {
        reqBtn.classList.add('hidden');
    }

    // ب) رسم معايير التقييم (Rubric)
    renderRubric(projectData.rubric_json, submissionData);

    // ج) رسم كارت التسليم بناءً على الحالة
    renderSubmissionCard(projectData, submissionData);
}
function renderRubric(rubricJson, submissionData) {
    const container = document.getElementById('project-rubric-container');
    container.innerHTML = '';

    let criteria = [];
    try {
        // محاولة فك الـ JSON (قد يكون نصاً أو كائناً)
        if (typeof rubricJson === 'string') {
            const parsed = JSON.parse(rubricJson);
            criteria = parsed.criteria || [];
        } else if (typeof rubricJson === 'object') {
            criteria = rubricJson.criteria || [];
        }
    } catch (e) {
        console.warn("Rubric Parsing Error:", e);
        container.innerHTML = '<p class="text-gray-500 text-sm">تفاصيل التقييم غير متاحة حالياً.</p>';
        return;
    }

    // إذا تم التصحيح، نستخدم درجات الطالب. وإلا نستخدم الدرجة العظمى.
    const isGraded = submissionData && submissionData.status === 'graded';
    const studentScores = submissionData?.rubric_scores || {};

    criteria.forEach(item => {
        const studentScore = studentScores[item.aspect] || 0;
        const maxScore = item.points;
        
        // تلوين الدرجة إذا تم التصحيح
        let scoreColor = "text-gray-400";
        let icon = '<i class="fas fa-circle text-[6px] text-gray-600"></i>';
        
        if (isGraded) {
            if (studentScore === maxScore) {
                scoreColor = "text-green-400";
                icon = '<i class="fas fa-check-circle text-green-500"></i>';
            } else if (studentScore > 0) {
                scoreColor = "text-yellow-400";
                icon = '<i class="fas fa-exclamation-circle text-yellow-500"></i>';
            } else {
                scoreColor = "text-red-400";
                icon = '<i class="fas fa-times-circle text-red-500"></i>';
            }
        }

        const html = `
        <div class="bg-black/30 border border-white/5 rounded-xl p-4 flex justify-between items-center group hover:border-white/10 transition-colors">
            <div class="flex items-start gap-3">
                <div class="mt-1.5">${icon}</div>
                <div>
                    <h4 class="text-white font-bold text-sm">${item.aspect}</h4>
                    <p class="text-gray-400 text-xs mt-1 leading-relaxed">${item.description}</p>
                </div>
            </div>
            <div class="text-right min-w-[80px]">
                <div class="font-mono font-bold text-lg ${scoreColor}">
                    ${isGraded ? studentScore : maxScore}
                    <span class="text-[10px] text-gray-500">/ ${maxScore}</span>
                </div>
            </div>
        </div>`;
        container.innerHTML += html;
    });
}

function renderSubmissionCard(projectData, submissionData) {
    const container = document.getElementById('submission-card');
    const status = submissionData ? submissionData.status : 'new'; // new, pending, graded

    // --- الحالة 1: تم التصحيح (Graded) ---
    if (status === 'graded' || status === 'remarked') {
        const grade = submissionData.grade || 0;
        const max = projectData.max_points || 100;
        const percent = Math.round((grade / max) * 100);
        let gradeColor = percent >= 50 ? 'text-green-400' : 'text-red-400';
        let progressColor = percent >= 50 ? 'bg-green-500' : 'bg-red-500';

        container.innerHTML = `
            <div class="text-center">
                <div class="w-20 h-20 mx-auto bg-black rounded-full flex items-center justify-center border-4 ${percent >= 50 ? 'border-green-500/30' : 'border-red-500/30'} mb-4 relative">
                    <span class="text-2xl font-bold ${gradeColor}">${grade}</span>
                    <span class="absolute text-[10px] text-gray-500 -bottom-6">من ${max}</span>
                </div>
                <h3 class="text-white font-bold text-lg mb-1">تم رصد الدرجة</h3>
                <p class="text-xs text-gray-400 mb-6">بواسطة: ${submissionData.graded_by_name || 'Leader'}</p>
                
                ${submissionData.feedback ? `
                <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-right mb-6">
                    <h5 class="text-yellow-500 text-xs font-bold mb-2"><i class="fas fa-comment-alt ml-1"></i> ملاحظات الليدر:</h5>
                    <p class="text-gray-300 text-sm leading-relaxed">"${submissionData.feedback}"</p>
                </div>` : ''}

                <div class="bg-white/5 rounded-lg p-3 text-xs text-gray-400 break-all border border-white/5">
                    <i class="fab fa-github mr-1"></i> رابطك: <a href="${submissionData.link}" target="_blank" class="text-blue-400 hover:underline">فتح الرابط</a>
                </div>
            </div>
        `;
        return;
    }

    // --- الحالة 2: قيد الانتظار (Pending) ---
    if (status === 'pending') {
        container.innerHTML = `
            <div class="text-center py-6">
                <div class="w-16 h-16 mx-auto bg-yellow-500/10 rounded-full flex items-center justify-center text-yellow-500 text-2xl mb-4 animate-pulse">
                    <i class="fas fa-clock"></i>
                </div>
                <h3 class="text-white font-bold text-lg mb-2">قيد المراجعة</h3>
                <p class="text-gray-400 text-xs mb-6 px-4">تم استلام مشروعك بنجاح. سيقوم الليدر بمراجعته ورصد الدرجة قريباً.</p>
                
                <div class="bg-black/30 rounded-xl p-3 border border-white/5 text-left mb-4">
                    <p class="text-[10px] text-gray-500 mb-1">تاريخ التسليم</p>
                    <p class="text-xs text-white font-mono">${submissionData.submitted_at ? new Date(submissionData.submitted_at.seconds * 1000).toLocaleDateString('ar-EG') : 'الآن'}</p>
                </div>

                <div class="bg-white/5 rounded-lg p-3 text-xs text-gray-400 break-all border border-white/5">
                    <i class="fas fa-link mr-1"></i> <a href="${submissionData.link}" target="_blank" class="text-blue-400 hover:underline">الرابط المرسل</a>
                </div>
                
                <button onclick="resubmitProject('${projectData.project_id}')" class="mt-4 text-xs text-gray-500 hover:text-white underline">
                    هل أرسلت رابط خطأ؟ إعادة التسليم
                </button>
            </div>
        `;
        return;
    }

    // --- الحالة 3: جديد / لم يتم التسليم (New) ---
    const methodText = projectData.submission_method || "GitHub Link or Google Drive";
    
    container.innerHTML = `
        <h3 class="text-white font-bold text-lg mb-4 flex items-center gap-2">
            <i class="fas fa-upload text-purple-500"></i> تسليم المشروع
        </h3>
        
        <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4 flex gap-3 items-start">
            <i class="fas fa-info-circle text-blue-400 mt-0.5 text-sm"></i>
            <div>
                <p class="text-xs text-gray-300 font-bold mb-1">تعليمات التسليم:</p>
                <p class="text-[11px] text-gray-400 leading-relaxed">${methodText}</p>
            </div>
        </div>

        <div class="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-3 mb-6 flex gap-3 items-start">
            <i class="fas fa-exclamation-triangle text-yellow-500 mt-0.5 text-sm"></i>
            <p class="text-[10px] text-gray-400 leading-relaxed">
                تأكد من فتح صلاحيات الوصول (Access: Anyone with link) إذا كنت تستخدم Google Drive لتجنب رفض المشروع.
            </p>
        </div>

        <div class="space-y-4">
            <div>
                <label class="block text-xs text-gray-400 mb-1.5 font-bold">رابط المشروع (URL)</label>
                <input type="url" id="submission-url" placeholder="https://github.com/... or Drive Link" 
                       class="w-full bg-black border border-white/10 rounded-xl p-3 text-sm text-white focus:border-purple-500 outline-none transition-colors dir-ltr">
            </div>
            
            <button id="btn-submit-project-action" onclick="submitProjectAction('${projectData.project_id}', '${projectData.title}')" 
                    class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2">
                <i class="fas fa-paper-plane"></i> إرسال للمراجعة
            </button>
        </div>
    `;
}
// 5. دالة تنفيذ التسليم (Submit Action)
window.submitProjectAction = async (projectId, projectTitle) => {
    const input = document.getElementById('submission-url');
    const btn = document.getElementById('btn-submit-project-action');
    const link = input.value.trim();

    if (!link) {
        showToast("يرجى وضع رابط المشروع أولاً", "error");
        input.focus();
        return;
    }

    if (!isValidUrl(link)) {
        showToast("الرابط غير صالح، تأكد من بدايته بـ http/https", "error");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

    try {
        // أ) تسجيل البيانات في submissions (للمراجعة من الليدر)
        await setDoc(doc(db, "submissions", `${userUid}_${projectId}`), {
            student_id: userUid,
            student_name: document.getElementById('user-name').innerText, // جلب الاسم من الهيدر
            project_id: String(projectId),
            project_title: projectTitle,
            link: link,
            status: "pending",
            submitted_at: serverTimestamp(),
            team_id: currentUserTeamId // لسهولة الفلترة عند الليدر
        });

        // ب) تحديث حالة المهمة في الفريق (Task Stats) - ليعرف الليدر أنك أنجزت
        // ملاحظة: لا نعطي نقاط XP هنا، النقاط تمنح عند التصحيح (Graded)
        await updateTeamTaskStats(projectId); 

        showToast("تم تسليم المشروع بنجاح!", "success");
        
        // إعادة تحميل المشروع لتحديث الواجهة (إظهار حالة الانتظار)
        loadProjectFromData(projectId);

    } catch (e) {
        console.error("Submission Error:", e);
        showToast("حدث خطأ أثناء التسليم، حاول مرة أخرى", "error");
        btn.disabled = false;
        btn.innerHTML = 'إعادة المحاولة';
    }
};
window.resubmitProject = (projectId) => {
    openConfirmModal(
        "هل أنت متأكد من رغبتك في إعادة التسليم؟ سيتم إلغاء الرابط القديم.",
        async () => {
            // نقوم فقط بإعادة رسم الواجهة كأنها "جديدة" ليتمكن من الإرسال مرة أخرى
            // التحديث الفعلي للداتابيز سيحدث عند الضغط على "إرسال" مجدداً (Overwrite)
            const projectData = currentContent; // البيانات المخزنة
            renderSubmissionCard(projectData, null); // null submission data = new state
            document.getElementById('confirm-modal').classList.add('hidden');
        }
    );
};

// Helper: URL Validation
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

function formatTime(seconds) {
    if (!seconds) return "00:00";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function updateProgressBar(percent) {
    const bar = document.getElementById('total-progress-bar');
    const txt = document.getElementById('total-progress-txt');
    const stat = document.getElementById('stat-completion');
    if(bar) bar.style.width = `${percent}%`;
    if(txt) txt.innerText = `${percent}%`;
    if(stat) stat.innerText = `${percent}%`;
}

function updateCaptionsMenu() {
    if (!player || typeof player.getOption !== 'function') return;
    const tracks = player.getOption('captions', 'tracklist') || [];
    const menu = document.getElementById('captions-menu');
    let html = `<button class="w-full text-right px-4 py-2 text-xs text-red-400 hover:bg-white/10 border-b border-white/5 font-bold" onclick="changeCaption('off')">🔕 إيقاف الترجمة</button>`;
    html += `<button class="w-full text-right px-4 py-2 text-xs text-green-400 hover:bg-white/10 border-b border-white/5 font-bold" onclick="changeCaption('on')">💬 تشغيل (تلقائي)</button>`;
    if (tracks.length > 0) {
        tracks.forEach(track => {
            const isActive = track.languageCode === (player.getOption('captions', 'track') || {}).languageCode;
            const activeClass = isActive ? 'text-b-primary font-bold bg-white/5' : 'text-gray-300';
            const checkMark = isActive ? '<i class="fas fa-check text-[10px]"></i>' : '';
            html += `<button class="w-full text-right px-4 py-2 text-xs hover:bg-white/10 flex justify-between items-center ${activeClass}" onclick="changeCaption('${track.languageCode}')"><span>${track.displayName}</span><div class="flex items-center gap-2"><span class="uppercase text-[9px] text-gray-500 bg-white/10 px-1 rounded">${track.languageCode}</span>${checkMark}</div></button>`;
        });
    } else { html += `<div class="px-4 py-2 text-[10px] text-gray-500 text-center animate-pulse">جاري البحث عن ترجمات...</div>`; }
    menu.innerHTML = html;
}

window.changeCaption = (code) => {
    if (!player) return;
    if (code === 'off') { player.setOption('captions', 'track', {}); document.getElementById('btn-captions').classList.remove('text-b-primary'); }
    else if (code === 'on') { player.loadModule('captions'); const tracks = player.getOption('captions', 'tracklist') || []; if (tracks.length > 0) { player.setOption('captions', 'track', { 'languageCode': tracks[0].languageCode }); } else { player.setOption('captions', 'reload', true); } document.getElementById('btn-captions').classList.add('text-b-primary'); setTimeout(updateCaptionsMenu, 500); }
    else { player.setOption('captions', 'track', { 'languageCode': code }); document.getElementById('btn-captions').classList.add('text-b-primary'); }
    closeAllMenus();
};

function updateQualityMenu() {
    if (!player || typeof player.getAvailableQualityLevels !== 'function') return;
    const levels = player.getAvailableQualityLevels();
    const menu = document.getElementById('quality-menu');
    menu.innerHTML = '';
    if (!levels || levels.length === 0) { menu.innerHTML = '<div class="px-4 py-2 text-xs text-gray-500 text-center">Auto only</div>'; return; }
    const labelMap = { 'highres': '4K / Original', 'hd2160': '4K (2160p)', 'hd1440': '2K (1440p)', 'hd1080': 'HD (1080p)', 'hd720': 'HD (720p)', 'large': 'SD (480p)', 'medium': 'Low (360p)', 'small': 'Low (240p)', 'tiny': 'Low (144p)', 'auto': 'Auto' };
    levels.forEach(level => {
        const btn = document.createElement('button');
        btn.className = "w-full text-center px-2 py-1.5 text-xs text-gray-300 hover:bg-white/10 hover:text-b-primary transition block";
        if (level === selectedQuality) { btn.classList.add('text-b-primary', 'bg-white/5', 'font-bold'); btn.classList.remove('text-gray-300'); }
        btn.innerText = labelMap[level] || level;
        btn.onclick = () => window.changeQuality(level);
        menu.appendChild(btn);
    });
}

function onPlayerStateChange(event) {
    const btnIcon = document.querySelector('#btn-play i');
    if (event.data === 1) { if(btnIcon) btnIcon.className = "fas fa-pause"; } else { if(btnIcon) btnIcon.className = "fas fa-play"; }
    if (event.data === YT.PlayerState.BUFFERING || event.data === YT.PlayerState.PLAYING) {
        if (selectedQuality !== 'default') { player.setPlaybackQuality(selectedQuality); }
        updateCaptionsMenu(); updateQualityMenu();
    }
}

window.changeQuality = (quality) => {
    if(!player) return;
    selectedQuality = quality; 
    const currentTime = player.getCurrentTime();
    const videoId = player.getVideoData().video_id;
    player.loadVideoById({ 'videoId': videoId, 'startSeconds': currentTime, 'suggestedQuality': quality });
    updateQualityUI(quality);
    closeAllMenus();
};

function updateQualityUI(quality) {
    const labelMap = { 'highres': '4K', 'hd1080': '1080p', 'hd720': '720p', 'large': '480p', 'medium': '360p', 'small': '240p', 'auto': 'Auto' };
    const txt = labelMap[quality] || (quality === 'auto' ? 'Auto' : quality);
    document.getElementById('current-quality-txt').innerText = txt;
}

function toggleFullscreen() {
    const wrapper = document.getElementById('video-wrapper');
    const header = document.getElementById('video-header');
    const icon = document.querySelector('#btn-fullscreen i');
    if (!document.fullscreenElement) {
        if (wrapper.requestFullscreen) wrapper.requestFullscreen(); else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
        if(header) header.classList.add('hidden');
        if(icon) { icon.classList.remove('fa-expand'); icon.classList.add('fa-compress'); }
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        if(header) header.classList.remove('hidden');
        if(icon) { icon.classList.remove('fa-compress'); icon.classList.add('fa-expand'); }
    }
}

document.addEventListener('fullscreenchange', () => {
    const header = document.getElementById('video-header');
    const icon = document.querySelector('#btn-fullscreen i');
    if (!document.fullscreenElement) {
        if(header) header.classList.remove('hidden');
        if(icon) { icon.classList.remove('fa-compress'); icon.classList.add('fa-expand'); }
    }
});
// --- Modal Logic (Confirm Dialog) ---
let confirmCallback = null;

window.openConfirmModal = (message, callback) => {
    const modal = document.getElementById('confirm-modal');
    if (!modal) {
        // Fallback في حال نسيان كود الـ HTML
        if (confirm(message)) callback();
        return;
    }
    
    const msgEl = document.getElementById('confirm-msg');
    const yesBtn = document.getElementById('btn-confirm-yes');
    
    if(msgEl) msgEl.innerText = message;
    confirmCallback = callback;
    
    // إزالة أي مستمعين سابقين لتجنب التكرار (Cloning Trick)
    const newBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newBtn, yesBtn);
    
    newBtn.addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        closeConfirmModal();
    });

    modal.classList.remove('hidden');
};

window.closeConfirmModal = () => {
    const modal = document.getElementById('confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
        confirmCallback = null;
    }
};
function onPlayerApiChange() { updateCaptionsMenu(); updateQualityMenu(); }