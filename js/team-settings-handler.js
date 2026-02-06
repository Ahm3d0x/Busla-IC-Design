import { db, doc, getDoc, updateDoc } from './firebase-config.js';

// متغيرات العناصر
let modal, form, nameInput, logoInput, uniInput, govInput;
let previewImg, displayNamePreview;
let currentTeamId = null;

// =========================================================
// 1. تهيئة المودال
// =========================================================
export function initTeamSettingsModal() {
    modal = document.getElementById('team-settings-modal');
    form = document.getElementById('team-settings-form');
    
    // ربط العناصر
    nameInput = document.getElementById('team-set-name');
    logoInput = document.getElementById('team-set-logo');
    uniInput = document.getElementById('team-set-uni');
    govInput = document.getElementById('team-set-gov');
    previewImg = document.getElementById('team-preview-logo');
    displayNamePreview = document.getElementById('team-name-preview');

    // أزرار الإغلاق
    const closeBtn = document.getElementById('close-team-settings');
    if(closeBtn) closeBtn.addEventListener('click', closeTeamSettings);

    // زر تحديث المعاينة
    const previewBtn = document.getElementById('btn-preview-team-logo');
    if(previewBtn) previewBtn.addEventListener('click', () => {
        updateTeamPreviewUI();
        showToast("تم تحديث معاينة اللوجو", "info");
    });

    // معالجة الحفظ
    if(form) form.addEventListener('submit', saveTeamSettings);
}

// =========================================================
// 2. الفتح والعرض
// =========================================================
export async function openTeamSettings(teamId, isLeader) {
    if (!isLeader) {
        showToast("عذراً، إعدادات الفريق متاحة للقائد فقط 🔒", "error");
        return;
    }

    currentTeamId = teamId;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // جلب أحدث بيانات للفريق من السيرفر (لضمان الدقة)
    try {
        const docRef = doc(db, "teams", teamId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const info = data.info || {};

            // تعبئة الحقول
            nameInput.value = info.name || data.name || "";
            logoInput.value = info.logo_url || data.logo_url || "";
            uniInput.value = info.university || "";
            govInput.value = info.governorate || "";

            updateTeamPreviewUI();
        }
    } catch (error) {
        console.error("Error fetching team settings:", error);
        showToast("فشل تحميل بيانات الفريق", "error");
    }
}

export function closeTeamSettings() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function updateTeamPreviewUI() {
    const rawUrl = logoInput.value.trim();
    const name = nameInput.value.trim() || 'فريق جديد';
    
    const directUrl = getDirectImageLink(rawUrl);
    
    if (previewImg) {
        previewImg.src = directUrl;
        previewImg.onerror = function() {
            this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=006A67&color=fff&size=256`;
        };
    }

    if (displayNamePreview) displayNamePreview.textContent = name;
}

async function saveTeamSettings(e) {
    e.preventDefault();
    
    // 1. فتح مودال التأكيد الموجود في HTML
    const confirmModal = document.getElementById('general-confirm-modal');
    const msgEl = document.getElementById('general-confirm-msg');
    const yesBtn = document.getElementById('btn-general-yes');

    if (confirmModal && msgEl && yesBtn) {
        msgEl.innerText = "هل أنت متأكد من حفظ التعديلات على بيانات الفريق؟";
        confirmModal.classList.remove('hidden');

        // 2. تنظيف الزر من أي أحداث سابقة (عشان ميعملش Save مرتين)
        const newYesBtn = yesBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

        // 3. ربط الزر بدالة التنفيذ الفعلي
        newYesBtn.addEventListener('click', () => {
            // إخفاء مودال التأكيد
            confirmModal.classList.add('hidden');
            // استدعاء دالة الحفظ الحقيقية
            executeTeamSave(); 
        });
    } else {
        // لو المودال مش موجود لأي سبب، نحفظ علطول
        executeTeamSave();
    }
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    
    // إعدادات الألوان الصريحة لضمان عدم ظهور اللون الأحمر بالخطأ
    let bgStyle = '';
    let borderStyle = '';
    let textStyle = '';
    let icon = '';

    if (type === 'success') {
        // حالة النجاح: خلفية خضراء داكنة جداً + حدود خضراء فاقعة
        bgStyle = 'bg-[#064e3b]'; // Green-900 equivalent but explicit
        borderStyle = 'border-green-500';
        textStyle = 'text-green-100';
        icon = 'fa-check-circle';
    } else if (type === 'error') {
        // حالة الخطأ: خلفية حمراء داكنة + حدود حمراء
        bgStyle = 'bg-[#7f1d1d]'; // Red-900 equivalent
        borderStyle = 'border-red-500';
        textStyle = 'text-red-100';
        icon = 'fa-exclamation-triangle';
    } else {
        // حالة المعلومات
        bgStyle = 'bg-[#1e3a8a]'; // Blue-900 equivalent
        borderStyle = 'border-blue-500';
        textStyle = 'text-blue-100';
        icon = 'fa-info-circle';
    }

    // تجميع الكلاسات
    toast.className = `pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-xl border-l-4 shadow-2xl backdrop-blur-md animate-slide-in min-w-[320px] mb-3 ${bgStyle} ${borderStyle} ${textStyle}`;
    
    toast.innerHTML = `
        <i class="fas ${icon} text-2xl"></i>
        <div class="flex flex-col">
            <span class="font-bold text-sm leading-tight">${msg}</span>
        </div>
    `;
    
    container.appendChild(toast);
    
    // حذف التوست بعد 4 ثواني
    setTimeout(() => {
        toast.style.transition = 'all 0.5s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-20px)';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}
function getDirectImageLink(url) {
    if (!url) return "https://ui-avatars.com/api/?name=User&background=006A67&color=fff";
    
    try {
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
async function executeTeamSave() {
    const btn = document.getElementById('btn-save-team');
    const originalText = btn.innerHTML;
    
    // Loading State
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.disabled = true;
    btn.classList.add('opacity-75');

    try {
        const teamRef = doc(db, "teams", currentTeamId);
        
        await updateDoc(teamRef, {
            "info.name": nameInput.value,
            "info.logo_url": logoInput.value,
            "info.university": uniInput.value,
            "info.governorate": govInput.value,
            
            // Legacy Support (لضمان عمل الكود القديم)
            "name": nameInput.value,
            "logo_url": logoInput.value
        });

        // إظهار رسالة النجاح (باللون الأخضر)
        showToast("تم تحديث بيانات الفريق بنجاح! 🎉", "success");
        closeTeamSettings();
        
        // إعادة تحميل الصفحة لتطبيق التغييرات
        setTimeout(() => window.location.reload(), 1500);

    } catch (error) {
        console.error("Save Team Error:", error);
        showToast("حدث خطأ أثناء الحفظ: " + error.message, "error");
    } finally {
        // إعادة الزر لحالته الأصلية
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-75');
    }
}