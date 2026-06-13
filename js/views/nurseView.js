// ============================================
// NURSE VIEW - Render UI y tá
// ============================================

import { formatUserRole, formatUserStatus, formatWorkingStatus } from "../utils/formatter.js";
import authService from "../services/authService.js";
import { NURSE_DEPARTMENTS, NURSE_SHIFT_OPTIONS, NURSE_SKILL_OPTIONS, NURSE_WORKING_STATUS_OPTIONS } from "../data/constants.js";
import nurseService from "../services/nurseService.js";


let nurseStep = 1;
let nurseFormData = {};
let nurseDetail = null;

// Export these for controller access
export function getNurseFormStep() {
  return nurseStep;
}

export function getNurseFormData() {
  return { ...nurseFormData };
}

export function setNurseFormStep(step) {
  nurseStep = step;
}

export function setNurseFormData(data) {
  nurseFormData = { ...data };
}

export function resetNurseForm() {
  nurseStep = 1;
  nurseFormData = {};
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getNurseAvatarHtml(nurse) {
  const avatar = nurse?.avatar || "";
  const isActive = (nurse?.workingStatus || "active") !== "temporary_leave";
  const glowClass = isActive ? "nurse-avatar-glow-active" : "nurse-avatar-glow-inactive";

  if (avatar) {
    return `<div class="avatar ${glowClass}" style="background:#f3f7ff;overflow:hidden;"><img src="${avatar}" alt="Avatar ${escapeHtml(nurse?.fullName || '')}" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`;
  }

  const name = nurse?.fullName || "";
  if (!name) return `<div class="avatar ${glowClass}" style="background:#e2e8f0;color:#888;">?</div>`;
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#2f7bff","#00afdd","#7b31e2","#ef4444","#10b981"]; // random
  const color = colors[(name.charCodeAt(0)+name.length)%colors.length];
  return `<div class="avatar ${glowClass}" style="background:${color};">${initials}</div>`;
}

function renderOptionList(options, selectedValue) {
  return options.map((option) => {
    const value = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? option : option.label;
    return `<option value="${escapeHtml(value)}" ${selectedValue === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function renderSkillCheckboxes(selectedSkills = []) {
  const selected = new Set(selectedSkills);
  const mergedSkills = [...NURSE_SKILL_OPTIONS];
  selectedSkills.forEach((skill) => {
    if (skill && !mergedSkills.includes(skill)) {
      mergedSkills.push(skill);
    }
  });
  return mergedSkills.map((skill) => `
    <label class="skill-chip">
      <input type="checkbox" name="nurse-skill" value="${escapeHtml(skill)}" ${selected.has(skill) ? "checked" : ""} />
      <span>${escapeHtml(skill)}</span>
    </label>
  `).join("");
}

function getRoleColor(role) {
  if(role==="head_nurse") return "background:#ece1ff;color:#7b31e2;";
  if(role==="nurse") return "background:#e1ecff;color:#215fe3;";
  return "background:#e5e7eb;color:#374151;";
}
function getStatusColor(status) {
  if(status==="active") return "background:#d7f6e5;color:#0d7e42;";
  if(status==="dừng hoạt động"||status==="inactive") return "background:#ffe8e8;color:#b4232f;";
  return "background:#eceff5;color:#4e5d73;";
}

export function renderNurseView(container, nurses, isModalVisible = false) {
  // Calculate dashboard stats
  const allActiveNurses = nurseService.filterNurses({ role: "all", status: "all" });
  const totalStaff = allActiveNurses.length;
  const headNurses = allActiveNurses.filter(n => n.role === 'head_nurse').length;
  const onDuty = allActiveNurses.filter(n => n.workingStatus !== 'temporary_leave').length;
  const offDuty = allActiveNurses.filter(n => n.workingStatus === 'temporary_leave').length;

  // Pagination
  const pageSize = 10;
  let currentPage = window.nursePage || 1;
  const totalPages = Math.max(1, Math.ceil(nurses.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  window.nursePage = currentPage;
  const pagedNurses = nurses.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const canCreateNurse = authService.can("nurses.create");

  // Card grid
  const cards = pagedNurses.map((u, idx) => {
    const roleColor = getRoleColor(u.role);
    const workingStatusColor = getStatusColor(u.workingStatus === "temporary_leave" ? "inactive" : "active");
    const department = u.department || "-";
    const shift = u.shift || "-";

    const activeShift = String(u.shift || "").trim();
    const isSang = activeShift === "Sáng";
    const isChieu = activeShift === "Chiều";
    const isDem = activeShift === "Đêm";
    const shiftTimeline = `
      <div class="shift-timeline-container">
        <div class="shift-timeline-title">
          <span>Lịch trực</span>
          <span class="shift-label-active ${isSang ? '' : (isChieu ? 'afternoon' : 'night')}">Ca ${activeShift || 'Chưa phân'}</span>
        </div>
        <div class="shift-timeline-bar">
          <div class="shift-segment ${isSang ? 'active-shift' : ''}"></div>
          <div class="shift-segment ${isChieu ? 'active-shift afternoon' : ''}"></div>
          <div class="shift-segment ${isDem ? 'active-shift night' : ''}"></div>
        </div>
        <div class="shift-labels-row">
          <span class="${isSang ? 'shift-label-active' : ''}">Sáng</span>
          <span class="${isChieu ? 'shift-label-active afternoon' : ''}">Chiều</span>
          <span class="${isDem ? 'shift-label-active night' : ''}">Đêm</span>
        </div>
      </div>
    `;

    return `
      <div class="nurse-card" tabindex="0" data-idx="${idx}" style="animation-delay:${idx*40}ms">
        <div class="nurse-card-head">
          ${getNurseAvatarHtml(u)}
          <div class="nurse-card-info">
            <div class="nurse-card-name">${u.fullName}</div>
            <div class="nurse-card-badges">
              <div class="badge" style="${roleColor}">${formatUserRole(u.role)}</div>
              <div class="badge" style="${workingStatusColor}">${formatWorkingStatus(u.workingStatus || "active")}</div>
            </div>
            <div class="nurse-card-meta">
              <span><b>Khoa:</b> ${escapeHtml(department)}</span>
              <span><b>Ca:</b> ${escapeHtml(shift)}</span>
            </div>
          </div>
        </div>
        <!-- GỐC: ${shiftTimeline} -->
        <div class="nurse-card-username">${u.username}${u.employeeId ? ` · ${u.employeeId}` : ""}</div>
      </div>
    `;
  }).join("");

  // Detail quick view
  let detailHtml = "";
  if(nurseDetail) {
    detailHtml = `
      <div class="nurse-detail-modal modal-overlay show">
        <div class="modal-card">
          <h3>Chi tiết y tá</h3>
          <div class="nurse-detail-header">
            ${getNurseAvatarHtml(nurseDetail)}
            <div class="nurse-detail-title">
              <div class="nurse-detail-name">${nurseDetail.fullName}</div>
              <div class="nurse-card-badges">
                <div class="badge" style="${getRoleColor(nurseDetail.role)}">${formatUserRole(nurseDetail.role)}</div>
                <div class="badge" style="${getStatusColor(nurseDetail.workingStatus === "temporary_leave" ? "inactive" : "active")}">${formatWorkingStatus(nurseDetail.workingStatus || "active")}</div>
              </div>
            </div>
          </div>
          <div class="nurse-detail-grid">
            <div class="nurse-detail-item"><span>Mã nhân viên</span><b>${nurseDetail.employeeId || "-"}</b></div>
            <div class="nurse-detail-item"><span>Tài khoản</span><b>${nurseDetail.username}</b></div>
            <div class="nurse-detail-item"><span>SĐT</span><b>${nurseDetail.phone || "-"}</b></div>
            <div class="nurse-detail-item"><span>Khoa/phòng</span><b>${nurseDetail.department || "-"}</b></div>
            <div class="nurse-detail-item"><span>Ca mặc định</span><b>${nurseDetail.shift || "-"}</b></div>
            <div class="nurse-detail-item"><span>Khu vực phụ trách</span><b>${nurseDetail.workArea || "-"}</b></div>
            <div class="nurse-detail-item"><span>Ngày bắt đầu</span><b>${nurseDetail.startDate || "-"}</b></div>
            <div class="nurse-detail-item"><span>Kinh nghiệm</span><b>${nurseDetail.experienceYears || 0} năm</b></div>
          </div>
          <div class="nurse-detail-section">
            <div class="nurse-detail-section-title">Kỹ năng</div>
            <div class="nurse-detail-text">${Array.isArray(nurseDetail.skills) && nurseDetail.skills.length ? nurseDetail.skills.join(", ") : "-"}</div>
          </div>
          <div class="nurse-detail-section">
            <div class="nurse-detail-section-title">Ghi chú</div>
            <div class="nurse-detail-text">${nurseDetail.notes || "-"}</div>
          </div>
          <div class="modal-actions" style="margin-top:18px;display:flex;gap:12px;flex-wrap:wrap;">
            <button type="button" class="ghost-btn modal-cancel" id="nurse-detail-close">Đóng</button>
            ${authService.can("nurses.password") ? `<button type="button" class="warning reset-password-btn" data-id="${nurseDetail.id}" style="min-height:unset; box-shadow:none; background:linear-gradient(120deg, #f59e0b, #f97316); color:white; display:inline-flex; align-items:center; gap:8px; border-radius:14px; padding:12px 22px; font-weight:700; border:none; cursor:pointer;" aria-label="Đặt lại mật khẩu cho y tá ${nurseDetail.fullName}"><i class="fa-solid fa-key"></i> Đặt lại mật khẩu</button>` : ""}
            ${authService.can("nurses.delete") && nurseDetail.role!=="head_nurse" ? `<button class="danger delete-nurse-btn" data-id="${nurseDetail.id}" aria-label="Xóa y tá ${nurseDetail.fullName}"><span class="delete-icon"><img src="image/close.png" alt="Xóa" style="width:22px;height:22px;object-fit:contain;display:block;"></span>Xóa</button>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  // Step-form modal
  let modalHtml = "";
  if(isModalVisible) {
    modalHtml = `
      <div class="modal-overlay show" id="nurse-modal">
        <div class="modal-card nurse-modal-card">
          <h3>Thêm tài khoản y tá</h3>
          <form id="nurse-modal-form" class="patient-modal-form">
            <div class="premium-stepper-wizard">
              <div class="premium-stepper-line"></div>
              <div class="premium-stepper-progress" style="width: ${nurseStep === 1 ? '0%' : (nurseStep === 2 ? '50%' : '100%')}"></div>
              
              <div class="premium-step-node ${nurseStep >= 1 ? 'active' : ''} ${nurseStep > 1 ? 'completed' : ''}">
                <div class="premium-step-circle">${nurseStep > 1 ? '✓' : '1'}</div>
                <div class="premium-step-text">Thông tin cơ bản</div>
              </div>
              
              <div class="premium-step-node ${nurseStep >= 2 ? 'active' : ''} ${nurseStep > 2 ? 'completed' : ''}">
                <div class="premium-step-circle">${nurseStep > 2 ? '✓' : '2'}</div>
                <div class="premium-step-text">Thông tin làm việc</div>
              </div>
              
              <div class="premium-step-node ${nurseStep >= 3 ? 'active' : ''} ${nurseStep > 3 ? 'completed' : ''}">
                <div class="premium-step-circle">3</div>
                <div class="premium-step-text">Năng lực</div>
              </div>
            </div>
            <div class="step-content">
              ${nurseStep===1 ? `
                <div class="field-wrap">
                  <label for="nurse-employee-id">Mã nhân viên</label>
                  <input id="nurse-employee-id" name="employeeId" type="text" readonly value="${escapeHtml(nurseFormData.employeeId||"")}" />
                </div>
                <div class="row-2">
                  <div class="field-wrap">
                    <label for="nurse-fullname">Tên y tá</label>
                    <input id="nurse-fullname" name="fullName" type="text" placeholder="Nhập tên y tá" required value="${escapeHtml(nurseFormData.fullName||"")}" />
                  </div>
                  <div class="field-wrap">
                    <label for="nurse-phone">Số điện thoại</label>
                    <input id="nurse-phone" name="phone" type="text" placeholder="Nhập số điện thoại" value="${escapeHtml(nurseFormData.phone||"")}" pattern="[0-9+ ]{8,20}" />
                  </div>
                </div>
                <div class="row-2">
                  <div class="field-wrap">
                    <label for="nurse-username">Tài khoản đăng nhập</label>
                    <input id="nurse-username" name="username" type="text" placeholder="Nhập username" required value="${escapeHtml(nurseFormData.username||"")}" />
                  </div>
                  <div class="field-wrap">
                    <label for="nurse-password">Mật khẩu đăng nhập</label>
                    <input id="nurse-password" name="password" type="password" placeholder="Nhập mật khẩu" required value="${escapeHtml(nurseFormData.password||"")}" />
                  </div>
                </div>
                <div class="field-wrap">
                  <label for="nurse-role">Vai trò</label>
                  <select id="nurse-role" name="role" required>
                    <option value="nurse" ${nurseFormData.role==="nurse"?"selected":""}>Y tá</option>
                    <option value="head_nurse" ${nurseFormData.role==="head_nurse"?"selected":""}>Y tá trưởng</option>
                  </select>
                </div>
                <div class="field-wrap">
                  <label for="nurse-avatar">Ảnh đại diện</label>
                  <input id="nurse-avatar" name="avatarFile" type="file" accept="image/*" />
                  <div id="nurse-avatar-preview" style="margin-top:10px;">${nurseFormData.avatar ? `<img src="${nurseFormData.avatar}" alt="avatar preview" style="width:84px;height:84px;border-radius:18px;object-fit:cover;border:1px solid #d9e7f4;" />` : `<div class="avatar" style="width:84px;height:84px;background:#eef4fb;color:#7c8ea6;">${(nurseFormData.fullName||"?").trim().slice(0,2).toUpperCase()}</div>`}</div>
                </div>
              ` : ""}
              ${nurseStep===2 ? `
                <div class="row-2">
                  <div class="field-wrap">
                    <label for="nurse-department">Khoa / phòng</label>
                    <select id="nurse-department" name="department" required>
                      <option value="">-- Chọn khoa / phòng --</option>
                      ${renderOptionList(NURSE_DEPARTMENTS, nurseFormData.department || "")}
                    </select>
                  </div>
                  <div class="field-wrap">
                    <label for="nurse-work-area">Khu vực phụ trách</label>
                    <input id="nurse-work-area" name="workArea" type="text" placeholder="Ví dụ: Tầng 3, phòng 305" value="${escapeHtml(nurseFormData.workArea||"")}" />
                  </div>
                </div>
                <div class="row-2">
                  <div class="field-wrap">
                    <label for="nurse-shift">Ca làm mặc định</label>
                    <select id="nurse-shift" name="shift" required>
                      <option value="">-- Chọn ca --</option>
                      ${renderOptionList(NURSE_SHIFT_OPTIONS, nurseFormData.shift || "")}
                    </select>
                  </div>
                  <div class="field-wrap">
                    <label for="nurse-start-date">Ngày bắt đầu làm</label>
                    <input id="nurse-start-date" name="startDate" type="date" value="${escapeHtml(nurseFormData.startDate||"")}" />
                  </div>
                </div>
                <div class="field-wrap">
                  <label for="nurse-working-status">Trạng thái</label>
                  <select id="nurse-working-status" name="workingStatus" required>
                    ${renderOptionList(NURSE_WORKING_STATUS_OPTIONS, nurseFormData.workingStatus || "active")}
                  </select>
                </div>
              ` : ""}
              ${nurseStep===3 ? `
                <div class="nurse-step3-layout">
                  <div class="field-wrap nurse-step3-skills">
                    <label>Kỹ năng</label>
                    <div class="skill-grid">
                      ${renderSkillCheckboxes(nurseFormData.skills || [])}
                    </div>
                    <div class="field-wrap" style="margin-top:10px;">
                      <label for="nurse-custom-skills">Thêm kỹ năng khác</label>
                      <input id="nurse-custom-skills" name="customSkills" type="text" placeholder="Ví dụ: Lọc máu, Chăm sóc tim mạch (cách nhau bằng dấu phẩy)" value="${escapeHtml(nurseFormData.customSkills || "")}" />
                    </div>
                  </div>
                  <div class="nurse-step3-side">
                    <div class="field-wrap">
                      <label for="nurse-experience-years">Kinh nghiệm (năm)</label>
                      <input id="nurse-experience-years" name="experienceYears" type="number" min="0" max="60" step="1" value="${escapeHtml(nurseFormData.experienceYears ?? "")}" placeholder="0" />
                    </div>
                    <div class="field-wrap">
                      <label for="nurse-notes">Ghi chú</label>
                      <textarea id="nurse-notes" name="notes" rows="6" placeholder='Ví dụ: "làm việc nhanh", "cẩn thận"'>${escapeHtml(nurseFormData.notes||"")}</textarea>
                    </div>
                  </div>
                </div>
              ` : ""}
            </div>
            <div class="modal-actions">
              <button type="button" class="ghost-btn modal-cancel" id="nurse-modal-cancel">${nurseStep===1?"Hủy":"Quay lại"}</button>
              <button type="submit">${nurseStep===3?"Lưu tài khoản":"Tiếp tục"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  const isFilteredRoleTotal = !window.nurseController || (window.nurseController.filters.role === 'all' && (!window.nurseController.filters.workingStatus || window.nurseController.filters.workingStatus === 'all'));
  const isFilteredRoleHead = window.nurseController && window.nurseController.filters.role === 'head_nurse';
  const isFilteredWorkingActive = window.nurseController && window.nurseController.filters.workingStatus === 'active';
  const isFilteredWorkingLeave = window.nurseController && window.nurseController.filters.workingStatus === 'temporary_leave';

  container.innerHTML = `
    <div class="nurse-stats-dashboard">
      <div class="stat-glass-card ${isFilteredRoleTotal ? 'active-filter' : ''}" id="stat-card-total">
        <div class="stat-glass-icon" style="background: rgba(37, 99, 235, 0.1); color: #2563eb;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </div>
        <div class="stat-glass-info">
          <div class="stat-glass-label">Tổng nhân sự</div>
          <div class="stat-glass-val">${totalStaff}</div>
        </div>
      </div>
      <div class="stat-glass-card ${isFilteredRoleHead ? 'active-filter' : ''}" id="stat-card-head">
        <div class="stat-glass-icon" style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
        </div>
        <div class="stat-glass-info">
          <div class="stat-glass-label">Y tá trưởng</div>
          <div class="stat-glass-val">${headNurses}</div>
        </div>
      </div>
      <div class="stat-glass-card ${isFilteredWorkingActive ? 'active-filter' : ''}" id="stat-card-active">
        <div class="stat-glass-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        </div>
        <div class="stat-glass-info">
          <div class="stat-glass-label">Đang làm việc</div>
          <div class="stat-glass-val">${onDuty}</div>
        </div>
      </div>
      <div class="stat-glass-card ${isFilteredWorkingLeave ? 'active-filter' : ''}" id="stat-card-leave">
        <div class="stat-glass-icon" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
        <div class="stat-glass-info">
          <div class="stat-glass-label">Nghỉ tạm thời</div>
          <div class="stat-glass-val">${offDuty}</div>
        </div>
      </div>
    </div>

    <div class="card patient-toolbar-card">
      <div class="filter-group">
        <select id="nurse-role-filter" aria-label="Lọc vai trò">
          <option value="all">Tất cả vai trò</option>
          <option value="head_nurse">Y tá trưởng</option>
          <option value="nurse">Y tá</option>
        </select>
        <select id="nurse-status-filter" aria-label="Lọc trạng thái">
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Ngưng hoạt động</option>
        </select>
        <input id="nurse-search-input" type="text" placeholder="Tìm kiếm y tá..." aria-label="Tìm kiếm y tá" />
        <button id="apply-nurse-filter" class="ghost-btn" type="button">
          <img src="image/filter.png" alt="Lọc" class="icon-img" /><span>Lọc</span>
        </button>
        <button id="reset-nurse-filter" class="ghost-btn" type="button">
          <img src="image/undo.png" alt="Đặt lại" class="icon-img" /><span>Đặt lại</span>
        </button>
      </div>
      <button id="open-nurse-modal" ${canCreateNurse ? "" : "disabled title='Không có quyền thêm y tá'"}>
        <img src="image/addnurse.png" alt="Thêm y tá" class="icon-img" /><span>Thêm y tá</span>
      </button>
    </div>
    <div class="nurse-card-grid">${cards || "<div style='padding:32px;text-align:center;color:#888;'>Không có dữ liệu.</div>"}</div>
    <div class="pagination" id="nurse-pagination">
      <button id="first-nurse-page" ${currentPage===1?'disabled':''} title="Trang đầu" aria-label="Trang đầu"><img src="image/arrow2.png" alt="first" style="width:22px;height:22px;transform:rotate(180deg);opacity:${currentPage===1?0.4:1};"/></button>
      <button id="prev-nurse-page" ${currentPage===1?'disabled':''} title="Trang trước" aria-label="Trang trước"><img src="image/arrow1.png" alt="prev" style="width:22px;height:22px;transform:rotate(180deg);opacity:${currentPage===1?0.4:1};"/></button>
      <span style="margin:0 8px;">Trang <b>${currentPage}</b> / ${totalPages}</span>
      <button id="next-nurse-page" ${currentPage===totalPages?'disabled':''} title="Trang sau" aria-label="Trang sau"><img src="image/arrow1.png" alt="next" style="width:22px;height:22px;opacity:${currentPage===totalPages?0.4:1};"/></button>
      <button id="last-nurse-page" ${currentPage===totalPages?'disabled':''} title="Trang cuối" aria-label="Trang cuối"><img src="image/arrow2.png" alt="last" style="width:22px;height:22px;opacity:${currentPage===totalPages?0.4:1};"/></button>
    </div>
    ${modalHtml}
    ${detailHtml}
  `;

  // Gắn sự kiện click cho nút xóa trong modal chi tiết nếu có
  setTimeout(() => {
    const detailModal = document.querySelector('.nurse-detail-modal');
    if (detailModal) {
      const deleteBtn = detailModal.querySelector('.delete-nurse-btn');
      if (deleteBtn) {
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          // Gọi đúng controller nếu có
          if (window.nurseController && typeof window.nurseController.handleDeleteNurse === 'function') {
            const id = deleteBtn.dataset.id;
            window.nurseController.handleDeleteNurse(id);
            setTimeout(() => {
              if (detailModal.parentNode) detailModal.parentNode.removeChild(detailModal);
            }, 300);
          }
        };
      }
      const resetPwdBtn = detailModal.querySelector('.reset-password-btn');
      if (resetPwdBtn) {
        resetPwdBtn.onclick = (e) => {
          e.stopPropagation();
          if (window.nurseController && typeof window.nurseController.handleResetPassword === 'function') {
            const id = resetPwdBtn.dataset.id;
            window.nurseController.handleResetPassword(id);
          }
        };
      }
    }
  }, 0);

  // Pagination event binding
  setTimeout(() => {
    const pag = document.getElementById('nurse-pagination');
    if (!pag) return;
    pag.querySelector('#first-nurse-page').onclick = () => { window.nursePage = 1; container.dispatchEvent(new CustomEvent('rerender')); };
    pag.querySelector('#prev-nurse-page').onclick = () => { window.nursePage = Math.max(1, window.nursePage-1); container.dispatchEvent(new CustomEvent('rerender')); };
    pag.querySelector('#next-nurse-page').onclick = () => { window.nursePage = Math.min(totalPages, window.nursePage+1); container.dispatchEvent(new CustomEvent('rerender')); };
    pag.querySelector('#last-nurse-page').onclick = () => { window.nursePage = totalPages; container.dispatchEvent(new CustomEvent('rerender')); };

    // Stats cards click bindings
    const cardTotal = document.getElementById('stat-card-total');
    const cardHead = document.getElementById('stat-card-head');
    const cardActive = document.getElementById('stat-card-active');
    const cardLeave = document.getElementById('stat-card-leave');

    if (cardTotal) {
      cardTotal.onclick = () => {
        if (window.nurseController) {
          window.nurseController.filters.role = 'all';
          window.nurseController.filters.workingStatus = 'all';
          window.nursePage = 1;
          window.nurseController.renderView(window.nurseController.filters.search || "").catch(e => console.error(e));
        }
      };
    }
    if (cardHead) {
      cardHead.onclick = () => {
        if (window.nurseController) {
          window.nurseController.filters.role = 'head_nurse';
          window.nurseController.filters.workingStatus = 'all';
          window.nursePage = 1;
          window.nurseController.renderView(window.nurseController.filters.search || "").catch(e => console.error(e));
        }
      };
    }
    if (cardActive) {
      cardActive.onclick = () => {
        if (window.nurseController) {
          window.nurseController.filters.role = 'all';
          window.nurseController.filters.workingStatus = 'active';
          window.nursePage = 1;
          window.nurseController.renderView(window.nurseController.filters.search || "").catch(e => console.error(e));
        }
      };
    }
    if (cardLeave) {
      cardLeave.onclick = () => {
        if (window.nurseController) {
          window.nurseController.filters.role = 'all';
          window.nurseController.filters.workingStatus = 'temporary_leave';
          window.nursePage = 1;
          window.nurseController.renderView(window.nurseController.filters.search || "").catch(e => console.error(e));
        }
      };
    }

    // Card click for detail
    document.querySelectorAll('.nurse-card').forEach(card => {
      card.onclick = (e) => {
        const idx = card.getAttribute('data-idx');
        nurseDetail = pagedNurses[idx];
        renderNurseView(container, nurses, false);
      };
    });
    // Close detail
    const closeBtn = document.getElementById('nurse-detail-close');
    if(closeBtn) closeBtn.onclick = ()=>{ nurseDetail=null; renderNurseView(container, nurses, false); };

    const avatarInput = document.getElementById('nurse-avatar');
    const avatarPreview = document.getElementById('nurse-avatar-preview');
    if (avatarInput) {
      avatarInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) {
          const nextData = { ...getNurseFormData(), avatar: "" };
          setNurseFormData(nextData);
          if (avatarPreview) {
            avatarPreview.innerHTML = `<div class="avatar" style="width:84px;height:84px;background:#eef4fb;color:#7c8ea6;">${(nextData.fullName || "?").trim().slice(0,2).toUpperCase()}</div>`;
          }
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const nextData = { ...getNurseFormData(), avatar: event.target.result };
          setNurseFormData(nextData);
          if (avatarPreview) {
            avatarPreview.innerHTML = `<img src="${nextData.avatar}" alt="avatar preview" style="width:84px;height:84px;border-radius:18px;object-fit:cover;border:1px solid #d9e7f4;" />`;
          }
        };
        reader.readAsDataURL(file);
      };
    }
  }, 0);
}
