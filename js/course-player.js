import { auth, db, doc, getDoc, setDoc, updateDoc, arrayUnion, onAuthStateChanged, increment } from './firebase-config.js';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyi1nTA-P4QfrmrPhYU7JLScBm13ZzZtkCeTtHuqwOonfIpXbu9VT1TinKaFcje2KNC/exec';

let currentCourseId = null;
let courseModules = [];
let currentModuleIndex = 0;
let userUid = null;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentCourseId = urlParams.get('id');
trackTaskStart(currentCourseId, currentModuleIndex);
    if (!currentCourseId) {
        alert("لم يتم تحديد كورس!");
        window.location.href = "student-dash.html";
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

    const openBtn = document.getElementById('open-sidebar');
    const closeBtn = document.getElementById('close-sidebar');
    if(openBtn) openBtn.onclick = () => document.getElementById('sidebar').classList.remove('translate-x-full');
    if(closeBtn) closeBtn.onclick = () => document.getElementById('sidebar').classList.add('translate-x-full');
});
// تُستدعى عندما يضغط الطالب "ابدأ الدرس" أو يفتح الصفحة
async function trackTaskStart(teamId, taskId) {
    // نحتاج للتأكد أن الطالب لم يبدأها من قبل (لتجنب العد المزدوج)
    // يمكن التحقق من LocalStorage أو التقدم في Firebase
    const hasStartedBefore = localStorage.getItem(`started_${taskId}`);
    
    if (!hasStartedBefore && teamId && taskId) {
        try {
            const taskRef = doc(db, "teams", teamId, "tasks", taskId);
            await updateDoc(taskRef, {
                "stats.started_count": increment(1)
            });
            localStorage.setItem(`started_${taskId}`, 'true');
        } catch (e) {
            console.error("Failed to update task stats", e);
        }
    }
}
async function trackTaskCompletion(teamId, taskId) {
    if (teamId && taskId) {
        try {
            const taskRef = doc(db, "teams", teamId, "tasks", taskId);
            await updateDoc(taskRef, {
                "stats.completed_count": increment(1)
            });
        } catch (e) { console.error(e); }
    }
}
async function initPlayer() {
    try {
        // إضافة Timestamp لمنع الكاش نهائياً
        const noCacheUrl = `${APPS_SCRIPT_URL}?action=getCourseContent&id=${currentCourseId}&t=${new Date().getTime()}`;
        
        const response = await fetch(noCacheUrl, { cache: "no-store" });
        const data = await response.json();

        console.log("✅ بيانات الكورس وصلت:", data);

        if (data.status !== "success") throw new Error("فشل تحميل الكورس");

        document.getElementById('course-title').innerText = data.course_info.title;
        courseModules = data.modules;

        if (!courseModules || courseModules.length === 0) {
            document.getElementById('modules-list').innerHTML = '<div class="text-center py-6 text-gray-500">لا يوجد محتوى.</div>';
            return;
        }

        renderSidebar();
        loadModule(0);

    } catch (error) {
        console.error("❌ خطأ:", error);
        document.getElementById('modules-list').innerHTML = `<p class="text-red-400 text-center p-4 text-xs">تأكد من الانترنت</p>`;
    }
}

function renderSidebar() {
    const list = document.getElementById('modules-list');
    list.innerHTML = courseModules.map((mod, index) => {
        const type = mod.type ? mod.type.toLowerCase() : 'video';
        
        let icon = 'fa-play-circle';
        let colorClass = 'text-b-primary';
        
        if (type === 'quiz') { icon = 'fa-question-circle'; colorClass = 'text-yellow-500'; }
        if (type === 'project') { icon = 'fa-code-branch'; colorClass = 'text-purple-500'; }

        return `
            <div onclick="window.loadModule(${index})" 
                 class="module-item p-3 rounded-lg cursor-pointer hover:bg-white/5 transition-colors flex items-center gap-3 ${index === 0 ? 'active-module' : ''}" 
                 id="module-${index}">
                <i class="fas ${icon} ${colorClass}"></i>
                <div class="overflow-hidden">
                    <h4 class="text-sm font-medium text-gray-200 truncate">${mod.title}</h4>
                    <span class="text-[10px] text-gray-500 capitalize">${type} • ${mod.points || 0} نقطة</span>
                </div>
            </div>
        `;
    }).join('');

    window.loadModule = loadModule;
}

