import { auth, db, doc, getDoc, signOut, onAuthStateChanged } from './firebase-config.js';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzUQ4z75E9mSQ24xG0KP7Y9TVSM8SKj9p9rAC6heMWO1TEgnANThOqFxYLL3VFu3Psy/exec';

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

function initDashboard() {
    // 1. التحقق من حالة تسجيل الدخول (Auth Guard) 🛡️
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("User verified:", user.uid);
            // المستخدم مسجل -> جلب بياناته
            await loadUserData(user.uid);
            // جلب الكورسات المتاحة
            await loadCourses();
        } else {
            // المستخدم غير مسجل -> طرده لصفحة الدخول
            window.location.href = "auth.html";
        }
    });

    // تفعيل زر تسجيل الخروج
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await signOut(auth);
            window.location.href = "auth.html";
        });
    }
}

// --- دالة جلب بيانات المستخدم من Firebase ---
async function loadUserData(uid) {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // تحديث الواجهة بالبيانات الحقيقية
            updateElementText('user-name', userData.personal_info.full_name || 'مهندس');
            updateElementText('user-points', userData.gamification.total_points || 0);
            updateElementText('user-rank', userData.gamification.current_rank || 'Newbie');
            
            // يمكنك هنا تحديث الصورة الشخصية أيضاً لو وجدت
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
}

// --- دالة جلب الكورسات من Google Sheets API ---
async function loadCourses() {
    try {
        // نستخدم الكاش لسرعة التحميل (نفس فكرة الصفحة الرئيسية)
        const CACHE_KEY = 'busla_courses_cache';
        const cachedData = localStorage.getItem(CACHE_KEY);
        
        // عرض الكاش أولاً إذا وجد
        if (cachedData) {
            renderCourses(JSON.parse(cachedData));
        }

        // طلب البيانات الحديثة من السيرفر
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getCourses`); // لاحظ الـ action
        const result = await response.json();

        if (result.status === "success") {
            // تحديث الكاش والواجهة
            localStorage.setItem(CACHE_KEY, JSON.stringify(result.data));
            renderCourses(result.data);
        }

    } catch (error) {
        console.error("Error loading courses:", error);
    }
}

// --- دالة رسم الكورسات في الصفحة ---
function renderCourses(courses) {
    const container = document.getElementById('courses-container');
    if (!container) return;

    if (courses.length === 0) {
        container.innerHTML = '<p class="text-gray-400 col-span-full text-center">لا توجد مسارات متاحة حالياً.</p>';
        return;
    }

    container.innerHTML = courses.map(course => `
        <div class="bg-b-surface border border-white/5 rounded-2xl overflow-hidden hover:border-b-primary transition-all group">
            <div class="h-40 bg-gray-800 relative overflow-hidden">
                <img src="${course.img || '../assets/images/1.jpg'}" alt="${course.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                <div class="absolute top-3 right-3 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-xs text-white border border-white/10">
                    ${course.track || 'عام'}
                </div>
            </div>
            
            <div class="p-5">
                <h3 class="font-bold text-lg text-white mb-2">${course.title}</h3>
                <p class="text-gray-400 text-sm mb-4 line-clamp-2">${course.desc}</p>
                
                <div class="flex items-center justify-between mt-4">
                    <div class="text-xs text-gray-500">
                        <i class="fas fa-layer-group ml-1"></i> ${course.prereq ? 'يتطلب خبرة' : 'مبتدئ'}
                    </div>
                    <a href="course-player.html?id=${course.id}" class="bg-white/5 hover:bg-b-primary text-b-primary hover:text-white px-4 py-2 rounded-lg text-sm transition-colors font-bold">
                        ابدأ التعلم
                    </a>
                </div>
            </div>
        </div>
    `).join('');
}

// مساعد صغير لتحديث النصوص بأمان
function updateElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}