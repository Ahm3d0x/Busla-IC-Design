/**
 * ------------------------------------------------------------------
 * BUSLA MASTER API v5.0 (Header-Based Dynamic Logic)
 * ------------------------------------------------------------------
 * ميزة هذا الإصدار:
 * - لا يعتمد على ترتيب الأعمدة (A, B, C).
 * - يعتمد على أسماء رؤوس الأعمدة (Headers) فقط.
 * - يمكنك نقل الأعمدة أو إضافة أعمدة جديدة دون كسر الكود.
 * ------------------------------------------------------------------
 */

var YOUTUBE_API_KEY = "AIzaSyCeiKc-MsUQs3TDOC7yvqD_Qx3mayLqY6Q"; // تأكد من المفتاح

/* ==========================================================
   ENTRY POINT
========================================================== */

function doGet(e) {
  var p = e.parameter;
  var action = p.action;

  try {
    // Read Actions
    if (action === "getAllContent") return getHomeContent();
    if (action === "getPhases") return getPhases();
    if (action === "getCourses") return getCourses(p.phase_id);
    if (action === "getCourseContent") return getCourseContent(p.course_id);
    if (action === "getQuizData") return getQuizRandomized(p.quiz_id);
    if (action === "getProjectDetails") return getProject(p.project_id);
 if (action === "getFullCurriculum") return getFullCurriculum();
    // Write Actions
    if (action === "syncCourseContent") return syncSingleCourse(p.course_id);
    if (action === "syncAllCourses") return syncAllCourses();

    return sendJSON({ status: "error", message: "Invalid action" });

  } catch (err) {
    return sendJSON({ status: "error", message: err.toString(), stack: err.stack });
  }
}


function syncSingleCourse(courseId) {
  var ss = SpreadsheetApp.getActive();
  
  // 1. Read Course Data
  var courses = readSheet(ss, "Courses");
  var course = courses.find(c => String(c['course_id']) === String(courseId));
  
  console.log("Syncing CourseID: " + courseId);
  
  if (!course) throw new Error("Course ID not found in sheet");
  if (!course['playlist_id']) throw new Error("No Playlist ID for this course");

  // 2. Fetch from YouTube
  var playlistVideos = fetchPlaylistVideosOptimized(course['playlist_id']);
  
  // 3. Prepare Sheet & Headers
  var contentSheet = ss.getSheetByName("Course_Contents");
  var contentHeaderMap = getHeaderMap(contentSheet);
  
  var allContent = readSheet(ss, "Course_Contents");
  var courseContent = allContent.filter(c => String(c['course_id']) === String(courseId));

  var existingMap = {};
  courseContent.forEach(c => existingMap[c['video_id']] = c);

  // --- FIX START: Calculate Max ID ONCE before loop ---
  var currentMaxId = 0;
  allContent.forEach(r => {
    var id = Number(r['content_id']);
    if (!isNaN(id) && id > currentMaxId) currentMaxId = id;
  });
  // ----------------------------------------------------

  // 4. Processing Loop
  playlistVideos.forEach((v, index) => {
    
    var dataToWrite = {
      'title': v.title,
      'order_index': index + 1,
      'Duration': v.duration,
      'status': "active",
      'last_modified_at': new Date(),
      'last_modified_by': 'system_sync'
    };

    if (existingMap[v.video_id]) {
      // === UPDATE Existing ===
      updateRowByHeader(contentSheet, existingMap[v.video_id]._row, dataToWrite, contentHeaderMap);
      
    } else {
      // === CREATE New ===
      
      // Increment ID for THIS specific row
      currentMaxId++; 
      
      dataToWrite['content_id'] = currentMaxId; // Assign Unique ID
      dataToWrite['course_id'] = courseId;      // Constant Course ID
      dataToWrite['type'] = 'video';
      dataToWrite['Author'] = v.author;
      dataToWrite['Link Title'] = 'YouTube';
      dataToWrite['video_id'] = v.video_id;
      dataToWrite['source_type'] = 'youtube';
      dataToWrite['created_at'] = new Date();
      dataToWrite['created_by'] = 'system';
      
      appendRowByHeader(contentSheet, dataToWrite, contentHeaderMap);
    }
  });

  // Update Course Timestamp
  var courseHeaderMap = getHeaderMap(ss.getSheetByName("Courses"));
  updateRowByHeader(ss.getSheetByName("Courses"), course._row, {
    'last_sync_at': new Date()
  }, courseHeaderMap);

  return sendJSON({ status: "success", message: "Synced " + playlistVideos.length + " videos", course_id: courseId });
}
/* ==========================================================
   SYNC ALL COURSES (BATCH PROCESSOR)
========================================================== */

