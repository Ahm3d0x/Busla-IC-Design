import { auth, onAuthStateChanged } from './firebase-config.js';
import { submitTeamRequest, getUserTeamStatus } from './team-system.js';

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // التحقق: هل المستخدم بالفعل في فريق أو لديه طلب؟
            const status = await getUserTeamStatus(user.uid);
            
            if (status.inTeam) {
                alert("أنت بالفعل عضو في فريق! لا يمكنك إنشاء فريق جديد.");
                window.location.href = "student-dash.html";
            } else if (status.hasPendingRequest) {
                showSuccessState("لديك طلب قيد المراجعة حالياً. يرجى انتظار موافقة الإدارة.");
                document.getElementById('create-team-form').remove(); // إخفاء الفورم
            }
        } else {
            window.location.href = "auth.html";
        }
    });

    // التعامل مع الإرسال
    document.getElementById('create-team-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = document.getElementById('submit-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
        btn.disabled = true;

        const teamData = {
            name: document.getElementById('team-name').value,
            logo: document.getElementById('team-logo').value || 'https://placehold.co/100', // صورة افتراضية
            university: document.getElementById('uni-name').value,
            governorate: document.getElementById('gov-name').value,
            members_count: document.getElementById('members-count').value,
            reason: document.getElementById('reason').value
        };

        const result = await submitTeamRequest(auth.currentUser.uid, teamData);

        if (result.success) {
            showSuccessState("تم إرسال طلبك بنجاح! ✅<br>سيقوم الأدمن بمراجعته وتفعيله قريباً.");
            document.getElementById('create-team-form').reset();
            document.getElementById('create-team-form').classList.add('hidden');
        } else {
            const msgDiv = document.getElementById('form-msg');
            msgDiv.className = "p-4 rounded-xl text-center text-sm font-bold bg-red-500/20 text-red-400 mb-4 block";
            msgDiv.innerText = "خطأ: " + result.message;
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
});

function showSuccessState(message) {
    const container = document.querySelector('.max-w-2xl');
    container.innerHTML = `
        <div class="text-center py-10">
            <div class="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <i class="fas fa-check text-4xl text-green-500"></i>
            </div>
            <h2 class="text-2xl font-bold mb-4">طلبك قيد المعالجة</h2>
            <p class="text-gray-400 mb-8 leading-relaxed">${message}</p>
            <a href="student-dash.html" class="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-bold transition-all">
                العودة للرئيسية
            </a>
        </div>
    `;
}