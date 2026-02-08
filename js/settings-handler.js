import { auth, db, doc, getDoc, updateDoc, updateProfile } from './firebase-config.js';

// رابط Apps Script (تأكد إنه هو الرابط الصحيح اللي شغال)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyfXoESIoTAIbIofv3PGdZdD65ktxXSuX0Rb-WOtoeRccJFbB5PzJTSDu4DDVSPNSW3/exec';

// متغيرات العناصر
let modal, form, nameInput, photoInput, uniInput, yearInput, govInput, facultyInput, deptInput, emailInput;
let previewImg, displayNamePreview;
let confirmCallback = null;

// =========================================================
// 1. دوال المساعدة (Utilities)
// =========================================================

/**
 * تحويل روابط Google Drive أو Dropbox لروابط عرض مباشرة
 */
function getDirectImageLink(url) {
    if (!url) return "https://ui-avatars.com/api/?name=User&background=006A67&color=fff";
    
    try {
        // معالجة روابط جوجل درايف
        if (url.includes('drive.google.com')) {
            const idMatch = url.match(/\/d\/(.*?)(?:\/|$)/) || url.match(/id=(.*?)(?:&|$)/);
            if (idMatch && idMatch[1]) {
                return `https://lh3.googleusercontent.com/d/${idMatch[1]}=s220`; // رابط سريع وآمن
            }
        }
    } catch (e) {
        console.warn("Error parsing image URL:", e);
    }
    return url;
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return console.error("Toast container missing!");

    const toast = document.createElement('div');
    
    // تصميم التوست حسب النوع
    let styleClass = type === 'success' 
        ? 'border-green-500/50 text-green-400 bg-green-900/40' 
        : (type === 'error' ? 'border-red-500/50 text-red-400 bg-red-900/40' : 'border-blue-500/50 text-blue-400 bg-blue-900/40');
    
    let icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle');

    toast.className = `pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-xl border backdrop-blur-md shadow-2xl animate-slide-in min-w-[320px] ${styleClass}`;
    
    toast.innerHTML = `
        <i class="fas ${icon} text-xl"></i>
        <div class="flex flex-col">
            <span class="font-bold text-sm">${msg}</span>
        </div>
    `;
    
    container.appendChild(toast);
    
    // حذف التوست بعد 4 ثواني
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

/**
 * فتح نافذة التأكيد (General Confirm Modal)
 */
function openConfirmModal(msg, callback) {
    const modal = document.getElementById('general-confirm-modal');
    const msgEl = document.getElementById('general-confirm-msg');
    
    if (!modal) return console.error("Confirm modal missing!");

    if (msgEl) msgEl.textContent = msg;
    confirmCallback = callback;
    
    modal.classList.remove('hidden');
}

/**
 * إغلاق نافذة التأكيد
 */
window.closeGeneralModal = function() {
    const modal = document.getElementById('general-confirm-modal');
    if (modal) modal.classList.add('hidden');
    confirmCallback = null;
};

// =========================================================
// 2. تهيئة المودال (Initialization)
// =========================================================

export function initSettingsModal() {
    modal = document.getElementById('settings-modal');
    form = document.getElementById('settings-form');
    
    // ربط الحقول بالـ IDs
    nameInput = document.getElementById('set-name');
    photoInput = document.getElementById('set-photo');
    emailInput = document.getElementById('set-email');
    uniInput = document.getElementById('set-uni');
    yearInput = document.getElementById('set-year');
    govInput = document.getElementById('set-gov');
    facultyInput = document.getElementById('set-faculty');
    deptInput = document.getElementById('set-dept');
    previewImg = document.getElementById('preview-avatar');
    displayNamePreview = document.getElementById('display-name-preview');

    // تفعيل الأزرار
    const closeBtn = document.getElementById('close-settings-btn');
    if(closeBtn) closeBtn.addEventListener('click', closeSettings);
    
    if(form) form.addEventListener('submit', saveSettings);
    
    // زر تحديث معاينة الصورة
    const previewBtn = document.getElementById('btn-preview-photo');
    if(previewBtn) previewBtn.addEventListener('click', () => {
        updatePreviewUI();
        showToast("تم تحديث معاينة الصورة", "info");
    });

    // زر تغيير الباسورد
    const resetBtn = document.getElementById('btn-reset-pass');
    if(resetBtn) {
        resetBtn.addEventListener('click', () => {
            openConfirmModal(
                "سيتم إرسال رابط آمن لتغيير كلمة المرور إلى بريدك الإلكتروني. هل تود المتابعة؟", 
                handleCustomPasswordReset
            );
        });
    }

    // تهيئة زر "نعم" في مودال التأكيد
    setupConfirmYesButton();
}

function setupConfirmYesButton() {
    const yesBtn = document.getElementById('btn-general-yes');
    if (!yesBtn) return;

    const newBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newBtn, yesBtn);

    newBtn.addEventListener('click', async () => {
        if (confirmCallback) {
            // تحويل الزر لوضع التحميل
            const originalText = newBtn.innerHTML;
            newBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جاري التنفيذ...';
            newBtn.classList.add('opacity-75', 'cursor-not-allowed');
            newBtn.disabled = true;

            try {
                await confirmCallback();
            } catch (err) {
                console.error(err);
                showToast("حدث خطأ غير متوقع", "error");
            } finally {
                // إرجاع الزر لوضعه الطبيعي وإغلاق المودال
                newBtn.innerHTML = originalText;
                newBtn.classList.remove('opacity-75', 'cursor-not-allowed');
                newBtn.disabled = false;
                window.closeGeneralModal();
            }
        } else {
            window.closeGeneralModal();
        }
    });
}

