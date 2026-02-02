import { auth, db, doc, getDoc, setDoc, updateDoc, arrayUnion, onAuthStateChanged } from './firebase-config.js';

// رابط الـ API (استخدمت الرابط الذي زودتني به في الملف السابق)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzkeSHHhx-9RyXGRSXiKRql_GLHmHm5EAZBU1zXZLibAVF1R4uQ5biNG_qBLRuRUJlw/exec';

let currentCourseId = null;
let courseModules = [];
let currentModuleIndex = 0;
let userUid = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. استخراج الـ ID من الرابط
    const urlParams = new URLSearchParams(window.location.search);
    currentCourseId = urlParams.get('id');

    if (!currentCourseId) {
        alert("لم يتم تحديد كورس!");
        window.location.href = "student-dash.html";
        return;
    }

    // 2. التحقق من الدخول
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userUid = user.uid;
            initPlayer();
        } else {
            window.location.href = "auth.html";
        }
    });

    // Sidebar Mobile Toggles
    document.getElementById('open-sidebar').onclick = () => document.getElementById('sidebar').classList.remove('translate-x-full');
    document.getElementById('close-sidebar').onclick = () => document.getElementById('sidebar').classList.add('translate-x-full');
});

async function initPlayer() {
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getCourseContent&id=${currentCourseId}`);
        const data = await response.json();

        if (data.status !== "success") throw new Error("فشل تحميل الكورس");

        document.getElementById('course-title').innerText = data.course_info.title;
        courseModules = data.modules;

        // --- التعديل الجديد هنا: فحص هل الكورس فارغ؟ ---
        if (!courseModules || courseModules.length === 0) {
            document.getElementById('modules-list').innerHTML = '<p class="text-center py-4 text-gray-500">هذا الكورس لا يحتوي على دروس بعد.</p>';
            document.getElementById('content-area').innerHTML = `
                <div class="text-center mt-20">
                    <i class="fas fa-box-open text-6xl text-gray-600 mb-4"></i>
                    <h2 class="text-xl text-gray-400">لا يوجد محتوى لعرضه حالياً</h2>
                    <a href="student-dash.html" class="inline-block mt-4 text-b-primary hover:underline">عودة للوحة القيادة</a>
                </div>
            `;
            return; // توقف هنا ولا تحاول تشغيل الدرس الأول
        }
        // ------------------------------------------------

        renderSidebar();
        loadModule(0); // الآن هذا السطر آمن لأنه لن يعمل إلا لو في دروس

    } catch (error) {
        console.error(error);
        document.getElementById('modules-list').innerHTML = `<p class="text-red-400 text-center p-4">حدث خطأ في الاتصال.</p>`;
    }
}

// --- رسم القائمة الجانبية ---
function renderSidebar() {
    const list = document.getElementById('modules-list');
    list.innerHTML = courseModules.map((mod, index) => {
        let icon = 'fa-play-circle';
        if (mod.type === 'Quiz') icon = 'fa-question-circle';
        if (mod.type === 'Project') icon = 'fa-code-branch';

        return `
            <div onclick="window.loadModule(${index})" 
                 class="module-item p-3 rounded-lg cursor-pointer hover:bg-white/5 transition-colors flex items-center gap-3 ${index === 0 ? 'active-module' : ''}" 
                 id="module-${index}">
                <i class="fas ${icon} ${mod.type === 'Quiz' ? 'text-yellow-500' : (mod.type === 'Project' ? 'text-purple-500' : 'text-b-primary')}"></i>
                <div>
                    <h4 class="text-sm font-medium text-gray-200 line-clamp-1">${mod.title}</h4>
                    <span class="text-[10px] text-gray-500">${mod.type} • ${mod.points} نقطة</span>
                </div>
            </div>
        `;
    }).join('');

    // جعل الدالة متاحة في الـ Window لاستدعائها من HTML
    window.loadModule = loadModule;
}

// --- تشغيل الدرس (المحرك الرئيسي) ---
function loadModule(index) {
    currentModuleIndex = index;
    const module = courseModules[index];
    const container = document.getElementById('content-area');

    // تحديث الستايل في القائمة
    document.querySelectorAll('.module-item').forEach(el => el.classList.remove('active-module'));
    document.getElementById(`module-${index}`)?.classList.add('active-module');

    // إغلاق القائمة في الموبايل
    if(window.innerWidth < 768) document.getElementById('sidebar').classList.add('translate-x-full');

    // 1. عرض الفيديو
    if (module.type === 'Video') {
        const template = document.getElementById('video-template').content.cloneNode(true);
        const videoId = extractYouTubeID(module.video);
        
        template.querySelector('#video-frame').src = `https://www.youtube.com/embed/${videoId}?rel=0`;
        template.querySelector('#video-title').innerText = module.title;
        
        template.querySelector('#mark-complete-btn').onclick = () => markAsCompleted(module, 100); // 100% completion
        
        container.innerHTML = '';
        container.appendChild(template);
    } 
    
    // 2. عرض الكويز
    else if (module.type === 'Quiz') {
        const template = document.getElementById('quiz-template').content.cloneNode(true);
        template.querySelector('#quiz-title').innerText = module.title;
        container.innerHTML = '';
        container.appendChild(template);
        
        startQuiz(module.quiz_id, module); // تشغيل منطق الكويز
    }

    // 3. عرض المشروع
    else if (module.type === 'Project') {
        const template = document.getElementById('project-template').content.cloneNode(true);
        template.querySelector('#project-title').innerText = module.title;
        template.querySelector('#project-desc').innerText = "قم برفع الكود الخاص بك على GitHub ثم ضع الرابط هنا.";
        
        template.querySelector('#project-form').onsubmit = (e) => {
            e.preventDefault();
            const link = document.getElementById('project-link').value;
            submitProject(module, link);
        };

        container.innerHTML = '';
        container.appendChild(template);
    }
}

