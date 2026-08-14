/*
  PRJ Participation Frontend
  - ใช้สำหรับหน้าเข้าร่วมกิจกรรม/โครงการของผู้ใช้
  - อ่านรายการ project/activity และบันทึก participant ลง public.project_participants
  - ใช้ session จาก MIS localStorage เพื่อรู้ person_code/full_name/email ของผู้ใช้งาน
  - ใช้ API_URL เดียวกับ PRJ หลัก เพื่อลดจำนวน Web App URL ที่ต้องดูแล
*/

const API_URL = String(window.PRJ_CONFIG?.API_URL || "").trim();

const MIS_STORAGE = {
  TOKEN: "mis_token",
  USER: "mis_user"
};

const MISSION_FIELDS = [
  "การบริหาร",
  "การเรียนการสอน",
  "การวิจัย",
  "การบริการวิชาการ",
  "การทำนุบำรุงศิลปะและวัฒนธรรม"
];

const pageMeta = {
  report: { title: "รายงานกิจกรรมที่เข้าร่วม", subtitle: "รายการบันทึกเข้าร่วมกิจกรรมของฉัน" },
  form: { title: "เพิ่มบันทึกกิจกรรมเข้าร่วม", subtitle: "เลือกกิจกรรม แนบหลักฐาน และบันทึกการเข้าร่วม" }
};

const state = {
  projects: [],
  records: [],
  activePage: "report",
  editingActivityId: "",
  filters: {
    search: "",
    year: "",
    type: "",
    mission: ""
  },
  dashboardYear: "",
  dashboardType: ""
};

let currentUser = null;

document.addEventListener("DOMContentLoaded", initParticipationApp);

async function initParticipationApp() {
  currentUser = getCurrentUserFromMisSession();
  if (!currentUser) return;
  document.getElementById("userPill").textContent = `${currentUser.personId || "-"} | ${currentUser.name}`;
  bindParticipationEvents();
  navigateToParticipation(getInitialParticipationPage());
  await loadParticipationData();
}

function bindParticipationEvents() {
  const search = document.getElementById("activitySearch");
  const year = document.getElementById("activityYearFilter");
  const type = document.getElementById("activityTypeFilter");
  const mission = document.getElementById("activityMissionFilter");
  const dashboardYear = document.getElementById("dashboardYearFilter");
  const dashboardType = document.getElementById("dashboardTypeFilter");
  if (search) search.addEventListener("input", () => {
    state.filters.search = search.value;
    renderActivityTable();
  });
  if (year) year.addEventListener("change", () => {
    state.filters.year = year.value;
    renderActivityTable();
  });
  if (type) type.addEventListener("change", () => {
    state.filters.type = type.value;
    renderActivityTable();
  });
  if (mission) mission.addEventListener("change", () => {
    state.filters.mission = mission.value;
    renderActivityTable();
  });
  if (dashboardYear) dashboardYear.addEventListener("change", () => {
    state.dashboardYear = dashboardYear.value;
    renderParticipantDashboard();
  });
  if (dashboardType) dashboardType.addEventListener("change", () => {
    state.dashboardType = dashboardType.value;
    renderParticipantDashboard();
  });
  const form = document.getElementById("participantForm");
  if (form) form.addEventListener("submit", event => {
    event.preventDefault();
    submitParticipantRecord();
  });
}

function readMisUser() {
  try {
    return JSON.parse(localStorage.getItem(MIS_STORAGE.USER) || "null");
  } catch (_) {
    return null;
  }
}

function getCurrentUserFromMisSession() {
  const token = localStorage.getItem(MIS_STORAGE.TOKEN) || "";
  const user = readMisUser();
  const expiresAt = Number(user && user.expiresAt);
  if (!token || !user || (expiresAt && Date.now() >= expiresAt)) {
    localStorage.removeItem(MIS_STORAGE.TOKEN);
    localStorage.removeItem(MIS_STORAGE.USER);
    window.location.href = `../login.html?next=prj/${encodeURIComponent("index_participation.html")}`;
    return null;
  }
  return {
    personId: user.personId || user.PERSON_ID || "",
    name: user.fullName || user.FULL_NAME || user.name || "-",
    email: user.email || user.EMAIL || "",
    role: user.role || user.MIS_ROLE || "USERS"
  };
}