function loadModule(index) {
    if (!courseModules[index]) return;

    currentModuleIndex = index;
    const module = courseModules[index];
    const container = document.getElementById('content-area');
    const type = module.type ? module.type.toLowerCase() : 'video';

    document.querySelectorAll('.module-item').forEach(el => el.classList.remove('active-module'));
    const activeItem = document.getElementById(`module-${index}`);
    if(activeItem) activeItem.classList.add('active-module');

    if(window.innerWidth < 768) document.getElementById('sidebar').classList.add('translate-x-full');

    // ============================
    // 🎥 1. عرض الفيديو (محسن)
    // ============================
    if (type === 'video') {
        const template = document.getElementById('video-template').content.cloneNode(true);
        const iframe = template.querySelector('#video-frame');
        
        // البحث عن الرابط بأي اسم
        const rawLink = module.video_url || module.video || module.link || "";
        console.log("🎥 محاولة تشغيل:", rawLink); 

        const embedUrl = getEmbedLink(rawLink);
        
        if (embedUrl) {
            iframe.src = embedUrl;
            // 🔥 إضافة صلاحيات التشغيل لضمان عمل الفيديو
            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
            iframe.setAttribute('allowfullscreen', 'true');
        } else {
            template.querySelector('.aspect-video').innerHTML = `
                <div class="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-gray-500 p-4 text-center">
                    <i class="fas fa-video-slash text-4xl mb-2 text-red-500"></i>
                    <p class="font-bold text-white mb-1">الرابط غير صالح</p>
                    <p class="text-xs font-mono bg-black p-1 rounded dir-ltr">${rawLink || "فارغ"}</p>
                </div>
            `;
        }

        template.querySelector('#video-title').innerText = module.title;
        template.querySelector('#mark-complete-btn').onclick = () => markAsCompleted(module, 100);
        
        container.innerHTML = '';
        container.appendChild(template);
    } 
    // 2. الكويز
    else if (type === 'quiz') {
        const template = document.getElementById('quiz-template').content.cloneNode(true);
        template.querySelector('#quiz-title').innerText = module.title;
        container.innerHTML = '';
        container.appendChild(template);
        if(module.related_quiz_id || module.linked_quiz_id) {
             startQuiz(module.related_quiz_id || module.linked_quiz_id, module);
        } else {
             container.innerHTML += '<p class="text-center text-red-400 mt-4">خطأ: لا يوجد معرف للكويز</p>';
        }
    }
    // 3. المشروع
    else if (type === 'project') {
        const template = document.getElementById('project-template').content.cloneNode(true);
        template.querySelector('#project-title').innerText = module.title;
        template.querySelector('#project-desc').innerText = module.description || "قم برفع الكود الخاص بك.";
        template.querySelector('#project-form').onsubmit = (e) => {
            e.preventDefault();
            submitProject(module, document.getElementById('project-link').value);
        };
        container.innerHTML = '';
        container.appendChild(template);
    }
}

// 🛠️ دالة استخراج الرابط (النسخة الأقوى)
function getEmbedLink(url) {
    if (!url) return null;
    url = url.trim(); // إزالة المسافات

    // 1. يوتيوب (يتجاهل ?si= وأي إضافات)
    const youtubeRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(youtubeRegExp);
    
    // تأكد أن الـ ID موجود (عادة 11 حرف)
    if (match && match[2].length === 11) {
        return `https://www.youtube.com/embed/${match[2]}?rel=0&modestbranding=1`;
    }

    // 2. جوجل درايف
    if (url.includes('drive.google.com')) {
        return url.replace(/\/view.*/, '/preview').replace(/\/edit.*/, '/preview');
    }

    return url;
}

// ... (باقي الدوال: saveProgress, markAsCompleted, startQuiz, submitProject - اتركها كما هي) ...
// فقط للتأكد، سأضع لك أهم الدوال هنا لتنسخ الملف كاملاً بدون نقص

async function saveProgress(module, score, status) {
    try {
        const progressRef = doc(db, "users", userUid, "progress", String(module.content_id || module.id));
        await setDoc(progressRef, {
            content_id: module.content_id || module.id,
            type: module.type,
            score: score,
            status: status,
            timestamp: new Date().toISOString()
        }, { merge: true });
    } catch (e) {
        console.error("Error saving progress:", e);
    }
}

