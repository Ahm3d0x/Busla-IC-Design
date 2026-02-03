import { db, collection, addDoc, getDoc, doc, query, where, getDocs, serverTimestamp } from './firebase-config.js';

// --- Constants ---
const TEAMS_COLLECTION = "teams";
const REQUESTS_COLLECTION = "team_requests";
const USERS_COLLECTION = "users";

/**
 * 1. Submit a new team creation request
 * @param {string} leaderUid - The User ID of the student creating the team
 * @param {object} teamData - Object containing name, logo, uni, gov, etc.
 * @returns {object} { success: boolean, message: string }
 */
export async function submitTeamRequest(leaderUid, teamData) {
    try {
        // Step 1: Check if the user already has a pending request
        const q = query(collection(db, REQUESTS_COLLECTION), 
            where("leader_id", "==", leaderUid),
            where("status", "==", "Pending")
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            throw new Error("You already have a pending request under review.");
        }

        // Step 2: Prepare request data
        const requestData = {
            leader_id: leaderUid,
            team_name: teamData.name,
            logo_url: teamData.logo,
            university: teamData.university,
            governorate: teamData.governorate,
            reason: teamData.reason,
            expected_members: teamData.members_count,
            status: "Pending", // Requires admin approval
            submitted_at: serverTimestamp()
        };

        // Step 3: Add to Firestore
        await addDoc(collection(db, REQUESTS_COLLECTION), requestData);
        
        return { success: true, message: "Request submitted successfully! Waiting for admin approval." };

    } catch (error) {
        console.error("Error submitting request:", error);
        return { success: false, message: error.message };
    }
}

/**
 * 2. Check user's team status (Is he a leader? In a team? Pending?)
 * @param {string} uid - User ID
 * @returns {object|null} Status object or null if error
 */
export async function getUserTeamStatus(uid) {
    try {
        // Fetch user document
        const userDoc = await getDoc(doc(db, USERS_COLLECTION, uid));
        if (!userDoc.exists()) return null;
        
        const userData = userDoc.data();
        
        // Case A: User is already in a team
        if (userData.team_id) {
            return { inTeam: true, role: userData.role || 'Student', teamId: userData.team_id };
        }

        // Case B: User is not in a team, check for pending requests
        const q = query(collection(db, REQUESTS_COLLECTION), 
            where("leader_id", "==", uid),
            where("status", "==", "Pending")
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            return { inTeam: false, hasPendingRequest: true };
        }

        // Case C: User is free
        return { inTeam: false, hasPendingRequest: false };

    } catch (error) {
        console.error("Error checking team status:", error);
        return null;
    }
}

/**
 * 3. Fetch team details
 * @param {string} teamId 
 * @returns {object|null} Team data
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