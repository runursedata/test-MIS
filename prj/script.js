/*
  PRJ Main Frontend
  - ไฟล์หลักของระบบติดตาม/บันทึกโครงการคณะและโครงการมหาวิทยาลัย
  - อ่านข้อมูลจาก backend/prj/Code.gs ผ่าน API_URL ใน config.js
  - ชื่อ field ที่ส่งขึ้น Supabase ต้องตรงกับตาราง public.project และ master tables แบบ lowercase เช่น plan_budget, actual_budget
  - รวม logic dashboard, รายการโครงการ, ฟอร์มบันทึก, KPI, งบประมาณ, ผู้รับผิดชอบ และ feedback loading/toast
*/

const API_URL = String(window.PRJ_CONFIG?.API_URL || "").trim();

const APP_CONTEXT = window.PROJECT_APP_CONTEXT || {};
const CURRENT_PROJECT_LEVEL = APP_CONTEXT.projectLevel || "";
const CURRENT_PROJECT_TITLE = APP_CONTEXT.projectTitle || "Project Monitoring";
const IS_UNIVERSITY_FORM = normalizeProjectLevel(CURRENT_PROJECT_LEVEL) === "มหาวิทยาลัย";
const IS_PUBLIC_PROJECT_ENTRY = APP_CONTEXT.publicAccess === true;

function byId(id) {
  return document.getElementById(id);
}

function onIfExists(id, eventName, handler) {
  const el = byId(id);
  if (el) el.addEventListener(eventName, handler);
}

function setValueIfExists(id, value) {
  const el = byId(id);
  if (el) el.value = value;
}

function setCheckedIfExists(id, checked) {
  const el = byId(id);
  if (el) el.checked = !!checked;
}

function ensureUniversityDefaults() {
  if (!IS_UNIVERSITY_FORM) return;
  const projectName = byId("PROJECT_NAME")?.value || "";
  setValueIfExists("ACTIVITY_NAME", projectName);
  setCheckedIfExists("NO_SUB_ACTIVITY", true);
  setCheckedIfExists("Q1", true);
  setValueIfExists("PLAN_TYPE", "");
  setValueIfExists("STRATEGY_ID", "");
  setValueIfExists("OBJECTIVE_ID", "");
  setValueIfExists("STRATEGY_PLAN_ID", "");
  setValueIfExists("PLAN_BUDGET", "0");
  setValueIfExists("ACTUAL_BUDGET", "0");
  setValueIfExists("REMAIN_BUDGET", "0.00");
  setValueIfExists("STATUS", "พร้อมใช้งาน");
  syncUniversityDateMode();
}

function syncUniversityDateMode() {
  if (!IS_UNIVERSITY_FORM) return;
  const isMultiDay = !!byId("IS_MULTI_DAY")?.checked;
  const endDateField = byId("endDateField");
  const startDate = getProjectDateInputValue("START_DATE");
  const endDate = byId("END_DATE");
  if (endDateField) endDateField.classList.toggle("hidden", !isMultiDay);
  if (!isMultiDay && endDate) endDate.value = formatProjectDateInput(startDate);
}

function syncProjectDateRange() {
  const startDate = byId("START_DATE");
  const endDate = byId("END_DATE");
  if (!startDate || !endDate) return;

  startDate.removeAttribute("max");

  const startIso = getProjectDateInputValue("START_DATE");
  const endIso = getProjectDateInputValue("END_DATE");
  if (startIso && endIso && endIso < startIso) {
    endDate.value = formatProjectDateInput(startIso);
  }
}

function getQuarterFields() {
  return ["Q1", "Q2", "Q3", "Q4"];
}

function formatDateForInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function projectThaiMonthNumber(value) {
  const text = String(value || "").trim();
  const months = [
    ["มกราคม", "ม.ค."],
    ["กุมภาพันธ์", "ก.พ."],
    ["มีนาคม", "มี.ค."],
    ["เมษายน", "เม.ย."],
    ["พฤษภาคม", "พ.ค."],
    ["มิถุนายน", "มิ.ย."],
    ["กรกฎาคม", "ก.ค."],
    ["สิงหาคม", "ส.ค."],
    ["กันยายน", "ก.ย."],
    ["ตุลาคม", "ต.ค."],
    ["พฤศจิกายน", "พ.ย."],
    ["ธันวาคม", "ธ.ค."]
  ];
  const index = months.findIndex(aliases => aliases.includes(text));
  return index >= 0 ? index + 1 : 0;
}

function parseProjectThaiDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    let year = Number(match[1]);
    if (year > 2400) year -= 543;
    return { day: Number(match[3]), month: Number(match[2]), yearCe: year };
  }
  match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    let year = Number(match[3]);
    if (year > 2400) year -= 543;
    return { day: Number(match[1]), month: Number(match[2]), yearCe: year };
  }
  match = raw.match(/^(\d{1,2})\s+([^\d\s]+)\s+(?:พ\.ศ\.|ค\.ศ\.)?\s*(\d{4})$/);
  if (match) {
    const month = projectThaiMonthNumber(match[2]);
    let year = Number(match[3]);
    if (year > 2400) year -= 543;
    return month ? { day: Number(match[1]), month, yearCe: year } : null;
  }
  return null;
}

