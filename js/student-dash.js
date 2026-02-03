import { auth, db, doc, getDoc, signOut, onAuthStateChanged } from './firebase-config.js';
import { getUserTeamStatus } from './team-system.js'; // 👈 1. استدعاء دالة فحص الفريق

// رابط الـ API
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwTZcXVXAqpu2H7Int1omEeJrfS8bfiSmhhWayX-wjOJsbaHH4-LX39K4RhVKmzrUOL/exec';

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

function initDashboard() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("User verified:", user.uid);
            await loadUserData(user.uid);
            await loadCourses();
        } else {
            window.location.href = "auth.html";
        }
    });

    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await signOut(auth);
            window.location.href = "auth.html";
        });
    }
}

async function loadUserData(uid) {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            
            // تحديث البيانات الأساسية
            document.getElementById('user-name').innerText = data.personal_info.full_name || "مستخدم";
            
            // حساب النقاط (مجموع النقاط من الـ Progress)
            let totalPoints = 0;
            if (data.progress) {
                // تجميع النقاط من كل درس مكتمل
                // ملاحظة: هذا يعتمد على هيكلية بياناتك، هنا نجمع الحقول إذا كانت مخزنة
                // للتبسيط سنعرض الرقم المخزن في total_points إذا وجد، أو نحسبه لاحقاً
                totalPoints = data.total_points || 0; 
            }
            document.getElementById('user-points').innerText = totalPoints;

            // تحديد الرتبة بناءً على النقاط
            let rank = "مبتدئ";
            if(totalPoints > 100) rank = "مجتهد";
            if(totalPoints > 500) rank = "متفوق";
            if(totalPoints > 1000) rank = "خبير";
            document.getElementById('user-rank').innerText = rank;

            // ============================================================
            // 🚀 2. المنطق الجديد: التحكم في زر "إنشاء فريق"
            // ============================================================
            const createTeamBtn = document.getElementById('create-team-btn');
            if (createTeamBtn) {
                // نفحص حالة الطالب
                const status = await getUserTeamStatus(uid);
                
                // إذا كان في فريق (inTeam) أو عنده طلب معلق (hasPendingRequest) -> نخفي الزر
                if (status && (status.inTeam || status.hasPendingRequest)) {
                    createTeamBtn.classList.add('hidden');
                } else {
                    // غير ذلك -> نظهر الزر
                    createTeamBtn.classList.remove('hidden');
                }
            }
            // ============================================================

        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
}

// ... (دالة loadCourses وباقي الدوال تبقى كما هي بدون تغيير) ...
async function loadCourses() {
    const grid = document.getElementById('courses-grid');
    grid.innerHTML = '<div class="col-span-full text-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-b-primary"></i></div>';

    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getCourses`);
        const data = await response.json();

        if (data.status === "success") {
            // عرض الكورسات المفعلة فقط
            const activeCourses = data.data.filter(c => c.is_active === true);
            
            if (activeCourses.length === 0) {
                grid.innerHTML = '<div class="col-span-full text-center text-gray-500">لا توجد كورسات متاحة حالياً.</div>';
                return;
            }

            grid.innerHTML = activeCourses.map(course => `
                <div class="bg-b-surface rounded-2xl overflow-hidden border border-white/10 hover:border-b-primary/50 transition-all group">
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
    } catch (error) {
        console.error("Error loading courses:", error);
        grid.innerHTML = '<div class="col-span-full text-center text-red-400">فشل تحميل الكورسات</div>';
    }
}