export async function openSettings() {
    const user = auth.currentUser;
    if (!user) return; // لو مش مسجل خروج

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    nameInput.value = user.displayName || ""; 
    photoInput.value = user.photoURL || ""; 
    emailInput.value = user.email || "";
    
    updatePreviewUI(); 
    try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            const dbName = data.personal_info?.full_name?.trim() || user.displayName;
            if(dbName) nameInput.value = dbName;
            const dbPhoto = data.photo_url || data.personal_info?.photo_url || user.photoURL;
            if(dbPhoto) photoInput.value = dbPhoto;
            if(data.personal_info?.governorate) govInput.value = data.personal_info.governorate;

            if(data.academic_info) {
                if(data.academic_info.university) uniInput.value = data.academic_info.university;
                if(data.academic_info.year) yearInput.value = data.academic_info.year;
                if(data.academic_info.faculty) facultyInput.value = data.academic_info.faculty;
                if(data.academic_info.department) deptInput.value = data.academic_info.department;
            }
            updatePreviewUI();
            const role = data.system_info?.role || 'Student';
            const roleEl = document.getElementById('display-role-preview');
            if(roleEl) roleEl.textContent = role;
        }
    } catch (error) {
        console.error("❌ Error fetching settings:", error);
        showToast("فشل تحميل بعض البيانات، تأكد من الانترنت", "error");
    }
}

function updatePreviewUI() {
    const rawUrl = photoInput.value.trim();
    const name = nameInput.value.trim() || 'مستخدم جديد';
    
    const directUrl = getDirectImageLink(rawUrl);
    
    // تحديث الصورة
    if (previewImg) {
        previewImg.src = directUrl;
        // لو الصورة باظت، نحط صورة بالحروف
        previewImg.onerror = function() {
            this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=006A67&color=fff&size=256`;
        };
    }

    // تحديث الاسم
    if (displayNamePreview) displayNamePreview.textContent = name;
}

function closeSettings() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

/**
 * حفظ البيانات (Saving Logic)
 */
async function saveSettings(e) {
    e.preventDefault();
    
    const btn = document.getElementById('btn-save-settings');
    const originalText = btn.innerHTML;
    
    // UI Loading
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.disabled = true;

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No user logged in");

        // 1. تحديث الـ Auth Profile (عشان يظهر في الهيدر فوراً)
        await updateProfile(user, {
            displayName: nameInput.value,
            photoURL: photoInput.value 
        });

        // 2. تحديث الـ Firestore (هنحدث في المكانين عشان نضمن التوافق)
        const userRef = doc(db, "users", user.uid);
        
        await updateDoc(userRef, {
            // تحديث البيانات الشخصية
            "personal_info.full_name": nameInput.value,
            "personal_info.photo_url": photoInput.value,
            "personal_info.governorate": govInput.value,
            
            // تحديث الصورة في الـ Root كمان (عشان JSON اللي بعته كان فيه Root)
            "photo_url": photoInput.value,
            "full_name": nameInput.value, // احتياطي

            // تحديث البيانات الأكاديمية
            "academic_info.university": uniInput.value,
            "academic_info.year": yearInput.value,
            "academic_info.faculty": facultyInput.value,
            "academic_info.department": deptInput.value
        });

        showToast("تم تحديث ملفك الشخصي بنجاح! 🚀", "success");
        closeSettings();
        
        // إعادة تحميل الصفحة لتطبيق التغييرات في كل مكان
        setTimeout(() => window.location.reload(), 1500);

    } catch (error) {
        console.error("❌ Save Error:", error);
        showToast("حدث خطأ أثناء الحفظ: " + error.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/**
 * إرسال رابط تغيير الباسورد
 */
async function handleCustomPasswordReset() {
    const email = emailInput.value;
    if (!email) {
        showToast("لا يوجد بريد إلكتروني مسجل!", "error");
        return;
    }

    // إظهار توست بدل Alert
    showToast("جاري الاتصال بالسيرفر لإرسال الرابط...", "info");

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // مهم جداً مع Apps Script
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'resetPassword',
                email: email,
                name: nameInput.value || "مستخدم بوصلة"
            })
        });

        // بما إننا بنستخدم no-cors، منقدرش نقرأ الرد، فبنفترض النجاح لو مفيش خطأ شبكة
        showToast("تم إرسال الرابط! راجع بريدك (والمهملات) 📧", "success");

    } catch (error) {
        console.error("❌ Reset Error:", error);
        showToast("فشل الإرسال. تأكد من اتصالك بالإنترنت.", "error");
    }
}