function normalizeProjectDateValue(value) {
  const parsed = parseProjectThaiDate(value);
  if (!parsed) return "";
  return `${parsed.yearCe}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

function formatProjectDateInput(value) {
  const parsed = parseProjectThaiDate(value);
  if (!parsed) return "";
  return `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${parsed.yearCe + 543}`;
}

function getProjectDateInputValue(id) {
  return normalizeProjectDateValue(byId(id)?.value || "");
}

function initProjectThaiDatePickers(root = document) {
  root.querySelectorAll("[data-thai-date-control]").forEach(control => {
    if (control.dataset.thaiDateReady === "true") return;
    control.dataset.thaiDateReady = "true";
    const input = control.querySelector("[data-thai-date-input]");
    const button = control.querySelector("[data-thai-date-toggle]");
    button?.addEventListener("click", () => {
      const picker = control.querySelector("[data-thai-date-picker]");
      closeProjectThaiDatePickers(control);
      if (picker && !picker.hidden) picker.hidden = true;
      else openProjectThaiDatePicker(control);
    });
    input?.addEventListener("blur", () => {
      const formatted = formatProjectDateInput(input.value);
      if (formatted) input.value = formatted;
    });
  });
}

function getProjectThaiDateState(input) {
  const today = new Date();
  const parsed = parseProjectThaiDate(input?.value || "") || {
    day: today.getDate(),
    month: today.getMonth() + 1,
    yearCe: today.getFullYear()
  };
  return { selectedDay: parsed.day, monthIndex: parsed.month - 1, yearCe: parsed.yearCe };
}

function renderProjectThaiDatePicker(control, state) {
  const picker = control.querySelector("[data-thai-date-picker]");
  if (!picker) return;
  const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const firstDay = new Date(state.yearCe, state.monthIndex, 1).getDay();
  const daysInMonth = new Date(state.yearCe, state.monthIndex + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push('<span class="thai-date-empty"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const active = day === state.selectedDay ? " active" : "";
    cells.push(`<button type="button" class="thai-date-day${active}" data-thai-date-day="${day}">${day}</button>`);
  }
  picker.innerHTML = `
    <div class="thai-date-head">
      <button type="button" data-thai-date-prev aria-label="เดือนก่อนหน้า">‹</button>
      <div class="thai-date-selectors">
        <select aria-label="เลือกเดือน" data-thai-date-month>
          ${monthNames.map((name, index) => `<option value="${index}"${index === state.monthIndex ? " selected" : ""}>${name}</option>`).join("")}
        </select>
        <select aria-label="เลือกปี พ.ศ." data-thai-date-year>
          ${Array.from({ length: 121 }, (_, index) => {
            const yearBe = new Date().getFullYear() + 543 + 20 - index;
            return `<option value="${yearBe - 543}"${yearBe - 543 === state.yearCe ? " selected" : ""}>${yearBe}</option>`;
          }).join("")}
        </select>
      </div>
      <button type="button" data-thai-date-next aria-label="เดือนถัดไป">›</button>
    </div>
    <div class="thai-date-weekdays"><span>อา</span><span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span></div>
    <div class="thai-date-grid">${cells.join("")}</div>
    <div class="thai-date-actions"><button type="button" data-thai-date-today>วันนี้</button></div>
  `;
}

function openProjectThaiDatePicker(control) {
  let picker = control.querySelector("[data-thai-date-picker]");
  if (!picker) {
    picker = document.createElement("div");
    picker.className = "thai-date-picker";
    picker.dataset.thaiDatePicker = "";
    control.appendChild(picker);
  }
  const state = getProjectThaiDateState(control.querySelector("[data-thai-date-input]"));
  control._thaiDateState = state;
  renderProjectThaiDatePicker(control, state);
  picker.hidden = false;
}

function closeProjectThaiDatePickers(exceptControl) {
  document.querySelectorAll("[data-thai-date-control]").forEach(control => {
    if (control === exceptControl) return;
    const picker = control.querySelector("[data-thai-date-picker]");
    if (picker) picker.hidden = true;
  });
}

function setProjectThaiDateInput(control, state) {
  const input = control.querySelector("[data-thai-date-input]");
  if (!input) return;
  input.value = `${String(state.selectedDay).padStart(2, "0")}/${String(state.monthIndex + 1).padStart(2, "0")}/${state.yearCe + 543}`;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function getQuarterDateRange(fiscalYear, quarter) {
  return {
    start: formatDateForInput(getFiscalQuarterDate(fiscalYear, quarter, true)),
    end: formatDateForInput(getFiscalQuarterDate(fiscalYear, quarter, false))
  };
}

function getFiscalYearFromDateInput(dateText) {
  const normalized = normalizeProjectDateValue(dateText);
  const match = String(normalized || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const yearAD = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(yearAD) || yearAD >= 2400 || month < 1 || month > 12) return "";
  return String(yearAD + (month >= 10 ? 544 : 543));
}

function syncFiscalYearFromStartDate() {
  const fiscalYear = byId("FISCAL_YEAR");
  const startDate = getProjectDateInputValue("START_DATE");
  if (!fiscalYear) return "";
  const derivedYear = getFiscalYearFromDateInput(startDate);
  fiscalYear.value = derivedYear;
  return derivedYear;
}

function syncQuartersFromDateRange() {
  syncFiscalYearFromStartDate();
  const startDate = getProjectDateInputValue("START_DATE");
  const endDate = getProjectDateInputValue("END_DATE") || startDate;
  const fiscalYear = byId("FISCAL_YEAR")?.value || "";

  getQuarterFields().forEach(quarter => {
    const checkbox = byId(quarter);
    if (!checkbox) return;
    if (!startDate && !endDate) {
      checkbox.checked = false;
      return;
    }
    const range = getQuarterDateRange(fiscalYear, quarter);
    checkbox.checked = Boolean(startDate <= range.end && endDate >= range.start);
  });

  syncProjectDateRange();
}

function syncQuarterDateConsistency(source) {
  if (source === "quarter") {
    syncProjectDateRange();
    return;
  }
  syncProjectDateRange();
  syncQuartersFromDateRange();
}

function validateProjectDateRange(payload) {
  if (!payload.START_DATE || !payload.END_DATE) return true;
  return String(payload.END_DATE) >= String(payload.START_DATE);
}

function hasDateDerivedQuarterForFiscalYear(payload) {
  if (!payload.START_DATE || !payload.END_DATE || !payload.FISCAL_YEAR) return false;
  return getQuarterFields().some(quarter => {
    const range = getQuarterDateRange(payload.FISCAL_YEAR, quarter);
    return String(payload.START_DATE) <= range.end && String(payload.END_DATE) >= range.start;
  });
}

function validateGregorianProjectDates(payload) {
  const fields = ["START_DATE", "END_DATE"];
  return fields.every(field => {
    const value = String(payload[field] || "").trim();
    if (!value) return true;
    const year = Number(value.slice(0, 4));
    return Number.isFinite(year) && year < 2400;
  });
}

function formatBudgetPercent(value, plan) {
  const planValue = toNumber(plan);
  if (!planValue) return "0%";
  return `${numberFormatter.format(Math.round((toNumber(value) / planValue) * 100))}%`;
}

function normalizeProjectLevel(value) {
  const text = String(value || "").trim().toUpperCase();
  if (text === "UNIVERSITY" || text === "UNI" || text === "มหาวิทยาลัย") return "มหาวิทยาลัย";
  if (text === "FACULTY" || text === "FAC" || text === "คณะ") return "คณะ";
  return String(value || "").trim();
}

function isProjectInCurrentLevel(project) {
  if (!CURRENT_PROJECT_LEVEL) return true;
  const target = normalizeProjectLevel(CURRENT_PROJECT_LEVEL);
  const level = normalizeProjectLevel(project.PROJECT_LEVEL || project.PROJECT_TYPE || "");
  if (target === "คณะ") return !level || level === "คณะ";
  return level === target;
}

function getProjectQueryParams() {
  return CURRENT_PROJECT_LEVEL ? { projectLevel: CURRENT_PROJECT_LEVEL } : {};
}

const MIS_STORAGE = {
  TOKEN: "mis_token",
  USER: "mis_user"
};

function readMisUser() {
  try {
    return JSON.parse(localStorage.getItem(MIS_STORAGE.USER) || "null");
  } catch (_) {
    return null;
  }
}

function getProjectReturnPath() {
  return `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search}${window.location.hash}`;
}

function redirectToMisLogin() {
  localStorage.removeItem(MIS_STORAGE.TOKEN);
  localStorage.removeItem(MIS_STORAGE.USER);
  window.location.href = `../login.html?next=prj/${encodeURIComponent(getProjectReturnPath())}`;
}

function normalizeProjectUser(user) {
  return {
    personId: user.personId || user.PERSON_ID || "",
    name: user.fullName || user.FULL_NAME || user.name || "-",
    email: user.email || user.EMAIL || "",
    role: user.role || user.MIS_ROLE || "USERS",
    hrRole: user.hrRole || user.HR_ROLE || ""
  };
}

function getCurrentUserFromMisSession() {
  if (IS_PUBLIC_PROJECT_ENTRY) {
    return {
      personId: "PUBLIC",
      name: "Public University Project",
      email: "public-university-project@runs.local",
      role: "PUBLIC",
      hrRole: ""
    };
  }
  const token = localStorage.getItem(MIS_STORAGE.TOKEN) || "";
  const user = readMisUser();
  const expiresAt = Number(user && user.expiresAt);
  if (!token || !user || (expiresAt && Date.now() >= expiresAt)) {
    redirectToMisLogin();
    return null;
  }
  return normalizeProjectUser(user);
}

const currentUser = getCurrentUserFromMisSession();

const state = {
  projects: [],
  dashboard: null,
  planTypes: [],
  strategies: [],
  objectives: [],
  strategyPlans: [],
  kpis: [],
  employees: [],
  deletedProjects: [],
  projectAccess: { active: false, role: "", canManage: false, canRestore: false, canPurge: false },
  activePage: "dashboard",
  editingProjectId: "",
  projectPage: 1,
  myProjectPage: 1,
  expandedProjectIds: new Set(),
  facultyProjectsCollapsed: true,
  dashboardPieMetric: "count",
  dashboardSummaryType: "planType",
  dashboardBudgetProjectId: "",
  dashboardBudgetPage: 1,
  dashboardSearchTimer: null,
  dashboardFilters: {
    projectSearch: "",
    year: "",
    quarter: "",
    planType: "",
    strategy: "",
    status: ""
  },
  formMastersLoaded: false,
  formMastersLoading: null
};

const PROJECT_PAGE_SIZE = 10;

const pageMeta = {
  dashboard: { title: "Dashboard", subtitle: `ภาพรวม${CURRENT_PROJECT_TITLE}` },
  projects: { title: "รายการโครงการ", subtitle: `ค้นหา กรอง ดูรายละเอียด แก้ไข และลบ${CURRENT_PROJECT_TITLE}` },
  deleted: { title: "รายการที่ลบแล้ว", subtitle: "รายการ soft delete สำหรับเรียกคืนหรือลบถาวรตามสิทธิ์" },
  form: { title: CURRENT_PROJECT_TITLE, subtitle: "เพิ่มหรือแก้ไขข้อมูลโครงการ" }
};

const moneyFormatter = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const numberFormatter = new Intl.NumberFormat("th-TH");

const PROJECT_FIELDS = [
  "ACTIVITY_ID", "PROJECT_ID", "PROJECT_LEVEL", "PROJECT_NAME", "PROJECT_DESCRIPTION", "ACTIVITY_NAME", "DOCUMENT_URL",
  "FISCAL_YEAR", "Q1", "Q2", "Q3", "Q4", "START_DATE", "END_DATE", "PLAN_TYPE", "STRATEGY_ID",
  "OBJECTIVE_ID", "STRATEGY_PLAN_ID", "PLAN_BUDGET", "ACTUAL_BUDGET", "REMAIN_BUDGET",
  "PROJECT_FINANCE_TYPE", "HAS_PROJECT_EXPENSE",
  "USE_PARTICIPANT_KPI", "PARTICIPANT_TARGET", "PARTICIPANT_UNIT",
  "PARTICIPANT_RESULT", "USE_OUTPUT_KPI", "OUTPUT_DETAIL", "OUTPUT_TARGET", "OUTPUT_UNIT", "OUTPUT_RESULT",
  "USE_SATISFACTION_KPI", "SATISFACTION_TARGET", "SATISFACTION_UNIT", "SATISFACTION_RESULT",
  "TEACHER_COUNT", "SUPPORT_STAFF_COUNT", "STUDENT_YEAR1_COUNT", "STUDENT_YEAR2_COUNT",
  "STUDENT_YEAR3_COUNT", "STUDENT_YEAR4_COUNT", "TOTAL_STUDENT_COUNT",
  "HAS_EXTERNAL_PARTICIPANT", "EXTERNAL_PARTICIPANT_DETAIL", "EXTERNAL_PARTICIPANT_COUNT", "STATUS",
  "RESPONSIBLE_PERSON_ID", "RESPONSIBLE_FULL_NAME", "RESPONSIBLE_EMAIL",
  "CO_OWNER_PERSON_ID", "CO_OWNER_FULL_NAME", "CO_OWNER_EMAIL", "REMARK"
];


const FIELD_LABELS = {
  ACTIVITY_ID: "รหัสกิจกรรม",
  PROJECT_ID: "รหัสโครงการ",
  PROJECT_LEVEL: "ประเภทโครงการ",
  PROJECT_NAME: "ชื่อโครงการ",
  PROJECT_DESCRIPTION: "รายละเอียดโครงการ",
  ACTIVITY_NAME: "ชื่อกิจกรรม",
  DOCUMENT_URL: "ลิงก์เอกสารโครงการ",
  FISCAL_YEAR: "ปีงบประมาณ",
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
  START_DATE: "วันที่เริ่มดำเนินการ",
  END_DATE: "วันที่สิ้นสุดดำเนินการ",
  PROJECT_PERIOD: "ช่วงเวลา",
  PROJECT_QUARTERS: "ไตรมาส",
  PARTICIPANT_SUMMARY: "จำนวนผู้เข้าร่วมแยกประเภท",
  PLAN_TYPE: "แผนงาน",
  MISSION: "พันธกิจ",
  STRATEGY_ID: "ยุทธศาสตร์",
  OBJECTIVE_ID: "เป้าประสงค์",
  STRATEGY_PLAN_ID: "กลยุทธ์",
  PLAN_BUDGET: "งบประมาณตามแผน",
  ACTUAL_BUDGET: "ใช้จริง",
  REMAIN_BUDGET: "งบประมาณคงเหลือ",
  PROJECT_FINANCE_TYPE: "ประเภทการเงินของโครงการ",
  HAS_PROJECT_EXPENSE: "มีค่าใช้จ่ายหรือไม่",
  USE_PARTICIPANT_KPI: "ใช้ตัวชี้วัดด้านผู้เข้าร่วม",
  PARTICIPANT_TARGET: "ค่าเป้าหมายผู้เข้าร่วม",
  PARTICIPANT_UNIT: "หน่วยผู้เข้าร่วม",
  PARTICIPANT_RESULT: "ผลการดำเนินงานผู้เข้าร่วม",
  USE_OUTPUT_KPI: "ใช้ตัวชี้วัดอื่น / ผลงาน / ผลผลิต",
  OUTPUT_DETAIL: "ประเภทผลงาน/ผลผลิต",
  OUTPUT_TARGET: "ค่าเป้าหมายผลผลิต",
  OUTPUT_UNIT: "หน่วยผลผลิต",
  OUTPUT_RESULT: "ผลการดำเนินงานผลผลิต",
  USE_SATISFACTION_KPI: "ใช้ตัวชี้วัดด้านความพึงพอใจ",
  SATISFACTION_TARGET: "ค่าเป้าหมายความพึงพอใจ",
  SATISFACTION_UNIT: "หน่วยความพึงพอใจ",
  SATISFACTION_RESULT: "ผลการดำเนินงานความพึงพอใจ",
  TEACHER_COUNT: "จำนวนอาจารย์",
  SUPPORT_STAFF_COUNT: "จำนวนบุคลากรสายสนับสนุน",
  STUDENT_YEAR1_COUNT: "จำนวนนักศึกษาชั้นปีที่ 1",
  STUDENT_YEAR2_COUNT: "จำนวนนักศึกษาชั้นปีที่ 2",
  STUDENT_YEAR3_COUNT: "จำนวนนักศึกษาชั้นปีที่ 3",
  STUDENT_YEAR4_COUNT: "จำนวนนักศึกษาชั้นปีที่ 4",
  TOTAL_STUDENT_COUNT: "รวมนักศึกษา",
  HAS_EXTERNAL_PARTICIPANT: "มีบุคคลภายนอกเข้าร่วม",
  EXTERNAL_PARTICIPANT_DETAIL: "บุคคลภายนอก: ใคร / มาจากไหน",
  EXTERNAL_PARTICIPANT_COUNT: "จำนวนบุคคลภายนอก",
  STATUS: "สถานะ",
  RESPONSIBLE_PERSON_ID: "รหัสผู้รับผิดชอบ 1",
  RESPONSIBLE_FULL_NAME: "ผู้รับผิดชอบ 1",
  RESPONSIBLE_EMAIL: "อีเมลผู้รับผิดชอบ 1",
  CO_OWNER_PERSON_ID: "รหัสผู้รับผิดชอบ 2",
  CO_OWNER_FULL_NAME: "ผู้รับผิดชอบ 2",
  CO_OWNER_EMAIL: "อีเมลผู้รับผิดชอบ 2",
  REMARK: "หมายเหตุ",
  CREATED_BY_NAME: "ผู้บันทึกข้อมูล",
  CREATED_BY_EMAIL: "อีเมลผู้บันทึก",
  CREATED_AT: "วันที่และเวลาบันทึก",
  UPDATED_BY_NAME: "ผู้แก้ไขล่าสุด",
  UPDATED_BY_EMAIL: "อีเมลผู้แก้ไขล่าสุด",
  UPDATED_AT: "วันที่และเวลาแก้ไขล่าสุด",
  IS_ACTIVE: "สถานะการใช้งานข้อมูล",
  YEAR_BUDGET_PERCENT: "ร้อยละงบประมาณทั้งปี",
  IS_SELECTABLE: "เลือกใช้งานได้",
  FORM_TYPE: "ประเภทฟอร์ม",
  "การบริหาร": "พันธกิจ: การบริหาร",
  "การเรียนการสอน": "พันธกิจ: การเรียนการสอน",
  "การวิจัย": "พันธกิจ: การวิจัย",
  "การบริการวิชาการ": "พันธกิจ: การบริการวิชาการ",
  "การทำนุบำรุงศิลปะและวัฒนธรรม": "พันธกิจ: การทำนุบำรุงศิลปะและวัฒนธรรม",
  UPDATED_AT: "วันที่และเวลาแก้ไขล่าสุด",
  IS_ACTIVE: "สถานะการใช้งานข้อมูล"
};

const DETAIL_FIELDS = [
  "ACTIVITY_ID", "PROJECT_ID", "PROJECT_LEVEL", "PROJECT_NAME", "ACTIVITY_NAME", "PLAN_TYPE", "MISSION", "STRATEGY_ID", "PROJECT_PERIOD",
  "PLAN_BUDGET", "ACTUAL_BUDGET", "OUTPUT_DETAIL", "TEACHER_COUNT", "SUPPORT_STAFF_COUNT", "TOTAL_STUDENT_COUNT",
  "RESPONSIBLE_FULL_NAME", "STATUS", "REMARK"
];

document.addEventListener("DOMContentLoaded", initApp);

document.addEventListener("click", event => {
  if (!event.target.closest("[data-thai-date-control]")) closeProjectThaiDatePickers();
});

document.addEventListener("click", event => {
  const control = event.target.closest("[data-thai-date-control]");
  if (!control) return;
  const state = control._thaiDateState || getProjectThaiDateState(control.querySelector("[data-thai-date-input]"));

  if (event.target.closest("[data-thai-date-prev]")) {
    state.monthIndex -= 1;
    if (state.monthIndex < 0) {
      state.monthIndex = 11;
      state.yearCe -= 1;
    }
    control._thaiDateState = state;
    renderProjectThaiDatePicker(control, state);
    return;
  }

  if (event.target.closest("[data-thai-date-next]")) {
    state.monthIndex += 1;
    if (state.monthIndex > 11) {
      state.monthIndex = 0;
      state.yearCe += 1;
    }
    control._thaiDateState = state;
    renderProjectThaiDatePicker(control, state);
    return;
  }

  if (event.target.closest("[data-thai-date-today]")) {
    const today = new Date();
    state.selectedDay = today.getDate();
    state.monthIndex = today.getMonth();
    state.yearCe = today.getFullYear();
    control._thaiDateState = state;
    setProjectThaiDateInput(control, state);
    renderProjectThaiDatePicker(control, state);
    const picker = control.querySelector("[data-thai-date-picker]");
    if (picker) picker.hidden = true;
    return;
  }

  const dayButton = event.target.closest("[data-thai-date-day]");
  if (!dayButton) return;
  state.selectedDay = Number(dayButton.dataset.thaiDateDay);
  control._thaiDateState = state;
  setProjectThaiDateInput(control, state);
  const picker = control.querySelector("[data-thai-date-picker]");
  if (picker) picker.hidden = true;
});

document.addEventListener("change", event => {
  const control = event.target.closest("[data-thai-date-control]");
  if (!control) return;
  const state = control._thaiDateState || getProjectThaiDateState(control.querySelector("[data-thai-date-input]"));
  if (event.target.matches("[data-thai-date-month]")) {
    state.monthIndex = Number(event.target.value);
    control._thaiDateState = state;
    renderProjectThaiDatePicker(control, state);
  }
  if (event.target.matches("[data-thai-date-year]")) {
    state.yearCe = Number(event.target.value);
    control._thaiDateState = state;
    renderProjectThaiDatePicker(control, state);
  }
});

async function initApp() {
  if (!currentUser) return;
  document.title = `${CURRENT_PROJECT_TITLE} | Faculty of Nursing, Ramkhamhaeng University`;
  initProjectThaiDatePickers();
  bindEvents();
  setInitialYear();
  renderBudgetCalculations();
  renderStudentTotal();
  setOutputItems([]);
  setupTableEnhancements();
  await loadInitialData();
}

function bindEvents() {
  onIfExists("searchInput", "input", resetProjectPageAndRender);
  onIfExists("filterYear", "change", resetProjectPageAndRender);
  onIfExists("filterQuarter", "change", resetProjectPageAndRender);
  onIfExists("filterStatus", "change", resetProjectPageAndRender);

  onIfExists("STRATEGY_ID", "change", handleStrategyChange);
  onIfExists("OBJECTIVE_ID", "change", handleObjectiveChange);
  onIfExists("RESPONSIBLE_PERSON_ID", "change", handleResponsibleChange);
  onIfExists("CO_OWNER_PERSON_ID", "change", handleCoOwnerChange);
  onIfExists("existingProjectSelect", "change", handleExistingProjectSelect);
  onIfExists("FISCAL_YEAR", "change", () => syncQuarterDateConsistency("year"));
  onIfExists("FISCAL_YEAR", "input", () => syncQuarterDateConsistency("year"));
  getQuarterFields().forEach(field => onIfExists(field, "change", () => syncQuarterDateConsistency("quarter")));
  onIfExists("PROJECT_NAME", "input", handleProjectNameInput);
  onIfExists("PROJECT_NAME", "input", syncNoSubActivityName);
  onIfExists("PROJECT_NAME", "input", ensureUniversityDefaults);
  onIfExists("NO_SUB_ACTIVITY", "change", handleNoSubActivityChange);
  onIfExists("IS_MULTI_DAY", "change", syncUniversityDateMode);
  onIfExists("START_DATE", "change", syncUniversityDateMode);
  onIfExists("START_DATE", "change", () => syncQuarterDateConsistency("date"));
  onIfExists("END_DATE", "change", () => syncQuarterDateConsistency("date"));
  onIfExists("START_DATE", "input", () => syncQuarterDateConsistency("date"));
  onIfExists("END_DATE", "input", () => syncQuarterDateConsistency("date"));
  onIfExists("STATUS", "change", updateKpiRequiredStates);
  onIfExists("PROJECT_FINANCE_TYPE", "change", syncProjectFinanceFields);
  onIfExists("HAS_PROJECT_EXPENSE", "change", syncProjectFinanceFields);
  onIfExists("DOCUMENT_URL", "input", event => setProjectCurrentDocumentLink(event.target.value || ""));
  onIfExists("projectCheckDocumentLinkBtn", "click", checkProjectDocumentLink);

  ["PLAN_BUDGET", "ACTUAL_BUDGET"].forEach(id => onIfExists(id, "input", renderBudgetCalculations));
  ["STUDENT_YEAR1_COUNT", "STUDENT_YEAR2_COUNT", "STUDENT_YEAR3_COUNT", "STUDENT_YEAR4_COUNT"].forEach(id => onIfExists(id, "input", renderStudentTotal));
  ["OUTPUT_DETAIL", "OUTPUT_TARGET", "OUTPUT_UNIT", "OUTPUT_RESULT"].forEach(id => onIfExists(id, "input", syncOutputItemsFromLegacyFields));
  onIfExists("OUTPUT_UNIT", "change", syncOutputItemsFromLegacyFields);

  setupKpiToggle("USE_PARTICIPANT_KPI", ["PARTICIPANT_TARGET", "PARTICIPANT_UNIT", "PARTICIPANT_RESULT"]);
  setupKpiToggle("USE_OUTPUT_KPI", ["OUTPUT_DETAIL", "OUTPUT_TARGET", "OUTPUT_UNIT", "OUTPUT_RESULT"]);
  setupKpiToggle("USE_SATISFACTION_KPI", ["SATISFACTION_TARGET", "SATISFACTION_UNIT", "SATISFACTION_RESULT"]);
  syncProjectDateRange();
  updateKpiRequiredStates();

  onIfExists("projectForm", "submit", handleFormSubmit);
}

function updatePermissionControls() {
  document.querySelectorAll("[data-create-project]").forEach(button => {
    button.classList.toggle("hidden", !canCreateProject());
  });
}

function setInitialYear() {
  const fiscalYearInput = byId("FISCAL_YEAR");
  if (!fiscalYearInput) return;
  fiscalYearInput.readOnly = true;
  fiscalYearInput.value = getFiscalYearFromDateInput(getProjectDateInputValue("START_DATE"));
}

function getCurrentFiscalYear() {
  const now = new Date();
  const buddhistYear = now.getFullYear() + 543;
  return now.getMonth() >= 9 ? buddhistYear + 1 : buddhistYear;
}

function getDefaultDashboardYear(projects = state.projects) {
  const years = uniqueValues((projects || []).map(project => project.FISCAL_YEAR)).sort().reverse();
  const current = String(getCurrentFiscalYear());
  return years.find(year => String(year) === current) || years[0] || current;
}

function ensureDashboardDefaultYear() {
  if (!state.dashboardFilters.year) state.dashboardFilters.year = getDefaultDashboardYear();
}

function getInitialPageFromHash() {
  const page = String(window.location.hash || "").replace("#", "").trim();
  return ["dashboard", "projects", "deleted", "form"].includes(page) ? page : "dashboard";
}

async function ensureDashboardLabelMasters() {
  const tasks = [];
  if (!state.planTypes.length) {
    tasks.push(apiGet("getPlanTypes", {}, false).then(rows => {
      state.planTypes = rows || [];
    }));
  }
  if (!state.strategies.length) {
    tasks.push(apiGet("getStrategies", {}, false).then(rows => {
      state.strategies = rows || [];
    }));
  }
  if (tasks.length) await Promise.all(tasks);
}

async function loadInitialData() {
  setLoading(true);
  try {
    const initialPage = getInitialPageFromHash();
    state.projectAccess = await apiGet("getProjectAccess", { email: currentUser.email, projectLevel: CURRENT_PROJECT_LEVEL }, false);
    currentUser.prjRole = state.projectAccess.role || "";
    if (byId("userPill")) byId("userPill").textContent = `${state.projectAccess.role || "NO PRJ ROLE"} | ${currentUser.name}`;
    updatePermissionControls();
    if (!state.projectAccess.active) {
      throw new Error(IS_UNIVERSITY_FORM
        ? "บัญชีนี้ไม่มี PRJ_UNIVERSITY_ROLE หรือถูกปิดด้วย PRJ_UNIVERSITY_ACTIVE = FALSE"
        : "บัญชีนี้ไม่มี PRJ_FACULTY_ROLE หรือถูกปิดด้วย PRJ_FACULTY_ACTIVE = FALSE");
    }

    navigateTo(initialPage);
    const targetPage = state.activePage || initialPage;

    if (targetPage === "form") {
      const [planTypes, strategies, objectives, strategyPlans, kpis, employees, projects] = await Promise.all([
        apiGet("getPlanTypes", {}, false),
        apiGet("getStrategies", {}, false),
        apiGet("getObjectives", {}, false),
        apiGet("getStrategyPlans", {}, false),
        apiGetOptional("getKPIs", [], {}, false),
        apiGet("getActiveEmployees", {}, false),
        apiGet("getProjectsLite", getProjectQueryParams(), false)
      ]);
      state.planTypes = planTypes || [];
      state.strategies = strategies || [];
      state.objectives = objectives || [];
      state.strategyPlans = strategyPlans || [];
      state.kpis = kpis || [];
      state.employees = employees || [];
      state.projects = (projects || []).filter(isProjectInCurrentLevel);
      state.formMastersLoaded = true;
      populateMasterDropdowns();
      populateExistingProjectSelect();
      populateResponsibleDropdown();
      return;
    }

    if (targetPage === "deleted") {
      const deletedProjects = await apiGet("getProjectsLite", { ...getProjectQueryParams(), includeInactive: true }, false);
      state.deletedProjects = (deletedProjects || []).filter(isProjectInCurrentLevel);
      renderDeletedProjectsTable();
      return;
    }

    const [projects] = await Promise.all([
      apiGet("getProjectsLite", getProjectQueryParams(), false),
      targetPage === "dashboard" ? ensureDashboardLabelMasters() : Promise.resolve()
    ]);
    state.projects = (projects || []).filter(isProjectInCurrentLevel);
    populateExistingProjectSelect();
    populateFilters();
    if (targetPage === "dashboard") {
      state.dashboard = buildDashboardFromProjects(state.projects);
      ensureDashboardDefaultYear();
      renderDashboard();
    } else {
      renderProjectsTable();
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "โหลดข้อมูลไม่สำเร็จ", "error");
    renderDashboardError();
    renderProjectTableError();
  } finally {
    setLoading(false);
  }
}

function openInitialPageFromHash() {
  navigateTo(getInitialPageFromHash());
}

async function refreshProjectsAndDashboard(targetPage = state.activePage) {
  setLoading(true);
  try {
    if (targetPage === "deleted") {
      const deletedProjects = await apiGet("getProjectsLite", { ...getProjectQueryParams(), includeInactive: true }, false);
      state.deletedProjects = (deletedProjects || []).filter(isProjectInCurrentLevel);
      renderDeletedProjectsTable();
      return;
    }

    if (targetPage === "form") {
      const [planTypes, strategies, objectives, strategyPlans, kpis, employees, projects] = await Promise.all([
        apiGet("getPlanTypes", {}, false),
        apiGet("getStrategies", {}, false),
        apiGet("getObjectives", {}, false),
        apiGet("getStrategyPlans", {}, false),
        apiGetOptional("getKPIs", [], {}, false),
        apiGet("getActiveEmployees", {}, false),
        apiGet("getProjectsLite", getProjectQueryParams(), false)
      ]);
      state.planTypes = planTypes || [];
      state.strategies = strategies || [];
      state.objectives = objectives || [];
      state.strategyPlans = strategyPlans || [];
      state.kpis = kpis || [];
      state.employees = employees || [];
      state.projects = (projects || []).filter(isProjectInCurrentLevel);
      state.formMastersLoaded = true;
      populateMasterDropdowns();
      populateExistingProjectSelect();
      populateResponsibleDropdown();
      return;
    }

    const [projects] = await Promise.all([
      apiGet("getProjectsLite", getProjectQueryParams(), false),
      targetPage === "dashboard" ? ensureDashboardLabelMasters() : Promise.resolve()
    ]);
    state.projects = (projects || []).filter(isProjectInCurrentLevel);
    populateExistingProjectSelect();
    populateFilters();
    if (targetPage === "dashboard") {
      state.dashboard = buildDashboardFromProjects(state.projects);
      ensureDashboardDefaultYear();
      renderDashboard();
    } else {
      renderProjectsTable();
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "อัปเดตข้อมูลไม่สำเร็จ", "error");
  } finally {
    setLoading(false);
  }
}

async function apiGet(action, params = {}, useLoading = true) {
  if (useLoading) setLoading(true);
  try {
    const url = new URL(API_URL);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const result = await fetchProjectApiJson(url.toString(), { method: "GET" });
    if (!result.success) throw new Error(result.message || "API Error");
    return (action === "getProjects" || action === "getProjectsLite")
      ? normalizeProjectRecords(result.data)
      : result.data;
  } finally {
    if (useLoading) setLoading(false);
  }
}

function normalizeProjectRecords(rows) {
  return (rows || []).map(row => normalizeProjectRecord(row));
}

async function getFullProjectForAction(activityId) {
  const fallback = findProjectByActivityKey(activityId);
  const fullProject = await apiGet("getProject", { ACTIVITY_ID: activityId }, true);
  return normalizeProjectRecord({ ...(fallback || {}), ...(fullProject || {}) });
}

function normalizeProjectRecord(row) {
  const project = { ...(row || {}) };
  if (!hasProjectValue(project.PLAN_BUDGET)) {
    project.PLAN_BUDGET = getProjectValueByAliases(project, ["plan_budget", "BUDGET_AMOUNT", "budget_amount", "PLAN_AMOUNT", "plan_amount"]);
  }
  if (!hasProjectValue(project.ACTUAL_BUDGET)) {
    project.ACTUAL_BUDGET = getProjectValueByAliases(project, ["actual_budget", "ACTUAL_AMOUNT", "actual_amount", "USED_BUDGET", "used_budget"]);
  }
  if (!hasProjectValue(project.REMAIN_BUDGET)) {
    const plan = toNumber(project.PLAN_BUDGET);
    const actual = toNumber(project.ACTUAL_BUDGET);
    project.REMAIN_BUDGET = plan || actual ? plan - actual : "";
  }
  return project;
}

async function apiGetOptional(action, fallback = [], params = {}, useLoading = false) {
  try {
    return await apiGet(action, params, useLoading);
  } catch (error) {
    console.warn(`Optional API failed: ${action}`, error);
    return fallback;
  }
}

async function apiPost(action, payload = {}, useLoading = true) {
  if (useLoading) setLoading(true);
  try {
    // ใช้ URLSearchParams เพื่อเลี่ยง CORS preflight ของ Apps Script Web App
    const body = new URLSearchParams();
    body.set("action", action);
    body.set("payload", JSON.stringify(payload));

    const result = await fetchProjectApiJson(API_URL, {
      method: "POST",
      body
    });
    if (!result.success) throw new Error(result.message || "API Error");
    return result.data;
  } finally {
    if (useLoading) setLoading(false);
  }
}

async function fetchProjectApiJson(url, options) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      if (!response.ok) {
        throw new Error(getProjectApiTextError(response.status, text));
      }
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error(getProjectApiTextError(response.status, text));
      }
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 650));
    }
  }
  throw lastError || new Error("เชื่อมต่อ PRJ API ไม่สำเร็จ");
}

function getProjectApiTextError(status, text) {
  const preview = String(text || "").trim().slice(0, 180);
  if (preview) return `PRJ API ไม่ได้ส่ง JSON กลับมา (${status}): ${preview}`;
  return `PRJ API ไม่ได้ส่ง JSON กลับมา (${status})`;
}

function setLoading(isLoading, text = "กำลังดาวน์โหลด") {
  const overlay = document.getElementById("loadingOverlay");
  document.getElementById("loadingText").textContent = "กำลังดาวน์โหลด";
  overlay.classList.toggle("hidden", !isLoading);
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

function setProjectCurrentDocumentLink(url) {
  const text = String(url || "").trim();
  const target = document.getElementById("projectCurrentDocumentLink");
  if (!target) return;
  target.innerHTML = text
    ? `ไฟล์ปัจจุบัน: <a href="${escapeAttr(text)}" target="_blank" rel="noopener">เปิดไฟล์</a>`
    : "ยังไม่มีลิงก์ไฟล์แนบ";
  setProjectDocumentLinkCheckResult("");
}

function setProjectDocumentLinkCheckResult(message, type = "") {
  const target = document.getElementById("projectDocumentLinkCheckResult");
  if (!target) return;
  target.textContent = message || "";
  target.className = type || "";
}

function extractProjectDriveFileId(url) {
  const text = String(url || "").trim();
  if (!text) return "";
  let match = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  match = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  match = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : "";
}

function checkProjectImageLoad(url, timeoutMs = 5000) {
  return new Promise(resolve => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(false);
    }, timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

async function checkProjectDocumentLink() {
  const url = String(document.getElementById("DOCUMENT_URL")?.value || "").trim();
  if (!url) {
    setProjectDocumentLinkCheckResult("กรุณาวางลิงก์ก่อนตรวจ", "error");
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    setProjectDocumentLinkCheckResult("รูปแบบลิงก์ไม่ถูกต้อง", "error");
    return;
  }
  const fileId = extractProjectDriveFileId(url);
  if (!fileId) {
    setProjectDocumentLinkCheckResult("ตรวจได้เฉพาะลิงก์ Google Drive แบบมี file id", "warning");
    return;
  }
  setProjectDocumentLinkCheckResult("กำลังตรวจลิงก์...", "");
  const publicUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w64`;
  const ok = await checkProjectImageLoad(publicUrl);
  setProjectDocumentLinkCheckResult(
    ok
      ? "ลิงก์นี้น่าจะเปิดแบบสาธารณะได้"
      : "ยังตรวจ public ไม่ผ่าน ถ้าแชร์เฉพาะ @rumail.ru.ac.th ระบบอาจตรวจไม่ได้ ให้ทดสอบเปิดด้วยบัญชี Rumail",
    ok ? "success" : "warning"
  );
}

