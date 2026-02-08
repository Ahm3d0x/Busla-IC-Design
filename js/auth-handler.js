import { 
    db, auth, doc, setDoc, getDoc, updateDoc,
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    sendEmailVerification, 
    updateProfile 
} from './firebase-config.js';

// في ملف auth-handler.js

// 1. تأكد من استيراد APPS_SCRIPT_URL (أو عرفه هنا مؤقتاً)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyfXoESIoTAIbIofv3PGdZdD65ktxXSuX0Rb-WOtoeRccJFbB5PzJTSDu4DDVSPNSW3/exec';

// في ملف auth-handler.js

export async function registerUser(email, password, personalInfo, academicInfo) {
    let user;
    try {
        console.log("🚀 بدء عملية التسجيل...");

        // 1. إنشاء الحساب في Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
        console.log("✅ تم إنشاء الحساب:", user.uid);

        // 2. تحديث البروفايل فوراً
        await updateProfile(user, {
            displayName: personalInfo.fullName,
            photoURL: personalInfo.photoURL || "" 
        });

        // 3. 🔥 تجهيز وحفظ البيانات في Firestore (قبل الإيميل) 🔥
        const userData = {
            uid: user.uid,
            personal_info: {
                full_name: personalInfo.fullName,
                email: email,
                photo_url: personalInfo.photoURL || "",
                phone: "", // اختياري
                uid: user.uid // تكرار للتأكيد
            },
            academic_info: {
                university: academicInfo.university,
                faculty: academicInfo.faculty || "Engineering",
                department: academicInfo.department || "Electronics",
                year: academicInfo.year,
                governorate: academicInfo.governorate || "Not Specified"
            },
            system_info: {
                role: "Student",
                team_id: null,
                join_date: new Date().toISOString(),
                activity_status: "Active",
                email_verified: false 
            },
            gamification: {
                total_points: 0,
                current_rank: "Newbie",
                badges: []
            }
        };

        // حفظ المستند كاملاً
        await setDoc(doc(db, "users", user.uid), userData);
        console.log("✅ تم حفظ البيانات في Firestore بنجاح");

        // 4. محاولة إرسال الإيميل (خطوة منفصلة لا توقف التسجيل)
        try {
            fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: "sendVerificationEmail",
                    email: email,
                    name: personalInfo.fullName
                })
            });
            console.log("📨 تم طلب إرسال الإيميل");
        } catch (emailErr) {
            console.warn("⚠️ فشل طلب الإيميل (لكن الحساب سليم):", emailErr);
        }
        
        return { user, verificationRequired: true };

    } catch (error) {
        console.error("❌ Registration Error:", error);
        // تنظيف: لو حصل خطأ وحساب Auth اتعمل بس الداتا لا، نحذفه عشان ميتحسبش يوزر وهمي
        if (user) {
            try { await user.delete(); } catch(e) {}
        }
        throw error;
    }
}
// --- تسجيل الدخول (مع تحديث حالة التفعيل في الداتابيز) ---
export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 🔥 التعديل الجديد: المزامنة مع الداتابيز
        // لو الإيميل مفعل في Auth، نخليه مفعل في Firestore كمان
        if (user.emailVerified) {
            const userRef = doc(db, "users", user.uid);
            
            // تحديث الحقل فقط بدون التأثير على باقي البيانات
            await updateDoc(userRef, {
                "system_info.email_verified": true
            }).catch(err => console.log("تحديث الحالة تم بالفعل أو حدث خطأ بسيط:", err));
        }

        return { user, emailVerified: user.emailVerified }; 
    } catch (error) {
        throw error;
    }
}