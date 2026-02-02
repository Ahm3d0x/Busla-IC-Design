import { auth, db, doc, getDoc, onAuthStateChanged, signOut } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. التأكد من تسجيل الدخول
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "auth.html"; // لو مش مسجل روح سجل
            return;
        }

        // 2. جلب بيانات المستخدم
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            
            // تعبئة البيانات الأساسية
            document.getElementById('user-name').innerText = data.personal_info.full_name.split(' ')[0];
            document.getElementById('user-points').innerText = data.gamification.total_points || 0;
            document.getElementById('user-rank').innerText = data.gamification.current_rank || 'Newbie';

            // 3. تحديد الدور (Role) وعرض الداشبورد المناسبة
            const role = data.system_info.role; // المفروض تكون 'Student' أو 'Leader'
            
            const roleBadge = document.getElementById('role-badge');
            const leaderDash = document.getElementById('leader-dashboard');
            const studentDash = document.getElementById('student-dashboard');
            const leaderLinks = document.getElementById('leader-links');
            const studentLinks = document.getElementById('student-links');

            if (role === 'Leader') {
                // تفعيل وضع الليدر
                roleBadge.innerText = 'Leader';
                roleBadge.className = "text-xs bg-purple-900 text-purple-200 px-2 py-0.5 rounded";
                leaderDash.classList.remove('hidden');
                leaderLinks.classList.remove('hidden');
            } else {
                // تفعيل وضع الطالب (الافتراضي)
                roleBadge.innerText = 'Student';
                studentDash.classList.remove('hidden');
                studentLinks.classList.remove('hidden');
            }
        }
    });

    // زر الخروج
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = "../index.html";
    });
});