function navigateTo(page) {
  if (!pageMeta[page] || !document.getElementById(`page-${page}`)) page = "dashboard";
  if (page === "form" && !canCreateProject()) {
    showToast("USERS ดูโครงการมหาวิทยาลัยได้อย่างเดียว", "warning");
    page = "projects";
  }
  state.activePage = page;
  if (window.location.hash !== `#${page}`) {
    window.history.replaceState(null, "", `#${page}`);
  }
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  document.getElementById(`page-${page}`).classList.add("active");

  document.querySelectorAll(".menu-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  document.getElementById("pageTitle").textContent = pageMeta[page].title;
  document.getElementById("pageSubtitle").textContent = pageMeta[page].subtitle;
  closeMobileSidebar();

  if (page === "dashboard") {
    renderDashboard();
    if (!state.planTypes.length || !state.strategies.length) {
      ensureDashboardLabelMasters()
        .then(renderDashboard)
        .catch(error => {
          console.error(error);
          showToast(error.message || "โหลดชื่อแผนงาน/ยุทธศาสตร์ไม่สำเร็จ", "error");
        });
    }
  }
  if (page === "projects") renderProjectsTable();
  if (page === "deleted") renderDeletedProjectsTable();
  if (page === "form") {
    ensureFormMastersLoaded().catch(error => {
      console.error(error);
      showToast(error.message || "โหลดข้อมูล dropdown ไม่สำเร็จ", "error");
      renderFormDropdownError();
    });
  }
}

function toggleSidebar() {
  if (window.innerWidth <= 860) {
    document.body.classList.toggle("mobile-sidebar-open");
    return;
  }
  document.body.classList.toggle("sidebar-collapsed");
}

function closeMobileSidebar() {
  document.body.classList.remove("mobile-sidebar-open");
}

function renderDashboard() {
  const allProjects = state.projects || [];
  ensureDashboardDefaultYear();
  const filteredProjects = getDashboardFilteredProjects();
  const data = buildDashboardFromProjects(filteredProjects);
  if (state.dashboardBudgetProjectId && !filteredProjects.some(project => String(getActivityKey(project)) === String(state.dashboardBudgetProjectId))) {
    state.dashboardBudgetProjectId = "";
  }

  if (IS_UNIVERSITY_FORM) {
    document.getElementById("dashboardCards").innerHTML = "";
    document.querySelector("#page-dashboard .summary-grid")?.setAttribute("hidden", "");
    renderUniversityDashboardChart(filteredProjects, allProjects);
    return;
  }

  document.querySelector("#page-dashboard .summary-grid")?.setAttribute("hidden", "");

  const dashboardYear = state.dashboardFilters.year || getDefaultDashboardYear();
  const cards = [
    { label: "จำนวนกิจกรรมทั้งหมด", value: numberFormatter.format(toNumber(data.totalProjects)), sub: "กิจกรรมที่ Active", metric: "count", tone: "activity" },
    { label: "งบประมาณตามแผนรวม", value: formatMoney(data.planBudgetSum), sub: "คิดเป็น 100% ของงบที่ได้", metric: "planBudgetSum", tone: "plan" },
    { label: "งบประมาณใช้จริงรวม", value: formatMoney(data.actualBudgetSum), sub: `ใช้จริง ${formatBudgetPercent(data.actualBudgetSum, data.planBudgetSum)} ของงบที่ได้`, metric: "actualBudgetSum", tone: "actual" },
    { label: "งบประมาณคงเหลือรวม", value: formatMoney(data.remainBudgetSum), sub: `คงเหลือ ${formatBudgetPercent(data.remainBudgetSum, data.planBudgetSum)} ของงบที่ได้`, metric: "planBudgetSum", tone: "remain" }
  ];

  document.getElementById("dashboardCards").innerHTML = `
    <section class="dashboard-year-context" aria-label="ปีงบประมาณที่กำลังแสดง">
      <div>
        <strong>ปีงบประมาณ ${escapeHtml(dashboardYear || "-")}</strong>
      </div>
      ${renderDashboardFilterBar(allProjects)}
    </section>
    ${cards.map(card => `
      <button class="metric-card metric-card-button metric-card-${escapeAttr(card.tone)}" type="button" onclick="setDashboardPieMetric('${escapeJs(card.metric)}')">
        <div class="metric-label">${escapeHtml(card.label)}</div>
        <div class="metric-value">${escapeHtml(card.value)}</div>
        <div class="metric-sub">${escapeHtml(card.sub)}</div>
      </button>
    `).join("")}
  `;

  renderDashboardCharts(data, filteredProjects, allProjects);
}

function renderUniversityDashboardChart(projects, allProjects) {
  const target = document.getElementById("dashboardCharts");
  if (!target) return;

  if (!allProjects.length) {
    target.innerHTML = `
      <div class="empty-state">
        <strong>ยังไม่มีข้อมูลโครงการมหาวิทยาลัย</strong>
        <p>เมื่อบันทึกโครงการแล้ว ระบบจะแสดงช่วงปีงบประมาณและจำนวนผู้เข้าร่วมอัตโนมัติ</p>
      </div>
    `;
    return;
  }

  const years = uniqueValues(allProjects.map(project => project.FISCAL_YEAR)).sort().reverse();
  const selectedYear = state.dashboardFilters.year || years[0] || "";
  if (!state.dashboardFilters.year && selectedYear) state.dashboardFilters.year = selectedYear;
  const yearProjects = (projects || [])
    .filter(project => !selectedYear || String(project.FISCAL_YEAR) === String(selectedYear))
    .slice()
    .sort((a, b) => {
      const dateA = getProjectStartDate(a)?.getTime() || 0;
      const dateB = getProjectStartDate(b)?.getTime() || 0;
      return dateA - dateB || String(a.PROJECT_NAME || "").localeCompare(String(b.PROJECT_NAME || ""), "th");
    });
  const maxParticipants = Math.max(1, ...yearProjects.map(getProjectParticipantTotal));
  const totalParticipants = yearProjects.reduce((sum, project) => sum + getProjectParticipantTotal(project), 0);

  target.innerHTML = `
    <div class="university-dashboard">
      <div class="university-dashboard-head">
        <div>
          <h3>กิจกรรมตามปีงบประมาณและจำนวนผู้เข้าร่วม</h3>
          <p class="muted">แสดงช่วงเวลาที่จัดกิจกรรมในปีงบประมาณ และจำนวนผู้เข้าร่วมของแต่ละกิจกรรม</p>
        </div>
        <label>
          <span>ปีงบประมาณ</span>
          <select onchange="setDashboardFilter('year', this.value)">
            ${years.map(year => `<option value="${escapeAttr(year)}" ${String(selectedYear) === String(year) ? "selected" : ""}>${escapeHtml(year)}</option>`).join("")}
          </select>
        </label>
      </div>

      <div class="university-dashboard-stats">
        <span>${numberFormatter.format(yearProjects.length)} กิจกรรม</span>
        <span>${numberFormatter.format(totalParticipants)} คนเข้าร่วม</span>
      </div>

      <div class="fiscal-timeline">
        <div class="fiscal-timeline-head">
          ${["ต.ค.", "พ.ย.", "ธ.ค.", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย."].map(month => `<span>${month}</span>`).join("")}
        </div>
        <div class="fiscal-timeline-body">
          ${yearProjects.length ? yearProjects.map(project => renderUniversityActivityTimelineRow(project, maxParticipants)).join("") : `
            <div class="empty-state">
              <strong>ไม่มีข้อมูลในปีงบประมาณนี้</strong>
              <p>เลือกปีงบประมาณอื่น หรือเพิ่มโครงการมหาวิทยาลัยใหม่</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

function renderUniversityActivityTimelineRow(project, maxParticipants) {
  const total = getProjectParticipantTotal(project);
  const position = getFiscalTimelinePosition(project);
  const activityName = project.ACTIVITY_NAME || project.PROJECT_NAME || getActivityKey(project) || "-";
  const projectName = project.PROJECT_NAME && project.ACTIVITY_NAME && project.PROJECT_NAME !== project.ACTIVITY_NAME
    ? project.PROJECT_NAME
    : "";
  const period = getProjectPeriod(project);
  const widthPercent = clamp((total / maxParticipants) * 100, 6, 100);

  return `
    <div class="university-activity-row">
      <div class="university-activity-info">
        <strong>${escapeHtml(activityName)}</strong>
        ${projectName ? `<small>${escapeHtml(projectName)}</small>` : ""}
        <em>${escapeHtml(period)}</em>
      </div>
      <div class="university-activity-timeline" title="${escapeAttr(period)}">
        <span style="left:${position.left}%; width:${position.width}%;"></span>
      </div>
      <div class="university-activity-count">
        <strong>${numberFormatter.format(total)}</strong>
        <span>คน</span>
        <i style="width:${widthPercent}%"></i>
      </div>
    </div>
  `;
}

function renderDashboardError() {
  document.getElementById("dashboardCards").innerHTML = `
    <div class="empty-state" style="grid-column:1/-1;">
      <strong>โหลด Dashboard ไม่สำเร็จ</strong>
      <p>กรุณาตรวจสอบ Web App URL และสิทธิ์การเข้าถึง Google Sheets</p>
    </div>
  `;
  document.getElementById("dashboardCharts").innerHTML = `
    <div class="empty-state">
      <strong>เตรียมกราฟไม่สำเร็จ</strong>
      <p>ต้องโหลดข้อมูลโครงการก่อนจึงจะแสดงกราฟได้</p>
    </div>
  `;
}

function renderSummaryList(targetId, rows, labelResolver = null) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const firstHeader = targetId === "summaryStrategy" ? "ยุทธศาสตร์" : "รายการ";
  if (!rows.length) {
    target.innerHTML = `
      <div class="inline-loading">
        <p>ยังไม่มีข้อมูลสำหรับสรุป</p>
      </div>
    `;
    return;
  }

  target.innerHTML = `
    <div class="summary-table-wrap">
      <table class="summary-table">
        <thead>
          <tr>
            <th>${firstHeader}</th>
            <th>จำนวนกิจกรรม</th>
            <th>งบประมาณตามแผน</th>
            <th>งบประมาณใช้จริง</th>
            <th>ใช้จริง (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${escapeHtml(labelResolver ? labelResolver(row.key || row.name) : (row.name || row.key || "ไม่ระบุ"))}</td>
              <td>${numberFormatter.format(toNumber(row.count))}</td>
              <td>${formatMoney(row.planBudgetSum)}</td>
              <td>${formatMoney(row.actualBudgetSum)}</td>
              <td>${formatBudgetPercent(row.actualBudgetSum, row.planBudgetSum)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function getDashboardSummaryConfigs(data) {
  return {
    planType: {
      title: "สรุปตามแผนงาน",
      firstHeader: "รายการ",
      rows: sortSummaryRows(data.byPlanType || [], "planType"),
      labelResolver: getPlanTypeLabel
    },
    strategy: {
      title: "สรุปตามยุทธศาสตร์",
      firstHeader: "ยุทธศาสตร์",
      rows: sortSummaryRows(data.byStrategy || [], "strategy"),
      labelResolver: getStrategySummaryLabel
    },
    status: {
      title: "สรุปตามสถานะ",
      firstHeader: "รายการ",
      rows: data.byStatus || [],
      labelResolver: null
    }
  };
}

function renderDashboardSummaryTabs(data) {
  const configs = getDashboardSummaryConfigs(data);
  const activeType = configs[state.dashboardSummaryType] ? state.dashboardSummaryType : "planType";
  const active = configs[activeType];

  return `
    <section class="panel dashboard-summary-tabs-panel">
      <div class="panel-header dashboard-summary-tabs-head">
        <h3>${escapeHtml(`ตาราง${active.title}`)}</h3>
        <div class="segmented-control" role="tablist" aria-label="เลือกตารางสรุป">
          ${Object.entries(configs).map(([type, config]) => `
            <button type="button" class="${activeType === type ? "active" : ""}" onclick="setDashboardSummaryType('${escapeJs(type)}')">
              ${escapeHtml(config.title.replace("สรุปตาม", ""))}
            </button>
          `).join("")}
        </div>
      </div>
      ${renderDashboardSummaryTable(active.rows, active.firstHeader, active.labelResolver)}
    </section>
  `;
}

function renderDashboardSummaryTable(rows, firstHeader, labelResolver = null) {
  if (!rows.length) {
    return `
      <div class="inline-loading">
        <p>ยังไม่มีข้อมูลสำหรับสรุป</p>
      </div>
    `;
  }

  return `
    <div class="summary-table-wrap">
      <table class="summary-table">
        <thead>
          <tr>
            <th>${escapeHtml(firstHeader)}</th>
            <th>จำนวนกิจกรรม</th>
            <th>งบประมาณตามแผน</th>
            <th>งบประมาณใช้จริง</th>
            <th>ใช้จริง (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${escapeHtml(labelResolver ? labelResolver(row.key || row.name) : (row.name || row.key || "ไม่ระบุ"))}</td>
              <td>${numberFormatter.format(toNumber(row.count))}</td>
              <td>${formatMoney(row.planBudgetSum)}</td>
              <td>${formatMoney(row.actualBudgetSum)}</td>
              <td>${formatBudgetPercent(row.actualBudgetSum, row.planBudgetSum)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDashboardCharts(data, projects, allProjects) {
  const target = document.getElementById("dashboardCharts");
  if (!target) return;

  if (!allProjects.length) {
    target.innerHTML = `
      <div class="empty-state">
        <strong>ยังไม่มีข้อมูลสำหรับแสดงกราฟ</strong>
        <p>เมื่อมีโครงการ ระบบจะแสดงกราฟสรุปและกราฟเปรียบเทียบงบประมาณอัตโนมัติ</p>
      </div>
    `;
    return;
  }

  target.innerHTML = `
    <section class="panel pie-summary-panel">
      <div class="chart-controls pie-summary-controls">
        <div>
          <h3>กราฟสรุปแบบวงกลม</h3>
          <p>คลิกชิ้นกราฟหรือรายการด้านขวาเพื่อกรองกราฟอื่นร่วมกัน</p>
        </div>
        <div class="segmented-control" role="group" aria-label="เลือกข้อมูลกราฟวงกลม">
          ${renderPieMetricButton("count", "จำนวนกิจกรรม")}
          ${renderPieMetricButton("planBudgetSum", "งบที่ได้")}
          ${renderPieMetricButton("actualBudgetSum", "ใช้จริง")}
        </div>
      </div>

      <div class="pie-chart-grid">
        ${renderPiePanel("สรุปตามแผนงาน", sortSummaryRows(data.byPlanType || [], "planType"), "planType", getPlanTypeLabel)}
        ${renderPiePanel("สรุปตามยุทธศาสตร์", sortSummaryRows(data.byStrategy || [], "strategy"), "strategy", getStrategySummaryLabel)}
        ${renderPiePanel("สรุปตามสถานะ", data.byStatus || [], "status")}
      </div>

      ${renderDashboardSummaryTabs(data)}
    </section>

    <div class="panel chart-panel budget-comparison-panel">
      <div class="panel-header">
        <div>
          <h3>กราฟเปรียบเทียบงบประมาณรายโครงการ</h3>
          <p class="muted">งบที่ได้ ใช้จริง และคงเหลือ แสดงทุกโครงการแบบแบ่งหน้า</p>
        </div>
      </div>
      ${renderBudgetOverviewChart(data)}
      ${renderProjectBudgetChart(projects)}
    </div>

    ${renderQuarterProjectChart(projects)}
  `;
  initQuarterGanttResize();
}

function renderPieMetricButton(metric, label) {
  return `
    <button
      class="${state.dashboardPieMetric === metric ? "active" : ""}"
      type="button"
      onclick="setDashboardPieMetric('${escapeJs(metric)}')"
    >${escapeHtml(label)}</button>
  `;
}

function renderDashboardFilterBar(allProjects) {
  const years = uniqueValues(allProjects.map(project => project.FISCAL_YEAR)).sort().reverse();
  const quarters = uniqueValues(allProjects.flatMap(getProjectQuarters)).sort();
  ensureDashboardDefaultYear();

  return `
    <div class="dashboard-filter-bar dashboard-filter-card" aria-label="ตัวกรอง Dashboard">
      <div class="dashboard-filter-controls">
        <label class="dashboard-search-field">
          ค้นหาชื่อโครงการ
          <input type="search" value="${escapeAttr(state.dashboardFilters.projectSearch)}" placeholder="พิมพ์ชื่อโครงการ..." oninput="setDashboardSearchFilter(this.value)" />
        </label>
        <label>
          ปีงบประมาณ
          <select onchange="setDashboardFilter('year', this.value)">
            ${years.map(year => `<option value="${escapeAttr(year)}" ${String(state.dashboardFilters.year) === String(year) ? "selected" : ""}>${escapeHtml(year)}</option>`).join("")}
          </select>
        </label>
        <label>
          ไตรมาส
          <select onchange="setDashboardFilter('quarter', this.value)">
            <option value="">ทุกไตรมาส</option>
            ${quarters.map(quarter => `<option value="${escapeAttr(quarter)}" ${String(state.dashboardFilters.quarter) === String(quarter) ? "selected" : ""}>${escapeHtml(quarter)}</option>`).join("")}
          </select>
        </label>
        <button class="btn secondary dashboard-reset-filter" type="button" onclick="resetDashboardFilters()">ล้างตัวกรอง</button>
      </div>
      <div class="dashboard-filter-state">
        ${renderDashboardFilterChip("projectSearch", "ค้นหา")}
        ${renderDashboardFilterChip("planType", "แผนงาน", getPlanTypeLabel)}
        ${renderDashboardFilterChip("strategy", "ยุทธศาสตร์", getStrategySummaryLabel)}
        ${renderDashboardFilterChip("status", "สถานะ")}
      </div>
    </div>
  `;
}

function renderDashboardFilterChip(filterType, label, labelResolver = null) {
  const value = state.dashboardFilters[filterType];
  if (!value) return "";
  const display = labelResolver ? labelResolver(value) : value;
  return `
    <button class="filter-chip" type="button" onclick="setDashboardFilter('${escapeJs(filterType)}', '')">
      ${escapeHtml(label)}: ${escapeHtml(display)} <span>×</span>
    </button>
  `;
}

function renderPiePanel(title, rows, filterType, labelResolver = null) {
  const metric = state.dashboardPieMetric;
  const total = rows.reduce((sum, row) => sum + getPieMetricValue(row, metric), 0);
  const activeKey = state.dashboardFilters[filterType] || "";

  return `
    <article class="panel pie-chart-panel ${activeKey ? "has-filter" : ""}" onclick="setDashboardSummaryType('${escapeJs(filterType)}')">
      <div class="panel-header">
        <h3>${escapeHtml(title)}</h3>
        <span class="badge">${activeKey ? "กำลังกรอง" : escapeHtml(getPieMetricLabel(metric))}</span>
      </div>
      <div class="pie-chart-body">
        ${renderPieSvg(rows, metric, filterType, labelResolver, total)}
        ${renderPieLegend(rows, metric, filterType, labelResolver, total)}
      </div>
    </article>
  `;
}

function renderPieSvg(rows, metric, filterType, labelResolver, total) {
  const colors = getChartColors();
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const activeKey = state.dashboardFilters[filterType] || "";

  if (!total) {
    return `
      <svg class="pie-chart" viewBox="0 0 120 120" role="img" aria-label="ยังไม่มีข้อมูล">
        <circle cx="60" cy="60" r="${radius}" fill="none" stroke="#E5E7EB" stroke-width="18"></circle>
        <text x="60" y="65" text-anchor="middle">0</text>
      </svg>
    `;
  }

  const segments = rows.map((row, index) => {
    const value = getPieMetricValue(row, metric);
    const dash = (value / total) * circumference;
    const key = row.key || row.name || "ไม่ระบุ";
    const label = labelResolver ? labelResolver(row.key || row.name) : (row.name || row.key || "ไม่ระบุ");
    const isActive = String(activeKey) === String(key);
    const segment = `
      <circle
        cx="60"
        cy="60"
        r="${radius}"
        fill="none"
        stroke="${colors[index % colors.length]}"
        stroke-width="18"
        stroke-dasharray="${dash} ${circumference - dash}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 60 60)"
        class="${isActive ? "active" : ""}"
        tabindex="0"
        onclick="event.stopPropagation(); selectDashboardSummaryType('${escapeJs(filterType)}'); toggleDashboardChartFilter('${escapeJs(filterType)}', '${escapeJs(key)}')"
      >
        <title>${escapeHtml(label)}: ${escapeHtml(formatPieValue(value, metric))}</title>
      </circle>
    `;
    offset += dash;
    return segment;
  }).join("");

  return `
    <svg class="pie-chart" viewBox="0 0 120 120" role="img" aria-label="${escapeAttr(getPieMetricLabel(metric))}">
      <circle cx="60" cy="60" r="${radius}" fill="none" stroke="#E5E7EB" stroke-width="18"></circle>
      ${segments}
      <text x="60" y="56" text-anchor="middle">${escapeHtml(numberFormatter.format(rows.length))}</text>
      <text x="60" y="72" text-anchor="middle">กลุ่ม</text>
    </svg>
  `;
}

function renderPieLegend(rows, metric, filterType, labelResolver, total) {
  const colors = getChartColors();
  const activeKey = state.dashboardFilters[filterType] || "";

  return `
    <div class="pie-legend">
      ${rows.map((row, index) => {
        const value = getPieMetricValue(row, metric);
        const percent = total > 0 ? (value / total) * 100 : 0;
        const key = row.key || row.name || "ไม่ระบุ";
        const label = labelResolver ? labelResolver(row.key || row.name) : (row.name || row.key || "ไม่ระบุ");
        const isActive = String(activeKey) === String(key);
        return `
          <button class="legend-item ${isActive ? "active" : ""}" type="button" onclick="event.stopPropagation(); selectDashboardSummaryType('${escapeJs(filterType)}'); toggleDashboardChartFilter('${escapeJs(filterType)}', '${escapeJs(key)}')" title="${escapeAttr(label)}">
            <span class="legend-dot" style="background:${colors[index % colors.length]}"></span>
            <span class="legend-label">${escapeHtml(label)}</span>
            <strong>${escapeHtml(formatPieValue(value, metric))}</strong>
            <em>${formatPercent(percent)}%</em>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderBudgetOverviewChart(data) {
  const rows = [
    { label: "งบที่ได้", value: toNumber(data.planBudgetSum), percent: "100%", color: "#0B1F3A" },
    { label: "ใช้จริง", value: toNumber(data.actualBudgetSum), percent: formatBudgetPercent(data.actualBudgetSum, data.planBudgetSum), color: "#2563EB" },
    { label: "คงเหลือ", value: toNumber(data.remainBudgetSum), percent: formatBudgetPercent(data.remainBudgetSum, data.planBudgetSum), color: "#D4AF37" }
  ];
  const max = Math.max(...rows.map(row => row.value), 1);

  return `
    <div class="budget-overview-chart">
      <div class="overview-bars">
        ${rows.map(row => `
          <div class="overview-bar-item">
            <span>${escapeHtml(row.label)}</span>
            <div class="overview-bar-track">
              <i style="width:${clamp((row.value / max) * 100, 0, 100)}%; background:${row.color};"></i>
            </div>
            <strong>${formatMoney(row.value)}</strong>
            <em>${escapeHtml(row.percent)} ของงบที่ได้</em>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderQuarterProjectChart(projects) {
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const isCollapsed = localStorage.getItem("quarterGanttCollapsed") === "true";
  const selectedQuarter = String(state.dashboardFilters.quarter || "");
  const visibleProjects = projects
    .slice()
    .sort((a, b) => String(getActivityKey(a) || "").localeCompare(String(getActivityKey(b) || ""), "th"));
  const projectsByQuarter = groupProjectsByQuarter(visibleProjects, quarters);
  const rowCount = Math.max(...quarters.map(quarter => projectsByQuarter[quarter].length), 0);

  return `
    <div class="panel quarter-chart-panel">
      <div class="panel-header">
        <div>
          <h3>ติดตามกิจกรรมตามไตรมาส</h3>
          <p class="muted">แสดงชื่อโครงการ กิจกรรม และสถานะ วางเมาส์เพื่อดูรหัสและรายละเอียด คลิกหัวไตรมาสเพื่อกรองทุกกราฟ</p>
        </div>
        <button class="btn secondary small-btn" type="button" onclick="toggleQuarterGanttCollapse()">
          ${isCollapsed ? "ขยาย" : "ยุบ"}
        </button>
      </div>
      <div class="quarter-gantt ${isCollapsed ? "collapsed" : ""} ${selectedQuarter ? "quarter-filter-mode" : ""}">
        <div class="quarter-gantt-head">
          ${quarters.map(quarter => renderQuarterGanttHeader(quarter, projects)).join("")}
        </div>
        <div class="quarter-gantt-body">
          ${rowCount ? Array.from({ length: rowCount }, (_, index) => renderQuarterGanttPackedRow(index, quarters, projectsByQuarter)).join("") : `<div class="quarter-gantt-empty">ไม่มีโครงการ</div>`}
        </div>
      </div>
    </div>
  `;
}

function groupProjectsByQuarter(projects, quarters) {
  const grouped = Object.fromEntries(quarters.map(quarter => [quarter, []]));
  projects.forEach(project => {
    getProjectQuarters(project).forEach(quarter => {
      if (grouped[quarter]) grouped[quarter].push(project);
    });
  });
  return grouped;
}

function renderQuarterGanttPackedRow(rowIndex, quarters, projectsByQuarter) {
  return `
    <div class="quarter-gantt-row">
      <div class="quarter-gantt-track">
        ${quarters.map(quarter => `
          <div class="quarter-gantt-cell ${projectsByQuarter[quarter][rowIndex] ? "filled" : ""}">
            ${projectsByQuarter[quarter][rowIndex] ? renderQuarterGanttBar(projectsByQuarter[quarter][rowIndex]) : ""}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function toggleQuarterGanttCollapse() {
  const next = localStorage.getItem("quarterGanttCollapsed") !== "true";
  localStorage.setItem("quarterGanttCollapsed", String(next));
  renderDashboard();
}

function renderQuarterGanttHeader(quarter, projects) {
  const isActive = String(state.dashboardFilters.quarter || "") === String(quarter);
  const count = projects.filter(project => getProjectQuarters(project).includes(quarter)).length;
  const quarterLabel = getQuarterFullLabel(quarter);
  const monthLabel = getQuarterMonthLabel(quarter);
  return `
    <button class="quarter-gantt-quarter ${isActive ? "active" : ""}" type="button" onclick="toggleDashboardChartFilter('quarter', '${escapeJs(quarter)}')">
      <span class="quarter-title">
        <strong>${escapeHtml(quarterLabel)}</strong>
        <em>${escapeHtml(monthLabel)}</em>
      </span>
      <span class="quarter-count">${numberFormatter.format(count)} กิจกรรม</span>
      <span class="quarter-resizer" onpointerdown="startQuarterResize(event, '${escapeJs(quarter)}')" title="ลากเพื่อปรับความกว้าง"></span>
    </button>
  `;
}

function initQuarterGanttResize() {
  const gantt = document.querySelector(".quarter-gantt");
  if (!gantt) return;
  const saved = getSavedQuarterWidths();
  applyQuarterWidths(gantt, saved);
}

function startQuarterResize(event, quarter) {
  event.preventDefault();
  event.stopPropagation();

  const gantt = event.currentTarget.closest(".quarter-gantt");
  if (!gantt) return;

  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const index = quarters.indexOf(quarter);
  if (index < 0) return;

  const widths = getCurrentQuarterWidths(gantt);
  const startX = event.clientX;
  const startWidth = widths[index];

  const onMove = moveEvent => {
    const nextWidth = Math.max(140, startWidth + moveEvent.clientX - startX);
    widths[index] = nextWidth;
    applyQuarterWidths(gantt, widths);
  };

  const onUp = () => {
    localStorage.setItem("quarterGanttWidths", JSON.stringify(widths));
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.body.classList.remove("is-resizing-quarter");
  };

  document.body.classList.add("is-resizing-quarter");
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp, { once: true });
}

function getSavedQuarterWidths() {
  try {
    const widths = JSON.parse(localStorage.getItem("quarterGanttWidths") || "[]");
    if (Array.isArray(widths) && widths.length === 4) return widths.map(width => Math.max(140, Number(width) || 180));
  } catch (error) {
    console.warn("Cannot read quarter widths", error);
  }
  return [180, 180, 180, 180];
}

function getCurrentQuarterWidths(gantt) {
  const current = getComputedStyle(gantt).getPropertyValue("--quarter-widths").trim();
  if (!current) return getSavedQuarterWidths();
  const widths = current.split(/\s+/).map(item => Number(item.replace("px", "")));
  return widths.length === 4 ? widths.map(width => Math.max(140, width || 180)) : getSavedQuarterWidths();
}

function applyQuarterWidths(gantt, widths) {
  const normalized = widths.map(width => `${Math.max(140, Number(width) || 180)}px`);
  gantt.style.setProperty("--quarter-widths", normalized.join(" "));
  gantt.style.setProperty("--quarter-total-width", `${widths.reduce((sum, width) => sum + Math.max(140, Number(width) || 180), 0)}px`);
}

function renderQuarterGanttRow(project, quarters) {
  const projectQuarters = getProjectQuarters(project);
  const activeQuarterSet = new Set(projectQuarters);
  const projectName = project.PROJECT_NAME || getActivityKey(project) || "-";
  const activityName = project.ACTIVITY_NAME && String(project.ACTIVITY_NAME) !== String(projectName) ? project.ACTIVITY_NAME : "";
  const statusClass = getStatusClass(project.STATUS);
  const tooltip = [
    project.ACTIVITY_ID || "-",
    project.PROJECT_ID || "-",
    projectName,
    activityName,
    `สถานะ: ${project.STATUS || "-"}`,
    `ไตรมาส: ${projectQuarters.join(", ") || "ไม่ระบุ"}`
  ].filter(Boolean).join("\n");
  const barContent = `
    <span class="quarter-gantt-name">
      <b>${escapeHtml(projectName)}</b>
      ${activityName ? `<small>${escapeHtml(activityName)}</small>` : ""}
    </span>
    <i>${escapeHtml(project.STATUS || "-")}</i>
  `;
  return `
    <div class="quarter-gantt-row">
      <div class="quarter-gantt-track">
        ${quarters.map(quarter => `
          <div class="quarter-gantt-cell ${activeQuarterSet.has(quarter) ? "filled" : ""}" title="${escapeAttr(tooltip)}">
            ${activeQuarterSet.has(quarter) ? `
              <button class="quarter-gantt-bar ${escapeAttr(statusClass)}" type="button" onclick="openDetail('${escapeJs(getActivityKey(project))}')">
                ${barContent}
              </button>
            ` : ""}
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function getQuarterMonthLabel(quarter) {
  const labels = {
    Q1: "ต.ค.-ธ.ค.",
    Q2: "ม.ค.-มี.ค.",
    Q3: "เม.ย.-มิ.ย.",
    Q4: "ก.ค.-ก.ย."
  };
  return labels[quarter] || "";
}

function renderQuarterGanttBar(project) {
  const projectQuarters = getProjectQuarters(project);
  const projectName = project.PROJECT_NAME || getActivityKey(project) || "-";
  const activityName = project.ACTIVITY_NAME && String(project.ACTIVITY_NAME) !== String(projectName) ? project.ACTIVITY_NAME : "";
  const statusClass = getStatusClass(project.STATUS);
  const tooltip = [
    project.ACTIVITY_ID || "-",
    project.PROJECT_ID || "-",
    projectName,
    activityName,
    `สถานะ: ${project.STATUS || "-"}`,
    `ไตรมาส: ${projectQuarters.join(", ") || "ไม่ระบุ"}`
  ].filter(Boolean).join("\n");
  return `
    <button class="quarter-gantt-bar ${escapeAttr(statusClass)}" type="button" onclick="openDetail('${escapeJs(getActivityKey(project))}')" title="${escapeAttr(tooltip)}">
      <span class="quarter-gantt-name">
        <b>${escapeHtml(projectName)}</b>
        ${activityName ? `<small>${escapeHtml(activityName)}</small>` : ""}
      </span>
      <i>${escapeHtml(project.STATUS || "-")}</i>
    </button>
  `;
}

function getQuarterFullLabel(quarter) {
  const labels = {
    Q1: "ไตรมาสที่ 1",
    Q2: "ไตรมาสที่ 2",
    Q3: "ไตรมาสที่ 3",
    Q4: "ไตรมาสที่ 4"
  };
  return labels[quarter] || quarter;
}

function renderQuarterColumn(quarter, rows) {
  const isActive = String(state.dashboardFilters.quarter || "") === String(quarter);
  return `
    <article class="quarter-column ${isActive ? "active" : ""}">
      <button type="button" onclick="toggleDashboardChartFilter('quarter', '${escapeJs(quarter)}')">
        <strong>${escapeHtml(getQuarterFullLabel(quarter))}</strong>
        <span>${numberFormatter.format(rows.length)} กิจกรรม</span>
      </button>
      <div class="quarter-project-list">
        ${rows.length ? rows.slice(0, 8).map(project => `
          <div class="quarter-project" title="${escapeAttr(project.PROJECT_NAME || getActivityKey(project))}">
            ${escapeHtml(project.PROJECT_NAME || getActivityKey(project))}
          </div>
        `).join("") : `<div class="quarter-empty">ไม่มีโครงการ</div>`}
        ${rows.length > 8 ? `<em>+${numberFormatter.format(rows.length - 8)} รายการ</em>` : ""}
      </div>
    </article>
  `;
}

function renderProjectBudgetChart(projects) {
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(projects.length / pageSize));
  state.dashboardBudgetPage = Math.min(Math.max(state.dashboardBudgetPage || 1, 1), totalPages);
  const start = (state.dashboardBudgetPage - 1) * pageSize;
  const rows = projects.slice(start, start + pageSize);
  const max = Math.max(...rows.flatMap(project => [
    toNumber(project.PLAN_BUDGET),
    toNumber(project.ACTUAL_BUDGET),
    getRemainBudget(project)
  ]), 1);

  return `
    <div class="project-budget-chart">
      <div class="project-budget-head">
        <h4>งบประมาณรายโครงการ</h4>
        <div class="budget-pagination">
          <button class="btn secondary small-btn" type="button" onclick="changeDashboardBudgetPage(-1)" ${state.dashboardBudgetPage <= 1 ? "disabled" : ""}>ก่อนหน้า</button>
          <span>หน้า ${numberFormatter.format(state.dashboardBudgetPage)} / ${numberFormatter.format(totalPages)}</span>
          <button class="btn secondary small-btn" type="button" onclick="changeDashboardBudgetPage(1)" ${state.dashboardBudgetPage >= totalPages ? "disabled" : ""}>ถัดไป</button>
        </div>
      </div>
      <div class="budget-legend">
        <span><i class="plan"></i>งบที่ได้</span>
        <span><i class="actual"></i>ใช้จริง</span>
        <span><i class="remain"></i>คงเหลือ</span>
        <em>แสดง ${numberFormatter.format(start + 1)}-${numberFormatter.format(Math.min(start + rows.length, projects.length))} จาก ${numberFormatter.format(projects.length)} กิจกรรม</em>
      </div>
      <div class="project-budget-rows">
        ${rows.map(project => renderProjectBudgetRow(project, max)).join("")}
      </div>
    </div>
  `;
}

function renderProjectBudgetRow(project, max) {
  const plan = toNumber(project.PLAN_BUDGET);
  const actual = toNumber(project.ACTUAL_BUDGET);
  const remain = getRemainBudget(project);
  const actualPercent = plan > 0 ? (actual / plan) * 100 : 0;
  const remainPercent = plan > 0 ? (remain / plan) * 100 : 0;
  const projectName = project.PROJECT_NAME || getActivityKey(project);
  const activityName = project.ACTIVITY_NAME && String(project.ACTIVITY_NAME) !== String(projectName) ? project.ACTIVITY_NAME : "";

  return `
    <div class="project-budget-row" title="คลิกชื่อเพื่อดูรายละเอียดโครงการ">
      <button class="project-budget-name" type="button" onclick="openDetail('${escapeJs(getActivityKey(project))}')" title="${escapeAttr(activityName ? `${projectName}\n${activityName}` : projectName)}">
        <strong>${escapeHtml(projectName)}</strong>
        ${activityName ? `<span>${escapeHtml(activityName)}</span>` : ""}
      </button>
      <div class="project-budget-stack">
        ${renderBudgetMiniBar("plan", plan, max, "money", "", "งบที่ได้")}
        ${renderBudgetMiniBar("actual", actual, max, "money", ` (${numberFormatter.format(Math.round(actualPercent))}%)`, "ใช้จริง")}
        ${renderBudgetMiniBar("remain", remain, max, "money", ` (${numberFormatter.format(Math.round(remainPercent))}%)`, "คงเหลือ")}
      </div>
    </div>
  `;
}

function renderBudgetMiniBar(type, value, max, formatType = "money", suffix = "", labelText = "") {
  const percent = clamp((value / max) * 100, 0, 100);
  const label = `${formatType === "percent" ? `${numberFormatter.format(Math.round(value))}%` : formatMoney(value)}${suffix}`;
  return `
    <div class="budget-mini-bar ${type} ${percent >= 42 ? "label-on-fill" : ""}">
      ${labelText ? `<b>${escapeHtml(labelText)}</b>` : ""}
      <span style="width:${percent}%"></span>
      <em>${label}</em>
    </div>
  `;
}

function setDashboardPieMetric(metric) {
  state.dashboardPieMetric = metric;
  renderDashboard();
}

function isDashboardSummaryType(type) {
  return ["planType", "strategy", "status"].includes(type);
}

function selectDashboardSummaryType(type) {
  if (isDashboardSummaryType(type)) state.dashboardSummaryType = type;
}

function setDashboardSummaryType(type) {
  selectDashboardSummaryType(type);
  renderDashboard();
}

function setDashboardFilter(filterType, value) {
  selectDashboardSummaryType(filterType);
  state.dashboardFilters[filterType] = value;
  state.dashboardBudgetProjectId = "";
  state.dashboardBudgetPage = 1;
  renderDashboard();
}

function setDashboardSearchFilter(value) {
  state.dashboardFilters.projectSearch = value;
  state.dashboardBudgetProjectId = "";
  state.dashboardBudgetPage = 1;
  clearTimeout(state.dashboardSearchTimer);
  state.dashboardSearchTimer = setTimeout(renderDashboard, 180);
}

function toggleDashboardChartFilter(filterType, value) {
  selectDashboardSummaryType(filterType);
  const current = String(state.dashboardFilters[filterType] || "");
  state.dashboardFilters[filterType] = current === String(value) ? "" : value;
  state.dashboardBudgetProjectId = "";
  state.dashboardBudgetPage = 1;
  renderDashboard();
}

function resetDashboardFilters() {
  state.dashboardFilters = {
    projectSearch: "",
    year: getDefaultDashboardYear(),
    quarter: "",
    planType: "",
    strategy: "",
    status: ""
  };
  state.dashboardBudgetProjectId = "";
  state.dashboardBudgetPage = 1;
  renderDashboard();
}

function setDashboardBudgetProject(projectId) {
  state.dashboardBudgetProjectId = projectId;
  renderDashboard();
}

function changeDashboardBudgetPage(delta) {
  state.dashboardBudgetPage = Math.max(1, state.dashboardBudgetPage + delta);
  renderDashboard();
}

function filterDashboardByProjectName(projectName) {
  state.dashboardFilters.projectSearch = projectName || "";
  state.dashboardBudgetPage = 1;
  state.dashboardBudgetProjectId = "";
  renderDashboard();
}

function getDashboardFilteredProjects() {
  const filters = state.dashboardFilters;
  const keyword = String(filters.projectSearch || "").trim().toLowerCase();
  return (state.projects || []).filter(project => {
    const searchableName = [project.PROJECT_NAME, project.PROJECT_ID, project.ACTIVITY_ID, project.ACTIVITY_NAME].join(" ").toLowerCase();
    return (!keyword || searchableName.includes(keyword)) &&
      (!filters.year || String(project.FISCAL_YEAR) === String(filters.year)) &&
      (!filters.quarter || getProjectQuarters(project).includes(String(filters.quarter))) &&
      (!filters.planType || String(project.PLAN_TYPE || "ไม่ระบุ") === String(filters.planType)) &&
      (!filters.strategy || String(project.STRATEGY_ID || "ไม่ระบุ") === String(filters.strategy)) &&
      (!filters.status || String(project.STATUS || "ไม่ระบุ") === String(filters.status));
  });
}

function getPieMetricValue(row, metric) {
  if (metric === "planBudgetSum") return toNumber(row.planBudgetSum);
  if (metric === "actualBudgetSum") return toNumber(row.actualBudgetSum);
  return toNumber(row.count);
}

function getPieMetricLabel(metric) {
  if (metric === "planBudgetSum") return "งบที่ได้";
  if (metric === "actualBudgetSum") return "ใช้จริง";
  return "จำนวนกิจกรรม";
}

function formatPieValue(value, metric) {
  return metric === "count" ? `${numberFormatter.format(toNumber(value))} กิจกรรม` : formatMoney(value);
}

function getRemainBudget(project) {
  const explicit = toNumber(project.REMAIN_BUDGET);
  if (explicit) return explicit;
  return Math.max(toNumber(project.PLAN_BUDGET) - toNumber(project.ACTUAL_BUDGET), 0);
}

function getProjectParticipantTotal(project) {
  const explicit = toNumber(project.PARTICIPANT_RESULT || project.PARTICIPANT_TARGET || project.ATTENDEE_COUNT);
  if (explicit) return explicit;
  const studentTotal = toNumber(project.TOTAL_STUDENT_COUNT) || (
    toNumber(project.STUDENT_YEAR1_COUNT) +
    toNumber(project.STUDENT_YEAR2_COUNT) +
    toNumber(project.STUDENT_YEAR3_COUNT) +
    toNumber(project.STUDENT_YEAR4_COUNT)
  );
  const externalTotal = toBool(project.HAS_EXTERNAL_PARTICIPANT) ? toNumber(project.EXTERNAL_PARTICIPANT_COUNT) : 0;
  return toNumber(project.TEACHER_COUNT) +
    toNumber(project.SUPPORT_STAFF_COUNT) +
    studentTotal +
    externalTotal;
}

function getProjectStartDate(project) {
  const date = parseProjectDate(project.START_DATE);
  if (date) return date;
  const quarters = getProjectQuarters(project);
  return getFiscalQuarterDate(project.FISCAL_YEAR, quarters[0] || "Q1", true);
}

function getProjectEndDate(project) {
  const date = parseProjectDate(project.END_DATE);
  if (date) return date;
  const quarters = getProjectQuarters(project);
  return getFiscalQuarterDate(project.FISCAL_YEAR, quarters[quarters.length - 1] || quarters[0] || "Q1", false);
}

function parseProjectDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getFiscalQuarterDate(fiscalYear, quarter, isStart) {
  const yearBE = toNumber(fiscalYear) || (new Date().getFullYear() + 543);
  const yearAD = yearBE > 2400 ? yearBE - 543 : yearBE;
  const map = {
    Q1: isStart ? [yearAD - 1, 9, 1] : [yearAD - 1, 11, 31],
    Q2: isStart ? [yearAD, 0, 1] : [yearAD, 2, 31],
    Q3: isStart ? [yearAD, 3, 1] : [yearAD, 5, 30],
    Q4: isStart ? [yearAD, 6, 1] : [yearAD, 8, 30]
  };
  const parts = map[quarter] || map.Q1;
  return new Date(parts[0], parts[1], parts[2]);
}

function getFiscalTimelinePosition(project) {
  const fiscalYear = project.FISCAL_YEAR || new Date().getFullYear() + 543;
  const start = getProjectStartDate(project);
  const end = getProjectEndDate(project);
  const yearBE = toNumber(fiscalYear) || (new Date().getFullYear() + 543);
  const yearAD = yearBE > 2400 ? yearBE - 543 : yearBE;
  const fiscalStart = new Date(yearAD - 1, 9, 1);
  const fiscalEnd = new Date(yearAD, 8, 30);
  const totalMs = Math.max(1, fiscalEnd.getTime() - fiscalStart.getTime());
  const left = clamp(((start.getTime() - fiscalStart.getTime()) / totalMs) * 100, 0, 100);
  const right = clamp(((end.getTime() - fiscalStart.getTime()) / totalMs) * 100, 0, 100);
  return {
    left,
    width: Math.max(3, right - left)
  };
}

function getChartColors() {
  return ["#0B1F3A", "#D4AF37", "#2563EB", "#16A34A", "#DC2626", "#7C3AED", "#0891B2", "#EA580C"];
}

function populateMasterDropdowns() {
  const planTypeSelect = document.getElementById("PLAN_TYPE");
  planTypeSelect.innerHTML = `<option value="">เลือกแผนงาน</option>` + state.planTypes.map(item => {
    const value = item.PLAN_TYPE_ID || item.PLAN_CODE || item.PLAN_NAME;
    const label = item.PLAN_NAME || item.PLAN_CODE || item.PLAN_TYPE_ID;
    return `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`;
  }).join("");

  const strategySelect = document.getElementById("STRATEGY_ID");
  strategySelect.innerHTML = `<option value="">เลือกยุทธศาสตร์</option>` + state.strategies.map(item => {
    const label = getStrategyOptionLabel(item);
    return `<option value="${escapeAttr(item.STRATEGY_ID)}">${escapeHtml(label)}</option>`;
  }).join("");

  handleStrategyChange();
}

function getStrategyOptionLabel(strategy) {
  const code = String(strategy.STRATEGY_CODE || strategy.STRATEGY_ID || "").trim();
  const name = String(strategy.STRATEGY_NAME || "").trim();
  const number = (code.match(/\d+/) || name.match(/ยุทธศาสตร์\s*(\d+)/) || [])[0];
  const prefix = number ? `ยุทธศาสตร์ ${number}` : (code || "ยุทธศาสตร์");
  return name ? `${prefix} - ${name}` : prefix;
}

function populateExistingProjectSelect() {
  const select = document.getElementById("existingProjectSelect");
  if (!select) return;
  const currentProjectId = document.getElementById("PROJECT_ID")?.value || "";
  const projects = getUniqueProjectOptions();

  select.innerHTML = `<option value="">สร้างโครงการใหม่ / กรอกเอง</option>` + projects.map(project => `
    <option value="${escapeAttr(project.PROJECT_ID)}">${escapeHtml(project.PROJECT_NAME)} (${escapeHtml(project.PROJECT_ID)})</option>
  `).join("");

  if (currentProjectId && projects.some(project => String(project.PROJECT_ID) === String(currentProjectId))) {
    select.value = currentProjectId;
  }
}

function getUniqueProjectOptions() {
  const map = new Map();
  (state.projects || []).forEach(project => {
    const projectId = String(project.PROJECT_ID || "").trim();
    const projectName = String(project.PROJECT_NAME || "").trim();
    if (!projectId || !projectName || map.has(projectId)) return;
    map.set(projectId, {
      PROJECT_ID: projectId,
      PROJECT_NAME: projectName
    });
  });

  return Array.from(map.values())
    .sort((a, b) => a.PROJECT_NAME.localeCompare(b.PROJECT_NAME, "th"));
}

function handleExistingProjectSelect() {
  const select = document.getElementById("existingProjectSelect");
  const selectedProjectId = select.value;
  const project = getUniqueProjectOptions().find(item => String(item.PROJECT_ID) === String(selectedProjectId));

  if (!project) {
    document.getElementById("PROJECT_ID").value = "";
    return;
  }

  document.getElementById("PROJECT_ID").value = project.PROJECT_ID;
  document.getElementById("PROJECT_NAME").value = project.PROJECT_NAME;
  syncNoSubActivityName();
}

function handleProjectNameInput() {
  const input = document.getElementById("PROJECT_NAME");
  const selectedProjectId = document.getElementById("PROJECT_ID").value;
  if (!selectedProjectId) return;

  const project = getUniqueProjectOptions().find(item => String(item.PROJECT_ID) === String(selectedProjectId));
  if (!project || String(project.PROJECT_NAME) !== String(input.value)) {
    document.getElementById("PROJECT_ID").value = "";
    document.getElementById("existingProjectSelect").value = "";
  }
}

function populateResponsibleDropdown() {
  const select = document.getElementById("RESPONSIBLE_PERSON_ID");
  select.innerHTML = `<option value="">เลือกผู้รับผิดชอบ 1</option>` + state.employees.map(emp => `
    <option value="${escapeAttr(emp.PERSON_ID)}">${escapeHtml(emp.FULL_NAME || emp.EMAIL || emp.PERSON_ID)}</option>
  `).join("");

  const coOwnerSelect = document.getElementById("CO_OWNER_PERSON_ID");
  if (coOwnerSelect) {
    coOwnerSelect.innerHTML = `<option value="">เลือกผู้รับผิดชอบ 2 (ถ้ามี)</option>` + state.employees.map(emp => `
      <option value="${escapeAttr(emp.PERSON_ID)}">${escapeHtml(emp.FULL_NAME || emp.EMAIL || emp.PERSON_ID)}</option>
    `).join("");
  }
}

function handleStrategyChange() {
  const strategyId = document.getElementById("STRATEGY_ID").value;
  const objectiveSelect = document.getElementById("OBJECTIVE_ID");
  const filtered = state.objectives.filter(item => String(item.STRATEGY_ID) === String(strategyId));

  objectiveSelect.disabled = !strategyId;
  objectiveSelect.innerHTML = strategyId
    ? `<option value="">เลือกเป้าประสงค์</option>` + filtered.map(item => {
      const label = item.OBJECTIVE_NAME || item.OBJECTIVE_CODE || item.OBJECTIVE_ID;
      return `<option value="${escapeAttr(item.OBJECTIVE_ID)}">${escapeHtml(label)}</option>`;
    }).join("")
    : `<option value="">เลือกยุทธศาสตร์ก่อน</option>`;

  handleObjectiveChange();
}

function handleObjectiveChange() {
  const objectiveId = document.getElementById("OBJECTIVE_ID").value;
  const strategyPlanSelect = document.getElementById("STRATEGY_PLAN_ID");
  const filtered = state.strategyPlans.filter(item => String(item.OBJECTIVE_ID) === String(objectiveId));

  strategyPlanSelect.disabled = !objectiveId;
  strategyPlanSelect.innerHTML = objectiveId
    ? `<option value="">เลือกกลยุทธ์</option>` + filtered.map(item => {
      const label = item.STRATEGY_PLAN_NAME || item.STRATEGY_PLAN_CODE || item.STRATEGY_PLAN_ID;
      return `<option value="${escapeAttr(item.STRATEGY_PLAN_ID)}">${escapeHtml(label)}</option>`;
    }).join("")
    : `<option value="">เลือกเป้าประสงค์ก่อน</option>`;
}

function handleResponsibleChange() {
  const personId = document.getElementById("RESPONSIBLE_PERSON_ID").value;
  const employee = state.employees.find(emp => String(emp.PERSON_ID) === String(personId));
  document.getElementById("RESPONSIBLE_FULL_NAME").value = employee ? (employee.FULL_NAME || "") : "";
  document.getElementById("RESPONSIBLE_EMAIL").value = employee ? (employee.EMAIL || "") : "";
}

function handleCoOwnerChange() {
  const personId = document.getElementById("CO_OWNER_PERSON_ID")?.value || "";
  const employee = state.employees.find(emp => String(emp.PERSON_ID) === String(personId));
  setValueIfExists("CO_OWNER_FULL_NAME", employee ? (employee.FULL_NAME || "") : "");
  setValueIfExists("CO_OWNER_EMAIL", employee ? (employee.EMAIL || "") : "");
}

function setSelectResolvedValue(selectId, rawValue, rows, matchFields) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const value = String(rawValue || "").trim();
  if (!value) {
    select.value = "";
    return;
  }
  const matched = (rows || []).find(row =>
    matchFields.some(field => String(row[field] || "").trim() === value)
  );
  const idField = matchFields[0];
  const resolvedValue = matched ? String(matched[idField] || value) : value;
  const hasOption = Array.from(select.options || []).some(option => String(option.value) === resolvedValue);
  select.value = hasOption ? resolvedValue : value;
}

function populateFilters() {
  const years = uniqueValues(state.projects.map(item => item.FISCAL_YEAR)).sort().reverse();
  const quarters = uniqueValues(state.projects.flatMap(getProjectQuarters)).sort();
  const statuses = uniqueValues(state.projects.map(item => item.STATUS)).sort();

  keepAndFillSelect("filterYear", years, "ทั้งหมด");
  keepAndFillSelect("filterQuarter", quarters, "ทั้งหมด");
  keepAndFillSelect("filterStatus", statuses, "ทั้งหมด");
}

function keepAndFillSelect(id, values, firstLabel) {
  const select = document.getElementById(id);
  const current = select.value;
  select.innerHTML = `<option value="">${firstLabel}</option>` + values.map(value => `
    <option value="${escapeAttr(value)}">${escapeHtml(value)}</option>
  `).join("");
  if (values.includes(current)) select.value = current;
}

function renderProjectsTable() {
  const wrap = document.getElementById("projectTableWrap");
  const filtered = getFilteredProjects();
  if (IS_UNIVERSITY_FORM) {
    renderUniversityProjectList(wrap, filtered);
    return;
  }

  const myWrap = document.getElementById("myProjectTableWrap");
  if (myWrap) {
    renderGroupedProjectTable(myWrap, filtered.filter(isOwnProject), {
      pageKey: "myProjectPage",
      emptyTitle: "ยังไม่มีรายการโครงการของฉันที่ตรงเงื่อนไข",
      emptyText: "ลองล้างตัวกรอง หรือเพิ่มโครงการใหม่",
      emptyAction: canCreateProject() ? `<button class="btn primary" type="button" onclick="openCreateForm()">+ เพิ่มโครงการ</button>` : ""
    });
  }

  renderGroupedProjectTable(wrap, filtered, {
    pageKey: "projectPage",
    emptyTitle: CURRENT_PROJECT_LEVEL ? "ยังไม่มีรายการโครงการคณะที่ตรงเงื่อนไข" : "ยังไม่มีรายการโครงการที่ตรงเงื่อนไข",
    emptyText: "ลองล้างตัวกรอง หรือเพิ่มโครงการใหม่",
    emptyAction: CURRENT_PROJECT_LEVEL
      ? (canCreateProject() ? `<button class="btn primary" type="button" onclick="openCreateForm()">+ เพิ่มโครงการ</button>` : "")
      : `<div class="empty-actions">
          <a class="btn primary" href="index_faculty.html#form">+ บันทึกโครงการคณะ</a>
          <a class="btn secondary" href="index_university.html#form">+ บันทึกโครงการมหาวิทยาลัย</a>
        </div>`
  });
  syncFacultyProjectsPanelCollapse();
}

function syncFacultyProjectsPanelCollapse() {
  const panel = document.querySelector(".faculty-projects-panel");
  const wrap = document.getElementById("projectTableWrap");
  const button = document.getElementById("facultyProjectsToggleBtn");
  if (!panel || !wrap || !button) return;
  const isCollapsed = !!state.facultyProjectsCollapsed;
  panel.classList.toggle("collapsed", isCollapsed);
  wrap.hidden = isCollapsed;
  button.textContent = isCollapsed ? "เปิดโครงการทั้งหมด" : "ซ่อนโครงการ";
  button.setAttribute("aria-expanded", String(!isCollapsed));
}

function toggleFacultyProjectsPanel() {
  state.facultyProjectsCollapsed = !state.facultyProjectsCollapsed;
  syncFacultyProjectsPanelCollapse();
}

function renderGroupedProjectTable(wrap, projects, options = {}) {
  if (!wrap) return;
  const pageKey = options.pageKey || "projectPage";
  const projectGroups = getGroupedProjects(projects);
  const totalPages = Math.max(1, Math.ceil(projectGroups.length / PROJECT_PAGE_SIZE));
  state[pageKey] = clampProjectPage(state[pageKey], totalPages);
  const startIndex = (state[pageKey] - 1) * PROJECT_PAGE_SIZE;
  const pageGroups = projectGroups.slice(startIndex, startIndex + PROJECT_PAGE_SIZE);

  if (!projectGroups.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <strong>${escapeHtml(options.emptyTitle || "ยังไม่มีรายการโครงการที่ตรงเงื่อนไข")}</strong>
        <p>${escapeHtml(options.emptyText || "ลองล้างตัวกรอง หรือเพิ่มโครงการใหม่")}</p>
        ${options.emptyAction || ""}
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <table class="project-table">
      <thead>
        <tr>
          <th>ชื่อโครงการ</th>
          <th>สถานะ</th>
          <th>จัดการ</th>
          <th>วันที่เริ่ม</th>
          <th>วันที่สิ้นสุด</th>
          <th>งบประมาณตามแผน</th>
          <th>ผู้รับผิดชอบ 1</th>
        </tr>
      </thead>
      <tbody>
        ${pageGroups.map(group => renderProjectGroup(group)).join("")}
      </tbody>
    </table>
    ${renderProjectPagination(projectGroups.length, totalPages, startIndex, pageGroups.length, pageKey)}
  `;
}

function renderUniversityProjectList(wrap, projects) {
  const totalPages = Math.max(1, Math.ceil(projects.length / PROJECT_PAGE_SIZE));
  state.projectPage = clampProjectPage(state.projectPage, totalPages);
  const startIndex = (state.projectPage - 1) * PROJECT_PAGE_SIZE;
  const pageRows = projects
    .slice()
    .sort((a, b) => {
      const dateA = getProjectStartDate(a)?.getTime() || 0;
      const dateB = getProjectStartDate(b)?.getTime() || 0;
      return dateB - dateA || String(a.PROJECT_NAME || "").localeCompare(String(b.PROJECT_NAME || ""), "th");
    })
    .slice(startIndex, startIndex + PROJECT_PAGE_SIZE);

  if (!projects.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <strong>ยังไม่มีรายการโครงการมหาวิทยาลัย</strong>
        <p>เพิ่มบันทึกโครงการมหาวิทยาลัยเพื่อเริ่มสร้างรายการอ้างอิง</p>
        ${canCreateProject() ? `<button class="btn primary" type="button" onclick="openCreateForm()">+ เพิ่มบันทึกโครงการมหาวิทยาลัย</button>` : ""}
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <table class="project-table university-project-table">
      <thead>
        <tr>
          <th>โครงการ/กิจกรรม</th>
          <th>ปีงบ</th>
          <th>ช่วงเวลา</th>
          <th>ไตรมาส</th>
          <th>ประเภท</th>
          <th>สถานที่</th>
          <th>ผู้เข้าร่วม</th>
          <th>จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${pageRows.map(renderUniversityProjectRow).join("")}
      </tbody>
    </table>
    ${renderProjectPagination(projects.length, totalPages, startIndex, pageRows.length)}
  `;
}

function renderUniversityProjectRow(project) {
  const canEdit = canManageProject(project);
  const activityKey = getActivityKey(project);
  const activityName = project.ACTIVITY_NAME || project.PROJECT_NAME || "-";
  const projectName = project.PROJECT_NAME && project.PROJECT_NAME !== activityName ? project.PROJECT_NAME : "";
  const missions = getProjectMissions(project);
  const place = project.REMARK || "-";
  const participantTotal = getProjectParticipantTotal(project);
  return `
    <tr>
      <td class="university-project-name">
        <strong>${escapeHtml(activityName)}</strong>
        ${projectName ? `<em>${escapeHtml(projectName)}</em>` : ""}
        <small>${escapeHtml(project.PROJECT_ID || activityKey || "-")}</small>
      </td>
      <td>${escapeHtml(project.FISCAL_YEAR || "-")}</td>
      <td>${escapeHtml(getProjectPeriod(project))}</td>
      <td>${escapeHtml(getProjectQuarters(project).join(", ") || "-")}</td>
      <td>${escapeHtml(missions.join(", ") || "-")}</td>
      <td>${escapeHtml(place)}</td>
      <td><strong>${numberFormatter.format(participantTotal)}</strong> คน</td>
      <td>
        <div class="table-actions-cell">
          <button class="icon-action view" type="button" onclick="openDetail('${escapeJs(activityKey)}')" title="ดูรายละเอียด">ดู</button>
          ${canEdit ? `<button class="icon-action edit" type="button" onclick="editProject('${escapeJs(activityKey)}')" title="แก้ไข">แก้</button>` : ""}
        </div>
      </td>
    </tr>
  `;
}

function getGroupedProjects(projects) {
  const map = new Map();
  projects.forEach(project => {
    const groupKey = getProjectGroupKey(project);
    if (!map.has(groupKey)) {
      map.set(groupKey, {
        key: groupKey,
        PROJECT_ID: project.PROJECT_ID || "",
        PROJECT_NAME: project.PROJECT_NAME || "ไม่ระบุชื่อโครงการ",
        activities: []
      });
    }
    map.get(groupKey).activities.push(project);
  });

  return Array.from(map.values())
    .map(group => {
      group.activities.sort((a, b) => String(getActivityKey(a)).localeCompare(String(getActivityKey(b)), "th", { numeric: true }));
      group.planTypes = uniqueValues(group.activities.map(project => getPlanTypeCodeLabel(project.PLAN_TYPE)));
      group.strategies = uniqueValues(group.activities.map(project => getStrategyCodeLabel(project.STRATEGY_ID)));
      group.quarters = uniqueValues(group.activities.flatMap(getProjectQuarters)).sort();
      group.responsibles = uniqueValues(group.activities.map(project => project.RESPONSIBLE_FULL_NAME));
      group.statuses = uniqueValues(group.activities.map(project => project.STATUS || "ไม่ระบุ"));
      group.planBudgetSum = group.activities.reduce((sum, project) => sum + toNumber(project.PLAN_BUDGET), 0);
      group.startDate = getExtremeDate(group.activities, "START_DATE", "min");
      group.endDate = getExtremeDate(group.activities, "END_DATE", "max");
      return group;
    })
    .sort((a, b) => String(a.PROJECT_NAME || "").localeCompare(String(b.PROJECT_NAME || ""), "th", { numeric: true }));
}

function getProjectGroupKey(project) {
  return String(project.PROJECT_ID || project.PROJECT_NAME || getActivityKey(project) || "unknown");
}

function getExtremeDate(projects, field, mode) {
  const dates = projects
    .map(project => project[field])
    .filter(Boolean)
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()));
  if (!dates.length) return "";
  const targetTime = mode === "max"
    ? Math.max(...dates.map(date => date.getTime()))
    : Math.min(...dates.map(date => date.getTime()));
  return new Date(targetTime).toISOString().slice(0, 10);
}

function renderProjectGroup(group) {
  const isExpanded = state.expandedProjectIds.has(group.key);
  return `
    ${renderProjectGroupRow(group, isExpanded)}
    ${isExpanded ? group.activities.map(project => renderProjectActivityRow(project)).join("") : ""}
  `;
}

function renderProjectGroupRow(group, isExpanded) {
  return `
    <tr class="project-group-row">
      <td>
        <button class="project-group-toggle" type="button" onclick="toggleProjectGroup('${escapeJs(group.key)}')" aria-expanded="${isExpanded ? "true" : "false"}">
          <span class="toggle-icon">${isExpanded ? "-" : "+"}</span>
          <span>
            <strong>${escapeHtml(group.PROJECT_NAME)}</strong>
            <em>${numberFormatter.format(group.activities.length)} กิจกรรมย่อย</em>
          </span>
        </button>
      </td>
      <td>${renderStatusBadges(group.statuses)}</td>
      <td>${renderProjectGroupActions(group, isExpanded)}</td>
      <td>${escapeHtml(formatDateDisplay(group.startDate))}</td>
      <td>${escapeHtml(formatDateDisplay(group.endDate))}</td>
      <td>${formatMoney(group.planBudgetSum)}</td>
      <td>${escapeHtml(group.responsibles.join(", ") || "-")}</td>
    </tr>
  `;
}

function renderProjectGroupActions(group, isExpanded) {
  if (group.activities.length !== 1) {
    return `
      <button class="btn small-btn secondary" type="button" onclick="toggleProjectGroup('${escapeJs(group.key)}')">
        ${isExpanded ? "ซ่อน" : "ดู"}
      </button>
    `;
  }

  const project = group.activities[0];
  const activityKey = getActivityKey(project);
  const canEdit = canManageProject(project);
  return `
    <div class="action-cell">
      <button class="icon-action view" type="button" onclick="openDetail('${escapeJs(activityKey)}')" title="ดูรายละเอียด" aria-label="ดูรายละเอียด">&#128269;</button>
      ${canEdit ? `<button class="icon-action edit" type="button" onclick="editProject('${escapeJs(activityKey)}')" title="แก้ไข" aria-label="แก้ไข">&#9998;</button>` : ""}
      ${canEdit ? `<button class="icon-action delete" type="button" onclick="deleteProject('${escapeJs(activityKey)}')" title="ลบ" aria-label="ลบ">&#128465;</button>` : ""}
    </div>
  `;
}

function renderProjectActivityRow(project) {
  const canEdit = canManageProject(project);
  const planTypeName = getPlanTypeCodeLabel(project.PLAN_TYPE);
  const strategyName = getStrategyCodeLabel(project.STRATEGY_ID);
  const activityKey = getActivityKey(project);

  return `
    <tr class="project-activity-row">
      <td><span class="activity-indent">${escapeHtml(project.ACTIVITY_NAME || "กิจกรรมย่อย")}</span></td>
      <td>${renderStatusBadges([project.STATUS || "ไม่ระบุ"])}</td>
      <td>
        <div class="action-cell">
          <button class="icon-action view" type="button" onclick="openDetail('${escapeJs(activityKey)}')" title="ดูรายละเอียด" aria-label="ดูรายละเอียด">&#128269;</button>
          ${canEdit ? `<button class="icon-action edit" type="button" onclick="editProject('${escapeJs(activityKey)}')" title="แก้ไข" aria-label="แก้ไข">&#9998;</button>` : ""}
          ${canEdit ? `<button class="icon-action delete" type="button" onclick="deleteProject('${escapeJs(activityKey)}')" title="ลบ" aria-label="ลบ">&#128465;</button>` : ""}
        </div>
      </td>
      <td>${escapeHtml(formatDateDisplay(project.START_DATE))}</td>
      <td>${escapeHtml(formatDateDisplay(project.END_DATE))}</td>
      <td>${formatMoney(project.PLAN_BUDGET)}</td>
      <td>${escapeHtml(project.RESPONSIBLE_FULL_NAME)}</td>
    </tr>
  `;
}

function renderStatusBadges(statuses) {
  const values = uniqueValues(statuses);
  return `
    <div class="status-stack">
      ${(values.length ? values : ["ไม่ระบุ"]).map(status => `<span class="status-pill ${getStatusClass(status)}">${escapeHtml(status)}</span>`).join("")}
    </div>
  `;
}

function getStatusClass(status) {
  const value = String(status || "").trim();
  if (value === "วางแผน") return "status-planning";
  if (value === "กำลังดำเนินการ") return "status-active";
  if (value === "รอสรุปโครงการ") return "status-waiting-summary";
  if (value === "เสร็จสิ้น") return "status-done";
  if (value === "ยกเลิก") return "status-cancelled";
  return "status-unknown";
}

function toggleProjectGroup(projectKey) {
  if (state.expandedProjectIds.has(projectKey)) {
    state.expandedProjectIds.delete(projectKey);
  } else {
    state.expandedProjectIds.add(projectKey);
  }
  renderProjectsTable();
}

function renderProjectPagination(totalItems, totalPages, startIndex, rowCount, pageKey = "projectPage") {
  if (totalItems <= PROJECT_PAGE_SIZE) return "";
  const from = startIndex + 1;
  const to = startIndex + rowCount;
  const currentPage = state[pageKey] || 1;
  return `
    <div class="table-pagination">
      <span>แสดง ${numberFormatter.format(from)}-${numberFormatter.format(to)} จาก ${numberFormatter.format(totalItems)} รายการ</span>
      <div class="pagination-actions">
        <button class="btn small-btn secondary" type="button" onclick="changeProjectPage(-1, '${escapeJs(pageKey)}')" ${currentPage <= 1 ? "disabled" : ""}>ก่อนหน้า</button>
        <span>หน้า ${numberFormatter.format(currentPage)} / ${numberFormatter.format(totalPages)}</span>
        <button class="btn small-btn secondary" type="button" onclick="changeProjectPage(1, '${escapeJs(pageKey)}')" ${currentPage >= totalPages ? "disabled" : ""}>ถัดไป</button>
      </div>
    </div>
  `;
}

function changeProjectPage(delta, pageKey = "projectPage") {
  const filtered = getFilteredProjects();
  const targetProjects = pageKey === "myProjectPage" ? filtered.filter(isOwnProject) : filtered;
  const totalPages = Math.max(1, Math.ceil(getGroupedProjects(targetProjects).length / PROJECT_PAGE_SIZE));
  state[pageKey] = clampProjectPage((state[pageKey] || 1) + delta, totalPages);
  renderProjectsTable();
}

function resetProjectPageAndRender() {
  state.projectPage = 1;
  state.myProjectPage = 1;
  renderProjectsTable();
}

function clampProjectPage(page, totalPages) {
  return Math.min(Math.max(Number(page) || 1, 1), totalPages);
}

function getFilteredProjects() {
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
  const year = document.getElementById("filterYear").value;
  const quarter = document.getElementById("filterQuarter").value;
  const status = document.getElementById("filterStatus").value;

  return state.projects.filter(project => {
    const text = [
      project.PROJECT_NAME, project.ACTIVITY_NAME, project.RESPONSIBLE_FULL_NAME
    ].join(" ").toLowerCase();

    return (!keyword || text.includes(keyword)) &&
      (!year || String(project.FISCAL_YEAR) === String(year)) &&
      (!quarter || getProjectQuarters(project).includes(String(quarter))) &&
      (!status || String(project.STATUS) === String(status));
  });
}

function resetProjectFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("filterYear").value = "";
  document.getElementById("filterQuarter").value = "";
  document.getElementById("filterStatus").value = "";
  state.projectPage = 1;
  renderProjectsTable();
}

function renderDeletedProjectsTable() {
  const wrap = byId("deletedProjectTableWrap");
  if (!wrap) return;
  const rows = (state.deletedProjects || []).slice().sort((a, b) => {
    const dateA = new Date(a.UPDATED_AT || a.CREATED_AT || 0).getTime() || 0;
    const dateB = new Date(b.UPDATED_AT || b.CREATED_AT || 0).getTime() || 0;
    return dateB - dateA || String(getActivityKey(a)).localeCompare(String(getActivityKey(b)), "th", { numeric: true });
  });

  if (!rows.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <strong>ยังไม่มีรายการที่ถูกลบ</strong>
        <p>รายการที่ลบแบบ soft delete จะแสดงที่นี่</p>
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <table class="project-table deleted-project-table">
      <thead>
        <tr>
          <th>รหัส</th>
          <th>ชื่อโครงการ/กิจกรรม</th>
          <th>ปีงบ</th>
          <th>วันที่เริ่ม</th>
          <th>ผู้แก้ไขล่าสุด</th>
          <th>เวลาแก้ไขล่าสุด</th>
          <th>จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(renderDeletedProjectRow).join("")}
      </tbody>
    </table>
  `;
}

function renderDeletedProjectRow(project) {
  const activityKey = getActivityKey(project);
  return `
    <tr>
      <td>${escapeHtml(activityKey || "-")}</td>
      <td>
        <strong>${escapeHtml(project.ACTIVITY_NAME || project.PROJECT_NAME || "-")}</strong>
        <small>${escapeHtml(project.PROJECT_NAME || "")}</small>
      </td>
      <td>${escapeHtml(project.FISCAL_YEAR || "-")}</td>
      <td>${escapeHtml(formatDateDisplay(project.START_DATE))}</td>
      <td>${escapeHtml(project.UPDATED_BY_NAME || project.CREATED_BY_NAME || "-")}</td>
      <td>${escapeHtml(project.UPDATED_AT || project.CREATED_AT || "-")}</td>
      <td>
        <div class="table-actions-cell">
          ${canRestoreProject(project) ? `<button class="icon-action edit" type="button" onclick="restoreProject('${escapeJs(activityKey)}')">เรียกคืน</button>` : ""}
          ${canPurgeProject() ? `<button class="icon-action delete" type="button" onclick="purgeProject('${escapeJs(activityKey)}')">ลบถาวร</button>` : ""}
        </div>
      </td>
    </tr>
  `;
}

function renderProjectTableError() {
  document.getElementById("projectTableWrap").innerHTML = `
    <div class="empty-state">
      <strong>โหลดรายการโครงการไม่สำเร็จ</strong>
      <p>กรุณาตรวจสอบ API URL และการ Deploy Web App</p>
    </div>
  `;
}

async function ensureFormMastersLoaded() {
  if (state.formMastersLoaded) {
    populateMasterDropdowns();
    populateExistingProjectSelect();
    populateResponsibleDropdown();
    return;
  }

  if (state.formMastersLoading) return state.formMastersLoading;

  state.formMastersLoading = (async () => {
    setLoading(true);
    try {
      const [planTypes, strategies, objectives, strategyPlans, kpis, employees, projects] = await Promise.all([
        apiGet("getPlanTypes", {}, false),
        apiGet("getStrategies", {}, false),
        apiGet("getObjectives", {}, false),
        apiGet("getStrategyPlans", {}, false),
        apiGetOptional("getKPIs", [], {}, false),
        apiGet("getActiveEmployees", {}, false),
        apiGet("getProjectsLite", getProjectQueryParams(), false)
      ]);
      state.planTypes = planTypes || [];
      state.strategies = strategies || [];
      state.objectives = objectives || [];
      state.strategyPlans = strategyPlans || [];
      state.kpis = kpis || [];
      state.employees = employees || [];
      state.projects = (projects || []).filter(isProjectInCurrentLevel);
      state.formMastersLoaded = true;
      populateMasterDropdowns();
      populateExistingProjectSelect();
      populateResponsibleDropdown();
    } finally {
      state.formMastersLoading = null;
      setLoading(false);
    }
  })();

  return state.formMastersLoading;
}

function renderFormDropdownError() {
  fillSelectIfExists("PLAN_TYPE", "โหลดแผนงานไม่สำเร็จ");
  fillSelectIfExists("STRATEGY_ID", "โหลดยุทธศาสตร์ไม่สำเร็จ");
  fillSelectIfExists("OBJECTIVE_ID", "เลือกยุทธศาสตร์ก่อน", true);
  fillSelectIfExists("STRATEGY_PLAN_ID", "เลือกวัตถุประสงค์ก่อน", true);
  fillSelectIfExists("RESPONSIBLE_PERSON_ID", "โหลดผู้รับผิดชอบ 1 ไม่สำเร็จ");
  fillSelectIfExists("CO_OWNER_PERSON_ID", "โหลดผู้รับผิดชอบ 2 ไม่สำเร็จ");
}

function fillSelectIfExists(id, label, disabled = false) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = `<option value="">${escapeHtml(label)}</option>`;
  select.disabled = disabled;
}

async function openCreateForm() {
  if (!canCreateProject()) {
    showToast("USERS ดูโครงการมหาวิทยาลัยได้อย่างเดียว", "warning");
    return;
  }
  navigateTo("form");
  await ensureFormMastersLoaded();
  resetFormState();
}

function resetFormState() {
  state.editingProjectId = "";
  document.getElementById("projectForm").reset();
  document.getElementById("ACTIVITY_ID").value = "";
  document.getElementById("PROJECT_ID").value = "";
  document.getElementById("existingProjectSelect").value = "";
  document.getElementById("ACTIVITY_NAME").disabled = false;
  document.getElementById("formTitle").textContent = CURRENT_PROJECT_TITLE;
  const levelInput = document.getElementById("PROJECT_LEVEL");
  if (levelInput) levelInput.value = CURRENT_PROJECT_LEVEL;
  setInitialYear();
  ensureUniversityDefaults();
  populateMasterDropdowns();
  populateResponsibleDropdown();
  ["USE_PARTICIPANT_KPI", "USE_OUTPUT_KPI", "USE_SATISFACTION_KPI"].forEach(id => {
    document.getElementById(id).checked = false;
    document.getElementById(id).dispatchEvent(new Event("change"));
  });
  setOutputItems([]);
  syncProjectDateRange();
  updateKpiRequiredStates();
  syncProjectFinanceFields();
  renderBudgetCalculations();
  renderStudentTotal();
  setProjectCurrentDocumentLink("");
  setProjectDocumentLinkCheckResult("");
}

async function editProject(activityId) {
  const liteProject = findProjectByActivityKey(activityId);
  const project = liteProject ? await getFullProjectForAction(activityId).catch(error => {
    console.error(error);
    showToast(error.message || "โหลดข้อมูลโครงการไม่สำเร็จ", "error");
    return null;
  }) : null;
  if (!project) {
    showToast("ไม่พบข้อมูลโครงการ", "error");
    return;
  }
  if (!canManageProject(project)) {
    showToast("คุณไม่มีสิทธิ์แก้ไขรายการนี้", "error");
    return;
  }

  navigateTo("form");
  try {
    await ensureFormMastersLoaded();
  } catch (error) {
    console.error(error);
    showToast(error.message || "โหลดข้อมูลสำหรับแก้ไขไม่สำเร็จ", "error");
    return;
  }
  resetFormState();
  state.editingProjectId = getActivityKey(project);
  document.getElementById("formTitle").textContent = `แก้ไขกิจกรรม: ${getActivityKey(project)}`;
  populateExistingProjectSelect();

  PROJECT_FIELDS.forEach(field => {
    const el = document.getElementById(field);
    if (!el) return;
    if (el.type === "checkbox") {
      el.checked = getProjectCheckboxValue(project, field);
      el.dispatchEvent(new Event("change"));
    } else if (["START_DATE", "END_DATE"].includes(field)) {
      el.value = formatProjectDateInput(project[field]);
    } else if (field === "PROJECT_FINANCE_TYPE") {
      el.value = project[field] || "ใช้งบภายในตามแผนฯ";
    } else if (field === "HAS_PROJECT_EXPENSE") {
      el.value = hasProjectValue(project[field]) ? (toBool(project[field]) ? "true" : "false") : "true";
    } else if (field === "PLAN_BUDGET") {
      el.value = formatNumberInputValue(getProjectValueByAliases(project, ["PLAN_BUDGET", "plan_budget", "BUDGET_AMOUNT", "budget_amount", "PLAN_AMOUNT", "plan_amount"]));
    } else if (field === "ACTUAL_BUDGET") {
      el.value = formatNumberInputValue(getProjectValueByAliases(project, ["ACTUAL_BUDGET", "actual_budget", "ACTUAL_AMOUNT", "actual_amount", "USED_BUDGET", "used_budget"]));
    } else {
      el.value = project[field] ?? "";
    }
  });
  document.getElementById("existingProjectSelect").value = project.PROJECT_ID || "";
  document.getElementById("NO_SUB_ACTIVITY").checked = String(project.ACTIVITY_NAME || "") === String(project.PROJECT_NAME || "");
  setProjectCurrentDocumentLink(project.DOCUMENT_URL || "");
  setProjectDocumentLinkCheckResult("");
  handleNoSubActivityChange();
  if (IS_UNIVERSITY_FORM) {
    const startDate = normalizeDateForInput(project.START_DATE);
    const endDate = normalizeDateForInput(project.END_DATE);
    setCheckedIfExists("IS_MULTI_DAY", !!endDate && endDate !== startDate);
    syncUniversityDateMode();
  }

  if (!["Q1", "Q2", "Q3", "Q4"].some(field => document.getElementById(field).checked)) {
    getProjectQuarters(project).forEach(quarter => {
      const el = document.getElementById(quarter);
      if (el) el.checked = true;
    });
  }

  setSelectedMissions(getProjectMissions(project));
  setOutputItems(parseProjectOutputs(project));

  setSelectResolvedValue("PLAN_TYPE", project.PLAN_TYPE, state.planTypes, ["PLAN_TYPE_ID", "PLAN_CODE", "PLAN_NAME"]);
  setSelectResolvedValue("STRATEGY_ID", project.STRATEGY_ID, state.strategies, ["STRATEGY_ID", "STRATEGY_CODE", "STRATEGY_NAME"]);
  handleStrategyChange();
  setSelectResolvedValue("OBJECTIVE_ID", project.OBJECTIVE_ID, state.objectives, ["OBJECTIVE_ID", "OBJECTIVE_CODE", "OBJECTIVE_NAME"]);
  handleObjectiveChange();
  setSelectResolvedValue("STRATEGY_PLAN_ID", project.STRATEGY_PLAN_ID, state.strategyPlans, ["STRATEGY_PLAN_ID", "STRATEGY_PLAN_CODE", "STRATEGY_PLAN_NAME"]);
  setSelectResolvedValue("RESPONSIBLE_PERSON_ID", project.RESPONSIBLE_PERSON_ID || project.RESPONSIBLE_FULL_NAME || project.RESPONSIBLE_EMAIL, state.employees, ["PERSON_ID", "FULL_NAME", "EMAIL"]);
  handleResponsibleChange();
  setSelectResolvedValue("CO_OWNER_PERSON_ID", project.CO_OWNER_PERSON_ID || project.CO_OWNER_FULL_NAME || project.CO_OWNER_EMAIL, state.employees, ["PERSON_ID", "FULL_NAME", "EMAIL"]);
  handleCoOwnerChange();
  syncProjectDateRange();
  syncProjectFinanceFields();
  renderBudgetCalculations();
  renderStudentTotal();
}

function getProjectCheckboxValue(project, field) {
  if (hasProjectValue(project[field])) return toBool(project[field]);
  if (field === "USE_PARTICIPANT_KPI") {
    return ["PARTICIPANT_TARGET", "PARTICIPANT_UNIT", "PARTICIPANT_RESULT"].some(key => hasProjectValue(project[key]));
  }
  if (field === "USE_SATISFACTION_KPI") {
    return ["SATISFACTION_TARGET", "SATISFACTION_UNIT", "SATISFACTION_RESULT"].some(key => hasProjectValue(project[key]));
  }
  if (field === "USE_OUTPUT_KPI") {
    return ["OUTPUT_DETAIL", "OUTPUT_TARGET", "OUTPUT_UNIT", "OUTPUT_RESULT"].some(key => hasProjectValue(project[key])) ||
      parseProjectOutputs(project).length > 0;
  }
  return false;
}

function hasProjectValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function getProjectValueByAliases(project, aliases) {
  for (const key of aliases) {
    if (hasProjectValue(project?.[key])) return project[key];
  }
  return "";
}

function formatNumberInputValue(value) {
  if (!hasProjectValue(value)) return "";
  return String(toNumber(value));
}

async function handleFormSubmit(event) {
  event.preventDefault();
  if (!canCreateProject() && !state.editingProjectId) {
    showToast("USERS ดูโครงการมหาวิทยาลัยได้อย่างเดียว", "warning");
    return;
  }
  renderBudgetCalculations();
  renderStudentTotal();
  syncProjectDateRange();
  syncQuartersFromDateRange();

  const payload = collectFormData();
  const missingRequired = IS_UNIVERSITY_FORM
    ? (!payload.PROJECT_NAME || !payload.FISCAL_YEAR || !payload.START_DATE)
    : (!payload.PROJECT_NAME || !payload.ACTIVITY_NAME || !payload.FISCAL_YEAR || !payload.START_DATE || !payload.END_DATE || !hasSelectedQuarter(payload) ||
      !payload.PLAN_TYPE || !hasSelectedMission(payload) || !payload.STRATEGY_ID || !payload.OBJECTIVE_ID || !payload.STRATEGY_PLAN_ID);
  if (missingRequired) {
    showToast("กรุณากรอกช่องที่มีเครื่องหมาย * ให้ครบ", "warning");
    return;
  }

  if (!validateProjectDateRange(payload)) {
    focusProjectField("END_DATE");
    showToast("วันที่สิ้นสุดดำเนินการต้องไม่ก่อนวันที่เริ่มดำเนินการ", "warning");
    return;
  }

  if (!IS_UNIVERSITY_FORM && payload.START_DATE && payload.END_DATE && !hasDateDerivedQuarterForFiscalYear(payload)) {
    focusProjectField("START_DATE");
    showToast(`ช่วงวันที่ที่เลือกไม่อยู่ในปีงบประมาณ ${payload.FISCAL_YEAR} กรุณาแก้ปีงบประมาณหรือวันที่ดำเนินการ`, "warning");
    return;
  }

  if (!validateGregorianProjectDates(payload)) {
    focusProjectField("START_DATE");
    showToast("รูปแบบวันที่ไม่ถูกต้อง กรุณาเลือกจากปฏิทินหรือกรอกเป็น วว/ดด/ปปปป พ.ศ.", "warning");
    return;
  }

  const kpiValidation = validateSelectedKpis(payload);
  if (!kpiValidation.ok) {
    focusProjectField(kpiValidation.field);
    showToast(kpiValidation.message, "warning");
    return;
  }

  payload.PROJECT_LEVEL = CURRENT_PROJECT_LEVEL || payload.PROJECT_LEVEL || "คณะ";
  if (IS_UNIVERSITY_FORM) {
    if (!byId("IS_MULTI_DAY")?.checked) payload.END_DATE = payload.START_DATE;
    payload.FORM_TYPE = "UNIVERSITY";
    payload.IS_SELECTABLE = true;
    payload.ACTIVITY_NAME = payload.PROJECT_NAME;
    payload.STATUS = payload.STATUS || "พร้อมใช้งาน";
  } else {
    payload.FORM_TYPE = "FACULTY";
    payload.IS_SELECTABLE = true;
  }
  payload.currentUser = currentUser;

  try {
    if (state.editingProjectId) {
      payload.ACTIVITY_ID = state.editingProjectId;
      await apiPost("updateProject", payload);
      showToast("แก้ไขข้อมูลโครงการเรียบร้อย", "success");
    } else {
      await apiPost("saveProject", payload);
      showToast("บันทึกโครงการใหม่เรียบร้อย", "success");
    }
    resetFormState();
    await refreshProjectsAndDashboard("projects");
    navigateTo("projects");
  } catch (error) {
    console.error(error);
    showToast(error.message || "บันทึกข้อมูลไม่สำเร็จ", "error");
  }
}

function handleNoSubActivityChange() {
  const checkbox = document.getElementById("NO_SUB_ACTIVITY");
  const activityInput = document.getElementById("ACTIVITY_NAME");
  if (!checkbox || !activityInput) return;

  if (checkbox.checked) {
    activityInput.value = document.getElementById("PROJECT_NAME").value || "";
    activityInput.disabled = true;
    return;
  }

  activityInput.disabled = false;
  if (activityInput.value === document.getElementById("PROJECT_NAME").value) {
    activityInput.value = "";
  }
}

function syncNoSubActivityName() {
  const checkbox = document.getElementById("NO_SUB_ACTIVITY");
  const activityInput = document.getElementById("ACTIVITY_NAME");
  if (checkbox?.checked && activityInput) {
    activityInput.value = document.getElementById("PROJECT_NAME").value || "";
  }
}

function collectFormData() {
  syncQuartersFromDateRange();
  const data = {};
  PROJECT_FIELDS.forEach(field => {
    const el = document.getElementById(field);
    if (!el) return;

    if (el.type === "checkbox") {
      data[field] = el.checked;
      return;
    }

    data[field] = ["START_DATE", "END_DATE"].includes(field) ? normalizeProjectDateValue(el.value) : el.value;
  });
  applyMissionData(data);
  data.PROJECT_LEVEL = CURRENT_PROJECT_LEVEL || data.PROJECT_LEVEL || "คณะ";
  if (IS_UNIVERSITY_FORM) {
    if (!byId("IS_MULTI_DAY")?.checked) data.END_DATE = data.START_DATE;
    data.ACTIVITY_NAME = data.PROJECT_NAME;
    data.FORM_TYPE = "UNIVERSITY";
    data.IS_SELECTABLE = true;
  } else {
    data.FORM_TYPE = "FACULTY";
    data.IS_SELECTABLE = true;
    if (!data.PROJECT_FINANCE_TYPE) data.PROJECT_FINANCE_TYPE = "ใช้งบภายในตามแผนฯ";
    data.HAS_PROJECT_EXPENSE = data.HAS_PROJECT_EXPENSE !== "false";
  }

  cleanDisabledKpiGroup(data, "USE_PARTICIPANT_KPI", ["PARTICIPANT_TARGET", "PARTICIPANT_UNIT", "PARTICIPANT_RESULT"]);
  applyOutputItemsToPayload(data);
  cleanDisabledKpiGroup(data, "USE_OUTPUT_KPI", ["OUTPUT_DETAIL", "OUTPUT_TARGET", "OUTPUT_UNIT", "OUTPUT_RESULT"]);
  cleanDisabledKpiGroup(data, "USE_SATISFACTION_KPI", ["SATISFACTION_TARGET", "SATISFACTION_UNIT", "SATISFACTION_RESULT"]);

  return data;
}

function validateSelectedKpis(payload) {
  const completed = isCompletedProjectStatus(payload.STATUS);

  if (payload.USE_PARTICIPANT_KPI) {
    if (!hasFormValue(payload.PARTICIPANT_TARGET)) {
      return { ok: false, field: "PARTICIPANT_TARGET", message: "กรุณากรอกค่าเป้าหมายผู้เข้าร่วม" };
    }
    if (!hasFormValue(payload.PARTICIPANT_UNIT)) {
      return { ok: false, field: "PARTICIPANT_UNIT", message: "กรุณาเลือกหน่วยผู้เข้าร่วม" };
    }
    if (completed && !hasFormValue(payload.PARTICIPANT_RESULT)) {
      return { ok: false, field: "PARTICIPANT_RESULT", message: "สถานะเสร็จสิ้นแล้ว กรุณากรอกผลจริงผู้เข้าร่วม" };
    }
  }

  if (payload.USE_SATISFACTION_KPI) {
    if (!hasFormValue(payload.SATISFACTION_TARGET)) {
      return { ok: false, field: "SATISFACTION_TARGET", message: "กรุณากรอกค่าเป้าหมายความพึงพอใจ" };
    }
    if (!hasFormValue(payload.SATISFACTION_UNIT)) {
      return { ok: false, field: "SATISFACTION_UNIT", message: "กรุณาเลือกหน่วยความพึงพอใจ" };
    }
    if (completed && !hasFormValue(payload.SATISFACTION_RESULT)) {
      return { ok: false, field: "SATISFACTION_RESULT", message: "สถานะเสร็จสิ้นแล้ว กรุณากรอกผลจริงความพึงพอใจ" };
    }
  }

  if (payload.USE_OUTPUT_KPI) {
    const items = payload.PROJECT_OUTPUTS || [];
    if (!items.length) {
      return { ok: false, field: "OUTPUT_DETAIL", message: "กรุณาเพิ่มตัวชี้วัดอย่างน้อย 1 รายการ" };
    }
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const label = `ตัวชี้วัด/ผลงาน/ผลผลิต รายการที่ ${index + 1}`;
      if (!hasFormValue(item.detail)) return { ok: false, field: "OUTPUT_DETAIL", message: `กรุณากรอกรายละเอียด${label}` };
      if (!hasFormValue(item.target)) return { ok: false, field: "OUTPUT_TARGET", message: `กรุณากรอกค่าเป้าหมาย${label}` };
      if (!hasFormValue(item.unit)) return { ok: false, field: "OUTPUT_UNIT", message: `กรุณากรอกหน่วย${label}` };
      if (completed && !hasFormValue(item.result)) return { ok: false, field: "OUTPUT_RESULT", message: `สถานะเสร็จสิ้นแล้ว กรุณากรอกผลจริง${label}` };
    }
  }

  return { ok: true };
}

function hasFormValue(value) {
  return String(value ?? "").trim() !== "";
}

function isCompletedProjectStatus(status) {
  return String(status || "").trim() === "เสร็จสิ้น";
}

function focusProjectField(field) {
  const direct = byId(field);
  if (direct && !direct.disabled) {
    direct.focus();
    return;
  }
  const outputMap = {
    OUTPUT_DETAIL: ".output-item-detail",
    OUTPUT_TARGET: ".output-item-target",
    OUTPUT_UNIT: ".output-item-unit",
    OUTPUT_RESULT: ".output-item-result"
  };
  const selector = outputMap[field];
  if (selector) document.querySelector(selector)?.focus();
}

function parseProjectOutputs(project) {
  if (Array.isArray(project?.PROJECT_OUTPUTS) && project.PROJECT_OUTPUTS.length) {
    return project.PROJECT_OUTPUTS
      .map(normalizeOutputItem)
      .filter(item => item.detail || item.target || item.unit || item.result);
  }

  const legacy = normalizeOutputItem({
    detail: project?.OUTPUT_DETAIL || "",
    target: project?.OUTPUT_TARGET || "",
    unit: project?.OUTPUT_UNIT || "",
    result: project?.OUTPUT_RESULT || ""
  });
  return legacy.detail || legacy.target || legacy.unit || legacy.result ? [legacy] : [];
}

function normalizeOutputItem(item) {
  return {
    detail: String(item?.detail || item?.OUTPUT_DETAIL || "").trim(),
    target: String(item?.target || item?.OUTPUT_TARGET || "").trim(),
    unit: String(item?.unit || item?.OUTPUT_UNIT || "ผลงาน").trim(),
    result: String(item?.result || item?.OUTPUT_RESULT || "").trim()
  };
}

function setOutputItems(items) {
  const wrap = byId("outputItems");
  if (!wrap) return;
  const normalized = (items || []).map(normalizeOutputItem);
  wrap.innerHTML = "";
  (normalized.length ? normalized : [normalizeOutputItem({})]).forEach(item => appendOutputItemRow(item));
  syncOutputLegacyFields();
  updateOutputItemsDisabled();
}

function addOutputItem(item = {}) {
  appendOutputItemRow(normalizeOutputItem(item));
  syncOutputLegacyFields();
  updateOutputItemsDisabled();
}

function appendOutputItemRow(item) {
  const wrap = byId("outputItems");
  if (!wrap) return;
  const row = document.createElement("div");
  row.className = "output-item-row";
  row.innerHTML = `
    <label>
      <span>รายการ/รายละเอียด</span>
      <input class="output-item-detail" type="text" value="${escapeAttr(item.detail)}" placeholder="เช่น องค์ความรู้ / คู่มือ / นวัตกรรม" />
    </label>
    <label>
      <span>เป้าหมาย</span>
      <input class="output-item-target" type="number" min="0" step="0.01" value="${escapeAttr(item.target)}" />
    </label>
    <label>
      <span>หน่วย</span>
      <input class="output-item-unit" type="text" value="${escapeAttr(item.unit)}" placeholder="เช่น ผลงาน, เรื่อง, เล่ม" />
    </label>
    <label>
      <span>ผลจริง</span>
      <input class="output-item-result" type="number" min="0" step="0.01" value="${escapeAttr(item.result)}" />
    </label>
    <button class="icon-action delete output-remove-btn" type="button" title="ลบรายการ" aria-label="ลบรายการ">ลบ</button>
  `;
  row.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", syncOutputLegacyFields);
    el.addEventListener("change", syncOutputLegacyFields);
  });
  row.querySelector(".output-remove-btn").addEventListener("click", () => {
    row.remove();
    if (!wrap.querySelector(".output-item-row")) appendOutputItemRow(normalizeOutputItem({}));
    syncOutputLegacyFields();
    updateOutputItemsDisabled();
    updateKpiRequiredStates();
  });
  wrap.appendChild(row);
  updateKpiRequiredStates();
}

