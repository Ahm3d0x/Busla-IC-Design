/**
 * ------------------------------------------------------------------
 * BUSLA MASTER API v6.0 (Unified & Optimized)
 * ------------------------------------------------------------------
 * المميزات:
 * 1. جلب البيانات دفعة واحدة (Full Fetch) لتقليل الطلبات.
 * 2. التعامل الديناميكي مع أسماء الأعمدة (Header-Based).
 * 3. حساب الإحصائيات (عدد الفيديوهات، المدة) في السيرفر.
 * 4. دعم المزامنة (Sync) مع يوتيوب.
 * ------------------------------------------------------------------
 */

var YOUTUBE_API_KEY = "AIzaSyCeiKc-MsUQs3TDOC7yvqD_Qx3mayLqY6Q"; // مفتاح API الخاص بك
var FIREBASE_AUTH_URL = "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=" + "AIzaSyAsN0YsS3PFIbi-vRp1GK5SiqPqXGeUkG4";
/* ==========================================================
   ENTRY POINT (نقطة الدخول)
========================================================== */

function doGet(e) {
  var p = e.parameter;
  var action = p.action;

  try {
    // --- دوال القراءة (Read Actions) ---
    if (action === "getFullCurriculum") return getFullDatabase(); // 🔥 الدالة الرئيسية الشاملة
    if (action === "getAllContent") return getHomeContent();
    if (action === "getPhases") return getPhases();
    if (action === "getCourses") return getCourses(p.phase_id);
    if (action === "getCourseContent") return getCourseContent(p.course_id);
    if (action === "getQuizData") return getQuizRandomized(p.quiz_id);
    if (action === "getProjectDetails") return getProject(p.project_id);
    
    // --- دوال الكتابة والمزامنة (Write/Sync Actions) ---
    if (action === "syncCourseContent") return syncSingleCourse(p.course_id);
    if (action === "syncAllCourses") return syncAllCourses();

    return sendJSON({ status: "error", message: "Invalid action request" });

  } catch (err) {
    return sendJSON({ status: "error", message: err.toString(), stack: err.stack });
  }
}

/* ==========================================================
   1. MEGA FUNCTION: FETCH ALL DATA 🚀 (الدالة الشاملة)
========================================================== */