// --- منطق الكويز (Quiz Engine) 🧠 ---
async function startQuiz(quizId, moduleData) {
    const container = document.getElementById('question-container');
    container.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> جاري جلب الأسئلة...</div>';

    try {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=getQuizData&id=${quizId}`);
        const data = await res.json();
        
        if (!data.questions || data.questions.length === 0) {
            container.innerHTML = '<p>لا توجد أسئلة متاحة حالياً.</p>';
            return;
        }

        let currentQ = 0;
        let score = 0;
        const questions = data.questions;

        function renderQuestion() {
            const q = questions[currentQ];
            container.innerHTML = `
                <div class="mb-4">
                    <span class="text-xs text-b-primary font-bold">سؤال ${currentQ + 1} من ${questions.length}</span>
                    <p class="text-lg font-bold mt-2">${q.text}</p>
                </div>
                <div class="space-y-3">
                    ${Object.entries(q.options).map(([key, val]) => val ? `
                        <label class="block bg-black/20 p-3 rounded-lg border border-white/5 cursor-pointer hover:border-b-primary transition-all">
                            <input type="radio" name="answer" value="${key}" class="ml-2 accent-b-primary">
                            <span>${val}</span>
                        </label>
                    ` : '').join('')}
                </div>
            `;
            
            // تحديث الأزرار
            const nextBtn = document.getElementById('next-q-btn');
            nextBtn.innerText = (currentQ === questions.length - 1) ? "إنهاء وتصحيح" : "التالي";
            nextBtn.onclick = () => {
                const selected = document.querySelector('input[name="answer"]:checked');
                if (!selected) return alert("اختر إجابة أولاً");
                
                if (selected.value === q.correct) score++; // حساب الدرجة محلياً
                
                if (currentQ < questions.length - 1) {
                    currentQ++;
                    renderQuestion();
                } else {
                    finishQuiz(score, questions.length, moduleData);
                }
            };
        }
        renderQuestion();

    } catch (e) {
        console.error(e);
        container.innerHTML = "حدث خطأ في تحميل الكويز";
    }
}

async function finishQuiz(score, total, moduleData) {
    const percentage = Math.round((score / total) * 100);
    const container = document.getElementById('content-area');
    
    // حفظ النتيجة في Firebase
    await saveProgress(moduleData, percentage, 'Completed');

    container.innerHTML = `
        <div class="text-center animate-fade-in-up">
            <div class="text-6xl mb-4">${percentage >= 70 ? '🎉' : '📚'}</div>
            <h2 class="text-3xl font-bold mb-2">نتيجتك: ${percentage}%</h2>
            <p class="text-gray-400 mb-6">${percentage >= 70 ? 'أحسنت! اجتزت الاختبار.' : 'حاول مرة أخرى لتحسين مستواك.'}</p>
            <button onclick="location.reload()" class="bg-b-primary px-6 py-2 rounded-lg text-white font-bold">العودة للكورس</button>
        </div>
    `;
}

// --- منطق تسليم المشاريع ---
async function submitProject(moduleData, link) {
    const btn = document.querySelector('#project-form button');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    btn.disabled = true;

    try {
        // حفظ التسليم في كولكشن منفصل للمراجعة
        await setDoc(doc(db, "submissions", `${userUid}_${moduleData.id}`), {
            student_id: userUid,
            project_id: moduleData.project_id,
            link: link,
            status: 'Pending',
            submitted_at: new Date().toISOString()
        });

        await saveProgress(moduleData, 0, 'Pending_Review'); // 0 نقاط حتى يتم التصحيح

        alert("تم تسليم المشروع بنجاح! سيقوم الليدر بمراجعته قريباً.");
        location.reload();

    } catch (e) {
        console.error(e);
        alert("حدث خطأ أثناء التسليم");
        btn.disabled = false;
        btn.innerHTML = 'حاول مرة أخرى';
    }
}

// --- دالة مساعدة لحفظ التقدم ---
async function saveProgress(module, score, status) {
    const progressRef = doc(db, "users", userUid, "progress", module.id);
    
    await setDoc(progressRef, {
        content_id: module.id,
        type: module.type,
        score: score,
        status: status,
        timestamp: new Date().toISOString()
    }, { merge: true });

    // إضافة النقاط للمجموع العام إذا نجح
    if (status === 'Completed' && score >= 70) {
        const userRef = doc(db, "users", userUid);
        // ملاحظة: زيادة النقاط تتطلب Transaction دقيقة، لكن للتبسيط سنقوم بتحديثها مباشرة هنا
        // في النسخة القادمة سنستخدم Cloud Functions لهذا لزيادة الأمان
        // حالياً سنكتفي بتسجيل التقدم
    }
}

// دالة مساعدة للفيديو
function extractYouTubeID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// دالة للإتمام اليدوي (للفيديو)
async function markAsCompleted(module, score) {
    if(confirm("هل أتممت مشاهدة الدرس؟")) {
        await saveProgress(module, score, 'Completed');
        alert("تم تسجيل الدرس كمكتمل ✅");
        // تحديث الواجهة (اختياري: الانتقال للدرس التالي)
        if(currentModuleIndex < courseModules.length - 1) {
            loadModule(currentModuleIndex + 1);
        }
    }
}