function getOutputItemsFromForm() {
  return Array.from(document.querySelectorAll("#outputItems .output-item-row"))
    .map(row => normalizeOutputItem({
      detail: row.querySelector(".output-item-detail")?.value || "",
      target: row.querySelector(".output-item-target")?.value || "",
      unit: row.querySelector(".output-item-unit")?.value || "",
      result: row.querySelector(".output-item-result")?.value || ""
    }))
    .filter(item => item.detail || item.target || item.result);
}

function syncOutputLegacyFields() {
  const items = getOutputItemsFromForm();
  const first = items[0] || normalizeOutputItem({});
  setValueIfExists("OUTPUT_DETAIL", first.detail);
  setValueIfExists("OUTPUT_TARGET", first.target);
  setValueIfExists("OUTPUT_UNIT", first.unit || "ผลงาน");
  setValueIfExists("OUTPUT_RESULT", first.result);
}

function syncOutputItemsFromLegacyFields() {
  const activeElement = document.activeElement;
  if (activeElement && activeElement.closest && activeElement.closest("#outputItems")) return;
  const wrap = byId("outputItems");
  if (!wrap || wrap.querySelectorAll(".output-item-row").length > 1) return;
  setOutputItems([{
    detail: byId("OUTPUT_DETAIL")?.value || "",
    target: byId("OUTPUT_TARGET")?.value || "",
    unit: byId("OUTPUT_UNIT")?.value || "ผลงาน",
    result: byId("OUTPUT_RESULT")?.value || ""
  }]);
}