function getInitialParticipationPage() {
  const page = String(window.location.hash || "").replace("#", "").trim();
  return pageMeta[page] ? page : "report";
}

function navigateToParticipation(page) {
  if (!pageMeta[page]) page = "report";
  state.activePage = page;
  if (window.location.hash !== `#${page}`) window.history.replaceState(null, "", `#${page}`);
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  document.querySelectorAll(".menu-item").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  document.getElementById("pageTitle").textContent = pageMeta[page].title;
  document.getElementById("pageSubtitle").textContent = pageMeta[page].subtitle;
  closeMobileSidebar();
  if (page === "report") renderParticipantReport();
  if (page === "form") renderActivityTable();
}

async function loadParticipationData() {
  setLoading(true);
  try {
    const [projects, records] = await Promise.all([
      apiGet("getProjects", {}, false),
      apiGet("getParticipantRecords", { PERSON_ID: currentUser.personId }, false)
    ]);
    state.projects = (projects || []).filter(project => isActiveProject(project));
    state.records = records || [];
    populateParticipationFilters();
    populateDashboardFilters();
    ensureDashboardDefaults();
    renderParticipantDashboard();
    renderParticipantReport();
    renderActivityTable();
  } catch (error) {
    console.error(error);
    showToast(error.message || "โหลดข้อมูลไม่สำเร็จ", "error");
    renderLoadError("participantDashboardWrap");
    renderLoadError("participantReportWrap");
    renderLoadError("activityTableWrap");
  } finally {
    setLoading(false);
  }
}

async function apiGet(action, params = {}, useLoading = true) {
  assertApiUrlConfigured();
  if (useLoading) setLoading(true);
  try {
    const url = new URL(API_URL);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url.toString(), { method: "GET" });
    const result = await response.json();
    if (!result.success) throw new Error(result.message || "API Error");
    return result.data;
  } finally {
    if (useLoading) setLoading(false);
  }
}

async function apiPost(action, payload = {}, useLoading = true) {
  assertApiUrlConfigured();
  if (useLoading) setLoading(true);
  try {
    const body = new URLSearchParams();
    body.set("action", action);
    body.set("payload", JSON.stringify(payload));
    const response = await fetch(API_URL, { method: "POST", body });
    const result = await response.json();
    if (!result.success) throw new Error(result.message || "API Error");
    return result.data;
  } finally {
    if (useLoading) setLoading(false);
  }
}

function populateParticipationFilters() {
  const years = uniqueValues(state.projects.map(project => project.FISCAL_YEAR)).sort().reverse();
  const types = uniqueValues(state.projects.map(getProjectTypeLabel)).sort((a, b) => a.localeCompare(b, "th"));
  fillSelect("activityYearFilter", years, "ทั้งหมด");
  fillSelect("activityTypeFilter", types, "ทั้งหมด");
  fillSelect("activityMissionFilter", MISSION_FIELDS, "ทั้งหมด");
}

function populateDashboardFilters() {
  const years = uniqueValues(state.records.map(record => getRecordFiscalYear(record))).sort().reverse();
  fillSelect("dashboardYearFilter", years, "ทั้งหมด");
  const yearSelect = document.getElementById("dashboardYearFilter");
  if (yearSelect && state.dashboardYear) yearSelect.value = years.includes(state.dashboardYear) ? state.dashboardYear : "";
}

function ensureDashboardDefaults() {
  if (!state.dashboardYear) {
    const years = uniqueValues(state.records.map(record => getRecordFiscalYear(record))).sort().reverse();
    state.dashboardYear = years[0] || "";
    const yearSelect = document.getElementById("dashboardYearFilter");
    if (yearSelect) yearSelect.value = state.dashboardYear;
  }
}

