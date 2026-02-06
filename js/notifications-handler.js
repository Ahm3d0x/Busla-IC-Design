import { 
    db, auth, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, 
    query, orderBy, limit, serverTimestamp, getDoc, where 
} from './firebase-config.js';

// ==========================================
// 1. GLOBAL STATE & CONFIG
// ==========================================
let currentTeamId = null;
let isEditMode = false;
let currentPostId = null;
let teamMembersCache = [];

const POST_TYPES = {
    'announcement': { label: 'إعلان عام', icon: 'fa-bullhorn', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500' },
    'deadline': { label: 'ميعاد تسليم', icon: 'fa-hourglass-half', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500' },
    'meeting': { label: 'اجتماع', icon: 'fa-video', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500' },
    'warning': { label: 'تنبيه هام', icon: 'fa-exclamation-triangle', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500' },
    'achievement': { label: 'إنجاز', icon: 'fa-trophy', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500' }
};

// ==========================================
// 2. INITIALIZATION
// ==========================================
export async function initNotificationsSystem(teamId) {
    currentTeamId = teamId;
    if (!currentTeamId) return;

    await loadTeamMembers(teamId);
    loadPosts(); 

    const form = document.getElementById('post-form');
    if (form) {
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        newForm.addEventListener('submit', handlePostSubmit);
    }

    const searchInput = document.getElementById('archive-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => loadArchivePosts(e.target.value));
    }
}

// ==========================================
// 3. FETCHING DATA
// ==========================================
async function loadPosts() {
    const container = document.getElementById('posts-table-body');
    if(!container) return;
    
    container.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-gray-500"><i class="fas fa-circle-notch fa-spin text-2xl"></i><br>جاري تحميل الإشعارات...</td></tr>`;

    try {
        const postsRef = collection(db, "teams", currentTeamId, "posts");
        const q = query(postsRef, orderBy("created_at", "desc"), limit(20));
        
        const snapshot = await getDocs(q);
        const posts = [];
        const now = new Date();

        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            
            const isExpired = data.expiry_date && new Date(data.expiry_date) < now;
            
            if (data.status !== 'archived' && !isExpired) {
                posts.push(data);
            }
        });

        posts.sort((a, b) => (b.is_pinned === true) - (a.is_pinned === true));

        if (posts.length === 0) {
            container.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-gray-500">لا توجد إشعارات نشطة حالياً.</td></tr>`;
            return;
        }

        container.innerHTML = posts.map(post => renderPostRow(post, 'active')).join('');

    } catch (error) {
        console.error("Error loading posts:", error);
        container.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-red-400">حدث خطأ في تحميل البيانات.</td></tr>`;
    }
}

// Load Archive
window.loadArchivePosts = async (searchTerm = '') => {
    const container = document.getElementById('archive-table-body');
    if(!container) return;

    container.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-gray-500"><i class="fas fa-circle-notch fa-spin text-2xl"></i><br>جاري البحث في الأرشيف...</td></tr>`;

    try {
        const postsRef = collection(db, "teams", currentTeamId, "posts");
        const q = query(postsRef, orderBy("created_at", "desc"), limit(50));
        
        const snapshot = await getDocs(q);
        let posts = [];
        const now = new Date();

        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            const isExpired = data.expiry_date && new Date(data.expiry_date) < now;
            
            if (data.status === 'archived' || isExpired) {
                posts.push(data);
            }
        });

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            posts = posts.filter(p => p.title.toLowerCase().includes(term) || p.content.toLowerCase().includes(term));
        }

        if (posts.length === 0) {
            container.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-gray-500">الأرشيف فارغ.</td></tr>`;
            return;
        }

        container.innerHTML = posts.map(post => renderPostRow(post, 'archive')).join('');

    } catch (error) {
        console.error(error);
        showToast("فشل تحميل الأرشيف", "error");
    }
};

