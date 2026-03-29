// ============================================
// NURSE VIEW - Render UI y tá
// ============================================

import { formatUserRole, formatUserStatus } from "../utils/formatter.js";
import authService from "../services/authService.js";

export function renderNurseView(container, nurses, isModalVisible = false) {
  const canCreateNurse = authService.can("nurses.create");

  // Pagination logic
  const pageSize = 10;
  let currentPage = window.nursePage || 1;
  const totalPages = Math.ceil(nurses.length / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  window.nursePage = currentPage;
  const pagedNurses = nurses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const rows = pagedNurses
    .map((u) => {
      const roleClass = u.role === "head_nurse" ? "head" : "nurse";
      const actions = authService.can("nurses.delete")
        ? `
          <div class="action-row">
            <button class="danger delete-nurse-btn" data-id="${u.id}" ${authService.can("nurses.delete") ? "" : "disabled title='Không có quyền xóa'"}><i class="fa-regular fa-trash-can" aria-hidden="true"></i><span>Xóa</span></button>
          </div>
        `
        : `<span style=\"color:#7a8fa6;font-size:0.88rem;\">Không có quyền</span>`;

      return `
        <tr>
          <td>${u.fullName}</td>
          <td>${u.username}</td>
          <td><span class="badge ${roleClass}">${formatUserRole(u.role)}</span></td>
          <td><span class="badge ${u.status}">${formatUserStatus(u.status)}</span></td>
          <td>${actions}</td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Quản lý y tá</h2>
        <p>Y tá trưởng có quyền thêm, sửa, xóa, đổi mật khẩu tài khoản y tá</p>
      </div>
    </div>

    <div class="card patient-toolbar-card" style="position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div class="filter-group">
        <select id="nurse-role-filter">
          <option value="all">Tất cả vai trò</option>
          <option value="head_nurse">Y tá trưởng</option>
          <option value="nurse">Y tá</option>
        </select>
        <select id="nurse-status-filter">
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Ngưng hoạt động</option>
        </select>
        <button id="apply-nurse-filter" class="ghost-btn" type="button"><i class="fa-solid fa-filter" aria-hidden="true"></i><span>Lọc</span></button>
        <button id="reset-nurse-filter" class="ghost-btn" type="button"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>Đặt lại</span></button>
      </div>
      <button id="open-nurse-modal" ${canCreateNurse ? "" : "disabled title='Không có quyền thêm y tá'"} style="margin-left:auto;"><i class="fa-solid fa-user-plus" aria-hidden="true"></i><span>Thêm y tá</span></button>
    </div>



    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tên y tá</th>
            <th>Tài khoản</th>
            <th>Vai trò</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>${rows || "<tr><td colspan='5'>Không có dữ liệu.</td></tr>"}</tbody>
      </table>
      <div class="pagination" id="nurse-pagination" style="margin:12px 0;text-align:center;display:flex;align-items:center;justify-content:center;gap:4px;">
        <button id="first-nurse-page" ${currentPage===1?'disabled':''} title="Trang đầu"><img src="image/arrow2.png" alt="first" style="width:22px;height:22px;transform:rotate(180deg);opacity:${currentPage===1?0.4:1};"/></button>
        <button id="prev-nurse-page" ${currentPage===1?'disabled':''} title="Trang trước"><img src="image/arrow1.png" alt="prev" style="width:22px;height:22px;transform:rotate(180deg);opacity:${currentPage===1?0.4:1};"/></button>
        <span style="margin:0 8px;">Trang <b>${currentPage}</b> / ${totalPages}</span>
        <button id="next-nurse-page" ${currentPage===totalPages?'disabled':''} title="Trang sau"><img src="image/arrow1.png" alt="next" style="width:22px;height:22px;opacity:${currentPage===totalPages?0.4:1};"/></button>
        <button id="last-nurse-page" ${currentPage===totalPages?'disabled':''} title="Trang cuối"><img src="image/arrow2.png" alt="last" style="width:22px;height:22px;opacity:${currentPage===totalPages?0.4:1};"/></button>
      </div>
    </div>

    <div id="nurse-modal" class="modal-overlay ${isModalVisible ? "show" : ""}">
      <div class="modal-card nurse-modal-card">
        <h3>Thêm tài khoản y tá</h3>
        <form id="nurse-modal-form" class="patient-modal-form">
          <div class="field-wrap">
            <label for="nurse-fullname">Tên y tá</label>
            <input id="nurse-fullname" name="fullName" type="text" placeholder="Nhập tên y tá" required />
          </div>

          <div class="field-wrap">
            <label for="nurse-username">Tài khoản đăng nhập</label>
            <input id="nurse-username" name="username" type="text" placeholder="Nhập username" required />
          </div>

          <div class="field-wrap">
            <label for="nurse-password">Mật khẩu đăng nhập</label>
            <input id="nurse-password" name="password" type="password" placeholder="Nhập mật khẩu" required />
          </div>

          <div class="field-wrap">
            <label for="nurse-role">Vai trò</label>
            <select id="nurse-role" name="role" required>
              <option value="nurse">Y tá</option>
              <option value="head_nurse">Y tá trưởng</option>
            </select>
          </div>
    <style>
      .pagination button { margin: 0 2px; padding: 2px 10px; border-radius: 4px; border: 1px solid #ddd; background: #fff; cursor: pointer; font-size: 18px; }
      .pagination button[disabled] { opacity: 0.5; cursor: not-allowed; }
    </style>

    <script>
      setTimeout(() => {
        const pag = document.getElementById('nurse-pagination');
        if (!pag) return;
        pag.querySelector('#first-nurse-page').onclick = () => { window.nursePage = 1; container.dispatchEvent(new CustomEvent('rerender')); };
        pag.querySelector('#prev-nurse-page').onclick = () => { window.nursePage = Math.max(1, window.nursePage-1); container.dispatchEvent(new CustomEvent('rerender')); };
        pag.querySelector('#next-nurse-page').onclick = () => { window.nursePage = Math.min(${totalPages}, window.nursePage+1); container.dispatchEvent(new CustomEvent('rerender')); };
        pag.querySelector('#last-nurse-page').onclick = () => { window.nursePage = ${totalPages}; container.dispatchEvent(new CustomEvent('rerender')); };
      }, 0);
    </script>

          <div class="modal-actions">
            <button type="button" class="ghost-btn modal-cancel" id="nurse-modal-cancel"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Hủy</span></button>
            <button type="submit"><i class="fa-solid fa-user-check" aria-hidden="true"></i><span>Lưu tài khoản</span></button>
          </div>
        </form>
      </div>
    </div>
  `;
}