function fillSelect(id, values, firstLabel) {
  const select = document.getElementById(id);
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>` +
    values.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join("");
  select.value = values.includes(current) ? current : "";
}

function renderParticipantReport() {
  const wrap = document.getElementById("participantReportWrap");
  if (!wrap) return;
  if (!state.records.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <strong>ยังไม่มีรายการเข้าร่วมกิจกรรม</strong>
        <button class="btn primary" type="button" onclick="navigateToParticipation('form')">+ เพิ่มบันทึกกิจกรรมเข้าร่วม</button>
      </div>
    `;
    return;
  }
  const rows = [...state.records].sort((a, b) => String(b.TIMESTAMP || "").localeCompare(String(a.TIMESTAMP || "")));
  wrap.innerHTML = `
    <table class="project-table participation-table">
      <thead>
        <tr>
          <th>ชื่อโครงการ</th>
          <th>วันที่</th>
          <th>ประเภท</th>
          <th>พันธกิจ</th>
          <th>หลักฐาน</th>
          <th>หมายเหตุ</th>
          <th>บันทึกเมื่อ</th>
          <th>การจัดการ</th>
        </tr>
      </thead>
      <tbody>${rows.map(renderParticipantReportRow).join("")}</tbody>
    </table>
  `;
}

function renderParticipantDashboard() {
  const wrap = document.getElementById("participantDashboardWrap");
  if (!wrap) return;
  const records = getDashboardRecords();
  const total = records.length;
  const facultyTotal = records.filter(record => normalizeProjectType(getRecordType(record)) === "คณะ").length;
  const universityTotal = records.filter(record => normalizeProjectType(getRecordType(record)) === "มหาวิทยาลัย").length;
  const missionRows = MISSION_FIELDS.map(mission => {
    const faculty = records.filter(record => normalizeProjectType(getRecordType(record)) === "คณะ" && getRecordMissions(record).includes(mission)).length;
    const university = records.filter(record => normalizeProjectType(getRecordType(record)) === "มหาวิทยาลัย" && getRecordMissions(record).includes(mission)).length;
    return { mission, faculty, university, total: faculty + university };
  }).filter(row => row.total > 0);

  wrap.innerHTML = `
    <div class="participant-dashboard-cards">
      ${renderDashboardMetric("เข้าร่วมทั้งหมด", total)}
      ${renderDashboardMetric("โครงการคณะ", facultyTotal)}
      ${renderDashboardMetric("โครงการมหาวิทยาลัย", universityTotal)}
    </div>
    <div class="participant-mission-summary">
      ${missionRows.length ? missionRows.map(renderMissionSummaryRow).join("") : `
        <div class="empty-state compact"><strong>ไม่มีข้อมูลในเงื่อนไขนี้</strong></div>
      `}
    </div>
  `;
}

function renderDashboardMetric(label, value) {
  return `
    <div class="participant-dashboard-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(state.dashboardYear || "ทุกปีงบประมาณ")}</small>
    </div>
  `;
}

function renderMissionSummaryRow(row) {
  const max = Math.max(row.total, 1);
  return `
    <div class="participant-mission-row">
      <div>
        <strong>${escapeHtml(row.mission)}</strong>
        <span>รวม ${escapeHtml(row.total)} รายการ | คณะ ${escapeHtml(row.faculty)} | มหาวิทยาลัย ${escapeHtml(row.university)}</span>
      </div>
      <div class="participant-mission-bars">
        <span class="faculty" style="width:${(row.faculty / max) * 100}%"></span>
        <span class="university" style="width:${(row.university / max) * 100}%"></span>
      </div>
    </div>
  `;
}

function getDashboardRecords() {
  return state.records.filter(record => {
    const yearOk = !state.dashboardYear || getRecordFiscalYear(record) === state.dashboardYear;
    const typeOk = !state.dashboardType || normalizeProjectType(getRecordType(record)) === state.dashboardType;
    return yearOk && typeOk;
  });
}