function getFullDatabase() {
  var ss = SpreadsheetApp.getActive();
  
  // 1. قراءة جميع الجداول (باستخدام أسماء الأعمدة)
  var phases = readSheet(ss, "phase");
  var courses = readSheet(ss, "Courses");
  var contents = readSheet(ss, "Course_Contents");
  var projects = readSheet(ss, "Projects");
  var quizzes = readSheet(ss, "Quizzes");

  // 2. تصفية العناصر النشطة
  var activePhases = phases.filter(function(x) { return isActive(x.is_active); });
  var activeCourses = courses.filter(function(x) { return isActive(x.is_active); });

  // 3. حساب الإحصائيات للكورسات (عدد الفيديوهات، المدة، المحاضر)
  var courseStats = {}; 
  contents.forEach(function(item) {
    if (String(item.status).toLowerCase() === "removed") return;
    var cid = String(item.course_id);
    if (!courseStats[cid]) {
      courseStats[cid] = { count: 0, seconds: 0, author: item.Author || "" };
    }
    if (item.type === 'video') {
      courseStats[cid].count++;
      courseStats[cid].seconds += parseDurationToSeconds(item.Duration);
    }
    if (!courseStats[cid].author && item.Author) {
      courseStats[cid].author = item.Author;
    }
  });

  // دمج الإحصائيات مع الكورسات
  var enrichedCourses = activeCourses.map(function(course) {
    var stats = courseStats[String(course.course_id)] || { count: 0, seconds: 0, author: "غير محدد" };
    course.real_video_count = stats.count;
    course.real_total_duration = formatSecondsToTime(stats.seconds);
    course.instructor = stats.author;
    return course;
  });

  // 4. بناء الهيكل الشجري (Tree Structure) للواجهة
  var tree = activePhases.map(function(phase) {
    // الكورسات التابعة للمرحلة
    var phaseCourses = enrichedCourses.filter(function(c) { 
      return String(c.phase_id).trim() === String(phase.phase_id).trim() && 
             (c.type === "Course" || c.type === "genral" || !c.type); 
    });

    // إضافة السكاشن لكل كورس
    var coursesWithSections = phaseCourses.map(function(course) {
      var sections = enrichedCourses.filter(function(s) { 
        return String(s.related_with).trim() === String(course.course_id).trim() && s.type === "Section"; 
      });
      
      return {
        id: String(course.course_id),
        title: course.title,
        desc: course.description,
        img: course.image_url,
        track: course.what_you_will_learn,
        module_time: course["Module Time"] || course.module_time,
        real_video_count: course.real_video_count,
        real_total_duration: course.real_total_duration,
        instructor: course.instructor,
        sections: sections.map(function(sec) {
          return { 
            id: String(sec.course_id), 
            title: sec.title,
            real_video_count: sec.real_video_count,
            real_total_duration: sec.real_total_duration 
          };
        })
      };
    });

    return {
      id: String(phase.phase_id),
      title: phase.title,
      module_time: phase["Module Time"] || phase.module_time,
      description: phase.description,
      courses: coursesWithSections
    };
  });

  // 5. إرجاع البيانات مجمعة
  return sendJSON({
    status: "success",
    tree: tree,           // الهيكل الشجري
    phases: activePhases, // بيانات المراحل الخام
    courses: enrichedCourses, // بيانات الكورسات (مع الإحصائيات)
    contents: contents,   // المحتوى (لمعرفة الفيديوهات عند الطلب)
    projects: projects,   // بيانات المشاريع
    quizzes: quizzes      // بيانات الكويزات
  });
}

/* ==========================================================
   2. HELPER FUNCTIONS (دوال مساعدة)
========================================================== */

// التحقق من حالة التنشيط بمرونة
function isActive(val) {
  var s = String(val).toLowerCase().trim();
  return s === "true" || s === "1" || s === "yes" || s === "active" || s === "";
}

// قراءة الشيت وتحويله لمصفوفة كائنات (Array of Objects)
function readSheet(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  var headers = data[0]; // الصف الأول هو العناوين
  
  return data.slice(1).map((row, rowIndex) => {
    var obj = { '_row': rowIndex + 2 }; // رقم الصف
    headers.forEach((header, colIndex) => {
      if(header) obj[String(header).trim()] = row[colIndex];
    });
    return obj;
  });
}

// خريطة الأعمدة (للتحديث)
function getHeaderMap(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return {};
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach((h, i) => { if (h) map[String(h).trim()] = i + 1; });
  return map;
}

// تحديث صف
function updateRowByHeader(sheet, rowIndex, dataObject, headerMap) {
  Object.keys(dataObject).forEach(key => {
    var colIndex = headerMap[key];
    if (colIndex) sheet.getRange(rowIndex, colIndex).setValue(dataObject[key]);
  });
}

// إضافة صف
function appendRowByHeader(sheet, dataObject, headerMap) {
  var lastCol = sheet.getLastColumn();
  var rowData = new Array(lastCol);
  Object.keys(headerMap).forEach(headerName => {
    var colIndex = headerMap[headerName];
    if (dataObject.hasOwnProperty(headerName)) rowData[colIndex - 1] = dataObject[headerName];
    else rowData[colIndex - 1] = "";
  });
  sheet.appendRow(rowData);
}

// إرسال JSON
function sendJSON(d) {
  return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON);
}

