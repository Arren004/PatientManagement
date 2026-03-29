// ============================================
// PATIENT VIEW - Render UI bệnh nhân
// ============================================

import {
  formatPatientStatus,
} from "../utils/formatter.js";
import authService from "../services/authService.js";


export function renderPatientView(container, patients, isModalVisible = false, editingPatient = null) {
  console.log("Render patients:", patients); // DEBUG LOG
  const canCreatePatient = authService.can("patients.create");

  // Sắp xếp: nhập viện lên trên, xuất viện xuống dưới
  const sortedPatients = [...patients].sort((a, b) => {
    if (a.status === b.status) return 0;
    if (a.status === "admitted") return -1;
    if (b.status === "admitted") return 1;
    return 0;
  });

  // Pagination only
  const pageSize = 10;
  let currentPage = window.patientPage || 1;
  const totalPages = Math.ceil(sortedPatients.length / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  window.patientPage = currentPage;
  const pagedPatients = sortedPatients.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Badge color
  function statusBadge(status) {
    if (status === "admitted") return '<span class="badge badge-green">Nhập viện</span>';
    if (status === "discharged") return '<span class="badge badge-gray">Xuất viện</span>';
    return `<span class="badge">${formatPatientStatus(status)}</span>`;
  }

  // Table rows
  const rows = pagedPatients
    .map(
      (p) => `
      <tr>
        <td>${p.name}</td>
        <td>${p.room}</td>
        <td>${p.bed}</td>
        <td>${p.gender || ""}</td>
        <td>${p.dob || ""}</td>
        <td>${p.admissionDate || ""}</td>
        <td>${p.dischargeDate || ""}</td>
        <td>${statusBadge(p.status)}</td>
        <td>
          ${p.status !== "discharged" && canCreatePatient ? `<button class="discharge-patient-btn ghost-btn" data-id="${p.id}"><i class="fa-solid fa-person-walking-dashed-line-arrow-right" aria-hidden="true"></i><span>Xuất viện</span></button>` : ""}
        </td>
      </tr>
    `
    )
    .join("");

  // Tổng số bệnh nhân nhập viện/xuất viện
  const admittedCount = patients.filter(p => p.status === "admitted").length;
  const dischargedCount = patients.filter(p => p.status === "discharged").length;


  container.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Quản lý bệnh nhân</h2>
        <p>Quản lý bệnh nhân và phòng bệnh</p>
      </div>
      <div style="font-size:14px;color:#888;margin-top:4px;">
        Tổng số: <b>${patients.length}</b> bệnh nhân | Nhập viện: <b>${admittedCount}</b> | Xuất viện: <b>${dischargedCount}</b>
      </div>
    </div>

    <div class="card patient-toolbar-card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div class="filter-group">
        <select id="patient-status-filter">
          <option value="all">Tất cả trạng thái</option>
          <option value="admitted">Nhập viện</option>
          <option value="discharged">Xuất viện</option>
        </select>
        <input id="patient-room-filter" type="text" placeholder="Lọc theo phòng (vd: 101)" />
        <button id="apply-patient-filter" class="ghost-btn" type="button"><i class="fa-solid fa-filter" aria-hidden="true"></i><span>Lọc</span></button>
        <button id="reset-patient-filter" class="ghost-btn" type="button"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>Đặt lại</span></button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button id="print-patient-list-btn" class="ghost-btn" type="button"><i class="fa-solid fa-print" aria-hidden="true"></i><span>In danh sách</span></button>
        <button id="open-patient-modal" ${canCreatePatient ? "" : "disabled title='Bạn không có quyền thêm bệnh nhân'"}><i class="fa-solid fa-user-plus" aria-hidden="true"></i><span>Thêm bệnh nhân</span></button>
      </div>
    </div>

    <!-- Modal overlay chọn thời gian in danh sách bệnh nhân -->
    <div id="print-patient-modal" class="modal-overlay">
      <div class="modal-card" style="max-width:400px;">
        <h3>In danh sách bệnh nhân</h3>
        <div style="margin-bottom:12px;">
          <label>Từ ngày:</label>
          <input type="date" id="print-from-date" style="width:100%;margin-bottom:8px;" />
          <label>Đến ngày:</label>
          <input type="date" id="print-to-date" style="width:100%;" />
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button id="print-patient-cancel" class="ghost-btn" type="button">Huỷ</button>
          <button id="print-patient-confirm" class="main-btn" type="button">In</button>
        </div>
      </div>
    </div>

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tên bệnh nhân</th>
            <th>Số phòng</th>
            <th>Số giường</th>
            <th>Giới tính</th>
            <th>Ngày sinh</th>
            <th>Ngày nhập viện</th>
            <th>Ngày xuất viện</th>
            <th>Trạng thái</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          ${rows || "<tr><td colspan='9'>Không có dữ liệu.</td></tr>"}
        </tbody>
      </table>
      <div class="pagination" id="patient-pagination" style="margin:12px 0;text-align:center;display:flex;align-items:center;justify-content:center;gap:4px;">
        <button id="first-page" ${currentPage===1?'disabled':''} title="Trang đầu"><img src="image/arrow2.png" alt="first" style="width:22px;height:22px;transform:rotate(180deg);opacity:${currentPage===1?0.4:1};"/></button>
        <button id="prev-page" ${currentPage===1?'disabled':''} title="Trang trước"><img src="image/arrow1.png" alt="prev" style="width:22px;height:22px;transform:rotate(180deg);opacity:${currentPage===1?0.4:1};"/></button>
        <span style="margin:0 8px;">Trang <b>${currentPage}</b> / ${totalPages}</span>
        <button id="next-page" ${currentPage===totalPages?'disabled':''} title="Trang sau"><img src="image/arrow1.png" alt="next" style="width:22px;height:22px;opacity:${currentPage===totalPages?0.4:1};"/></button>
        <button id="last-page" ${currentPage===totalPages?'disabled':''} title="Trang cuối"><img src="image/arrow2.png" alt="last" style="width:22px;height:22px;opacity:${currentPage===totalPages?0.4:1};"/></button>
      </div>
    </div>

    <style>
      .badge-green { background: #d1fae5; color: #065f46; }
      .badge-gray { background: #e5e7eb; color: #374151; }
      .pagination button { margin: 0 2px; padding: 2px 10px; border-radius: 4px; border: 1px solid #ddd; background: #fff; cursor: pointer; font-size: 18px; }
      .pagination button[disabled] { opacity: 0.5; cursor: not-allowed; }
    </style>

    <script>
      setTimeout(() => {
        const pag = document.getElementById('patient-pagination');
        if (!pag) return;
        pag.querySelector('#first-page').onclick = () => { window.patientPage = 1; container.dispatchEvent(new CustomEvent('rerender')); };
        pag.querySelector('#prev-page').onclick = () => { window.patientPage = Math.max(1, window.patientPage-1); container.dispatchEvent(new CustomEvent('rerender')); };
        pag.querySelector('#next-page').onclick = () => { window.patientPage = Math.min(${totalPages}, window.patientPage+1); container.dispatchEvent(new CustomEvent('rerender')); };
        pag.querySelector('#last-page').onclick = () => { window.patientPage = ${totalPages}; container.dispatchEvent(new CustomEvent('rerender')); };
      }, 0);
    </script>

    <div id="patient-modal" class="modal-overlay ${isModalVisible && !editingPatient ? "show" : ""}">
      <div class="modal-card">
        <h3>Thêm bệnh nhân mới</h3>
        <form id="patient-modal-form" class="patient-modal-form">
          <div class="field-wrap">
            <label for="modal-patient-name">Tên bệnh nhân</label>
            <input id="modal-patient-name" name="name" type="text" placeholder="Nhập tên bệnh nhân" required />
          </div>

          <div class="row-2">
            <div class="field-wrap">
              <label for="modal-patient-room">Số phòng</label>
              <input id="modal-patient-room" name="room" type="text" placeholder="e.g., 101" required />
            </div>
            <div class="field-wrap">
              <label for="modal-patient-bed">Số giường</label>
              <input id="modal-patient-bed" name="bed" type="text" placeholder="e.g., A" required />
            </div>
          </div>

          <div class="row-2">
            <div class="field-wrap">
              <label for="modal-patient-gender">Giới tính</label>
              <select id="modal-patient-gender" name="gender" required>
                <option value="nam">Nam</option>
                <option value="nữ">Nữ</option>
              </select>
            </div>
            <div class="field-wrap">
              <label for="modal-patient-dob">Ngày sinh</label>
              <input id="modal-patient-dob" name="dob" type="date" required />
            </div>
          </div>

          <div class="row-2">
            <div class="field-wrap">
              <label for="modal-patient-admission">Ngày nhập viện</label>
              <input id="modal-patient-admission" name="admissionDate" type="date" required />
            </div>
          </div>

          <div class="field-wrap">
            <label for="modal-patient-status">Trạng thái</label>
            <select id="modal-patient-status" name="status" required>
              <option value="admitted">Nhập viện</option>
              <option value="discharged">Xuất viện</option>
            </select>
          </div>

          <div class="modal-actions">
            <button type="button" class="ghost-btn modal-cancel" id="patient-modal-cancel"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Hủy</span></button>
            <button type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i><span>Lưu</span></button>
          </div>
        </form>
      </div>
    </div>

    <div id="patient-edit-modal" class="modal-overlay ${editingPatient ? "show" : ""}">
      <div class="modal-card">
        <h3>Chỉnh sửa bệnh nhân</h3>
        <form id="patient-edit-modal-form" class="patient-modal-form">
          <input type="hidden" id="edit-patient-id" value="${editingPatient ? editingPatient.id : ""}" />
          ${editingPatient && editingPatient.status !== "discharged" ? `<button type="button" class="discharge-patient-btn ghost-btn" data-id="${editingPatient.id}"><i class="fa-solid fa-person-walking-dashed-line-arrow-right" aria-hidden="true"></i><span>Xuất viện</span></button>` : ""}
          
          <div class="field-wrap">
            <label for="edit-patient-name">Tên bệnh nhân</label>
            <input id="edit-patient-name" name="name" type="text" placeholder="Nhập tên bệnh nhân" value="${editingPatient ? editingPatient.name : ""}" required />
          </div>

          <div class="row-2">
            <div class="field-wrap">
              <label for="edit-patient-room">Số phòng</label>
              <input id="edit-patient-room" name="room" type="text" placeholder="e.g., 101" value="${editingPatient ? editingPatient.room : ""}" required />
            </div>
            <div class="field-wrap">
              <label for="edit-patient-bed">Số giường</label>
              <input id="edit-patient-bed" name="bed" type="text" placeholder="e.g., A" value="${editingPatient ? editingPatient.bed : ""}" required />
            </div>
          </div>

          <div class="row-2">
            <div class="field-wrap">
              <label for="edit-patient-gender">Giới tính</label>
              <select id="edit-patient-gender" name="gender" required>
                <option value="nam" ${editingPatient && editingPatient.gender === "nam" ? "selected" : ""}>Nam</option>
                <option value="nữ" ${editingPatient && editingPatient.gender === "nữ" ? "selected" : ""}>Nữ</option>
              </select>
            </div>
            <div class="field-wrap">
              <label for="edit-patient-dob">Ngày sinh</label>
              <input id="edit-patient-dob" name="dob" type="date" value="${editingPatient ? editingPatient.dob : ""}" required />
            </div>
          </div>

          <div class="row-2">
            <div class="field-wrap">
              <label for="edit-patient-admission">Ngày nhập viện</label>
              <input id="edit-patient-admission" name="admissionDate" type="date" value="${editingPatient ? editingPatient.admissionDate : ""}" required />
            </div>
            <div class="field-wrap">
              <label for="edit-patient-discharge">Ngày xuất viện</label>
              <input id="edit-patient-discharge" name="dischargeDate" type="date" value="${editingPatient ? editingPatient.dischargeDate : ""}" />
            </div>
          </div>

          <div class="field-wrap">
            <label for="edit-patient-status">Trạng thái</label>
            <select id="edit-patient-status" name="status" required>
              <option value="admitted" ${editingPatient && editingPatient.status === "admitted" ? "selected" : ""}>Nhập viện</option>
              <option value="discharged" ${editingPatient && editingPatient.status === "discharged" ? "selected" : ""}>Xuất viện</option>
            </select>
          </div>

          <div class="modal-actions">
            <button type="button" class="ghost-btn modal-cancel" id="patient-edit-modal-cancel"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Hủy</span></button>
            <button type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i><span>Lưu</span></button>
          </div>
        </form>
      </div>
    </div>
  `;
}