function renderParticipantReportRow(record) {
  const activityId = record.ACTIVITY_ID || "";
  const project = findProject(activityId);
  const canEdit = isEditableRecord(record);
  return `
    <tr>
      <td>
        <strong>${escapeHtml(record.PROJECT_NAME || project?.PROJECT_NAME || "-")}</strong>
        <small>${escapeHtml(record.ACTIVITY_NAME || project?.ACTIVITY_NAME || activityId)}</small>
      </td>
      <td>${escapeHtml(formatProjectPeriodText(record.PROJECT_DATE) || getProjectPeriod(project))}</td>
      <td>${escapeHtml(record.PROJECT_TYPE || project?.PROJECT_LEVEL || "-")}</td>
      <td>${escapeHtml(record.MISSION || getProjectMissions(project).join(", ") || "-")}</td>
      <td>${record.EVIDENCE_FILE_URL ? `<a href="${escapeAttr(record.EVIDENCE_FILE_URL)}" target="_blank" rel="noopener">เปิดหลักฐาน</a>` : "-"}</td>
      <td>${escapeHtml(record.REMARK || "-")}</td>
      <td>
        ${escapeHtml(record.TIMESTAMP || "-")}
        <small>${canEdit ? `แก้ไขได้ถึง ${escapeHtml(record.EDIT_UNTIL || "")}` : "ครบกำหนดแก้ไขแล้ว"}</small>
      </td>
      <td class="action-cell">
        <button class="icon-action view" type="button" onclick="openDetail('${escapeJs(activityId)}')" title="ดูรายละเอียด">🔍</button>
        ${canEdit ? `<button class="icon-action edit" type="button" onclick="openParticipantModal('${escapeJs(activityId)}', true)" title="แก้ไข">✎</button>` : ""}
        <button class="icon-action delete" type="button" onclick="cancelParticipantRecord('${escapeJs(activityId)}')" title="ยกเลิกรายการ" aria-label="ยกเลิกรายการ">×</button>
      </td>
    </tr>
  `;
}