// تحويل الوقت لثواني
function parseDurationToSeconds(duration) {
  if (!duration) return 0;
  if (duration instanceof Date) {
    return duration.getHours() * 3600 + duration.getMinutes() * 60 + duration.getSeconds();
  }
  var parts = String(duration).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// تحويل الثواني لوقت مقروء
function formatSecondsToTime(totalSeconds) {
  if (!totalSeconds) return "00:00:00";
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = Math.floor(totalSeconds % 60);
  return (h > 0 ? h + ":" : "") + (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
}

/* ==========================================================
   3. YOUTUBE SYNC & OTHER ENDPOINTS (الوظائف القديمة)
========================================================== */

function syncSingleCourse(courseId) {
  var ss = SpreadsheetApp.getActive();
  var courses = readSheet(ss, "Courses");
  var course = courses.find(c => String(c['course_id']) === String(courseId));
  
  if (!course || !course['playlist_id']) return sendJSON({status:"error", message:"Course or Playlist not found"});

  var playlistVideos = fetchPlaylistVideosOptimized(course['playlist_id']);
  var contentSheet = ss.getSheetByName("Course_Contents");
  var contentHeaderMap = getHeaderMap(contentSheet);
  var allContent = readSheet(ss, "Course_Contents");
  
  // حساب Max ID
  var currentMaxId = 0;
  allContent.forEach(r => { var id = Number(r['content_id']); if (!isNaN(id) && id > currentMaxId) currentMaxId = id; });

  // خريطة المحتوى الموجود
  var existingMap = {};
  allContent.filter(c => String(c['course_id']) === String(courseId)).forEach(c => existingMap[c['video_id']] = c);

  playlistVideos.forEach((v, index) => {
    var data = {
      'title': v.title, 'order_index': index + 1, 'Duration': v.duration,
      'status': "active", 'last_modified_at': new Date(), 'last_modified_by': 'system_sync'
    };

    if (existingMap[v.video_id]) {
      updateRowByHeader(contentSheet, existingMap[v.video_id]._row, data, contentHeaderMap);
    } else {
      currentMaxId++;
      data['content_id'] = currentMaxId;
      data['course_id'] = courseId;
      data['type'] = 'video';
      data['Author'] = v.author;
      data['Link Title'] = 'YouTube';
      data['video_id'] = v.video_id;
      data['created_at'] = new Date();
      appendRowByHeader(contentSheet, data, contentHeaderMap);
    }
  });

  return sendJSON({ status: "success", message: "Synced " + playlistVideos.length + " videos" });
}

function fetchPlaylistVideosOptimized(playlistId) {
  var videos = [];
  var pageToken = "";
  do {
    var url = "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=" + playlistId + "&maxResults=50&pageToken=" + pageToken + "&key=" + YOUTUBE_API_KEY;
    try {
      var res = JSON.parse(UrlFetchApp.fetch(url).getContentText());
      if(res.items) {
        var videoIds = res.items.map(i => i.contentDetails.videoId).join(",");
        var statsUrl = "https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=" + videoIds + "&key=" + YOUTUBE_API_KEY;
        var statsRes = JSON.parse(UrlFetchApp.fetch(statsUrl).getContentText());
        var durMap = {};
        if(statsRes.items) statsRes.items.forEach(v => durMap[v.id] = parseISO8601Duration(v.contentDetails.duration));

        res.items.forEach(i => {
          videos.push({
            video_id: i.contentDetails.videoId,
            title: i.snippet.title,
            author: i.snippet.videoOwnerChannelTitle,
            duration: durMap[i.contentDetails.videoId] || "00:00"
          });
        });
      }
      pageToken = res.nextPageToken || "";
    } catch(e) { pageToken = ""; }
  } while (pageToken);
  return videos;
}

function parseISO8601Duration(duration) {
  var match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if(!match) return "00:00";
  var h = (parseInt(match[1]) || 0);
  var m = (parseInt(match[2]) || 0);
  var s = (parseInt(match[3]) || 0);
  return (h > 0 ? (h < 10 ? "0"+h : h) + ":" : "") + (m < 10 ? "0"+m : m) + ":" + (s < 10 ? "0"+s : s);
}

function syncAllCourses() {
  var ss = SpreadsheetApp.getActive();
  var courses = readSheet(ss, "Courses");
  var results = [];
  courses.forEach(c => {
    var autoSync = String(c['auto_sync']).toLowerCase();
    if (c['playlist_id'] && (autoSync === "true" || autoSync === "1")) {
      try {
        syncSingleCourse(c['course_id']);
        results.push("✅ Synced: " + c['course_id']);
      } catch (e) {
        results.push("❌ Error " + c['course_id'] + ": " + e.message);
      }
    }
  });
  return sendJSON({ status: "success", log: results });
}

// --- دوال قراءة فردية (للتوافق) ---
function getHomeContent() {
  var ss = SpreadsheetApp.getActive();
  return sendJSON({
    board_Roadmap: readSheet(ss, "board_Roadmap"),
    board_Experts: readSheet(ss, "board_Experts"),
    board_Tools: readSheet(ss, "board_Tools")
  });
}
function getPhases() { return sendJSON({status:"success", data: readSheet(SpreadsheetApp.getActive(), "phase").filter(x => isActive(x.is_active))}); }
function getCourses(pid) { 
  var ss = SpreadsheetApp.getActive();
  var courses = readSheet(ss, "Courses").filter(x => isActive(x.is_active));
  if(pid) courses = courses.filter(x => String(x.phase_id) == String(pid));
  return sendJSON({status:"success", data: courses});
}
function getCourseContent(cid) {
  var d = readSheet(SpreadsheetApp.getActive(), "Course_Contents").filter(x => String(x.course_id) == String(cid) && x.status != "removed");
  d.sort((a,b) => a.order_index - b.order_index);
  return sendJSON({status:"success", data: d});
}
function getQuizRandomized(qid) {
  var qs = readSheet(SpreadsheetApp.getActive(), "Quiz_Questions").filter(x => String(x.quiz_id) == String(qid));
  var qmeta = readSheet(SpreadsheetApp.getActive(), "Quizzes").find(x => String(x.quiz_id) == String(qid));
  return sendJSON({status:"success", meta: qmeta, questions: qs});
}
function getProject(pid) {
  var proj = readSheet(SpreadsheetApp.getActive(), "Projects").find(x => String(x.project_id) == String(pid));
  return sendJSON({status:"success", data: proj});
}

/* ==========================================================
   4. CUSTOM EMAIL SYSTEM (نظام الإيميلات المخصص - جديد) 🚀
========================================================== */

// هذه الدالة لاستقبال طلبات الـ POST من الموقع (عند التسجيل)
function doPost(e) {
  try {
    // استقبال البيانات المرسلة من الفرونت إند
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    // توجيه الطلب للدالة المناسبة
    if (action === "sendVerificationEmail") {
      return sendCustomVerificationEmail(data.email, data.name);
    }
    if (action === "resetPassword") {
    return handlePasswordReset(data.email, data.name);
  }
    
    return sendJSON({status: "error", message: "Invalid action in doPost"});
  } catch (err) {
    return sendJSON({status: "error", message: err.toString()});
  }
}

// الدالة المسؤولة عن توليد الرابط وإرساله
function sendCustomVerificationEmail(email, name) {
  try {
    // 1. الاتصال بـ Firebase بصلاحيات الأدمن
    var service = getFirebaseService();
    if (!service.hasAccess()) {
      return sendJSON({status: "error", message: "Auth Failed: " + service.getLastError()});
    }
    
    // 2. طلب رابط تفعيل (OobLink) من Firebase API
    var projectId = PropertiesService.getScriptProperties().getProperty("FIREBASE_PROJECT_ID");
    var url = "https://identitytoolkit.googleapis.com/v1/projects/" + projectId + "/accounts:sendOobCode";
    
    var payload = {
      "requestType": "VERIFY_EMAIL",
      "email": email,
      "returnOobLink": true // 🔥 نطلب الرابط فقط لنرسله نحن
    };
    
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + service.getAccessToken() },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    var result = JSON.parse(response.getContentText());
    if (result.error) throw new Error(result.error.message);
    
    var verificationLink = result.oobLink; // 🔗 الرابط وصل!

    // 3. تجهيز الإيميل (التصميم الأسود الفخم)
    var emailBody = getEmailTemplate(name, verificationLink);

    // 4. الإرسال الفعلي
    MailApp.sendEmail({
      to: email,
      subject: "🚀 مرحباً بك في بوصلة! يرجى تفعيل حسابك",
      htmlBody: emailBody,
      name: "Busla Team" // اسم المرسل
    });

    return sendJSON({status: "success", message: "Email sent successfully"});

  } catch (err) {
    return sendJSON({status: "error", message: "Sending Failed: " + err.toString()});
  }
}
function handlePasswordReset(email, name) {
  try {
    // 1. الاتصال بـ Firebase بصلاحيات المفتاح الجديد (الأدمن)
    var service = getFirebaseService();
    if (!service.hasAccess()) {
      return sendJSON({status: "error", message: "Auth Failed: " + service.getLastError()});
    }

    // 2. طلب رابط الريست باستخدام الـ Admin Token لضمان القبول
    var projectId = PropertiesService.getScriptProperties().getProperty("FIREBASE_PROJECT_ID");
    var url = "https://identitytoolkit.googleapis.com/v1/projects/" + projectId + "/accounts:sendOobCode";
    
    var payload = {
      "requestType": "PASSWORD_RESET",
      "email": email,
      "returnOobLink": true 
    };

    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + service.getAccessToken() },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var result = JSON.parse(response.getContentText());
    if (result.error) throw new Error(result.error.message);

    var resetLink = result.oobLink; 

    // 3. تصميم الإيميل (يفضل استخدام التصميم الأسود الموحد للمنصة)
    var htmlBody = `
      <div style="direction:rtl; text-align:right; font-family: sans-serif; background-color:#000; padding:20px; color:#fff;">
        <div style="max-width:500px; margin:0 auto; background:#111; padding:30px; border-radius:15px; border:1px solid #333;">
          <h2 style="color:#006A67;">طلب تغيير كلمة المرور 🔒</h2>
          <p>أهلاً ${name || 'يا بطل'}،</p>
          <p>تلقينا طلباً لتغيير كلمة المرور الخاصة بحسابك في منصة <strong>بوصلة</strong>.</p>
          <div style="text-align:center; margin:30px 0;">
            <a href="${resetLink}" style="background-color:#006A67; color:#fff; padding:15px 30px; text-decoration:none; border-radius:10px; font-weight:bold;">تغيير كلمة المرور</a>
          </div>
          <p style="color:#666; font-size:12px;">إذا لم تطلب هذا التغيير، يمكنك تجاهل هذه الرسالة بأمان.</p>
        </div>
      </div>
    `;

    // 4. الإرسال
    GmailApp.sendEmail(email, "تغيير كلمة المرور - بوصلة", "", {
      htmlBody: htmlBody,
      name: "Busla LMS Team"
    });

    return sendJSON({ status: "success", message: "Reset email sent" });

  } catch (e) {
    return sendJSON({ status: "error", message: e.toString() });
  }
}
// --- إعداد خدمة OAuth2 (للاتصال الآمن) ---
function getFirebaseService() {
  var props = PropertiesService.getScriptProperties();
  return OAuth2.createService('Firebase')
    .setTokenUrl('https://oauth2.googleapis.com/token')
    .setPrivateKey(props.getProperty('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'))
    .setIssuer(props.getProperty('FIREBASE_CLIENT_EMAIL'))
    .setPropertyStore(props)
    .setScope('https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/cloud-platform');
}