function syncAllCourses() {
  var ss = SpreadsheetApp.getActive();
  
  // 1. قراءة شيت الكورسات ديناميكياً
  var courses = readSheet(ss, "Courses");
  var results = [];
  
  // 2. اللف على كل كورس
  courses.forEach(c => {
    // قراءة القيم باستخدام أسماء الأعمدة (بغض النظر عن ترتيبها)
    // بنحول القيمة لـ String ونخليها Lowercase عشان نتفادى مشاكل الكتابة (True/TRUE/true)
    var autoSync = String(c['auto_sync']).toLowerCase();
    var playlistId = c['playlist_id'];
    var courseId = c['course_id'];

    // الشرط: لازم يكون فيه Playlist ID ويكون Auto Sync شغال
    if (playlistId && (autoSync === "true" || autoSync === "1")) {
      try {
        console.log("Starting sync for Course: " + courseId);
        
        // استدعاء دالة الكورس الواحد (اللي إحنا صلحناها)
        // هي هتقوم بالواجب (حساب ID، جلب الفيديوهات، التحديث)
        var result = syncSingleCourse(courseId);
        
        // تسجيل النجاح
        var resObj = JSON.parse(result.getContent()); // فك JSON الناتج
        results.push("✅ Course " + courseId + ": " + resObj.message);
        
      } catch (e) {
        // تسجيل الفشل بدون إيقاف باقي الكورسات
        console.error("Failed Course " + courseId + ": " + e.message);
        results.push("❌ Error Course " + courseId + ": " + e.message);
      }
    } else {
      // لو الكورس مش مؤهل للـ Sync (اختياري: ممكن نشيل السطر ده عشان اللوج ميبقاش طويل)
      // results.push("Start Skipped: " + courseId);
    }
  });
  
  // 3. إرجاع تقرير كامل
  return sendJSON({ 
    status: "success", 
    total_processed: results.length,
    log: results 
  });
}

/* ==========================================================
   CORE HELPER FUNCTIONS (THE MAGIC SAUCE) 🧠
   هذه الدوال هي المسؤولة عن التعامل بالأسماء بدلاً من الأرقام
========================================================== */

/**
 * 1. إنشاء خريطة تربط اسم العمود برقمه
 * Returns: { 'course_id': 1, 'title': 2, ... }
 */
function getHeaderMap(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return {};
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach((h, i) => {
    if (h) map[String(h).trim()] = i + 1; // Col Index starts at 1
  });
  return map;
}

/**
 * 2. تحديث صف بناءً على أسماء الأعمدة
 */
function updateRowByHeader(sheet, rowIndex, dataObject, headerMap) {
  Object.keys(dataObject).forEach(key => {
    var colIndex = headerMap[key];
    if (colIndex) { // لو العمود موجود في الشيت، نحدثه
      sheet.getRange(rowIndex, colIndex).setValue(dataObject[key]);
    } else {
      // لو العمود مش موجود، نتجاهل القيمة عشان الكود ما يضربش
      // console.log("Column not found: " + key); 
    }
  });
}

/**
 * 3. إضافة صف جديد بترتيب الأعمدة الحالي
 */
function appendRowByHeader(sheet, dataObject, headerMap) {
  var lastCol = sheet.getLastColumn();
  var rowData = new Array(lastCol); // مصفوفة فارغة بنفس عدد الأعمدة
  
  // نملأ المصفوفة في الأماكن الصح
  Object.keys(headerMap).forEach(headerName => {
    var colIndex = headerMap[headerName]; // رقم العمود (1-based)
    var arrayIndex = colIndex - 1; // (0-based) للمصفوفة
    
    if (dataObject.hasOwnProperty(headerName)) {
      rowData[arrayIndex] = dataObject[headerName];
    } else {
      rowData[arrayIndex] = ""; // لو مفيش قيمة، سيبها فاضية
    }
  });
  
  sheet.appendRow(rowData);
}

/**
 * 4. قراءة الشيت وتحويله لـ Array of Objects
 */
function readSheet(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  var headers = data[0]; // الصف الأول هو العناوين
  
  return data.slice(1).map((row, rowIndex) => {
    var obj = { '_row': rowIndex + 2 }; // نحفظ رقم الصف الحقيقي
    headers.forEach((header, colIndex) => {
      if(header) {
         obj[String(header).trim()] = row[colIndex];
      }
    });
    return obj;
  });
}

/* ==========================================================
   YOUTUBE & UTILS
========================================================== */

function fetchPlaylistVideosOptimized(playlistId) {
  var videos = [];
  var pageToken = "";
  do {
    var url = "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=" + playlistId + "&maxResults=50&pageToken=" + pageToken + "&key=" + YOUTUBE_API_KEY;
    var res = JSON.parse(UrlFetchApp.fetch(url).getContentText());
    
    var videoIds = [];
    var itemsMap = {};
    
    if(res.items) {
      res.items.forEach(i => {
        var vid = i.contentDetails.videoId;
        videoIds.push(vid);
        itemsMap[vid] = { video_id: vid, title: i.snippet.title, author: i.snippet.videoOwnerChannelTitle, duration: "00:00" };
      });

      if (videoIds.length > 0) {
        var statsUrl = "https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=" + videoIds.join(",") + "&key=" + YOUTUBE_API_KEY;
        var statsRes = JSON.parse(UrlFetchApp.fetch(statsUrl).getContentText());
        if(statsRes.items) {
           statsRes.items.forEach(v => {
             if (itemsMap[v.id]) itemsMap[v.id].duration = parseISO8601Duration(v.contentDetails.duration);
           });
        }
      }
      videoIds.forEach(vid => videos.push(itemsMap[vid]));
    }
    pageToken = res.nextPageToken || "";
  } while (pageToken);
  return videos;
}

