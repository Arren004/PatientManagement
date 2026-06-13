// ============================================
// DATABASE EXPLORER VIEW - Giao diện quản trị CSDL thông minh
// ============================================

export function formatDocId(id, type) {
  if (!id) return "";
  const prefix = `${type}_`;
  if (id.startsWith(prefix)) {
    return id.replace(prefix, "");
  }
  return id;
}

export function formatDateTime(isoString) {
  if (!isoString) return "-";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    
    return `<div class="db-date-display"><strong>${hours}:${minutes}:${seconds}</strong><span class="db-date-sub">${day}/${month}/${year}</span></div>`;
  } catch (e) {
    return isoString;
  }
}

export function getDocPreview(doc) {
  if (!doc) return "-";
  switch (doc.type) {
    case "patient":
      return `Bệnh nhân: <strong>${doc.name || "Chưa rõ"}</strong> · Phòng: ${doc.room || "-"} / Giường: ${doc.bed || "-"} · Bác sĩ: ${doc.doctor || "Chưa phân công"}`;
    case "robot": {
      const batteryPercent = doc.battery ?? 0;
      let batteryIcon = "empty";
      let batteryColor = "#ef4444"; // Đỏ
      if (batteryPercent >= 80) {
        batteryIcon = "full";
        batteryColor = "#10b981"; // Xanh lá
      } else if (batteryPercent >= 50) {
        batteryIcon = "three-quarters";
        batteryColor = "#10b981";
      } else if (batteryPercent >= 20) {
        batteryIcon = "quarter";
        batteryColor = "#f97316"; // Cam
      }
      const onlineStatus = doc.online ? 
        `<span class="db-online-dot online" title="Trực tuyến"></span> <span style="color: #10b981; font-weight: 600;">Trực tuyến</span>` : 
        `<span class="db-online-dot offline" title="Ngoại tuyến"></span> <span style="color: #64748b; font-weight: 500;">Ngoại tuyến</span>`;
      
      return `Robot: <strong>${doc.name || doc._id}</strong> · Pin: <span style="color: ${batteryColor}; font-weight: 600;"><i class="fa-solid fa-battery-${batteryIcon}"></i> ${batteryPercent}%</span> · Trạng thái: ${onlineStatus}`;
    }
    case "room":
      return `Phòng bệnh: <strong>${doc.name || "-"}</strong> · Số giường cấu hình: <strong>${doc.beds ? doc.beds.length : 0} giường</strong>`;
    case "deliveryCommand": {
      const statusText = doc.status === "delivered" ? "Đã giao xong" : doc.status === "delivering" ? "Đang đi giao" : doc.status === "open_lid" ? "Mở nắp ngăn" : doc.status;
      const activeBins = doc.bins ? doc.bins.filter(b => b.patientName && b.patientName !== "OPEN" && b.patientName !== "Trống") : [];
      const patientsText = activeBins.map(b => `${b.patientName} (P.${b.room || "-"})`).join(", ");
      
      return `Robot ${doc.robotId || "-"}: Giao thuốc cho <strong>${patientsText || "không có"}</strong> · Người thực hiện: <strong>${doc.nurseName || "Quản trị viên"}</strong> · <span class="db-status-badge ${doc.status}">${statusText}</span>`;
    }
    case "user": {
      const roleText = doc.role === "head_nurse" ? "Y tá trưởng" : doc.role === "admin" ? "Quản trị viên" : "Y tá";
      const statusText = doc.status === "active" ? '<span style="color:#10b981; font-weight: 600;">Hoạt động</span>' : '<span style="color:#ef4444; font-weight: 600;">Vô hiệu hóa</span>';
      return `Tài khoản: <strong>${doc.fullName || doc.username}</strong> (@${doc.username}) · Vai trò: <span class="db-role-tag ${doc.role}">${roleText}</span> · Trạng thái: ${statusText}`;
    }
    case "systemLog": {
      const resultText = doc.result === "success" ? "Thành công" : doc.result === "failed" ? "Thất bại" : doc.result === "denied" ? "Từ chối" : doc.result;
      return `Thao tác: <strong>${doc.action || "-"}</strong> · Người thực hiện: ${doc.actor || "-"} · Module: <span class="db-module-tag">${doc.module || "-"}</span> · Kết quả: <span class="db-result-badge ${doc.result}">${resultText}</span>`;
    }
    default:
      return `Tài liệu dạng <strong>${doc.type || "Chưa phân loại"}</strong>`;
  }
}