function applyOutputItemsToPayload(data) {
  if (!data.USE_OUTPUT_KPI) return;
  const items = getOutputItemsFromForm();
  const first = items[0] || normalizeOutputItem({});
  data.PROJECT_OUTPUTS = items;
  data.OUTPUT_DETAIL = first.detail;
  data.OUTPUT_TARGET = first.target;
  data.OUTPUT_UNIT = first.unit || data.OUTPUT_UNIT || "ผลงาน";
  data.OUTPUT_RESULT = first.result;
}

function updateOutputItemsDisabled() {
  const enabled = !!byId("USE_OUTPUT_KPI")?.checked;
  document.querySelectorAll("#outputItems input, #outputItems select, #outputItems button").forEach(el => {
    el.disabled = !enabled;
  });
  const addButton = byId("addOutputItemBtn");
  if (addButton) addButton.disabled = !enabled;
}

function cleanDisabledKpiGroup(data, checkboxField, fields) {
  if (!data[checkboxField]) {
    data[checkboxField] = false;
    fields.forEach(field => data[field] = "");
  }
}

function setupKpiToggle(checkboxId, inputIds) {
  const checkbox = byId(checkboxId);
  if (!checkbox) return;
  checkbox.addEventListener("change", () => {
    inputIds.forEach(id => {
      const el = document.getElementById(id);
      el.disabled = !checkbox.checked;
      if (checkbox.checked && el.tagName === "SELECT" && !el.value && el.options.length) {
        el.selectedIndex = 0;
      }
      if (!checkbox.checked) el.value = "";
    });
    if (checkboxId === "USE_OUTPUT_KPI") updateOutputItemsDisabled();
    updateKpiRequiredStates();
  });
}

