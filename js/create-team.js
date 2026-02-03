import { auth, onAuthStateChanged } from './firebase-config.js';
import { submitTeamRequest, getUserTeamStatus } from './team-system.js';

// --- Global Variables ---
let currentUser = null;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Check Auth State
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await checkUserStatus(user.uid);
        } else {
            window.location.href = "auth.html";
        }
    });

    // Handle Form Submission
    document.getElementById('create-team-form').addEventListener('submit', handleFormSubmit);
});

// --- Logic Functions ---

/**
 * Check if user is eligible to create a team
 * @param {string} uid 
 */
async function checkUserStatus(uid) {
    const status = await getUserTeamStatus(uid);
    
    if (status) {
        if (status.inTeam) {
            showToast("أنت بالفعل عضو في فريق! سيتم توجيهك...", "error");
            setTimeout(() => window.location.href = "student-dash.html", 2000);
        } else if (status.hasPendingRequest) {
            renderSuccessState("لديك طلب قيد المراجعة حالياً. يرجى انتظار موافقة الإدارة.");
            document.getElementById('create-team-form').remove(); 
        }
    }
}

/**
 * Handle form submission logic
 * @param {Event} e 
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    
    // UI Loading State
    const btn = document.getElementById('submit-btn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin animate-spin"></i> جاري المعالجة...';
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');

    // Collect Data
    const teamData = {
        name: document.getElementById('team-name').value.trim(),
        logo: document.getElementById('team-logo').value.trim() || 'https://placehold.co/200?text=Team+Logo',
        university: document.getElementById('uni-name').value.trim(),
        governorate: document.getElementById('gov-name').value,
        members_count: document.getElementById('members-count').value,
        reason: document.getElementById('reason').value.trim()
    };

    // Submit to Backend
    const result = await submitTeamRequest(currentUser.uid, teamData);

    if (result.success) {
        showToast("تم إرسال طلبك بنجاح! 🚀", "success");
        renderSuccessState("تم استلام طلبك بنجاح! سيقوم فريق الإدارة بمراجعته وتفعيله قريباً.");
        document.getElementById('create-team-form').remove();
    } else {
        showToast(result.message || "حدث خطأ غير متوقع", "error");
        // Reset Button
        btn.innerHTML = originalContent;
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

// --- UI Helper Functions ---

/**
 * Replace the form with a success message card
 * @param {string} message 
 */
function renderSuccessState(message) {
    const container = document.querySelector('.max-w-2xl');
    container.innerHTML = `
        <div class="text-center py-12 animate-slide-in">
            <div class="relative w-24 h-24 mx-auto mb-6">
                <div class="absolute inset-0 bg-green-500/20 rounded-full animate-ping"></div>
                <div class="relative w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/30">
                    <i class="fas fa-check text-4xl text-green-400"></i>
                </div>
            </div>
            
            <h2 class="text-2xl font-bold mb-4 text-white">الطلب قيد المراجعة</h2>
            <p class="text-gray-400 mb-8 leading-relaxed max-w-md mx-auto">${message}</p>
            
            <a href="student-dash.html" class="inline-flex items-center gap-2 px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-bold transition-all hover:scale-105">
                <i class="fas fa-home"></i>
                العودة للرئيسية
            </a>
        </div>
    `;
}

/**
 * Display a custom toast notification
 * @param {string} message - Text to display
 * @param {string} type - 'success' | 'error' | 'info'
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    
    // Create Toast Element
    const toast = document.createElement('div');
    
    // Style config based on type
    let bgClass, iconClass, iconColor;
    if (type === 'success') {
        bgClass = 'bg-gray-900/90 border-green-500/50';
        iconClass = 'fa-check-circle';
        iconColor = 'text-green-400';
    } else if (type === 'error') {
        bgClass = 'bg-gray-900/90 border-red-500/50';
        iconClass = 'fa-exclamation-circle';
        iconColor = 'text-red-400';
    } else {
        bgClass = 'bg-gray-900/90 border-blue-500/50';
        iconClass = 'fa-info-circle';
        iconColor = 'text-blue-400';
    }

    toast.className = `
        pointer-events-auto flex items-center gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md 
        transform transition-all duration-300 animate-slide-in ${bgClass}
    `;

    toast.innerHTML = `
        <i class="fas ${iconClass} ${iconColor} text-xl"></i>
        <p class="text-sm font-medium text-white">${message}</p>
    `;

    // Append to container
    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('animate-fade-out'); // Add fade out animation
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000);
}