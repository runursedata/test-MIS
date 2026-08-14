# MIS Public Map

โฟลเดอร์นี้คือ deploy/public frontend ของระบบ MIS ปัจจุบัน

## MIS shell หลัก

- `index.html` = หน้า MIS หลังเข้าสู่ระบบ
- `login.html` = หน้าเข้าสู่ระบบ
- `404.html` = fallback page
- `styles.css` = CSS หลักของ MIS shell
- `app.min.js` = JavaScript หลักของ login/session/navigation
- `assets/` = logo/background assets ที่ shell ใช้
- `modules/` = JavaScript module ที่ถูกโหลดใน `index.html`
  - `personal.min.js`
  - `research.min.js`
  - `faculty-practice.min.js`
  - `training.min.js`

## Mini apps ที่ยังถูกลิงก์จาก MIS shell

- `HRM/` = ระบบ HRM admin และ personnel directory
- `prj/` = ระบบบันทึกโครงการคณะ/มหาวิทยาลัย

ห้ามย้าย `HRM/` หรือ `prj/` ถ้ายังไม่แก้ link ใน `index.html` และ `app.min.js`

## Source ที่ควรแก้ก่อน

- MIS shell source: `..\private\source-public\app.js`
- module source: `..\private\source-public\modules\`
- backend source: `..\private\source-public\backend\`
- HRM source: `..\private\source-public\HRM\`

หลังแก้ source ให้ sync ไปไฟล์ public ที่หน้าเว็บโหลดจริง.