function updateKpiRequiredStates() {
  const completed = isCompletedProjectStatus(byId("STATUS")?.value);
  setRequiredIfExists("PARTICIPANT_TARGET", !!byId("USE_PARTICIPANT_KPI")?.checked);
  setRequiredIfExists("PARTICIPANT_UNIT", !!byId("USE_PARTICIPANT_KPI")?.checked);
  setRequiredIfExists("PARTICIPANT_RESULT", !!byId("USE_PARTICIPANT_KPI")?.checked && completed);

  setRequiredIfExists("SATISFACTION_TARGET", !!byId("USE_SATISFACTION_KPI")?.checked);
  setRequiredIfExists("SATISFACTION_UNIT", !!byId("USE_SATISFACTION_KPI")?.checked);
  setRequiredIfExists("SATISFACTION_RESULT", !!byId("USE_SATISFACTION_KPI")?.checked && completed);

  const outputEnabled = !!byId("USE_OUTPUT_KPI")?.checked;
  document.querySelectorAll("#outputItems .output-item-row").forEach(row => {
    row.querySelector(".output-item-detail")?.toggleAttribute("required", outputEnabled);
    row.querySelector(".output-item-target")?.toggleAttribute("required", outputEnabled);
    row.querySelector(".output-item-unit")?.toggleAttribute("required", outputEnabled);
    row.querySelector(".output-item-result")?.toggleAttribute("required", outputEnabled && completed);
  });
}

