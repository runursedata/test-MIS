# PRJ Hosting Deploy Files

อัปโหลดไฟล์ในโฟลเดอร์นี้ขึ้น hosting สำหรับระบบ PRJ

## ไฟล์หน้าจอ

- `index.html` Dashboard และรายการโครงการ
- `index_faculty.html` บันทึกโครงการคณะ
- `index_university.html` บันทึกโครงการมหาวิทยาลัย
- `index_participation.html` บันทึกกิจกรรมเข้าร่วม

## ไฟล์ JavaScript

- `config.js` ตั้งค่า Apps Script Web App URL จุดเดียว
- `script.js` logic หลักของ PRJ dashboard/form
- `participation.js` logic หน้าบันทึกกิจกรรมเข้าร่วม

ถ้าเปลี่ยน URL backend ให้แก้เฉพาะ `config.js`

## ไฟล์ CSS

- `style.css` style หลักของ PRJ
- `detail-overrides.css` style เสริมหน้ารายละเอียด
- `participation.css` style เฉพาะหน้าบันทึกกิจกรรมเข้าร่วม

## Assets

- `logo.png`
- `mlogo.png`

## Backend ที่เกี่ยวข้อง

Apps Script PRJ อยู่ที่:

- `../../backend/prj/Code.gs`

SQL สร้างตาราง PRJ อยู่ที่:

- `../../backend/prj/SQL_CREATE_PRJ_TABLES.sql`

ไม่ต้องอัปโหลดไฟล์ `.gs` หรือ `.sql` ขึ้น hosting

