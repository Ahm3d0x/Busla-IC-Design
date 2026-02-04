import { db, collection, getDocs, query, where, doc, getDoc } from './firebase-config.js';

// 📅 دالة حساب الأسبوع (يجب أن تكون موحدة في المشروع كله)
function getCurrentWeekCycle() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // Sat=6, Sun=0... in JS? No, Sun=0, Sat=6
    // تعديل: السبت هو البداية.
    // Days since Saturday: (day + 1) % 7  --> Sat(6)=>0, Sun(0)=>1, Fri(5)=>6
    const daysSinceSaturday = (dayOfWeek + 1) % 7;
    
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - daysSinceSaturday);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
    
    return {
        id: startDate.toISOString().split('T')[0], // Week ID
        end: endDate
    };
}

// 👨‍🎓 الدالة الرئيسية لعرض مهام الطالب
async function loadStudentTasks(teamId, userId) {
    const container = document.getElementById('courses-container');
    container.innerHTML = '<div class="spinner"></div>'; // Loading...

    try {
        const currentWeek = getCurrentWeekCycle();

        // 1. جلب مهام الفريق
        const tasksRef = collection(db, "teams", teamId, "tasks");
        const tasksSnap = await getDocs(query(tasksRef, where("status", "!=", "hidden"))); // لا نجلب المخفي
        
        // 2. جلب تقدم الطالب (Progress) لمعرفة ما تم إنجازه
        // نفترض أن التقدم محفوظ في: users/{uid}/progress/{content_id}
        const progressRef = collection(db, "users", userId, "progress");
        const progressSnap = await getDocs(progressRef);
        
        const userProgress = {};
        progressSnap.forEach(doc => {
            userProgress[doc.id] = doc.data(); // Key = content_id
        });

        // 3. تصنيف المهام (Filtering Logic)
        const activeTasks = [];
        const overdueTasks = [];

        tasksSnap.forEach(doc => {
            const task = doc.data();
            const progress = userProgress[task.content_id];
            const isCompleted = progress?.status === 'Completed';

            // 🅰️ هل المهمة في الأسبوع الحالي؟ -> تظهر دائماً
            if (task.week_id === currentWeek.id) {
                activeTasks.push({ ...task, isCompleted, progress });
            } 
            // 🅱️ هل المهمة من أسبوع سابق؟
            else {
                // لو لم تنجز -> تظهر كـ متأخرة (Overdue)
                if (!isCompleted) {
                    overdueTasks.push({ ...task, isCompleted: false, isOverdue: true });
                }
                // لو أنجزت -> تختفي (Archived) -> لا نفعل شيء
            }
        });

        // 4. الرسم (Rendering)
        renderStudentTasks(activeTasks, overdueTasks);

    } catch (error) {
        console.error("Error loading tasks:", error);
        container.innerHTML = '<p class="text-red-500">حدث خطأ في تحميل المهام</p>';
    }
}

function renderStudentTasks(active, overdue) {
    const container = document.getElementById('courses-container');
    let html = '';

    // قسم المتأخرات (تحذير)
    if (overdue.length > 0) {
        html += `
        <div class="mb-8 p-4 bg-red-900/20 border border-red-500/30 rounded-xl">
            <h3 class="text-red-400 font-bold mb-3 flex items-center gap-2">
                <i class="fas fa-exclamation-triangle"></i> مهام متأخرة (يجب تسليمها فوراً)
            </h3>
            <div class="grid gap-3">
                ${overdue.map(task => createStudentTaskCard(task)).join('')}
            </div>
        </div>`;
    }

    // قسم الأسبوع الحالي
    if (active.length > 0) {
        html += `
        <div class="mb-6">
            <h3 class="text-b-hl-light font-bold mb-4 flex items-center gap-2">
                <i class="fas fa-calendar-day"></i> مهام هذا الأسبوع
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${active.map(task => createStudentTaskCard(task)).join('')}
            </div>
        </div>`;
    } else if (overdue.length === 0) {
        html += `<div class="text-center py-10 text-gray-500">🎉 لا توجد مهام مطلوبة منك حالياً</div>`;
    }

    container.innerHTML = html;
}

function createStudentTaskCard(task) {
    const isDone = task.isCompleted;
    const btnColor = isDone ? 'bg-green-600/20 text-green-400' : (task.isOverdue ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-b-primary text-white hover:bg-teal-700');
    const btnText = isDone ? 'مكتمل ✅' : (task.isOverdue ? 'إنجاز الآن 🚨' : 'ابدأ الدرس');

    // رابط المشغل (يجب أن يوجه لصفحة الكورس مع معرف المحتوى)
    const action = isDone ? '#' : `course-player.html?id=${task.course_id}&content=${task.content_id}&task_id=${task.task_id}`;

    return `
    <div class="bg-white/5 border ${task.isOverdue ? 'border-red-500/30' : 'border-white/10'} rounded-xl p-4 flex justify-between items-center transition-all hover:scale-[1.01]">
        <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-lg ${task.isOverdue ? 'bg-red-500/20 text-red-400' : 'bg-b-primary/20 text-b-primary'} flex items-center justify-center text-xl">
                <i class="fas ${task.type === 'video' ? 'fa-play' : 'fa-clipboard-check'}"></i>
            </div>
            <div>
                <h4 class="font-bold text-white text-sm line-clamp-1">${task.title}</h4>
                <p class="text-xs text-gray-400 mt-1">
                    ${task.isOverdue ? '<span class="text-red-400">انتهى الموعد: ' + new Date(task.due_date).toLocaleDateString('ar-EG') + '</span>' : 'آخر موعد: الجمعة'}
                </p>
            </div>
        </div>
        <a href="${action}" class="px-4 py-2 rounded-lg text-sm font-bold transition-colors ${btnColor}">
            ${btnText}
        </a>
    </div>
    `;
}