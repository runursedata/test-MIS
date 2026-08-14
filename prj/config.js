/*
  PRJ Frontend Config
  - เก็บ URL ของ Google Apps Script Web App สำหรับระบบโครงการทั้งหมด
  - หน้า index.html, index_faculty.html, index_university.html และ participation จะอ่านค่าจาก window.PRJ_CONFIG.API_URL
  - ถ้า redeploy backend ใหม่ ให้แก้ URL จุดนี้จุดเดียว
*/

window.PRJ_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxYqtnGm5yuPXNW9BUi18EHuSny3XWANJMBQi4E1ThK0HSCEZbTGVPhxjGOKXsBW5gk/exec"
};
