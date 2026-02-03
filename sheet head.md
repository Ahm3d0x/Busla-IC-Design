بناءً على الملف الذي قدّمته، يبدو أنك تريد تحويل وصف الأوراق (Sheets) وعناوين الأعمدة إلى ملف Markdown منظم. إليك تنظيم جميع الأوراق في ملف Markdown مفصل:

```markdown
# وثائق قاعدة بيانات LMS – محتوى الجداول (Sheets)

## 1. **Sheet Name: phase**

**وصف:** يحتوي على معلومات المراحل التعليمية.

| Column Name         | Data Type | Description                |
| ------------------- | --------- | -------------------------- |
| phase_id            |           | معرف المرحلة               |
| title               |           | عنوان المرحلة              |
| Module Time         |           | المدة المتوقعة للمرحلة     |
| Note                |           | ملاحظات إضافية             |
| description         |           | وصف تفصيلي للمرحلة         |
| prerequisites       |           | المتطلبات المسبقة          |
| what_you_will_learn |           | ما سوف تتعلمه              |
| image_url           |           | رابط صورة المرحلة          |
| is_active           |           | حالة التنشيط (نشط/غير نشط) |
| created_by          |           | منشئ السجل                 |
| created_at          |           | تاريخ الإنشاء              |
| last_modified_by    |           | آخر معدل                   |
| last_modified_at    |           | تاريخ آخر تعديل            |

---

## 2. **Sheet Name: Courses**

**وصف:** يحتوي على معلومات الدورات التعليمية.

| Column Name         | Data Type | Description                               |
| ------------------- | --------- | ----------------------------------------- |
| course_id           |           | معرف الدورة                               |
| phase_id            |           | معرف المرحلة التابعة لها                  |
| title               |           | عنوان الدورة                              |
| playlist_id         |           | معرف قائمة التشغيل (إن وجدت)              |
| auto_sync           |           | تطابق التحديثات تلقائيا (مثل True, False) |
| type                |           | نوع المحتوى (مثل Course, Section)         |
| related_with        |           | معرّف المحتوى المرتبط                     |
| Module Time         |           | المدة المتوقعة                            |
| Note                |           | ملاحظات إضافية                            |
| description         |           | وصف تفصيلي                                |
| prerequisites       |           | المتطلبات المسبقة                         |
| what_you_will_learn |           | ما سوف تتعلمه                             |
| tools_required      |           | الأدوات المطلوبة                          |
| image_url           |           | رابط صورة الدورة                          |
| is_active           |           | حالة التنشيط                              |
| created_by          |           | منشئ السجل                                |
| created_at          |           | تاريخ الإنشاء                             |
| last_modified_by    |           | آخر معدل                                  |
| last_modified_at    |           | تاريخ آخر تعديل                           |

---

## 3. **Sheet Name: Course_Contents**

**وصف:** يحتوي على محتوى كل دورة (فيديوهات، ملاحظات، روابط).

| Column Name        | Data Type | Description                       |
| ------------------ | --------- | --------------------------------- |
| content_id         |           | معرف المحتوى                      |
| course_id          |           | معرف الدورة التابع لها            |
| title              |           | عنوان المحتوى                     |
| type               |           | نوع المحتوى (فيديو، ملاحظات، إلخ) |
| order_index        |           | ترتيب المحتوى                     |
| Author             |           | المؤلف / المقدم                   |
| Link Title         |           | عنوان الرابط                      |
| video_id           |           | معرف الفيديو                      |
| Duration           |           | مدة المحتوى                       |
| Note               |           | ملاحظات                           |
| status             |           | حالة المحتوى                      |
| related_quiz_id    |           | معرف الاختبار المرتبط             |
| related_project_id |           | معرف المشروع المرتبط              |
| base_points        |           | النقاط الأساسية                   |
| created_by         |           | منشئ السجل                        |
| created_at         |           | تاريخ الإنشاء                     |
| last_modified_by   |           | آخر معدل                          |
| last_modified_at   |           | تاريخ آخر تعديل                   |

---

## 4. **Sheet Name: Quizzes**

**وصف:** يحتوي على معلومات الاختبارات.

| Column Name       | Data Type | Description         |
| ----------------- | --------- | ------------------- |
| quiz_id           |           | معرف الاختبار       |
| title             |           | عنوان الاختبار      |
| questions_to_show |           | عدد الأسئلة الظاهرة |
| passing_score     |           | درجة النجاح         |
| max_points        |           | أقصى نقاط           |
| created_by        |           | منشئ السجل          |
| created_at        |           | تاريخ الإنشاء       |
| last_modified_by  |           | آخر معدل            |
| last_modified_at  |           | تاريخ آخر تعديل     |

---

## 5. **Sheet Name: Quiz_Questions**

**وصف:** يحتوي على أسئلة الاختبارات.

| Column Name      | Data Type | Description             |
| ---------------- | --------- | ----------------------- |
| question_id      |           | معرف السؤال             |
| quiz_id          |           | معرف الاختبار التابع له |
| question_text    |           | نص السؤال               |
| option_a         |           | الخيار أ                |
| option_b         |           | الخيار ب                |
| option_c         |           | الخيار ج                |
| option_d         |           | الخيار د                |
| correct_answer   |           | الإجابة الصحيحة         |
| hint             |           | تلميح                   |
| created_by       |           | منشئ السجل              |
| created_at       |           | تاريخ الإنشاء           |
| last_modified_by |           | آخر معدل                |
| last_modified_at |           | تاريخ آخر تعديل         |

---

## 6. **Sheet Name: Projects**

**وصف:** يحتوي على معلومات المشاريع العملية.

| Column Name       | Data Type | Description               |
| ----------------- | --------- | ------------------------- |
| project_id        |           | معرف المشروع              |
| title             |           | عنوان المشروع             |
| description       |           | وصف المشروع               |
| requirements_url  |           | رابط متطلبات المشروع      |
| submission_method |           | طريقة التقديم             |
| max_points        |           | أقصى نقاط                 |
| rubric_json       |           | معايير التقييم بصيغة JSON |
| created_by        |           | منشئ السجل                |
| created_at        |           | تاريخ الإنشاء             |
| last_modified_by  |           | آخر معدل                  |
| last_modified_at  |           | تاريخ آخر تعديل           |

---

## 7. **Sheet Name: Admin_Logs**

**وصف:** يحتوي على سجلات إدارة النظام.

| Column Name  | Data Type | Description      |
| ------------ | --------- | ---------------- |
| log_id       |           | معرف السجل       |
| admin_email  |           | بريد المسؤول     |
| action_type  |           | نوع الإجراء      |
| target_sheet |           | الورقة المستهدفة |
| target_id    |           | المعرف المستهدف  |
| timestamp    |           | الوقت والتاريخ   |
| created_by   |           | منشئ السجل       |
| created_at   |           | تاريخ الإنشاء    |

---

## 8. **Sheet Name: board_Roadmap**

**وصف:** يحتوي على خارطة الطريق للتعلم.

| Column Name      | Data Type | Description     |
| ---------------- | --------- | --------------- |
| id               |           | المعرف          |
| icon_class       |           | فئة الأيقونة    |
| title            |           | العنوان         |
| description      |           | الوصف           |
| status           |           | الحالة          |
| created_by       |           | منشئ السجل      |
| created_at       |           | تاريخ الإنشاء   |
| last_modified_by |           | آخر معدل        |
| last_modified_at |           | تاريخ آخر تعديل |

---

## 9. **Sheet Name: board_Experts**

**وصف:** يحتوي على بيانات الخبراء.

| Column Name      | Data Type | Description     |
| ---------------- | --------- | --------------- |
| id               |           | المعرف          |
| name             |           | الاسم           |
| role             |           | الدور           |
| image_url        |           | رابط الصورة     |
| linkedin_url     |           | رابط LinkedIn   |
| created_by       |           | منشئ السجل      |
| created_at       |           | تاريخ الإنشاء   |
| last_modified_by |           | آخر معدل        |
| last_modified_at |           | تاريخ آخر تعديل |

---

## 10. **Sheet Name: board_Tools**

**وصف:** يحتوي على أدوات التعلم والتصميم.

| Column Name      | Data Type | Description     |
| ---------------- | --------- | --------------- |
| id               |           | المعرف          |
| name             |           | الاسم           |
| description      |           | الوصف           |
| link             |           | الرابط          |
| icon_url         |           | رابط الأيقونة   |
| created_by       |           | منشئ السجل      |
| created_at       |           | تاريخ الإنشاء   |
| last_modified_by |           | آخر معدل        |
| last_modified_at |           | تاريخ آخر تعديل |

---

## 11. **Sheet Name: experts_data**

**وصف:** يحتوي على بيانات مفصلة للخبراء.

| Column Name      | Data Type | Description      |
| ---------------- | --------- | ---------------- |
| ID               |           | المعرف           |
| Title            |           | المسمى الوظيفي   |
| Summary          |           | ملخص             |
| Source           |           | المصدر           |
| Difficulty       |           | مستوى الصعوبة    |
| Priority         |           | الأولوية         |
| Tags             |           | الكلمات الدلالية |
| Category         |           | الفئة            |
| is_active        |           | حالة التنشيط     |
| created_by       |           | منشئ السجل       |
| created_at       |           | تاريخ الإنشاء    |
| last_modified_by |           | آخر معدل         |
| last_modified_at |           | تاريخ آخر تعديل  |

---

## 12. **Sheet Name: resources-data**

**وصف:** يحتوي على موارد تعليمية.

| Column Name          | Data Type | Description              |
| -------------------- | --------- | ------------------------ |
| ID                   |           | المعرف                   |
| Title                |           | العنوان                  |
| Author               |           | المؤلف                   |
| Type                 |           | النوع (كتاب، فيديو، إلخ) |
| Description          |           | الوصف                    |
| Level                |           | المستوى                  |
| Stage                |           | المرحلة                  |
| Track                |           | المسار                   |
| Tags                 |           | الكلمات الدلالية         |
| Roadmap              |           | خارطة الطريق             |
| Summary              |           | ملخص                     |
| URL                  |           | الرابط                   |
| Contributor Name     |           | اسم المساهم              |
| Contributor LinkedIn |           | LinkedIn المساهم         |
| created_by           |           | منشئ السجل               |
| created_at           |           | تاريخ الإنشاء            |
| last_modified_by     |           | آخر معدل                 |
| last_modified_at     |           | تاريخ آخر تعديل          |

---

## 13. **Sheet Name: tools_data**

**وصف:** يحتوي على بيانات تفصيلية للأدوات.

| Column Name         | Data Type | Description       |
| ------------------- | --------- | ----------------- |
| Category            |           | الفئة             |
| Name                |           | الاسم             |
| Description         |           | الوصف             |
| Level               |           | المستوى           |
| Link                |           | الرابط            |
| Badges              |           | الشارات           |
| Guidance            |           | إرشادات الاستخدام |
| Usage               |           | طريقة الاستخدام   |
| Pros                |           | المزايا           |
| Cons                |           | العيوب            |
| Alternatives        |           | البدائل           |
| System Requirements |           | متطلبات النظام    |
| created_by          |           | منشئ السجل        |
| created_at          |           | تاريخ الإنشاء     |
| last_modified_by    |           | آخر معدل          |
| last_modified_at    |           | تاريخ آخر تعديل   |

---

**إجمالي عدد الأوراق (Sheets): 13**
```