function setRequiredIfExists(id, required) {
  byId(id)?.toggleAttribute("required", !!required);
}

function renderBudgetCalculations() {
  if (isProjectNoExpense()) {
    setValueIfExists("PLAN_BUDGET", "0");
    setValueIfExists("ACTUAL_BUDGET", "0");
    setValueIfExists("REMAIN_BUDGET", "0.00");
    return;
  }
  const plan = toNumber(byId("PLAN_BUDGET")?.value);
  const actual = toNumber(byId("ACTUAL_BUDGET")?.value);
  const remain = plan - actual;
  setValueIfExists("REMAIN_BUDGET", remain.toFixed(2));
}

function syncProjectFinanceFields() {
  const financeType = byId("PROJECT_FINANCE_TYPE")?.value || "";
  const expenseSelect = byId("HAS_PROJECT_EXPENSE");
  const noExpense = financeType === "ไม่มีรายการเงิน" || expenseSelect?.value === "false";

  if (financeType === "ไม่มีรายการเงิน" && expenseSelect) {
    expenseSelect.value = "false";
    expenseSelect.disabled = true;
  } else if (expenseSelect) {
    expenseSelect.disabled = false;
    if (!expenseSelect.value) expenseSelect.value = "true";
  }

  ["PLAN_BUDGET", "ACTUAL_BUDGET"].forEach(id => {
    const el = byId(id);
    if (!el) return;
    el.disabled = noExpense;
    if (noExpense) el.value = "0";
  });

  renderBudgetCalculations();
}

function isProjectNoExpense() {
  return byId("PROJECT_FINANCE_TYPE")?.value === "ไม่มีรายการเงิน" ||
    byId("HAS_PROJECT_EXPENSE")?.value === "false";
}

function renderStudentTotal() {
  const total = ["STUDENT_YEAR1_COUNT", "STUDENT_YEAR2_COUNT", "STUDENT_YEAR3_COUNT", "STUDENT_YEAR4_COUNT"]
    .reduce((sum, id) => sum + toNumber(byId(id)?.value), 0);
  setValueIfExists("TOTAL_STUDENT_COUNT", total);
}

async function openDetail(activityId) {
  const liteProject = findProjectByActivityKey(activityId);
  const project = liteProject ? await getFullProjectForAction(activityId).catch(error => {
    console.error(error);
    showToast(error.message || "โหลดรายละเอียดโครงการไม่สำเร็จ", "error");
    return null;
  }) : null;
  if (!project) {
    showToast("ไม่พบข้อมูลโครงการ", "error");
    return;
  }

  document.getElementById("detailTitle").textContent = "รายละเอียดโครงการ";
  document.getElementById("detailSubtitle").textContent = "";

  document.getElementById("detailBody").innerHTML = `
    ${renderDetailSection("ข้อมูลโครงการ", project, [
      "PROJECT_ID", "PROJECT_LEVEL", "PROJECT_NAME", "PROJECT_DESCRIPTION", "ACTIVITY_ID", "ACTIVITY_NAME", "DOCUMENT_URL", "FISCAL_YEAR",
      "FORM_TYPE"
    ])}
    ${renderDetailSection("ช่วงเวลา แผนงาน และยุทธศาสตร์", project, [
      "PROJECT_QUARTERS", "START_DATE", "END_DATE", "PLAN_TYPE", "MISSION",
      "STRATEGY_ID", "OBJECTIVE_ID", "STRATEGY_PLAN_ID"
    ])}
    ${renderDetailSection("งบประมาณ", project, [
      "PROJECT_FINANCE_TYPE", "HAS_PROJECT_EXPENSE", "PLAN_BUDGET", "ACTUAL_BUDGET", "REMAIN_BUDGET", "YEAR_BUDGET_PERCENT"
    ])}
    ${renderDetailSection("ตัวชี้วัด", project, [
      "KPI_SUMMARY"
    ])}
    ${renderDetailSection("จำนวนผู้เข้าร่วม", project, [
      "PARTICIPANT_SUMMARY"
    ])}
    ${renderDetailSection("ผู้รับผิดชอบและสถานะ", project, [
      "STATUS", "RESPONSIBLE_FULL_NAME", "RESPONSIBLE_EMAIL", "CO_OWNER_FULL_NAME", "CO_OWNER_EMAIL", "REMARK",
      "IS_SELECTABLE", "IS_ACTIVE"
    ])}
    ${renderDetailSection("ประวัติการบันทึก", project, [
      "CREATED_BY_NAME", "CREATED_BY_EMAIL", "CREATED_AT", "UPDATED_BY_NAME", "UPDATED_BY_EMAIL", "UPDATED_AT"
    ])}
  `;

  document.getElementById("detailModal").classList.remove("hidden");
}

function renderDetailSection(title, project, fields) {
  return `
    <section class="detail-section">
      <h4>${escapeHtml(title)}</h4>
      <div class="detail-grid">
        ${fields.map(field => renderDetailItem(field, getDetailFieldValue(project, field))).join("")}
      </div>
    </section>
  `;
}

function getDetailFieldValue(project, field) {
  if (field === "ACTIVITY_ID") return getActivityKey(project);
  if (field === "KPI_SUMMARY") return project;
  if (field === "PARTICIPANT_SUMMARY") return project;
  if (field === "PROJECT_QUARTERS") return formatQuarterList(getProjectQuarters(project));
  if (field === "MISSION") return getProjectMissions(project).join(", ") || project.MISSION || "";
  return project[field];
}

function renderDetailItem(field, value) {
  if (field === "KPI_SUMMARY") {
    return `
      <div class="detail-item full">
        <label>${escapeHtml(getFieldLabel(field))}</label>
        <div>${renderKpiSummary(value)}</div>
      </div>
    `;
  }
  if (field === "PARTICIPANT_SUMMARY") {
    return `
      <div class="detail-item full">
        <label>${escapeHtml(getFieldLabel(field))}</label>
        <div>${renderParticipantSummary(value)}</div>
      </div>
    `;
  }
  const isMoney = ["PLAN_BUDGET", "ACTUAL_BUDGET", "REMAIN_BUDGET"].includes(field);
  const isNumber = [
    "PARTICIPANT_TARGET", "PARTICIPANT_RESULT", "OUTPUT_TARGET", "OUTPUT_RESULT",
    "SATISFACTION_TARGET", "SATISFACTION_RESULT", "YEAR_BUDGET_PERCENT"
  ].includes(field);
  const isPeople = [
    "TEACHER_COUNT", "SUPPORT_STAFF_COUNT", "STUDENT_YEAR1_COUNT", "STUDENT_YEAR2_COUNT",
    "STUDENT_YEAR3_COUNT", "STUDENT_YEAR4_COUNT", "TOTAL_STUDENT_COUNT",
    "HAS_EXTERNAL_PARTICIPANT", "EXTERNAL_PARTICIPANT_DETAIL", "EXTERNAL_PARTICIPANT_COUNT"
  ].includes(field);
  const display = isMoney ? formatMoney(value) : (isNumber ? numberFormatter.format(toNumber(value)) : formatDetailValue(field, value));
  const finalDisplay = isPeople ? `${numberFormatter.format(toNumber(value))} คน` : display;
  return `
    <div class="detail-item">
      <label>${escapeHtml(getFieldLabel(field))}</label>
      <div>${finalDisplay}</div>
    </div>
  `;
}

function formatQuarterList(quarters) {
  const labels = (quarters || []).map(quarter => {
    const match = String(quarter || "").match(/Q([1-4])/i);
    return match ? `ไตรมาส ${match[1]}` : String(quarter || "").trim();
  }).filter(Boolean);
  return labels.join(", ");
}

function renderKpiSummary(project) {
  const rows = [];
  const outputRows = [];
  if (toBool(project.USE_PARTICIPANT_KPI)) {
    rows.push(renderDetailKpiRow(
      "ผู้เข้าร่วมโครงการ (Participant)",
      project.PARTICIPANT_TARGET,
      project.PARTICIPANT_UNIT,
      project.PARTICIPANT_RESULT
    ));
  }
  if (toBool(project.USE_SATISFACTION_KPI)) {
    rows.push(renderDetailKpiRow(
      "ความพึงพอใจ (Satisfaction)",
      project.SATISFACTION_TARGET,
      project.SATISFACTION_UNIT,
      project.SATISFACTION_RESULT
    ));
  }
  if (toBool(project.USE_OUTPUT_KPI)) {
    parseProjectOutputs(project).forEach(item => {
      outputRows.push(renderDetailKpiRow(
        item.detail || "ตัวชี้วัดอื่น / ผลงาน / ผลผลิต (Output)",
        item.target,
        item.unit,
        item.result
      ));
    });
  }
  if (!rows.length && !outputRows.length) return "-";
  return `
    <table class="detail-kpi-table">
      <thead>
        <tr>
          <th>ตัวชี้วัด</th>
          <th>ค่าเป้าหมาย</th>
          <th>หน่วย</th>
          <th>ผลจริง</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join("")}
        ${outputRows.length ? `
          <tr class="detail-kpi-group-row">
            <td colspan="4">ตัวชี้วัดอื่น / ผลงาน / ผลผลิต (Output)</td>
          </tr>
          ${outputRows.join("")}
        ` : ""}
      </tbody>
    </table>
  `;
}

function renderDetailKpiRow(label, target, unit, result) {
  return `
    <tr>
      <td>${escapeHtml(label || "-")}</td>
      <td>${formatKpiNumber(target)}</td>
      <td>${escapeHtml(unit || "-")}</td>
      <td>${formatKpiNumber(result)}</td>
    </tr>
  `;
}

function formatKpiNumber(value) {
  return value === "" || value == null ? "-" : numberFormatter.format(toNumber(value));
}

function renderParticipantSummary(project) {
  const teacher = toNumber(project.TEACHER_COUNT);
  const support = toNumber(project.SUPPORT_STAFF_COUNT);
  const students = [
    { label: "นักศึกษาชั้นปีที่ 1", value: toNumber(project.STUDENT_YEAR1_COUNT) },
    { label: "นักศึกษาชั้นปีที่ 2", value: toNumber(project.STUDENT_YEAR2_COUNT) },
    { label: "นักศึกษาชั้นปีที่ 3", value: toNumber(project.STUDENT_YEAR3_COUNT) },
    { label: "นักศึกษาชั้นปีที่ 4", value: toNumber(project.STUDENT_YEAR4_COUNT) }
  ];
  const studentTotal = toNumber(project.TOTAL_STUDENT_COUNT) || students.reduce((sum, item) => sum + item.value, 0);
  const hasExternal = toBool(project.HAS_EXTERNAL_PARTICIPANT) || toNumber(project.EXTERNAL_PARTICIPANT_COUNT) > 0;
  const externalCount = hasExternal ? toNumber(project.EXTERNAL_PARTICIPANT_COUNT) : 0;
  const externalDetail = project.EXTERNAL_PARTICIPANT_DETAIL || "บุคคลภายนอก";
  const allTotal = teacher + support + studentTotal + externalCount;

  return `
    <table class="participant-table">
      <thead>
        <tr>
          <th>กลุ่ม</th>
          <th>ประเภทผู้เข้าร่วม</th>
          <th>จำนวน</th>
          <th>หน่วย</th>
        </tr>
      </thead>
      <tbody>
        ${renderParticipantTableRow("บุคลากร", "อาจารย์", teacher, false, 2)}
        ${renderParticipantTableRow("", "บุคลากรสายสนับสนุน", support)}
        ${renderParticipantTableRow("นักศึกษา", students[0].label, students[0].value, false, 5)}
        ${students.slice(1).map(item => renderParticipantTableRow("", item.label, item.value)).join("")}
        ${renderParticipantTableRow("", "รวมนักศึกษา", studentTotal, true)}
        ${hasExternal ? renderParticipantTableRow("บุคคลภายนอก", externalDetail, externalCount) : ""}
        ${renderParticipantTableRow("รวมทั้งหมด", "รวมผู้เข้าร่วมทั้งหมด", allTotal, true)}
      </tbody>
    </table>
  `;
}

function renderParticipantTableRow(group, label, value, isTotal = false, groupRowspan = 0) {
  const groupCell = group
    ? `<td${groupRowspan ? ` rowspan="${groupRowspan}"` : ""} class="participant-group-cell">${escapeHtml(group)}</td>`
    : "";
  return `
    <tr class="${isTotal ? "participant-row-total" : ""}">
      ${groupCell}
      <td>${escapeHtml(label)}</td>
      <td><strong>${numberFormatter.format(toNumber(value))}</strong></td>
      <td>คน</td>
    </tr>
  `;
}