function renderActivityTable() {
  const wrap = document.getElementById("activityTableWrap");
  if (!wrap) return;
  const projects = getFilteredProjects();
  if (!projects.length) {
    wrap.innerHTML = `<div class="empty-state"><strong>ไม่พบกิจกรรมตามเงื่อนไข</strong></div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="project-table participation-table activity-select-table">
      <thead>
        <tr>
          <th>ชื่อโครงการ</th>
          <th>วันที่</th>
          <th>ประเภท</th>
          <th>พันธกิจ</th>
          <th>เลือกเข้าร่วม</th>
          <th>หลักฐาน</th>
          <th>หมายเหตุ</th>
          <th>รายละเอียด</th>
        </tr>
      </thead>
      <tbody>${projects.map(renderActivityRow).join("")}</tbody>
    </table>
  `;
}

function renderActivityRow(project) {
  const activityId = getActivityKey(project);
  const record = findRecord(activityId);
  const selected = !!record;
  const canEdit = isEditableRecord(record);
  return `
    <tr class="${selected ? "participant-selected-row" : ""}">
      <td>
        <strong>${escapeHtml(project.PROJECT_NAME || "-")}</strong>
        <small>${escapeHtml(project.ACTIVITY_NAME || activityId)}</small>
      </td>
      <td>${escapeHtml(getProjectPeriod(project))}</td>
      <td>${escapeHtml(project.PROJECT_LEVEL || project.FORM_TYPE || "-")}</td>
      <td>${escapeHtml(getProjectMissions(project).join(", ") || "-")}</td>
      <td>
        ${selected
          ? `<span class="status-pill status-done">เลือกแล้ว</span>`
          : `<button class="btn primary small-btn" type="button" onclick="openParticipantModal('${escapeJs(activityId)}', false)">เลือกเข้าร่วม</button>`}
      </td>
      <td>${record?.EVIDENCE_FILE_URL ? `<a href="${escapeAttr(record.EVIDENCE_FILE_URL)}" target="_blank" rel="noopener">เปิดหลักฐาน</a>` : "-"}</td>
      <td>${escapeHtml(record?.REMARK || "-")}</td>
      <td class="action-cell">
        <button class="icon-action view" type="button" onclick="openDetail('${escapeJs(activityId)}')" title="ดูรายละเอียด">🔍</button>
        ${selected && canEdit ? `<button class="icon-action edit" type="button" onclick="openParticipantModal('${escapeJs(activityId)}', true)" title="แก้ไข">✎</button>` : ""}
        ${selected ? `<button class="icon-action delete" type="button" onclick="cancelParticipantRecord('${escapeJs(activityId)}')" title="ยกเลิกรายการ" aria-label="ยกเลิกรายการ">×</button>` : ""}
      </td>
    </tr>
  `;
}

function getFilteredProjects() {
  const keyword = String(state.filters.search || "").trim().toLowerCase();
  return state.projects.filter(project => {
    const missions = getProjectMissions(project);
    const projectType = getProjectTypeLabel(project);
    const haystack = [project.PROJECT_NAME, project.ACTIVITY_NAME, project.PROJECT_ID, project.ACTIVITY_ID].join(" ").toLowerCase();
    return (!keyword || haystack.includes(keyword)) &&
      (!state.filters.year || String(project.FISCAL_YEAR) === String(state.filters.year)) &&
      (!state.filters.type || projectType === state.filters.type) &&
      (!state.filters.mission || missions.includes(state.filters.mission));
  });
}

function resetParticipationFilters() {
  state.filters = { search: "", year: "", type: "", mission: "" };
  document.getElementById("activitySearch").value = "";
  document.getElementById("activityYearFilter").value = "";
  document.getElementById("activityTypeFilter").value = "";
  document.getElementById("activityMissionFilter").value = "";
  renderActivityTable();
}

function openParticipantModal(activityId, isEdit) {
  const project = findProject(activityId);
  if (!project) {
    showToast("ไม่พบข้อมูลโครงการ", "error");
    return;
  }
  const record = findRecord(activityId);
  if (isEdit && !isEditableRecord(record)) {
    showToast("แก้ไขได้ภายใน 7 วันหลังบันทึกเท่านั้น", "warning");
    return;
  }
  state.editingActivityId = activityId;
  document.getElementById("participantActivityId").value = activityId;
  document.getElementById("participantModalTitle").textContent = isEdit ? "แก้ไขบันทึกการเข้าร่วม" : "บันทึกการเข้าร่วม";
  document.getElementById("participantModalSubtitle").textContent = project.ACTIVITY_NAME || project.PROJECT_NAME || activityId;
  document.getElementById("participantProjectSummary").innerHTML = `
    <strong>${escapeHtml(project.PROJECT_NAME || "-")}</strong>
    <span>${escapeHtml(project.ACTIVITY_NAME || activityId)}</span>
    <small>${escapeHtml(getProjectPeriod(project))} | ${escapeHtml(project.PROJECT_LEVEL || "-")} | ${escapeHtml(getProjectMissions(project).join(", ") || "ไม่ระบุพันธกิจ")}</small>
  `;
  document.getElementById("participantJoined").checked = true;
  document.getElementById("participantRemark").value = record?.REMARK || "";
  document.getElementById("participantEvidence").value = "";
  document.getElementById("participantEvidenceHelp").textContent = record?.EVIDENCE_FILE_URL
    ? "มีหลักฐานเดิมแล้ว ถ้าเลือกไฟล์ใหม่จะบันทึกแทนไฟล์เดิม"
    : "ไม่บังคับแนบไฟล์ รองรับรูปภาพหรือ PDF ขนาดไม่เกิน 2 MB";
  document.getElementById("participantModal").classList.remove("hidden");
}

function closeParticipantModal() {
  document.getElementById("participantModal").classList.add("hidden");
}

async function cancelParticipantRecord(activityId) {
  const record = findRecord(activityId);
  const project = findProject(activityId);
  if (!record) {
    showToast("ไม่พบรายการที่เลือกไว้", "warning");
    return;
  }
  const label = record.ACTIVITY_NAME || project?.ACTIVITY_NAME || project?.PROJECT_NAME || activityId;
  if (!confirm(`ยืนยันยกเลิกรายการเข้าร่วม\n${label}`)) return;
  try {
    await apiPost("cancelParticipantRecord", {
      PERSON_ID: currentUser.personId,
      ACTIVITY_ID: activityId
    }, true);
    state.records = state.records.filter(item => String(item.ACTIVITY_ID || "") !== String(activityId));
    populateDashboardFilters();
    ensureDashboardDefaults();
    renderParticipantDashboard();
    renderParticipantReport();
    renderActivityTable();
    showToast("ยกเลิกรายการแล้ว");
  } catch (error) {
    console.error(error);
    showToast(error.message || "ยกเลิกรายการไม่สำเร็จ", "error");
  }
}

async function submitParticipantRecord() {
  const activityId = document.getElementById("participantActivityId").value;
  const project = findProject(activityId);
  const record = findRecord(activityId);
  const file = document.getElementById("participantEvidence").files[0] || null;
  if (!document.getElementById("participantJoined").checked) {
    showToast("กรุณาเลือกเข้าร่วมกิจกรรม", "warning");
    return;
  }
  if (file && file.size > 2 * 1024 * 1024) {
    showToast("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 2 MB", "warning");
    return;
  }
  try {
    const payload = {
      PERSON_ID: currentUser.personId,
      FULL_NAME: currentUser.name,
      EMAIL: currentUser.email,
      ACTIVITY_ID: activityId,
      JOINED: "y",
      REMARK: document.getElementById("participantRemark").value || ""
    };
    if (file) payload.EVIDENCE = await fileToPayload(file);
    const saved = await apiPost("saveParticipantRecord", payload, true);
    const index = state.records.findIndex(item => String(item.ACTIVITY_ID) === String(activityId));
    if (index >= 0) state.records[index] = saved;
    else state.records.push(saved);
    closeParticipantModal();
    populateDashboardFilters();
    ensureDashboardDefaults();
    renderParticipantDashboard();
    renderParticipantReport();
    renderActivityTable();
    showToast(project ? `บันทึก ${project.ACTIVITY_NAME || project.PROJECT_NAME} แล้ว` : "บันทึกข้อมูลแล้ว");
  } catch (error) {
    console.error(error);
    showToast(error.message || "บันทึกข้อมูลไม่สำเร็จ", "error");
  }
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      base64: String(reader.result || "").split(",")[1] || ""
    });
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