// --- تصميم الإيميل (HTML) ---
function getEmailTemplate(name, link) {
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head><style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #000000; margin: 0; padding: 0; }
      .btn { display: inline-block; background-color: #006A67; color: #ffffff !important; text-decoration: none; padding: 15px 40px; border-radius: 12px; font-weight: bold; margin-top: 20px; }
    </style></head>
    <body style="background-color:#000; color:#fff; padding:20px;">
      <div style="max-width:600px; margin:0 auto; background-color:#111; border:1px solid #333; border-radius:16px; overflow:hidden;">
        <div style="background:linear-gradient(90deg, #006A67, #22C45D); padding:30px; text-align:center;">
          <h1 style="color:#fff; margin:0; font-size:28px;">BUSLA LMS</h1>
        </div>
        <div style="padding:40px 30px; text-align:center; color:#e0e0e0;">
          <h2 style="color:#fff; margin-bottom:20px;">أهلاً بك، ${name}! 👋</h2>
          <p style="color:#b0b0b0; font-size:16px; line-height:1.6;">
            شكراً لانضمامك إلى منصة <strong>بوصلة</strong>.<br>
            أنت على بعد خطوة واحدة من بدء رحلتك في عالم Digital IC Design.
          </p>
          <a href="${link}" class="btn">تفعيل الحساب الآن</a>
          <p style="margin-top:30px; font-size:12px; color:#555;">
            إذا لم يعمل الزر، انسخ الرابط التالي:<br>
            <a href="${link}" style="color:#006A67;">${link}</a>
          </p>
        </div>
        <div style="background-color:#0a0a0a; padding:20px; text-align:center; font-size:12px; color:#666; border-top:1px solid #222;">
          &copy; 2026 Busla LMS. جميع الحقوق محفوظة.
        </div>
      </div>
    </body>
    </html>
  `;
}
function testEmailSystem() {
  var testEmail = "ahm3d.m.attia@gmail.com"; 
  var testName = "Ahmed Attia (Test)";

  console.log("⏳ جاري الاتصال بـ Firebase وتوليد الرابط...");

  try {
    // 1. استدعاء الخدمة وجلب الرابط
    var service = getFirebaseService();
    if (!service.hasAccess()) throw new Error("Auth Failed");

    var projectId = PropertiesService.getScriptProperties().getProperty("FIREBASE_PROJECT_ID");
    var url = "https://identitytoolkit.googleapis.com/v1/projects/" + projectId + "/accounts:sendOobCode";
    
    var payload = { "requestType": "VERIFY_EMAIL", "email": testEmail, "returnOobLink": true };
    
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + service.getAccessToken() },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var result = JSON.parse(response.getContentText());
    
    if (result.oobLink) {
      // ✅ النجاح الحقيقي: الرابط وصل!
      console.log("✅✅✅ تم توليد الرابط بنجاح! ✅✅✅");
      console.log("---------------------------------------------------");
      console.log("🔗 رابط التفعيل (اضغط عليه لتفعيل الحساب):");
      console.log(result.oobLink); // <--- هنا الرابط هيظهرلك
      console.log("---------------------------------------------------");
      
      // محاولة إرسال الإيميل (حتى لو فشلت، الرابط معاك)
      try {
        var emailBody = getEmailTemplate(testName, result.oobLink);
        GmailApp.sendEmail(testEmail, "تفعيل حساب بوصلة (Test)", "", {htmlBody: emailBody, name: "Busla Team"});
        console.log("📧 تمت محاولة إرسال الإيميل عبر GmailApp.");
      } catch(e) {
        console.log("⚠️ فشل إرسال الإيميل لكن الرابط سليم: " + e.toString());
      }

    } else {
      console.log("❌ خطأ من فايربيس: " + JSON.stringify(result));
    }

  } catch (e) {
    console.log("🚨 Exception: " + e.toString());
  }
}