function parseISO8601Duration(duration) {
  var match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if(!match) return "00:00";
  var hours = (parseInt(match[1]) || 0);
  var minutes = (parseInt(match[2]) || 0);
  var seconds = (parseInt(match[3]) || 0);
  var str = "";
  if (hours > 0) str += (hours < 10 ? "0" + hours : hours) + ":";
  str += (minutes < 10 ? "0" + minutes : minutes) + ":";
  str += (seconds < 10 ? "0" + seconds : seconds);
  return str;
}

function generateNextId(allContent) {
  var maxId = 0;
  allContent.forEach(r => {
    var id = Number(r['content_id']); // استخدام الاسم بدلاً من الرقم
    if (!isNaN(id) && id > maxId) maxId = id;
  });
  return maxId + 1;
}

function getHomeContent() {
  var ss = SpreadsheetApp.getActive();
  return sendJSON({
    board_Roadmap: readSheet(ss, "board_Roadmap"),
    board_Experts: readSheet(ss, "board_Experts"),
    board_Tools: readSheet(ss, "board_Tools")
  });
}

// Read functions wrappers
function getPhases() { return sendJSON({status:"success", data: readSheet(SpreadsheetApp.getActive(), "phase").filter(x => x.is_active == true)}); }
function getCourses(pid) { 
  var d = readSheet(SpreadsheetApp.getActive(), "Courses").filter(x => x.is_active == true);
  if(pid) d = d.filter(x => x.phase_id == pid);
  return sendJSON({status:"success", data: d});
}
function getCourseContent(cid) {
  var d = readSheet(SpreadsheetApp.getActive(), "Course_Contents").filter(x => x.course_id == cid && x.status != "removed");
  d.sort((a,b) => a.order_index - b.order_index);
  return sendJSON({status:"success", data: d});
}
function getQuizRandomized(qid) {
  var qs = readSheet(SpreadsheetApp.getActive(), "Quiz_Questions").filter(x => x.quiz_id == qid);
  var qmeta = readSheet(SpreadsheetApp.getActive(), "Quizzes").find(x => x.quiz_id == qid);
  return sendJSON({status:"success", meta: qmeta, questions: qs});
}
function getProject(pid) {
  return sendJSON({status:"success", data: readSheet(SpreadsheetApp.getActive(), "Projects").find(x => x.project_id == pid)});
}

function sendJSON(d) {
  return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON);
}

// Manual Test Function
function testSyncManually() {
  // جرب برقم كورس حقيقي عندك
  console.log(syncSingleCourse(3));
}

/* ==========================================================
   NEW ENDPOINT: GET FULL CURRICULUM TREE (Optimized)
   Author: AI Assistant
   Purpose: Returns a nested structure (Phase -> Courses -> Sections)
   Optimization: Sends minimal data for structure, reduces client-side processing.
========================================================== */

function getFullCurriculum() {
  var ss = SpreadsheetApp.getActive();
  
  // 1. Read Raw Data (Active Only)
  var phases = readSheet(ss, "phase").filter(function(x) { return x.is_active == true || x.is_active == "True"; });
  var courses = readSheet(ss, "Courses").filter(function(x) { return x.is_active == true || x.is_active == "True"; });
  
  // 2. Build the Tree
  // تحويل البيانات إلى هيكل شجري لتسهيل العرض وتقليل حجم البيانات المرسلة
  var tree = phases.map(function(phase) {
    
    // أ. جلب الكورسات التابعة لهذه المرحلة
    var phaseCourses = courses.filter(function(c) { 
      return String(c.phase_id) === String(phase.phase_id) && (c.type === "Course" || c.type === "genral" || !c.type); 
    });

    // ب. لكل كورس، جلب السكاشن التابعة له
    var coursesWithSections = phaseCourses.map(function(course) {
      var sections = courses.filter(function(s) { 
        return String(s.related_with) === String(course.course_id) && s.type === "Section"; 
      });
      
      // نرجع الكورس مع سكاشنه (بيانات خفيفة للعرض فقط)
      return {
        id: String(course.course_id),
        title: course.title,
        desc: course.description,
        img: course.image_url,
        time: course["Module Time"], // استخدام الاسم الدقيق للعمود
        sections: sections.map(function(sec) {
          return {
            id: String(sec.course_id),
            title: sec.title,
            type: "section"
          };
        })
      };
    });

    // ج. إرجاع المرحلة كاملة
    return {
      id: String(phase.phase_id),
      title: phase.title,
      desc: phase.description,
      note: phase.Note,
      items: coursesWithSections
    };
  });

  return sendJSON({ status: "success", tree: tree });
}