function openDetail(activityId) {
  const project = findProject(activityId);
  if (!project) {
    showToast("ไม่พบข้อมูลโครงการ", "error");
    return;
  }
  document.getElementById("detailTitle").textContent = "รายละเอียดโครงการ";
  document.getElementById("detailSubtitle").textContent = project.ACTIVITY_NAME || project.PROJECT_NAME || activityId;
  document.getElementById("detailBody").innerHTML = `
    ${renderDetailSection("ข้อมูลโครงการ", [
      ["รหัสกิจกรรม", getActivityKey(project)],
      ["รหัสโครงการ", project.PROJECT_ID],
      ["ชื่อโครงการ", project.PROJECT_NAME],
      ["ชื่อกิจกรรม", project.ACTIVITY_NAME],
      ["รายละเอียด", project.PROJECT_DESCRIPTION],
      ["ลิงก์เอกสาร", renderMaybeLink(project.DOCUMENT_URL)]
    ])}
    ${renderDetailSection("ช่วงเวลาและพันธกิจ", [
      ["ปีงบประมาณ", project.FISCAL_YEAR],
      ["วันที่", getProjectPeriod(project)],
      ["ไตรมาส", getProjectQuarters(project).join(", ")],
      ["ประเภท", project.PROJECT_LEVEL || project.FORM_TYPE],
      ["พันธกิจ", getProjectMissions(project).join(", ")],
      ["สถานะ", project.STATUS]
    ])}
    ${renderDetailSection("ผู้รับผิดชอบ", [
      ["ผู้รับผิดชอบ 1", project.RESPONSIBLE_FULL_NAME],
      ["อีเมล", project.RESPONSIBLE_EMAIL],
      ["ผู้รับผิดชอบ 2", project.CO_OWNER_FULL_NAME],
      ["หมายเหตุ", project.REMARK]
    ])}
  `;
  document.getElementById("detailModal").classList.remove("hidden");
}