async function loadTeamMembers(teamId) {
    try {
        const teamDoc = await getDoc(doc(db, "teams", teamId));
        if (teamDoc.exists()) {
            const memberIds = teamDoc.data().members || [];
            teamMembersCache = [];
            await Promise.all(memberIds.map(async (uid) => {
                try {
                    const uDoc = await getDoc(doc(db, "users", uid));
                    if (uDoc.exists()) {
                        teamMembersCache.push({
                            uid: uid,
                            name: uDoc.data().personal_info?.full_name || "Unknown",
                            photo: uDoc.data().personal_info?.photo_url
                        });
                    }
                } catch(e) {}
            }));
        }
    } catch (e) { console.error("Error loading members", e); }
}

// ==========================================
// 4. RENDERING
// ==========================================
function renderPostRow(post, viewType = 'active') {
    const style = POST_TYPES[post.type] || POST_TYPES['announcement'];
    const date = post.created_at ? new Date(post.created_at.toDate()).toLocaleDateString('ar-EG') : 'الآن';
    
    // استبعاد القائد من حساب المشاهدات
    const validMembers = teamMembersCache.filter(m => m.uid !== post.created_by);
    const totalMembers = validMembers.length || 1;
    
    // فلترة قائمة المشاهدة لاستبعاد القائد أيضاً
    const seenCount = (post.seen_by || []).filter(uid => uid !== post.created_by).length;
    
    // Status Logic
    const isExpired = post.expiry_date && new Date(post.expiry_date) < new Date();
    let statusBadge = isExpired 
        ? '<span class="px-2 py-1 rounded bg-red-500/10 text-red-400 text-[10px] border border-red-500/20">Expired</span>'
        : (post.status === 'archived' 
            ? '<span class="px-2 py-1 rounded bg-gray-500/10 text-gray-400 text-[10px] border border-gray-500/20">Archived</span>'
            : '<span class="px-2 py-1 rounded bg-green-500/10 text-green-400 text-[10px] border border-green-500/20">Active</span>');

    // 🔥 تعديل: إظهار الأزرار دائماً (حذفنا opacity-0 group-hover:opacity-100)
    let actions = '';
    if (viewType === 'active') {
        actions = `
            <button onclick="viewPostDetails('${post.id}')" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all" title="التفاصيل"><i class="fas fa-eye"></i></button>
            <button onclick="editPost('${post.id}')" class="w-8 h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-all" title="تعديل"><i class="fas fa-pen"></i></button>
            <button onclick="archivePost('${post.id}')" class="w-8 h-8 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 transition-all" title="أرشفة"><i class="fas fa-box-archive"></i></button>
            <button onclick="deletePost('${post.id}')" class="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all" title="حذف"><i class="fas fa-trash"></i></button>
        `;
    } else {
        actions = `
            <button onclick="viewPostDetails('${post.id}')" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all" title="التفاصيل"><i class="fas fa-eye"></i></button>
            <button onclick="restorePost('${post.id}')" class="w-8 h-8 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-all" title="استعادة"><i class="fas fa-undo"></i></button>
            <button onclick="deletePost('${post.id}')" class="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all" title="حذف نهائي"><i class="fas fa-trash"></i></button>
        `;
    }

    return `
    <tr class="border-b border-white/5 hover:bg-white/5 transition-colors group">
        <td class="p-4">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg ${style.bg} ${style.color} flex items-center justify-center border ${style.border} border-opacity-30">
                    <i class="fas ${style.icon}"></i>
                </div>
                <div>
                    <h4 class="font-bold text-white text-sm line-clamp-1 group-hover:text-b-primary transition-colors cursor-pointer" onclick="viewPostDetails('${post.id}')">
                        ${post.is_pinned ? '<i class="fas fa-thumbtack text-yellow-500 ml-1 rotate-45"></i>' : ''}
                        ${post.title}
                    </h4>
                    <span class="text-[10px] text-gray-500">${style.label}</span>
                </div>
            </div>
        </td>
        <td class="p-4 text-center font-mono text-xs text-gray-400">${date}</td>
        <td class="p-4 text-center">
            <div class="flex items-center justify-center gap-2" title="${seenCount} من ${totalMembers}">
                <div class="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full bg-b-primary" style="width: ${(seenCount / totalMembers) * 100}%"></div>
                </div>
                <span class="text-[10px] text-gray-300 font-mono">${seenCount}</span>
            </div>
        </td>
        <td class="p-4 text-center">${statusBadge}</td>
        <td class="p-4 text-center">
            <div class="flex items-center justify-center gap-2 transition-opacity">
                ${actions}
            </div>
        </td>
    </tr>
    `;
}