export function renderDbExplorerView(
  container,
  docs,
  counts,
  filters,
  activeCouchDbUrl
) {


  // Định dạng các badge loại tài liệu
  const typeBadgeClass = (type) => {
    switch (type) {
      case "user": return "db-badge-user";
      case "patient": return "db-badge-patient";
      case "robot": return "db-badge-robot";
      case "room": return "db-badge-room";
      case "deliveryCommand": return "db-badge-delivery";
      case "systemLog": return "db-badge-log";
      default: return "db-badge-default";
    }
  };

  const typeNameText = (type) => {
    switch (type) {
      case "user": return "Tài khoản";
      case "patient": return "Bệnh nhân";
      case "robot": return "Robot";
      case "room": return "Phòng bệnh";
      case "deliveryCommand": return "Lệnh giao";
      case "systemLog": return "Nhật ký";
      default: return type || "Khác";
    }
  };

  const tableRows = docs
    .map(
      (doc) => `
      <tr data-id="${doc._id}">
        <td><code class="db-doc-id" title="${doc._id}">${formatDocId(doc._id, doc.type)}</code></td>
        <td><span class="db-type-badge ${typeBadgeClass(doc.type)}">${typeNameText(doc.type)}</span></td>
        <td class="db-preview-cell">${getDocPreview(doc)}</td>
        <td class="db-time-cell">${formatDateTime(doc.createdAt)}</td>
        <td>
          <div class="db-actions-row">
            <button class="ghost-btn db-btn-json" data-id="${doc._id}" type="button">
              <i class="fa-solid fa-code"></i><span>Kiểm tra</span>
            </button>
            <button class="ghost-btn db-btn-delete" data-id="${doc._id}" type="button" style="color: #ef4444;">
              <i class="fa-solid fa-trash"></i><span>Xóa</span>
            </button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");

  container.innerHTML = `
    <div class="section-head">
      <div class="head-title">
        <h1>Quản Trị Cơ Sở Dữ Liệu</h1>
      </div>
    </div>


    <!-- HỆ THỐNG KẾT NỐI & DỌN DẸP -->
    <div class="grid-2 db-admin-settings">
      <div class="card db-setting-card">
        <div class="db-card-header-flex">
          <h3><i class="fa-solid fa-circle-nodes"></i> Đồng bộ CouchDB LAN</h3>
          <span class="db-sync-pulse-badge"><span class="pulse-dot"></span> Live Syncing</span>
        </div>
        <div class="form-row-ip">
          <input type="text" id="db-server-ip-input" value="${activeCouchDbUrl}" placeholder="Ví dụ: http://192.168.1.100:5984/smarthospital" />
          <button id="db-btn-update-ip" class="primary-btn"><i class="fa-solid fa-link"></i><span>Cập nhật</span></button>
        </div>
        <p class="db-note-text">PouchDB tự động đồng bộ hóa thời gian thực (Live Sync) với CouchDB Server qua địa chỉ trên.</p>
      </div>

      <div class="card db-setting-card actions-flex">
        <h3><i class="fa-solid fa-toolbox"></i> Công cụ Hệ thống</h3>
        <div class="buttons-grid">
          <button id="db-btn-compact" class="ghost-btn"><i class="fa-solid fa-compress"></i><span>Tối ưu CSDL</span></button>
          <button id="db-btn-backup" class="ghost-btn"><i class="fa-solid fa-download"></i><span>Tải Backup JSON</span></button>
          <button id="db-btn-export-excel" class="ghost-btn" style="border-color: #16a34a; color: #16a34a;"><i class="fa-solid fa-file-excel" style="color: #16a34a;"></i><span>Xuất Excel</span></button>
        </div>
        <p class="db-note-text">Nén dữ liệu để giảm dung lượng file lưu trữ hoặc tải file sao lưu toàn bộ tài liệu hiện có.</p>
      </div>
    </div>

    <!-- THẺ SỐ LIỆU ĐỘNG -->
    <div class="grid-4 db-metrics-row">
      <div class="stat db-stat-card ${filters.type === "all" ? "active" : ""}" data-filter-type="all">
        <span>Tổng số tài liệu</span>
        <strong>${counts.total}</strong>
      </div>
      <div class="stat db-stat-card ${filters.type === "patient" ? "active" : ""}" data-filter-type="patient" style="border-left-color: #10b981;">
        <span>Bệnh nhân</span>
        <strong>${counts.patient}</strong>
      </div>
      <div class="stat db-stat-card ${filters.type === "deliveryCommand" ? "active" : ""}" data-filter-type="deliveryCommand" style="border-left-color: #f43f5e;">
        <span>Lệnh giao thuốc</span>
        <strong>${counts.deliveryCommand}</strong>
      </div>
      <div class="stat db-stat-card ${filters.type === "systemLog" ? "active" : ""}" data-filter-type="systemLog" style="border-left-color: #6b7280;">
        <span>Nhật ký & Hệ thống</span>
        <strong>${counts.systemLog}</strong>
      </div>
    </div>

    <!-- BỘ LỌC TÌM KIẾM -->
    <div class="card patient-toolbar-card">
      <div class="filter-group">
        <input id="db-search-input" type="text" placeholder="Tìm theo ID hoặc dữ liệu..." value="${filters.search}" style="min-width: 250px;" />
        
        <div class="db-date-range-group" style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 0.85rem; font-weight: 600; color: #475569;"><i class="fa-regular fa-calendar-days"></i> Từ:</span>
          <input id="db-start-date" type="date" value="${filters.startDate || ""}" style="max-width: 150px;" title="Từ ngày tạo" />
          <span style="font-size: 0.85rem; font-weight: 600; color: #475569;">Đến:</span>
          <input id="db-end-date" type="date" value="${filters.endDate || ""}" style="max-width: 150px;" title="Đến ngày tạo" />
        </div>

        <button id="db-btn-refresh" class="ghost-btn" type="button"><i class="fa-solid fa-rotate"></i><span>Làm mới</span></button>
        <button id="db-btn-reset-filters" class="ghost-btn" type="button"><i class="fa-solid fa-rotate-left"></i><span>Đặt lại bộ lọc</span></button>
      </div>
    </div>

    <!-- BẢNG TÀI LIỆU -->
    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Mã tài liệu (Document ID)</th>
            <th>Loại</th>
            <th>Xem trước thông tin (Preview)</th>
            <th>Thời gian tạo (createdAt)</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || "<tr><td colspan='5' style='text-align:center;'>Không tìm thấy tài liệu phù hợp.</td></tr>"}
        </tbody>
      </table>
    </div>

    <!-- MODAL XEM CHI TIẾT JSON + CARD ĐỒNG THỜI -->
    <div id="db-json-modal" class="modal-overlay" aria-hidden="true">
      <div class="modal-card db-modal-json-card">
        <div class="db-modal-header">
          <div class="db-modal-title-stack">
            <h3><i class="fa-solid fa-circle-info"></i> Chi tiết tài nguyên</h3>
            <span class="db-modal-id-badge" id="db-modal-title-id"></span>
          </div>
          <div class="db-modal-tabs">
            <button id="db-modal-tab-visual" class="db-tab-btn active"><i class="fa-solid fa-id-card"></i><span>Trực quan</span></button>
            <button id="db-modal-tab-json" class="db-tab-btn"><i class="fa-solid fa-code"></i><span>Mã JSON</span></button>
          </div>
        </div>
        
        <!-- Tab Trực quan (Sẽ render thẻ card lâm sàng) -->
        <div id="db-modal-content-visual" class="db-modal-tab-content">
          <!-- Render động bằng JS -->
        </div>
        
        <!-- Tab JSON -->
        <div id="db-modal-content-json" class="db-modal-tab-content hidden">
          <div class="db-modal-json-wrap">
            <pre><code id="db-modal-json-block" class="language-json"></code></pre>
          </div>
        </div>
        
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" class="ghost-btn" id="db-btn-copy-json"><i class="fa-solid fa-copy"></i><span>Sao chép JSON</span></button>
          <button type="button" class="ghost-btn modal-cancel" id="db-btn-close-json">Đóng</button>
        </div>
      </div>
    </div>

    <!-- MODAL XUẤT EXCEL CHỌN LỌC -->
    <div id="db-export-excel-modal" class="modal-overlay" aria-hidden="true">
      <div class="modal-card print-modal-card" style="max-width: 480px !important;">
        <div class="print-modal-header">
          <span class="print-modal-icon" style="color: #16a34a; background: #dcfce7;"><i class="fa-solid fa-file-excel"></i></span>
          <h3 style="color: #16a34a;">Xuất dữ liệu ra Excel</h3>
        </div>
        <div class="print-modal-body">
          <div class="form-stack">
            <!-- Chọn khoảng ngày -->
            <div style="display: flex; gap: 12px; margin-bottom: 16px;">
              <div style="flex: 1;">
                <label style="font-weight: 600; color: #475569; display: block; margin-bottom: 6px; font-size: 0.9rem;">Từ ngày</label>
                <input type="date" id="db-export-start-date" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.9rem;" />
              </div>
              <div style="flex: 1;">
                <label style="font-weight: 600; color: #475569; display: block; margin-bottom: 6px; font-size: 0.9rem;">Đến ngày</label>
                <input type="date" id="db-export-end-date" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.9rem;" />
              </div>
            </div>

            <!-- Chọn loại tài liệu -->
            <label style="font-weight: 600; color: #475569; display: block; margin-bottom: 8px; font-size: 0.9rem;">Chọn dữ liệu muốn xuất:</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: #334155; cursor: pointer;">
                <input type="checkbox" id="db-export-type-patient" checked style="width: 16px; height: 16px; accent-color: #16a34a;" /> Bệnh nhân
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: #334155; cursor: pointer;">
                <input type="checkbox" id="db-export-type-deliveryCommand" checked style="width: 16px; height: 16px; accent-color: #16a34a;" /> Lệnh giao thuốc
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: #334155; cursor: pointer;">
                <input type="checkbox" id="db-export-type-systemLog" checked style="width: 16px; height: 16px; accent-color: #16a34a;" /> Nhật ký & Hệ thống
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: #334155; cursor: pointer;">
                <input type="checkbox" id="db-export-type-user" checked style="width: 16px; height: 16px; accent-color: #16a34a;" /> Tài khoản y tá
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: #334155; cursor: pointer;">
                <input type="checkbox" id="db-export-type-robot" checked style="width: 16px; height: 16px; accent-color: #16a34a;" /> Thiết bị Robot
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: #334155; cursor: pointer;">
                <input type="checkbox" id="db-export-type-room" checked style="width: 16px; height: 16px; accent-color: #16a34a;" /> Danh mục Phòng bệnh
              </label>
            </div>

            <!-- Các nút bấm -->
            <div style="display: flex; gap: 12px; margin-top: 10px;">
              <button id="db-export-cancel-btn" type="button" class="ghost-btn" style="flex: 1; padding: 10px; border-radius: 8px; justify-content: center;">Hủy</button>
              <button id="db-export-confirm-btn" type="button" class="primary-btn" style="flex: 1; padding: 10px; border-radius: 8px; justify-content: center; background: #16a34a; border-color: #16a34a; color: white;">Xuất Excel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