function renderDetailSection(title, rows) {
  return `
    <section class="detail-section">
      <h4>${escapeHtml(title)}</h4>
      <div class="detail-grid">
        ${rows.map(([label, value]) => `
          <div class="detail-item ${String(value || "").length > 120 ? "full" : ""}">
            <label>${escapeHtml(label)}</label>
            <div>${value || "-"}</div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderMaybeLink(url) {
  const text = String(url || "").trim();
  if (!text) return "";
  return `<a href="${escapeAttr(text)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
}

function closeDetailModal() {
  document.getElementById("detailModal").classList.add("hidden");
}

function findProject(activityId) {
  return state.projects.find(project => String(getActivityKey(project)) === String(activityId));
}

function findRecord(activityId) {
  return state.records.find(record => String(record.ACTIVITY_ID || "") === String(activityId));
}

function isEditableRecord(record) {
  if (!record) return false;
  if (record.CAN_EDIT === true || String(record.CAN_EDIT).toUpperCase() === "TRUE") return true;
  const timestamp = parseLocalTimestamp(record.TIMESTAMP || record.CREATED_AT);
  return !!timestamp && Date.now() - timestamp.getTime() <= 7 * 24 * 60 * 60 * 1000;
}

function parseLocalTimestamp(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
}

function getActivityKey(project) {
  return String(project?.ACTIVITY_ID || project?.PROJECT_ID || "");
}

function getProjectTypeLabel(project) {
  return String(project?.PROJECT_LEVEL || project?.FORM_TYPE || project?.PROJECT_TYPE || "").trim();
}

function getRecordType(record) {
  const project = findProject(record?.ACTIVITY_ID || "");
  return String(record?.PROJECT_TYPE || getProjectTypeLabel(project) || "").trim();
}

function normalizeProjectType(value) {
  const text = String(value || "").trim().toUpperCase();
  if (text === "UNIVERSITY" || text === "UNI" || text === "มหาวิทยาลัย") return "มหาวิทยาลัย";
  if (text === "FACULTY" || text === "FAC" || text === "คณะ") return "คณะ";
  return String(value || "").trim();
}

function getRecordFiscalYear(record) {
  const project = findProject(record?.ACTIVITY_ID || "");
  const direct = String(record?.FISCAL_YEAR || project?.FISCAL_YEAR || "").trim();
  if (direct) return direct;
  return getFiscalYearFromDateText(record?.PROJECT_DATE || project?.START_DATE || "");
}

function getFiscalYearFromDateText(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  return String(year + (month >= 10 ? 544 : 543));
}

function getRecordMissions(record) {
  const project = findProject(record?.ACTIVITY_ID || "");
  const missions = [];
  String(record?.MISSION || "").split(/\s*,\s*/).forEach(item => {
    if (item && !missions.includes(item)) missions.push(item);
  });
  getProjectMissions(project).forEach(item => {
    if (item && !missions.includes(item)) missions.push(item);
  });
  return missions;
}

function getProjectPeriod(project) {
  if (!project) return "";
  const start = formatProjectPeriodDate(project.START_DATE);
  const end = formatProjectPeriodDate(project.END_DATE);
  if (start && end && start !== end) return `${start} - ${end}`;
  return start || end || "";
}

function formatProjectPeriodDate(value) {
  if (!value) return "";
  const date = parseDateDisplayValue(value);
  if (!date) return String(value);
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatProjectPeriodText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const parts = text.split(/\s+-\s+/);
  if (parts.length >= 2) {
    const start = formatProjectPeriodDate(parts[0]);
    const end = formatProjectPeriodDate(parts.slice(1).join(" - "));
    if (start && end && start !== end) return `${start} - ${end}`;
    return start || end || text;
  }
  return formatProjectPeriodDate(text);
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
  return ["Q1", "Q2", "Q3", "Q4"].filter(field => isMarked(project?.[field]));
}

function getProjectMissions(project) {
  if (!project) return [];
  const selected = MISSION_FIELDS.filter(field => isMarked(project[field]));
  const legacy = String(project.MISSION || "").trim();
  if (legacy) {
    legacy.split(/\s*,\s*/).forEach(item => {
      if (item && !selected.includes(item)) selected.push(item);
    });
  }
  return selected;
}

function isActiveProject(project) {
  return project && getActivityKey(project) && !isFalse(project.IS_ACTIVE);
}

function isMarked(value) {
  const text = String(value || "").trim().toUpperCase();
  return value === true || text === "TRUE" || text === "Y" || text === "YES" || text === "1";
}

function isFalse(value) {
  const text = String(value || "").trim().toUpperCase();
  return value === false || text === "FALSE" || text === "0" || text === "NO";
}

function formatDateDisplay(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toLocaleDateString("th-TH");
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function uniqueValues(values) {
  return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
}

function setLoading(isLoading, text = "กำลังดาวน์โหลด") {
  const overlay = document.getElementById("loadingOverlay");
  document.getElementById("loadingText").textContent = text;
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

function renderLoadError(id) {
  const wrap = document.getElementById(id);
  if (wrap) wrap.innerHTML = `<div class="empty-state"><strong>โหลดข้อมูลไม่สำเร็จ</strong></div>`;
}

function assertApiUrlConfigured() {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(API_URL)) {
    throw new Error("URL ของ Apps Script Web App ไม่ถูกต้อง");
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function escapeJs(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