async function markAsCompleted(module, score) {
    if(confirm("هل أتممت مشاهدة الدرس؟")) {
        await saveProgress(module, score, 'Completed');
        alert("تم تسجيل الدرس كمكتمل ✅");
        if(currentModuleIndex < courseModules.length - 1) {
            loadModule(currentModuleIndex + 1);
        }
    }
}

async function startQuiz(quizId, moduleData) {
    const container = document.getElementById('question-container');
    container.innerHTML = '<div class="text-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-b-primary"></i><br>جاري جلب الأسئلة...</div>';

    try {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=getQuizData&id=${quizId}&t=${new Date().getTime()}`);
        const data = await res.json();
        
        if (!data.questions || data.questions.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400">لا توجد أسئلة متاحة حالياً لهذا الكويز.</p>';
            return;
        }

        let currentQ = 0;
        let score = 0;
        const questions = data.questions;

        function renderQuestion() {
            const q = questions[currentQ];
            container.innerHTML = `
                <div class="mb-6 animate-fade-in-up">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-xs text-b-primary font-bold bg-b-primary/10 px-3 py-1 rounded-full">سؤال ${currentQ + 1} من ${questions.length}</span>
                    </div>
                    <p class="text-xl font-bold mb-6 leading-relaxed">${q.text}</p>
                    <div class="space-y-3">
                        ${Object.entries(q.options).map(([key, val]) => val ? `
                            <label class="block bg-white/5 p-4 rounded-xl border border-white/10 cursor-pointer hover:border-b-primary hover:bg-white/10 transition-all group">
                                <div class="flex items-center">
                                    <input type="radio" name="answer" value="${key}" class="mr-3 accent-b-primary">
                                    <span class="text-gray-300 group-hover:text-white">${val}</span>
                                </div>
                            </label>
                        ` : '').join('')}
                    </div>
                </div>
            `;
            
            const nextBtn = document.getElementById('next-q-btn');
            nextBtn.innerText = (currentQ === questions.length - 1) ? "إنهاء وتصحيح" : "التالي";
            
            nextBtn.onclick = () => {
                const selected = document.querySelector('input[name="answer"]:checked');
                if (!selected) return alert("الرجاء اختيار إجابة");
                if (selected.value.toLowerCase() === q.correct.toLowerCase()) score++; 
                
                if (currentQ < questions.length - 1) {
                    currentQ++;
                    renderQuestion();
                } else {
                    finishQuiz(score, questions.length, moduleData);
                }
            };
            
            document.getElementById('prev-q-btn').onclick = () => {
                if(currentQ > 0) { currentQ--; renderQuestion(); }
            };
        }
        renderQuestion();

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="text-center text-red-400">حدث خطأ أثناء تحميل الكويز.</div>';
    }
}

async function finishQuiz(score, total, moduleData) {
    const percentage = Math.round((score / total) * 100);
    const container = document.getElementById('content-area');
    const isPassed = percentage >= 70;
    
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full animate-fade-in-up text-center max-w-lg mx-auto">
            <h2 class="text-3xl font-bold mb-2">${isPassed ? 'مبارك! 🎉' : 'حاول مرة أخرى 📚'}</h2>
            <p class="text-gray-400 mb-8 text-lg">النتيجة: <span class="font-bold text-white">${percentage}%</span></p>
            <button onclick="location.reload()" class="px-6 py-3 bg-b-primary hover:bg-teal-700 rounded-xl text-white font-bold">العودة للكورس</button>
        </div>
    `;
    if (isPassed) await saveProgress(moduleData, percentage, 'Completed');
}

async function submitProject(moduleData, link) {
    const btn = document.querySelector('#project-form button');
    
    if (!link.includes('http')) return alert("الرابط غير صحيح");
    btn.innerHTML = 'جاري التسليم...';
    btn.disabled = true;

    try {
        const submissionId = `${userUid}_${moduleData.related_project_id || moduleData.id}`;
        await setDoc(doc(db, "submissions", submissionId), {
            submission_id: submissionId,
            student_id: userUid,
            project_id: moduleData.related_project_id || 'unknown',
            project_title: moduleData.title,
            link: link,
            status: 'Pending',
            submitted_at: new Date().toISOString()
        });

        await saveProgress(moduleData, 0, 'Pending_Review'); 
        alert("تم التسليم بنجاح!");
        location.reload();
    } catch (e) {
        console.error(e);
        alert("خطأ في التسليم");
        btn.disabled = false;
    }
}