// ==========================================
// 5. POST ACTIONS (CRUD)
// ==========================================

window.openCreatePostPanel = () => {
    isEditMode = false;
    currentPostId = null;
    document.getElementById('panel-title').innerHTML = `<i class="fas fa-pen-nib text-b-primary"></i> إنشاء إشعار جديد`;
    document.getElementById('post-form').reset();
    document.getElementById('post-side-panel').classList.remove('translate-x-full');
    document.getElementById('panel-overlay').classList.remove('hidden');
};

window.closeCreatePostPanel = () => {
    document.getElementById('post-side-panel').classList.add('translate-x-full');
    document.getElementById('panel-overlay').classList.add('hidden');
};

window.editPost = async (postId) => {
    try {
        const docSnap = await getDoc(doc(db, "teams", currentTeamId, "posts", postId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            isEditMode = true;
            currentPostId = postId;
            
            document.getElementById('panel-title').innerHTML = `<i class="fas fa-edit text-blue-400"></i> تعديل الإشعار`;
            document.getElementById('post-title').value = data.title;
            document.getElementById('post-content').value = data.content;
            document.getElementById('post-type').value = data.type;
            document.getElementById('post-link').value = data.link || "";
            document.getElementById('post-expiry').value = data.expiry_date || "";
            document.getElementById('post-pin').checked = data.is_pinned;
            document.getElementById('post-ack').checked = data.require_seen;

            document.getElementById('post-side-panel').classList.remove('translate-x-full');
            document.getElementById('panel-overlay').classList.remove('hidden');
        }
    } catch (e) {
        showToast("فشل تحميل البيانات", "error");
    }
};

async function handlePostSubmit(e) {
    e.preventDefault();
    const currentUser = auth.currentUser;
    if (!currentUser) return showToast("يجب تسجيل الدخول", "error");

    const btn = document.getElementById('btn-save-post');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    btn.disabled = true;

    const postData = {
        title: document.getElementById('post-title').value,
        content: document.getElementById('post-content').value,
        type: document.getElementById('post-type').value,
        link: document.getElementById('post-link').value,
        expiry_date: document.getElementById('post-expiry').value,
        is_pinned: document.getElementById('post-pin').checked,
        require_seen: document.getElementById('post-ack').checked,
        updated_at: serverTimestamp()
    };

    try {
        if (isEditMode && currentPostId) {
            postData.seen_by = []; 
            await updateDoc(doc(db, "teams", currentTeamId, "posts", currentPostId), postData);
            showToast("تم التحديث بنجاح", "success");
        } else {
            postData.created_at = serverTimestamp();
            postData.created_by = currentUser.uid;
            postData.seen_by = [];
            postData.status = 'active';
            await addDoc(collection(db, "teams", currentTeamId, "posts"), postData);
            showToast("تم النشر بنجاح", "success");
        }

        closeCreatePostPanel();
        loadPosts(); 

    } catch (error) {
        console.error(error);
        showToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.deletePost = (postId) => {
    if(window.openConfirmModal) {
        window.openConfirmModal("هل أنت متأكد من حذف هذا الإشعار نهائياً؟", async () => {
            try {
                await deleteDoc(doc(db, "teams", currentTeamId, "posts", postId));
                showToast("تم الحذف", "success");
                loadPosts(); 
                if(!document.getElementById('archive-section').classList.contains('hidden')) {
                    loadArchivePosts();
                }
            } catch (e) { showToast("فشل الحذف", "error"); }
        });
    }
};

window.archivePost = (postId) => {
    if(window.openConfirmModal) {
        window.openConfirmModal("نقل الإشعار إلى الأرشيف؟", async () => {
            try {
                await updateDoc(doc(db, "teams", currentTeamId, "posts", postId), { status: 'archived' });
                showToast("تمت الأرشفة", "success");
                loadPosts();
            } catch (e) { showToast("فشل الأرشفة", "error"); }
        });
    }
};

window.restorePost = async (postId) => {
    try {
        await updateDoc(doc(db, "teams", currentTeamId, "posts", postId), { status: 'active', expiry_date: "" });
        showToast("تمت استعادة الإشعار", "success");
        loadArchivePosts();
        loadPosts();
    } catch (e) { showToast("فشل الاستعادة", "error"); }
};

// ==========================================
// 6. UI HELPERS & VIEWS
// ==========================================

window.toggleArchiveView = (showArchive) => {
    const activeSection = document.getElementById('active-posts-section');
    const archiveSection = document.getElementById('archive-section');
    
    if (showArchive) {
        activeSection.classList.add('hidden');
        archiveSection.classList.remove('hidden');
        loadArchivePosts();
    } else {
        archiveSection.classList.add('hidden');
        activeSection.classList.remove('hidden');
        loadPosts();
    }
};

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    
    let bgStyle = type === 'success' ? 'bg-[#064e3b]' : (type === 'error' ? 'bg-[#7f1d1d]' : 'bg-[#1e3a8a]');
    let borderStyle = type === 'success' ? 'border-green-500' : (type === 'error' ? 'border-red-500' : 'border-blue-500');
    let icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-triangle';

    toast.className = `pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-xl border-l-4 shadow-2xl backdrop-blur-md animate-slide-in min-w-[320px] mb-3 ${bgStyle} ${borderStyle} text-white`;
    
    toast.innerHTML = `<i class="fas ${icon} text-2xl"></i><span class="font-bold text-sm">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// ------------------------------------------
// 🔥 UPDATED: Detailed View with Fixes
// ------------------------------------------
window.viewPostDetails = async (postId) => {
    const modal = document.getElementById('post-detail-modal');
    const content = document.getElementById('post-detail-content');
    
    modal.classList.remove('hidden');
    content.innerHTML = `<div class="text-center py-10"><i class="fas fa-circle-notch fa-spin text-2xl text-b-primary"></i></div>`;

    try {
        const docSnap = await getDoc(doc(db, "teams", currentTeamId, "posts", postId));
        if (!docSnap.exists()) return;
        
        const data = docSnap.data();
        const style = POST_TYPES[data.type] || POST_TYPES['announcement'];
        
        // استبعاد القائد من القائمة (UID of Creator)
        const seenIds = data.seen_by || [];
        const creatorId = data.created_by;

        // 🔥 إضافة: عرض تاريخ الانتهاء
        let expiryHtml = '';
        if (data.expiry_date) {
            const expDate = new Date(data.expiry_date);
            const today = new Date();
            const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            
            let colorClass = daysLeft < 0 ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
            let text = daysLeft < 0 ? 'منتهي الصلاحية' : `باقي ${daysLeft} يوم`;

            expiryHtml = `
                <div class="mt-4 p-3 rounded-lg border flex items-center gap-3 ${colorClass}">
                    <i class="fas fa-hourglass-half text-xl"></i>
                    <div>
                        <p class="text-xs opacity-70 uppercase font-bold">تاريخ الانتهاء</p>
                        <p class="font-bold font-mono text-sm">${expDate.toLocaleDateString('ar-EG')} (${text})</p>
                    </div>
                </div>
            `;
        }

        let membersHtml = '';
        // نفلتر الأعضاء لاستبعاد القائد من القائمة
        teamMembersCache.forEach(member => {
            if (member.uid === creatorId) return; // 🛑 تخطي القائد

            const isSeen = seenIds.includes(member.uid);
            
            // 🔥 إضافة: معالجة رابط الصورة
            const avatarUrl = resolveImageUrl(member.photo, 'user');

            membersHtml += `
                <div class="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors">
                    <div class="flex items-center gap-3">
                        <img src="${avatarUrl}" class="w-10 h-10 rounded-full border border-white/10 object-cover bg-gray-800" onerror="this.src='../assets/icons/icon.jpg'">
                        <span class="text-sm text-gray-200 font-bold">${member.name}</span>
                    </div>
                    <div>
                        ${isSeen 
                            ? '<span class="text-green-400 text-xs bg-green-500/10 px-2 py-1 rounded border border-green-500/20"><i class="fas fa-check-double ml-1"></i> تمت المشاهدة</span>' 
                            : '<span class="text-gray-500 text-xs bg-gray-500/10 px-2 py-1 rounded border border-gray-500/20"><i class="far fa-clock ml-1"></i> لم يشاهد</span>'}
                    </div>
                </div>`;
        });

        // إذا لم يوجد أعضاء غير القائد
        if (!membersHtml) membersHtml = '<p class="text-center text-gray-500 py-4 text-sm">لا يوجد أعضاء آخرين في الفريق.</p>';

        content.innerHTML = `
            <div class="flex items-start gap-4 mb-6">
                <div class="w-14 h-14 rounded-2xl ${style.bg} ${style.color} flex items-center justify-center text-3xl border ${style.border} shadow-lg shadow-${style.color}/20">
                    <i class="fas ${style.icon}"></i>
                </div>
                <div>
                    <span class="text-[10px] uppercase font-bold tracking-wider ${style.color} bg-black/40 px-2 py-1 rounded border border-white/5 shadow-inner">${style.label}</span>
                    <h3 class="text-2xl font-bold text-white mt-2 leading-tight">${data.title}</h3>
                    <p class="text-xs text-gray-500 mt-1 font-mono">${new Date(data.created_at?.toDate()).toLocaleString('ar-EG')}</p>
                </div>
            </div>

            <div class="bg-black/20 p-5 rounded-2xl border border-white/5 text-gray-200 text-sm leading-relaxed whitespace-pre-line mb-6 shadow-inner relative overflow-hidden">
                <div class="absolute top-0 right-0 w-1 h-full bg-white/10"></div>
                ${data.content}
                
                ${data.link ? `
                    <div class="mt-4 pt-4 border-t border-white/5">
                        <a href="${data.link}" target="_blank" class="text-b-primary hover:text-white transition-colors flex items-center gap-2 font-bold bg-white/5 p-3 rounded-lg border border-white/5 hover:bg-b-primary hover:border-b-primary group">
                            <div class="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center group-hover:bg-white/20"><i class="fas fa-link"></i></div>
                            <span>فتح الرابط المرفق</span>
                            <i class="fas fa-external-link-alt text-xs mr-auto opacity-50"></i>
                        </a>
                    </div>
                ` : ''}

                ${expiryHtml}
            </div>

            <div class="border-t border-white/10 pt-4">
                <h4 class="text-sm font-bold text-white mb-4 flex items-center justify-between">
                    <span class="flex items-center gap-2"><i class="fas fa-eye text-gray-500"></i> حالة المشاهدة</span>
                    <span class="text-xs text-gray-500 font-mono bg-white/5 px-2 py-1 rounded">${seenIds.filter(id => id !== creatorId).length} / ${teamMembersCache.filter(m => m.uid !== creatorId).length}</span>
                </h4>
                <div class="max-h-[250px] overflow-y-auto custom-scroll bg-black/20 rounded-2xl border border-white/5 p-2 shadow-inner">
                    ${membersHtml}
                </div>
            </div>
        `;

    } catch (e) {
        console.error(e);
        content.innerHTML = `<p class="text-red-400 text-center py-10">حدث خطأ في تحميل التفاصيل.</p>`;
    }
};

window.closePostDetailModal = () => {
    document.getElementById('post-detail-modal').classList.add('hidden');
};

// ==========================================
// 7. UTILS
// ==========================================
function resolveImageUrl(url, type = 'user') {
    if (!url || url.trim() === "" || url === "null" || url === "undefined") {
        return '../assets/icons/icon.jpg';
    }
    try {
        if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
            const idMatch = url.match(/\/d\/([-\w]{25,})/) || url.match(/id=([-\w]{25,})/);
            if (idMatch && idMatch[1]) {
                return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
            }
        }
        if (url.includes('dropbox.com')) {
            return url.replace('?dl=0', '?raw=1');
        }
    } catch (e) { return '../assets/icons/icon.jpg'; }
    return url;
}