import { auth, db, doc, getDoc, updateDoc, updateProfile, sendPasswordResetEmail } from './firebase-config.js';

// متغيرات لتخزين عناصر الـ DOM
let modal, form, nameInput, photoInput, uniInput, yearInput, emailInput;

// 1. تهيئة المودال (يتم استدعاؤها مرة واحدة     عند تحميل الصفحة)
export function initSettingsModal() {
    modal = document.getElementById('settings-modal');
    form = document.getElementById('settings-form');
    
    // ربط المدخلات
    nameInput = document.getElementById('set-name');
    photoInput = document.getElementById('set-photo');
    uniInput = document.getElementById('set-uni');
    yearInput = document.getElementById('set-year');
    emailInput = document.getElementById('set-email');

    // زر الإغلاق
    document.getElementById('close-settings-btn').addEventListener('click', closeSettings);
    
    // زر الحفظ
    form.addEventListener('submit', saveSettings);

    // زر تغيير الباسورد
    document.getElementById('btn-reset-pass').addEventListener('click', handlePasswordReset);
}
function resolveImageUrl(url, type = 'course') {
    if (!url || url.trim() === "" || url === "null" || url === "undefined") {
        if (type === 'team') {
            return '../assets/icons/icon.jpg';
        } else if (type === 'user') {
            return '../assets/icons/icon.jpg';
        } else {
            return '../assets/icons/icon.jpg';
        }
    }
    if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
        const idMatch = url.match(/\/d\/([-\w]{25,})/) || url.match(/id=([-\w]{25,})/);
        if (idMatch && idMatch[1]) {
            return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
        }
    }

    if (url.includes('dropbox.com')) {
        return url.replace('?dl=0', '?raw=1');
    }
    return url;
}
// 2. فتح الإعدادات وجلب البيانات الحالية
export async function openSettings() {
    const user = auth.currentUser;
    if (!user) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex'); // عشان التوسط

    // تعبئة البيانات من Auth (سريع جداً)
    nameInput.value = user.displayName || '';
    photoInput.value = resolveImageUrl(user.photoURL || '', 'user');
    emailInput.value = user.email || '';

    // تعبئة باقي البيانات من Firestore (يحتاج تحميل)
    try {
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) {
            const data = docSnap.data();
            uniInput.value = data.academic_info?.university || '';
            yearInput.value = data.academic_info?.year || '';
        }
    } catch (error) {
        console.error("Error fetching user details:", error);
    }
}

// 3. إغلاق الإعدادات
function closeSettings() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// 4. حفظ التغييرات (Core Logic)
async function saveSettings(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-settings');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.disabled = true;

    try {
        const user = auth.currentUser;
        
        // أ. تحديث البروفايل في Auth (عشان الاسم والصورة يسمعوا فوراً في الموقع)
        await updateProfile(user, {
            displayName: nameInput.value,
            photoURL: photoInput.value
        });

        // ب. تحديث الوثيقة في Firestore
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
            "personal_info.full_name": nameInput.value,
            "personal_info.photo_url": photoInput.value,
            "academic_info.university": uniInput.value,
            "academic_info.year": yearInput.value
        });

        // ج. تحديث الواجهة فوراً (اختياري: لو عندك عنصر بيعرض الاسم في الهيدر)
        // document.getElementById('nav-user-name').textContent = nameInput.value;

        showToast("تم تحديث البيانات بنجاح! ✅", "success");
        closeSettings();

    } catch (error) {
        console.error(error);
        showToast("حدث خطأ أثناء الحفظ.", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// 5. إرسال رابط تغيير كلمة المرور
async function handlePasswordReset() {
    const email = emailInput.value;
    const btn = document.getElementById('btn-reset-pass');
    
    if(!confirm("هل أنت متأكد؟ سيتم إرسال رابط لتغيير كلمة المرور إلى بريدك.")) return;

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        await sendPasswordResetEmail(auth, email);
        showToast("تم إرسال رابط تغيير كلمة المرور للإيميل 📧", "success");
    } catch (error) {
        showToast("فشل الإرسال: " + error.message, "error");
    } finally {
        btn.innerHTML = '<i class="fas fa-key"></i> تغيير كلمة المرور';
    }
}

// دالة مساعدة للرسائل (لو مش عندك واحدة)
function showToast(msg, type) {
    alert(msg); // مؤقتاً لحد ما نستخدم التوست الاحترافي بتاعك
}