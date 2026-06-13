// ============================================
// PROFILE VIEW - Hồ sơ cá nhân
// ============================================

import authService from "../services/authService.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAvatar(user) {
  const avatar = user?.avatar || "";
  if (avatar) {
    return `<div class="profile-avatar profile-avatar-large"><img src="${avatar}" alt="Avatar ${escapeHtml(user?.fullName || "")}" /></div>`;
  }

  const initials = (user?.fullName || "?")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return `<div class="profile-avatar profile-avatar-large">${initials}</div>`;
}

function renderBadge(label, tone = "blue") {
  return `<span class="profile-badge profile-badge-${tone}">${escapeHtml(label)}</span>`;
}

export function renderProfileView(container, user) {
  const currentUser = user || authService.getCurrentUser();
  const isNurse = currentUser && ["nurse", "head_nurse"].includes(String(currentUser.role || "").toLowerCase());

  container.innerHTML = `
    <section class="profile-page card">
      <div class="section-head profile-section-head">
        <div>
          <h2>Hồ sơ cá nhân</h2>
          <p>Quản lý ảnh đại diện, thông tin cơ bản và đổi mật khẩu của tài khoản hiện tại</p>
        </div>
        <div class="profile-actions-inline">
          <button type="button" class="ghost-btn" id="profile-open-password-btn">Đổi mật khẩu</button>
        </div>
      </div>

      <div class="profile-layout">
        <div class="profile-hero card">
          ${renderAvatar(currentUser)}
          <div class="profile-hero-info">
            <h3>${escapeHtml(currentUser?.fullName || "Người dùng")}</h3>
            <div class="profile-badges-row">
              ${renderBadge(currentUser?.role === "head_nurse" ? "Y tá trưởng" : currentUser?.role === "nurse" ? "Y tá" : currentUser?.role === "admin" ? "Quản trị viên" : "Tài khoản", currentUser?.role === "head_nurse" ? "purple" : currentUser?.role === "nurse" ? "blue" : "gray")}
              ${renderBadge(currentUser?.status === "inactive" ? "Ngưng hoạt động" : "Đang hoạt động", currentUser?.status === "inactive" ? "red" : "green")}
            </div>
            <p>${isNurse ? "Trang này dành cho hồ sơ cá nhân của y tá: ảnh đại diện, thông tin liên hệ, và đổi mật khẩu." : "Trang hồ sơ cá nhân của bạn."}</p>
            <div class="profile-meta-grid">
              <div><span>Mã nhân viên</span><b>${escapeHtml(currentUser?.employeeId || "-")}</b></div>
              <div><span>Tài khoản</span><b>${escapeHtml(currentUser?.email || currentUser?.username || "-")}</b></div>
              <div><span>Khoa/phòng</span><b>${escapeHtml(currentUser?.department || "-")}</b></div>
              <div><span>Ca mặc định</span><b>${escapeHtml(currentUser?.shift || "-")}</b></div>
            </div>
          </div>
        </div>

        <div class="profile-form-card card">
          <form id="profile-form" class="profile-form">
            <div class="field-wrap">
              <label for="profile-fullname">Họ và tên</label>
              <input id="profile-fullname" name="fullName" type="text" value="${escapeHtml(currentUser?.fullName || "")}" placeholder="Nhập họ và tên" />
            </div>

            <div class="row-2">
              <div class="field-wrap">
                <label for="profile-phone">Số điện thoại</label>
                <input id="profile-phone" name="phone" type="text" value="${escapeHtml(currentUser?.phone || "")}" placeholder="Nhập số điện thoại" />
              </div>
              <div class="field-wrap">
                <label for="profile-avatar">Ảnh đại diện</label>
                <input id="profile-avatar" name="avatar" type="file" accept="image/*" />
              </div>
            </div>

            <div class="field-wrap">
              <label for="profile-email">Email / Tài khoản</label>
              <input id="profile-email" type="text" value="${escapeHtml(currentUser?.email || currentUser?.username || "")}" readonly />
            </div>

            <div class="row-2">
              <div class="field-wrap">
                <label for="profile-role">Vai trò</label>
                <input id="profile-role" type="text" value="${escapeHtml(currentUser?.role === "head_nurse" ? "Y tá trưởng" : currentUser?.role === "nurse" ? "Y tá" : currentUser?.role === "admin" ? "Quản trị viên" : "Tài khoản")}" readonly />
              </div>
              <div class="field-wrap">
                <label for="profile-employee-id">Mã nhân viên</label>
                <input id="profile-employee-id" type="text" value="${escapeHtml(currentUser?.employeeId || "")}" readonly />
              </div>
            </div>

            <div class="field-wrap">
              <label for="profile-notes">Ghi chú cá nhân</label>
              <textarea id="profile-notes" name="notes" rows="4" placeholder="Ghi chú nội bộ, sở trường, lưu ý...">${escapeHtml(currentUser?.notes || "")}</textarea>
            </div>

            <div class="profile-form-actions">
              <button type="submit">Lưu thay đổi</button>
              <button type="button" class="ghost-btn" id="profile-reset-btn">Khôi phục</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  `;
}
