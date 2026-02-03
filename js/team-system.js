import { db, auth, doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from './firebase-config.js';

// --- الثوابت ---
const TEAMS_COLLECTION = "teams";
const REQUESTS_COLLECTION = "team_requests";
const USERS_COLLECTION = "users";

/**
 * 1. إرسال طلب إنشاء فريق جديد
 */
export async function submitTeamRequest(leaderUid, teamData) {
    try {
        // التحقق أولاً: هل للمستخدم طلب معلق؟
        const q = query(collection(db, REQUESTS_COLLECTION), 
            where("leader_id", "==", leaderUid),
            where("status", "==", "Pending")
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            throw new Error("لديك طلب قيد المراجعة بالفعل.");
        }

        // إنشاء الطلب
        const requestData = {
            leader_id: leaderUid,
            team_name: teamData.name,
            logo_url: teamData.logo,
            university: teamData.university,
            governorate: teamData.governorate,
            reason: teamData.reason,
            expected_members: teamData.members_count,
            status: "Pending", // يحتاج موافقة الأدمن
            submitted_at: serverTimestamp()
        };

        await addDoc(collection(db, REQUESTS_COLLECTION), requestData);
        return { success: true, message: "تم إرسال طلبك بنجاح! سيتم مراجعته قريباً." };

    } catch (error) {
        console.error("Error submitting request:", error);
        return { success: false, message: error.message };
    }
}

/**
 * 2. جلب حالة المستخدم (هل هو ليدر؟ هل في فريق؟)
 */
export async function getUserTeamStatus(uid) {
    try {
        const userDoc = await getDoc(doc(db, USERS_COLLECTION, uid));
        if (!userDoc.exists()) return null;
        
        const userData = userDoc.data();
        
        // إذا كان عضواً في فريق
        if (userData.team_id) {
            return { inTeam: true, role: userData.role || 'Student', teamId: userData.team_id };
        }

        // إذا لم يكن في فريق، نفحص هل لديه طلب معلق
        const q = query(collection(db, REQUESTS_COLLECTION), 
            where("leader_id", "==", uid),
            where("status", "==", "Pending")
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            return { inTeam: false, hasPendingRequest: true };
        }

        return { inTeam: false, hasPendingRequest: false };

    } catch (error) {
        console.error("Error checking team status:", error);
        return null;
    }
}

/**
 * 3. جلب بيانات الفريق (لليدر والأعضاء)
 */
export async function getTeamData(teamId) {
    try {
        const teamDoc = await getDoc(doc(db, TEAMS_COLLECTION, teamId));
        if (teamDoc.exists()) {
            return teamDoc.data();
        }
        return null;
    } catch (error) {
        console.error("Error fetching team:", error);
        throw error;
    }
}