function formatDetailValue(field, value) {
  if (field === "DOCUMENT_URL" && value) {
    return `<a href="${escapeAttr(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>`;
  }
  if (field === "PLAN_TYPE") return escapeHtml(getPlanTypeLabel(value));
  if (field === "STRATEGY_ID") return escapeHtml(getStrategyLabel(value));
  if (field === "OBJECTIVE_ID") return escapeHtml(getObjectiveLabel(value));
  if (field === "STRATEGY_PLAN_ID") return escapeHtml(getStrategyPlanLabel(value));
  if (["START_DATE", "END_DATE", "CREATED_AT", "UPDATED_AT"].includes(field)) return escapeHtml(formatDateDisplay(value));
  if (field === "MISSION") return escapeHtml(value || "-");
  if (String(field).startsWith("USE_")) {
    if (value === "" || value == null) return "-";
    return toBool(value) ? "ใช้" : "ไม่ใช้";
  }
  if (field === "HAS_PROJECT_EXPENSE") {
    if (value === "" || value == null) return "-";
    return toBool(value) ? "มีค่าใช้จ่าย" : "ไม่มีค่าใช้จ่าย";
  }
  if (["Q1", "Q2", "Q3", "Q4", "IS_ACTIVE", "IS_SELECTABLE"].includes(field)) {
    if (value === "" || value == null) return "-";
    return toBool(value) ? "ใช่" : "ไม่ใช่";
  }
  return escapeHtml(value || "-");
}

function getProjectPeriod(project) {
  const start = formatProjectPeriodDate(project.START_DATE);
  const end = formatProjectPeriodDate(project.END_DATE);
  if (start === "-" && end === "-") return "-";
  if (start !== "-" && start === end) return start;
  if (start !== "-" && end !== "-") return `${start} - ${end}`;
  return start !== "-" ? start : end;
}

function formatProjectPeriodDate(value) {
  if (!value) return "-";
  const date = parseDateDisplayValue(value);
  if (!date) return String(value);
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function parseDateDisplayValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getProjectQuarters(project) {
  const quarterFields = ["Q1", "Q2", "Q3", "Q4"];
  const selected = quarterFields.filter(field => isQuarterMarked(project[field]));
  if (selected.length) return selected;

  const legacy = String(project.QUARTER || "").trim();
  if (!legacy) return [];
  return legacy.split(/[,\s/|]+/).map(item => item.trim()).filter(Boolean);
}

function isQuarterMarked(value) {
  return value === true ||
    String(value || "").trim().toUpperCase() === "TRUE" ||
    String(value || "").trim().toUpperCase() === "Y" ||
    String(value || "").trim() === "1" ||
    String(value || "").trim().toUpperCase() === "YES";
}

function hasSelectedQuarter(payload) {
  return ["Q1", "Q2", "Q3", "Q4"].some(field => isQuarterMarked(payload[field]));
}

function getMissionFields() {
  return ["การบริหาร", "การเรียนการสอน", "การวิจัย", "การบริการวิชาการ", "การทำนุบำรุงศิลปะและวัฒนธรรม"];
}

function getMissionInputMap() {
  return {
    "การบริหาร": "MISSION_ADMIN",
    "การเรียนการสอน": "MISSION_TEACHING",
    "การวิจัย": "MISSION_RESEARCH",
    "การบริการวิชาการ": "MISSION_ACADEMIC_SERVICE",
    "การทำนุบำรุงศิลปะและวัฒนธรรม": "MISSION_ART_CULTURE"
  };
}

function getSelectedMissions() {
  const inputMap = getMissionInputMap();
  return getMissionFields().filter(mission => {
    const el = document.getElementById(inputMap[mission]);
    return el && el.checked;
  });
}

function setSelectedMissions(missions) {
  const selected = new Set(missions || []);
  const inputMap = getMissionInputMap();
  getMissionFields().forEach(mission => {
    const el = document.getElementById(inputMap[mission]);
    if (el) el.checked = selected.has(mission);
  });
}

function applyMissionData(data) {
  const selected = getSelectedMissions();
  data.MISSION = "";
  getMissionFields().forEach(mission => {
    data[mission] = selected.includes(mission) ? "y" : "n";
  });
}

function hasSelectedMission(payload) {
  return getMissionFields().some(mission => isQuarterMarked(payload[mission]));
}

function getProjectMissions(project) {
  const missionFields = getMissionFields();
  const selected = missionFields.filter(field => isQuarterMarked(project[field]));
  if (selected.length) return selected;
  const legacy = String(project.MISSION || "").trim();
  if (!legacy) return [];
  return legacy.split(/\s*,\s*/).map(item => item.trim()).filter(item => missionFields.includes(item));
}

function closeDetailModal() {
  document.getElementById("detailModal").classList.add("hidden");
}

function printProjectDetail() {
  const modal = document.getElementById("detailModal");
  if (!modal || modal.classList.contains("hidden")) return;
  window.print();
}

async function deleteProject(activityId) {
  const project = findProjectByActivityKey(activityId);
  if (!project) {
    showToast("ไม่พบข้อมูลโครงการ", "error");
    return;
  }
  if (!canManageProject(project)) {
    showToast("คุณไม่มีสิทธิ์ลบรายการนี้", "error");
    return;
  }

  const ok = confirm(`ยืนยันการลบกิจกรรม ${getActivityKey(project)} ?\nระบบจะเปลี่ยน IS_ACTIVE เป็น FALSE และไม่ลบแถวจริง`);
  if (!ok) return;

  try {
    await apiPost("deleteProject", { ACTIVITY_ID: getActivityKey(project), currentUser });
    showToast("ลบรายการโครงการเรียบร้อย", "success");
    await refreshProjectsAndDashboard(state.activePage === "dashboard" ? "dashboard" : "projects");
  } catch (error) {
    console.error(error);
    showToast(error.message || "ลบข้อมูลไม่สำเร็จ", "error");
  }
}

async function restoreProject(activityId) {
  const project = (state.deletedProjects || []).find(item => String(getActivityKey(item)) === String(activityId));
  if (!project) {
    showToast("ไม่พบรายการที่ลบแล้ว", "error");
    return;
  }
  if (!canRestoreProject(project)) {
    showToast("บัญชีนี้ไม่มีสิทธิ์เรียกคืนรายการ", "error");
    return;
  }
  const ok = confirm(`ยืนยันเรียกคืนรายการ ${getActivityKey(project)} ?`);
  if (!ok) return;

  try {
    await apiPost("restoreProject", { ACTIVITY_ID: getActivityKey(project), currentUser });
    showToast("เรียกคืนรายการเรียบร้อย", "success");
    await refreshProjectsAndDashboard("deleted");
  } catch (error) {
    console.error(error);
    showToast(error.message || "เรียกคืนข้อมูลไม่สำเร็จ", "error");
  }
}

async function purgeProject(activityId) {
  const project = (state.deletedProjects || []).find(item => String(getActivityKey(item)) === String(activityId));
  if (!project) {
    showToast("ไม่พบรายการที่ลบแล้ว", "error");
    return;
  }
  if (!canPurgeProject()) {
    showToast("เฉพาะ ADMIN เท่านั้นที่ลบถาวรได้", "error");
    return;
  }
  const ok = confirm(`ยืนยันลบถาวร ${getActivityKey(project)} ?\nการลบถาวรจะลบแถวออกจากชีตและย้อนกลับไม่ได้`);
  if (!ok) return;

  try {
    await apiPost("purgeProject", { ACTIVITY_ID: getActivityKey(project), currentUser });
    showToast("ลบถาวรเรียบร้อย", "success");
    await refreshProjectsAndDashboard("deleted");
  } catch (error) {
    console.error(error);
    showToast(error.message || "ลบถาวรไม่สำเร็จ", "error");
  }
}

function canManageProject(project) {
  if (IS_PUBLIC_PROJECT_ENTRY) return false;
  if (isUniversityUsersReadOnly()) return false;
  const role = normalizePrjRole(state.projectAccess?.role);
  if (role === "STAFF" || role === "ADMIN") return true;
  if (role === "USERS") return isOwnProject(project);
  return false;
}

function canRestoreProject(project) {
  if (isUniversityUsersReadOnly()) return false;
  const role = normalizePrjRole(state.projectAccess?.role);
  if (role === "STAFF" || role === "ADMIN") return true;
  if (role === "USERS") return isOwnProject(project);
  return false;
}

function canPurgeProject() {
  if (isUniversityUsersReadOnly()) return false;
  return !!state.projectAccess?.canPurge;
}

function canCreateProject() {
  return !isUniversityUsersReadOnly() && !!state.projectAccess?.active;
}

function isUniversityUsersReadOnly() {
  return IS_UNIVERSITY_FORM && normalizePrjRole(state.projectAccess?.role) === "USERS";
}

function isOwnProject(project) {
  const userEmail = normalizeEmail(currentUser?.email);
  if (!userEmail || !project) return false;
  return normalizeEmail(project.CREATED_BY_EMAIL) === userEmail ||
    normalizeEmail(project.RESPONSIBLE_EMAIL) === userEmail ||
    normalizeEmail(project.CO_OWNER_EMAIL) === userEmail;
}

function normalizePrjRole(value) {
  const role = String(value || "").trim().toUpperCase();
  return role === "USER" ? "USERS" : role;
}

function getActivityKey(project) {
  return String(project?.ACTIVITY_ID || project?.PROJECT_ID || "");
}

function findProjectByActivityKey(activityId) {
  return state.projects.find(item => String(getActivityKey(item)) === String(activityId));
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getPlanTypeLabel(planTypeValue) {
  const value = String(planTypeValue || "");
  const item = (state.planTypes || []).find(row =>
    String(row.PLAN_TYPE_ID || "") === value ||
    String(row.PLAN_CODE || "") === value ||
    String(row.PLAN_NAME || "") === value
  );
  return String(item ? (item.PLAN_NAME || item.PLAN_CODE || item.PLAN_TYPE_ID || "-") : (value || "-"));
}

function getPlanTypeCodeLabel(planTypeValue) {
  const value = String(planTypeValue || "");
  const item = (state.planTypes || []).find(row =>
    String(row.PLAN_TYPE_ID || "") === value ||
    String(row.PLAN_CODE || "") === value ||
    String(row.PLAN_NAME || "") === value
  );
  return String(item ? (item.PLAN_CODE || item.PLAN_TYPE_ID || value || "-") : (value || "-"));
}

function getPlanTypeFullLabel(planTypeValue) {
  const value = String(planTypeValue || "");
  const item = (state.planTypes || []).find(row =>
    String(row.PLAN_TYPE_ID || "") === value ||
    String(row.PLAN_CODE || "") === value ||
    String(row.PLAN_NAME || "") === value
  );
  if (!item) return value || "-";
  return String([item.PLAN_CODE, item.PLAN_NAME].filter(Boolean).join(" ") || item.PLAN_TYPE_ID || "-");
}

function getStrategyLabel(strategyId) {
  const value = String(strategyId || "");
  const strategy = state.strategies.find(item =>
    String(item.STRATEGY_ID || "") === value ||
    String(item.STRATEGY_CODE || "") === value ||
    String(item.STRATEGY_NAME || "") === value
  );
  return strategy ? (strategy.STRATEGY_NAME || strategy.STRATEGY_CODE || strategy.STRATEGY_ID) : (strategyId || "-");
}

function getStrategyCodeLabel(strategyId) {
  const value = String(strategyId || "");
  const strategy = state.strategies.find(item =>
    String(item.STRATEGY_ID || "") === value ||
    String(item.STRATEGY_CODE || "") === value ||
    String(item.STRATEGY_NAME || "") === value
  );
  return strategy ? (strategy.STRATEGY_CODE || strategy.STRATEGY_ID || strategyId || "-") : (strategyId || "-");
}

function getStrategySummaryLabel(strategyId) {
  const value = String(strategyId || "");
  const strategy = state.strategies.find(item =>
    String(item.STRATEGY_ID || "") === value ||
    String(item.STRATEGY_CODE || "") === value ||
    String(item.STRATEGY_NAME || "") === value
  );
  if (!strategy) return strategyId || "-";
  return [strategy.STRATEGY_CODE, strategy.STRATEGY_NAME].filter(Boolean).join(" ") || strategy.STRATEGY_ID || "-";
}

function sortSummaryRows(rows, type) {
  const sorted = [...rows];
  if (type === "strategy") {
    return sorted.sort((a, b) => compareStrategyCode(a.key || a.name, b.key || b.name));
  }
  if (type === "planType") {
    return sorted.sort((a, b) => String(getPlanTypeLabel(a.key || a.name)).localeCompare(String(getPlanTypeLabel(b.key || b.name)), "th", { numeric: true }));
  }
  return sorted;
}

function compareStrategyCode(a, b) {
  const aStrategy = findStrategy(a);
  const bStrategy = findStrategy(b);
  const aCode = aStrategy ? (aStrategy.STRATEGY_CODE || aStrategy.STRATEGY_ID || a) : a;
  const bCode = bStrategy ? (bStrategy.STRATEGY_CODE || bStrategy.STRATEGY_ID || b) : b;
  return String(aCode || "").localeCompare(String(bCode || ""), "th", { numeric: true });
}

function findStrategy(value) {
  const key = String(value || "");
  return state.strategies.find(item =>
    String(item.STRATEGY_ID || "") === key ||
    String(item.STRATEGY_CODE || "") === key ||
    String(item.STRATEGY_NAME || "") === key
  );
}

function getObjectiveLabel(objectiveId) {
  const value = String(objectiveId || "");
  const objective = state.objectives.find(item =>
    String(item.OBJECTIVE_ID || "") === value ||
    String(item.OBJECTIVE_CODE || "") === value ||
    String(item.OBJECTIVE_NAME || "") === value
  );
  return objective ? (objective.OBJECTIVE_NAME || objective.OBJECTIVE_CODE || objective.OBJECTIVE_ID) : (objectiveId || "-");
}

function getStrategyPlanLabel(strategyPlanId) {
  const value = String(strategyPlanId || "");
  const plan = state.strategyPlans.find(item =>
    String(item.STRATEGY_PLAN_ID || "") === value ||
    String(item.STRATEGY_PLAN_CODE || "") === value ||
    String(item.STRATEGY_PLAN_NAME || "") === value
  );
  return plan ? (plan.STRATEGY_PLAN_NAME || plan.STRATEGY_PLAN_CODE || plan.STRATEGY_PLAN_ID) : (strategyPlanId || "-");
}


function buildDashboardFromProjects(projects) {
  const activeProjects = projects || [];
  return {
    totalProjects: activeProjects.length,
    planBudgetSum: sumBy(activeProjects, "PLAN_BUDGET"),
    actualBudgetSum: sumBy(activeProjects, "ACTUAL_BUDGET"),
    remainBudgetSum: activeProjects.reduce((sum, project) => sum + getRemainBudget(project), 0),
    byPlanType: groupSummary(activeProjects, "PLAN_TYPE"),
    byStrategy: groupSummary(activeProjects, "STRATEGY_ID"),
    byStatus: groupSummary(activeProjects, "STATUS")
  };
}

function groupSummary(rows, field) {
  const map = new Map();
  rows.forEach(row => {
    const key = row[field] || "ไม่ระบุ";
    if (!map.has(key)) map.set(key, { key, name: key, count: 0, planBudgetSum: 0, actualBudgetSum: 0, remainBudgetSum: 0 });
    const item = map.get(key);
    item.count += 1;
    item.planBudgetSum += toNumber(row.PLAN_BUDGET);
    item.actualBudgetSum += toNumber(row.ACTUAL_BUDGET);
    item.remainBudgetSum += getRemainBudget(row);
  });
  return Array.from(map.values());
}

function sumBy(rows, field) {
  return rows.reduce((sum, row) => sum + toNumber(row[field]), 0);
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(value => value !== undefined && value !== null && String(value).trim() !== "").map(String)));
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function toBool(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return value === true ||
    normalized === "TRUE" ||
    normalized === "1" ||
    normalized === "Y" ||
    normalized === "YES" ||
    normalized === "ใช่" ||
    normalized === "ใช้งาน";
}

function formatMoney(value) {
  return `${moneyFormatter.format(toNumber(value))} บาท`;
}

function formatPercent(value) {
  return moneyFormatter.format(toNumber(value));
}

function clamp(value, min, max) {
  return Math.min(Math.max(toNumber(value), min), max);
}

function formatDateDisplay(value) {
  if (!value) return "-";
  const formatted = formatProjectDateInput(value);
  if (formatted) return formatted;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function normalizeDateForInput(value) {
  if (!value) return "";
  const normalized = normalizeProjectDateValue(value);
  if (normalized) return normalized;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function getFieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function escapeJs(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function setupTableEnhancements() {
  enhanceTables(document);
  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(() => enhanceTables(document));
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function enhanceTables(root = document) {
  root.querySelectorAll("table").forEach(table => {
    if (table.dataset.enhancedTable === "true") return;
    table.dataset.enhancedTable = "true";
    table.classList.add("enhanced-table");
    enhanceTableHeaders(table);
    enhanceTableRows(table);
  });
}

function enhanceTableHeaders(table) {
  table.querySelectorAll("thead th").forEach((th, index) => {
    th.dataset.sortDirection = "";
    th.setAttribute("tabindex", "0");
    th.setAttribute("role", "button");
    th.setAttribute("aria-sort", "none");

    const sortIcon = document.createElement("span");
    sortIcon.className = "table-sort-icon";
    sortIcon.textContent = "↕";
    th.appendChild(sortIcon);

    const resizeHandle = document.createElement("span");
    resizeHandle.className = "col-resize-handle";
    resizeHandle.setAttribute("aria-hidden", "true");
    resizeHandle.addEventListener("pointerdown", event => startColumnResize(event, table, index));
    th.appendChild(resizeHandle);

    th.addEventListener("click", event => {
      if (event.target.closest(".col-resize-handle")) return;
      sortEnhancedTable(table, index, th);
    });
    th.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      sortEnhancedTable(table, index, th);
    });
  });
}

function enhanceTableRows(table) {
  table.querySelectorAll("tbody tr").forEach(row => {
    if (row.dataset.rowResizable === "true") return;
    const firstCell = row.querySelector("td, th");
    if (!firstCell) return;
    row.dataset.rowResizable = "true";
    const handle = document.createElement("span");
    handle.className = "row-resize-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.addEventListener("pointerdown", event => startRowResize(event, row));
    firstCell.appendChild(handle);
  });
}

function startColumnResize(event, table, columnIndex) {
  event.preventDefault();
  event.stopPropagation();
  const th = event.currentTarget.closest("th");
  if (!th) return;
  const startX = event.clientX;
  const startWidth = th.getBoundingClientRect().width;
  const cells = Array.from(table.querySelectorAll("tr")).map(row => row.children[columnIndex]).filter(Boolean);
  document.body.classList.add("is-resizing-table", "is-resizing-column");

  const onMove = moveEvent => {
    const nextWidth = Math.max(72, startWidth + moveEvent.clientX - startX);
    cells.forEach(cell => {
      cell.style.width = `${nextWidth}px`;
      cell.style.minWidth = `${nextWidth}px`;
    });
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.body.classList.remove("is-resizing-table", "is-resizing-column");
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp, { once: true });
}

function startRowResize(event, row) {
  event.preventDefault();
  event.stopPropagation();
  const startY = event.clientY;
  const startHeight = row.getBoundingClientRect().height;
  document.body.classList.add("is-resizing-table", "is-resizing-row");

  const onMove = moveEvent => {
    const nextHeight = Math.max(34, startHeight + moveEvent.clientY - startY);
    row.style.height = `${nextHeight}px`;
    Array.from(row.children).forEach(cell => {
      cell.style.height = `${nextHeight}px`;
    });
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.body.classList.remove("is-resizing-table", "is-resizing-row");
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp, { once: true });
}

function sortEnhancedTable(table, columnIndex, th) {
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const nextDirection = th.dataset.sortDirection === "asc" ? "desc" : "asc";
  table.querySelectorAll("thead th").forEach(header => {
    header.dataset.sortDirection = "";
    header.setAttribute("aria-sort", "none");
    const icon = header.querySelector(".table-sort-icon");
    if (icon) icon.textContent = "↕";
  });
  th.dataset.sortDirection = nextDirection;
  th.setAttribute("aria-sort", nextDirection === "asc" ? "ascending" : "descending");
  const icon = th.querySelector(".table-sort-icon");
  if (icon) icon.textContent = nextDirection === "asc" ? "↑" : "↓";

  const sorted = getSortableTableUnits(tbody, columnIndex)
    .sort((a, b) => compareTableText(a.sortText, b.sortText, nextDirection));
  sorted.forEach(unit => unit.rows.forEach(row => tbody.appendChild(row)));
}

function getSortableTableUnits(tbody, columnIndex) {
  const rows = Array.from(tbody.rows);
  if (!rows.some(row => row.classList.contains("project-group-row"))) {
    return rows.map(row => ({ rows: [row], sortText: getRowSortText(row, columnIndex) }));
  }

  const units = [];
  let current = null;
  rows.forEach(row => {
    if (row.classList.contains("project-group-row") || !current) {
      current = { rows: [row], sortText: getRowSortText(row, columnIndex) };
      units.push(current);
    } else {
      current.rows.push(row);
    }
  });
  return units;
}

function getRowSortText(row, columnIndex) {
  const cell = row.children[columnIndex] || row.children[0];
  if (!cell) return "";
  const input = cell.querySelector("input, select, textarea");
  return normalizeSortText(input ? input.value : cell.textContent);
}

function normalizeSortText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compareTableText(a, b, direction) {
  const numberA = Number(String(a).replace(/[^\d.-]/g, ""));
  const numberB = Number(String(b).replace(/[^\d.-]/g, ""));
  const bothNumbers = Number.isFinite(numberA) && Number.isFinite(numberB) && /\d/.test(a) && /\d/.test(b);
  const result = bothNumbers
    ? numberA - numberB
    : String(a).localeCompare(String(b), "th", { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

// ให้ฟังก์ชันที่ถูกเรียกจาก inline onclick อยู่บน window ชัดเจน
Object.assign(window, {
  navigateTo,
  toggleSidebar,
  closeMobileSidebar,
  resetProjectFilters,
  openCreateForm,
  resetFormState,
  openDetail,
  closeDetailModal,
  editProject,
  deleteProject,
  restoreProject,
  purgeProject,
  setDashboardPieMetric,
  selectDashboardSummaryType,
  setDashboardSummaryType,
  setDashboardFilter,
  setDashboardSearchFilter,
  toggleDashboardChartFilter,
  toggleProjectGroup,
  toggleFacultyProjectsPanel,
  resetDashboardFilters,
  setDashboardBudgetProject,
  changeDashboardBudgetPage,
  filterDashboardByProjectName,
  toggleQuarterGanttCollapse,
  startQuarterResize
});

