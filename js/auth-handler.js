// js/auth-handler.js
import { db, auth, doc, setDoc, getDoc, createUserWithEmailAndPassword, signInWithEmailAndPassword } from './firebase-config.js';

// --- دالة تسجيل حساب جديد (كما هي مع تعديل بسيط للتأكد) ---
export async function registerUser(email, password, personalInfo, academicInfo) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        const userData = {
            uid: user.uid,
            personal_info: {
                full_name: personalInfo.fullName,
                email: email,
                phone: ""
            },
            academic_info: {
                university: academicInfo.university,
                faculty: "Engineering",
                department: "Electronics", // يمكن تعديلها لتكون ديناميكية
                year: academicInfo.year
            },
            system_info: {
                role: "Student", // الافتراضي دائماً طالب
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

        await setDoc(doc(db, "users", user.uid), userData);
        return { user, role: "Student" };

    } catch (error) {
        throw error;
    }
}

// --- دالة تسجيل الدخول (الجديدة والمهمة) ---
export async function loginUser(email, password) {
    try {
        // 1. التحقق من صحة الإيميل والباسورد
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 2. جلب بيانات المستخدم من Firestore لمعرفة الرتبة (Role)
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const userData = docSnap.data();
            const role = userData.system_info.role; // Student, Leader, or Admin
            return { user, role };
        } else {
            // حالة نادرة: الحساب موجود في Auth لكن ليس له بيانات في Firestore
            throw new Error("بيانات المستخدم غير موجودة في قاعدة البيانات.");
        }

    } catch (error) {
        throw error;
    }
}