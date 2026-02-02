// js/auth-handler.js
import { db, auth, doc, setDoc, createUserWithEmailAndPassword } from './firebase-config.js';

export async function registerUser(email, password, personalInfo, academicInfo) {
    try {
        // 1. إنشاء الحساب في نظام الحماية (Authentication)
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. تجهيز ملف الطالب (حسب خطة العمل Master Plan)
        const userData = {
            uid: user.uid,
            personal_info: {
                full_name: personalInfo.fullName,
                email: email,
                phone: "" // يمكن إضافته لاحقاً
            },
            academic_info: {
                university: academicInfo.university,
                faculty: "Engineering",
                department: "Electronics",
                year: academicInfo.year
            },
            system_info: {
                role: "Student",
                team_id: null,
                join_date: new Date().toISOString(),
                activity_status: "Active"
            },
            gamification: {
                total_points: 0,
                current_rank: "Newbie",
                badges: []
            }
        };

        // 3. حفظ البيانات في قاعدة البيانات (Firestore)
        await setDoc(doc(db, "users", user.uid), userData);
        
        console.log("تم تسجيل الطالب بنجاح:", user.uid);
        return user;

    } catch (error) {
        console.error("خطأ في التسجيل:", error);
        throw error;
    }
}