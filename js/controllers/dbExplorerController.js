// ============================================
// DATABASE EXPLORER CONTROLLER - Quản lý nghiệp vụ dữ liệu
// ============================================

import { db } from "../db-config.js";
import { renderDbExplorerView } from "../views/dbExplorerView.js";
import { showToast } from "../utils/ui.js";
import logService from "../services/logService.js";

class DbExplorerController {
  constructor() {
    this.container = null;
    this.docs = [];
    this.filteredDocs = [];
    this.counts = {
      total: 0,
      patient: 0,
      deliveryCommand: 0,
      systemLog: 0,
      user: 0,
      robot: 0,
      room: 0
    };
    this.filters = {
      type: "all",
      search: "",
      startDate: "",
      endDate: ""
    };
    this.activeDoc = null; // Lưu trữ tài liệu đang mở xem chi tiết
  }

  init() {
    this.container = document.getElementById("view-dbexplorer");
    if (!this.container) return;

    // Lắng nghe các click/change thông qua event delegation trên container
    this.container.addEventListener("click", (e) => this.handleClicks(e));
    this.container.addEventListener("input", (e) => this.handleInputs(e));
    this.container.addEventListener("change", (e) => this.handleChanges(e));
  }

  async fetchAllData() {
    try {
      const result = await db.allDocs({ include_docs: true });
      // Lọc các design document để tránh hiển thị nhầm cho người dùng
      this.docs = result.rows
        .map((row) => row.doc)
        .filter((doc) => {
          if (!doc || doc._id.startsWith("_design")) return false;
          // Bỏ qua lệnh mở nắp thủ công trực tiếp (kể cả khi trạng thái đã đổi thành "delivered")
          if (doc.type === "deliveryCommand") {
            const isManualOpen = doc.status === "open_lid" || (doc.bins && doc.bins.some(b => b.patientName === "OPEN"));
            if (isManualOpen) return false;
          }
          return true;
        });

      // Đếm số lượng theo loại
      this.calculateCounts();
      this.applyFilters();
    } catch (error) {
      console.error("[DbExplorerController] Lỗi tải dữ liệu:", error);
      showToast("Không thể tải cơ sở dữ liệu.");
    }
  }

  calculateCounts() {
    const freshCounts = {
      total: this.docs.length,
      patient: 0,
      deliveryCommand: 0,
      systemLog: 0,
      user: 0,
      robot: 0,
      room: 0
    };

    this.docs.forEach((doc) => {
      if (doc.type && freshCounts[doc.type] !== undefined) {
        freshCounts[doc.type]++;
      }
    });

    this.counts = freshCounts;
  }

  applyFilters() {
    let result = [...this.docs];

    // Lọc theo loại tài liệu
    if (this.filters.type !== "all") {
      result = result.filter((d) => d.type === this.filters.type);
    }

    // Lọc theo khoảng ngày tạo
    if (this.filters.startDate || this.filters.endDate) {
      result = result.filter((d) => {
        if (!d.createdAt) return false;
        const docDate = d.createdAt.split("T")[0];
        if (this.filters.startDate && docDate < this.filters.startDate) return false;
        if (this.filters.endDate && docDate > this.filters.endDate) return false;
        return true;
      });
    }

    // Lọc theo tìm kiếm từ khóa
    if (this.filters.search) {
      const query = this.filters.search.toLowerCase();
      result = result.filter((d) => {
        const idMatch = d._id.toLowerCase().includes(query);
        const typeMatch = (d.type || "").toLowerCase().includes(query);
        
        let contentMatch = false;
        if (d.name && String(d.name).toLowerCase().includes(query)) contentMatch = true;
        if (d.fullName && String(d.fullName).toLowerCase().includes(query)) contentMatch = true;
        if (d.username && String(d.username).toLowerCase().includes(query)) contentMatch = true;
        if (d.room && String(d.room).toLowerCase().includes(query)) contentMatch = true;
        if (d.robotId && String(d.robotId).toLowerCase().includes(query)) contentMatch = true;
        
        return idMatch || typeMatch || contentMatch;
      });
    }

    // Sắp xếp giảm dần theo thời gian tạo
    result.sort((a, b) => {
      const timeA = a.createdAt || "";
      const timeB = b.createdAt || "";
      return timeB.localeCompare(timeA);
    });

    this.filteredDocs = result;
  }

  async renderView() {
    await this.fetchAllData();
    const activeCouchDbUrl = localStorage.getItem("couchdb_server_url") || "http://localhost:5984/smarthospital";
    renderDbExplorerView(
      this.container,
      this.filteredDocs,
      this.counts,
      this.filters,
      activeCouchDbUrl
    );
  }

  // ============================================
  // XỬ LÝ SỰ KIỆN (EVENT HANDLERS)
  // ============================================

  handleInputs(e) {
    if (e.target.id === "db-search-input") {
      this.filters.search = e.target.value.trim();
      this.applyFilters();
      this.reRenderTableOnly();
    }
  }

  handleChanges(e) {
    if (e.target.id === "db-start-date") {
      this.filters.startDate = e.target.value;
      this.applyFilters();
      this.renderView();
    } else if (e.target.id === "db-end-date") {
      this.filters.endDate = e.target.value;
      this.applyFilters();
      this.renderView();
    }
  }

  handleClicks(e) {
    const target = e.target;

    // 1. Nhấp thẻ thống kê để lọc nhanh
    const metricCard = target.closest(".db-stat-card");
    if (metricCard) {
      const type = metricCard.dataset.filterType;
      this.filters.type = type;
      this.applyFilters();
      this.renderView();
      return;
    }

    // 2. Nút Làm mới
    if (target.closest("#db-btn-refresh")) {
      this.renderView();
      showToast("Đã cập nhật dữ liệu mới nhất.");
      return;
    }

    // 3. Nút Đặt lại bộ lọc
    if (target.closest("#db-btn-reset-filters")) {
      this.filters = { type: "all", search: "", startDate: "", endDate: "" };
      this.renderView();
      showToast("Đã đặt lại toàn bộ bộ lọc.");
      return;
    }

    // 4. Nút cập nhật IP Server CouchDB
    if (target.closest("#db-btn-update-ip")) {
      const ipInput = document.getElementById("db-server-ip-input");
      if (ipInput) {
        const newUrl = ipInput.value.trim();
        if (!newUrl) {
          showToast("Vui lòng nhập địa chỉ URL CouchDB.");
          return;
        }
        if (typeof window.updateCouchDbUrl === "function") {
          window.updateCouchDbUrl(newUrl);
          logService.addSystemLog("system", "Cấu hình IP CouchDB", "success", `Cập nhật IP CouchDB: ${newUrl}`);
          showToast("Đã cập nhật IP và khởi động lại tiến trình đồng bộ LAN.");
        } else {
          showToast("Hàm cấu hình hệ thống bị lỗi.");
        }
      }
      return;
    }

    // 5. Nút Tối ưu hóa CSDL (Compact)
    if (target.closest("#db-btn-compact")) {
      db.compact()
        .then((res) => {
          logService.addSystemLog("system", "Tối ưu hóa CSDL", "success", "Nén dữ liệu PouchDB local thành công");
          showToast("Tối ưu hóa dữ liệu (Compaction) thành công!");
        })
        .catch((err) => {
          console.error("Lỗi compact:", err);
          showToast("Tối ưu hóa thất bại.");
        });
      return;
    }

    // 6. Nút Tải bản sao lưu JSON (Backup)
    if (target.closest("#db-btn-backup")) {
      this.handleBackup();
      return;
    }

    // 6a. Nút mở modal xuất Excel
    if (target.closest("#db-btn-export-excel")) {
      const modal = document.getElementById("db-export-excel-modal");
      if (modal) {
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
        const startDateInput = document.getElementById("db-export-start-date");
        const endDateInput = document.getElementById("db-export-end-date");
        if (startDateInput) startDateInput.value = this.filters.startDate || "";
        if (endDateInput) endDateInput.value = this.filters.endDate || "";
      }
      return;
    }

    // 6b. Nút đóng modal xuất Excel
    if (target.closest("#db-export-cancel-btn") || target.id === "db-export-excel-modal") {
      const modal = document.getElementById("db-export-excel-modal");
      if (modal) {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
      }
      return;
    }

    // 6c. Nút xác nhận xuất Excel
    if (target.closest("#db-export-confirm-btn")) {
      const modal = document.getElementById("db-export-excel-modal");
      const fromDate = document.getElementById("db-export-start-date")?.value || "";
      const toDate = document.getElementById("db-export-end-date")?.value || "";
      
      const selectedTypes = [];
      const types = ["patient", "deliveryCommand", "systemLog", "user", "robot", "room"];
      types.forEach(type => {
        const checkbox = document.getElementById(`db-export-type-${type}`);
        if (checkbox && checkbox.checked) {
          selectedTypes.push(type);
        }
      });

      if (selectedTypes.length === 0) {
        showToast("Vui lòng chọn ít nhất một loại dữ liệu muốn xuất.");
        return;
      }

      showToast("Đang tạo file Excel...");
      import("../utils/excelUtils.js")
        .then(({ exportDbToExcel }) => {
          return exportDbToExcel(this.docs, selectedTypes, fromDate, toDate);
        })
        .then(() => {
          showToast("Xuất file Excel thành công!");
          if (modal) {
            modal.classList.remove("show");
            modal.setAttribute("aria-hidden", "true");
          }
        })
        .catch(err => {
          console.error("Lỗi xuất Excel:", err);
          showToast("Có lỗi xảy ra khi xuất file Excel.");
        });
      return;
    }

    // 7. Nút xem JSON chi tiết tài liệu
    const jsonBtn = target.closest(".db-btn-json");
    if (jsonBtn) {
      const docId = jsonBtn.dataset.id;
      this.showJsonModal(docId);
      return;
    }

    // 8. Nút sao chép JSON
    if (target.closest("#db-btn-copy-json")) {
      const jsonBlock = document.getElementById("db-modal-json-block");
      if (jsonBlock) {
        navigator.clipboard.writeText(jsonBlock.textContent)
          .then(() => showToast("Đã sao chép mã JSON vào Clipboard!"))
          .catch(() => showToast("Không thể sao chép."));
      }
      return;
    }

    // 9. Nút đóng modal JSON
    if (target.closest("#db-btn-close-json") || target.id === "db-json-modal") {
      this.closeJsonModal();
      return;
    }

    // 10. Nút xóa tài liệu
    const deleteBtn = target.closest(".db-btn-delete");
    if (deleteBtn) {
      const docId = deleteBtn.dataset.id;
      this.handleDeleteDoc(docId);
      return;
    }

    // 11. Các tab trong Modal xem chi tiết
    const tabVisual = target.closest("#db-modal-tab-visual");
    if (tabVisual) {
      this.switchModalTab("visual");
      return;
    }

    const tabJson = target.closest("#db-modal-tab-json");
    if (tabJson) {
      this.switchModalTab("json");
      return;
    }
  }

  // ============================================
  // CÁC HÀM XỬ LÝ NGHIỆP VỤ PHỤ (HELPER METHODS)
  // ============================================

  reRenderTableOnly() {
    const tbody = this.container.querySelector("tbody");
    if (!tbody) return;

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

    import("../views/dbExplorerView.js").then(({ getDocPreview, formatDocId, formatDateTime }) => {
      tbody.innerHTML = this.filteredDocs
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
        .join("") || "<tr><td colspan='5' style='text-align:center;'>Không tìm thấy tài liệu phù hợp.</td></tr>";
    });
  }

  handleBackup() {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.docs, null, 2));
      const downloadAnchor = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `smarthospital_backup_${timestamp}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      logService.addSystemLog("system", "Sao lưu CSDL", "success", `Xuất file backup smarthospital_backup_${timestamp}.json`);
      showToast("Đã tải về file sao lưu CSDL thành công!");
    } catch (err) {
      console.error("Backup error:", err);
      showToast("Sao lưu thất bại.");
    }
  }

  showJsonModal(docId) {
    const doc = this.docs.find((d) => d._id === docId);
    if (!doc) return;

    this.activeDoc = doc;

    const modal = document.getElementById("db-json-modal");
    const jsonBlock = document.getElementById("db-modal-json-block");
    const titleBadge = document.getElementById("db-modal-title-id");
    const visualContentEl = document.getElementById("db-modal-content-visual");

    if (modal && jsonBlock && titleBadge && visualContentEl) {
      // 1. Mã JSON thô
      const cleanDoc = { ...doc };
      delete cleanDoc.id;
      jsonBlock.textContent = JSON.stringify(cleanDoc, null, 2);

      // 2. Định dạng ID
      titleBadge.textContent = doc._id;

      // 3. Render Card Trực quan
      visualContentEl.innerHTML = this.renderVisualCardContent(doc);

      // Mặc định hiển thị tab Trực quan trước
      this.switchModalTab("visual");

      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  closeJsonModal() {
    const modal = document.getElementById("db-json-modal");
    if (modal) {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
      this.activeDoc = null;
    }
  }

  switchModalTab(tabName) {
    const tabVisual = document.getElementById("db-modal-tab-visual");
    const tabJson = document.getElementById("db-modal-tab-json");
    const contentVisual = document.getElementById("db-modal-content-visual");
    const contentJson = document.getElementById("db-modal-content-json");

    if (!tabVisual || !tabJson || !contentVisual || !contentJson) return;

    if (tabName === "visual") {
      tabVisual.classList.add("active");
      tabJson.classList.remove("active");
      contentVisual.classList.remove("hidden");
      contentJson.classList.add("hidden");
    } else {
      tabVisual.classList.remove("active");
      tabJson.classList.add("active");
      contentVisual.classList.add("hidden");
      contentJson.classList.remove("hidden");
    }
  }

  renderVisualCardContent(doc) {
    if (!doc) return "<p class='db-no-data'>Không tìm thấy tài liệu.</p>";
    
    const statusLabel = (status) => {
      const texts = {
        active: "Đang hoạt động",
        inactive: "Vô hiệu hóa",
        delivered: "Đã giao thuốc",
        delivering: "Đang đi giao",
        open_lid: "Mở nắp ngăn"
      };
      return texts[status] || status;
    };

    switch (doc.type) {
      case "patient":
        return `
          <div class="db-visual-card patient">
            <div class="db-card-profile-header">
              <div class="card-avatar patient-avatar"><i class="fa-solid fa-hospital-user"></i></div>
              <div class="card-main-title">
                <h4>${doc.name || "Chưa rõ"}</h4>
                <p>Mã BHYT: ${doc.bhyt || "Không rõ BHYT"}</p>
              </div>
            </div>
            <div class="card-details-grid">
              <div class="detail-item"><strong>Phòng / Giường:</strong> <span>Phòng ${doc.room || "-"} / Giường ${(doc.bed || "-").replace(/^giường\s+/i, "")}</span></div>
              <div class="detail-item"><strong>Bác sĩ phụ trách:</strong> <span>${doc.doctor || "Chưa phân công"}</span></div>
              <div class="detail-item"><strong>Tuổi / Giới tính:</strong> <span>${doc.age || "-"} tuổi (${doc.gender === "male" ? "Nam" : "Nữ"})</span></div>
              <div class="detail-item"><strong>Bệnh án / Chẩn đoán:</strong> <span>${doc.disease || "-"}</span></div>
            </div>
            <div class="card-medicines-section">
              <h4><i class="fa-solid fa-pills"></i> Đơn thuốc điều trị:</h4>
              <ul>
                ${doc.medicines && doc.medicines.length ? doc.medicines.map(m => `<li><strong>${m.name}</strong> (${m.dosage}) - ${m.quantity || '14'} Viên · <em>${m.note || 'Uống theo chỉ dẫn'}</em></li>`).join("") : "<li>Chưa kê đơn thuốc.</li>"}
              </ul>
            </div>
          </div>
        `;
      case "robot":
        return `
          <div class="db-visual-card robot">
            <div class="db-card-profile-header">
              <div class="card-avatar robot-avatar"><i class="fa-solid fa-robot"></i></div>
              <div class="card-main-title">
                <h4>${doc.name || doc._id}</h4>
                <p>Trạng thái: ${doc.online ? '<span style="color:#10b981;font-weight:700;">Trực tuyến (Online)</span>' : '<span style="color:#64748b;font-weight:700;">Ngoại tuyến (Offline)</span>'}</p>
              </div>
            </div>
            <div class="card-details-grid">
              <div class="detail-item"><strong>Số lượng ngăn chứa:</strong> <span>${doc.ngan || doc.compartmentCount || 4} ngăn</span></div>
              <div class="detail-item"><strong>Mức năng lượng Pin:</strong> <span style="font-weight:700; color:${doc.battery < 25 ? '#ef4444' : '#10b981'};"><i class="fa-solid fa-battery-${doc.battery < 20 ? 'empty' : doc.battery < 50 ? 'quarter' : doc.battery < 80 ? 'three-quarters' : 'full'}"></i> ${doc.battery ?? 0}%</span></div>
              <div class="detail-item"><strong>Vị trí hiện tại:</strong> <span>X: ${doc.location?.x?.toFixed(2) || 0}, Y: ${doc.location?.y?.toFixed(2) || 0}</span></div>
              <div class="detail-item"><strong>Nhiệm vụ đang chạy:</strong> <span>${doc.task || "Đang rảnh"}</span></div>
            </div>
          </div>
        `;
      case "room":
        return `
          <div class="db-visual-card room">
            <div class="db-card-profile-header">
              <div class="card-avatar room-avatar"><i class="fa-solid fa-bed"></i></div>
              <div class="card-main-title">
                <h4>Phòng bệnh: ${doc.name || "-"}</h4>
                <p>Số giường: ${doc.beds ? doc.beds.length : 0} giường</p>
              </div>
            </div>
            <div class="card-medicines-section">
              <h4><i class="fa-solid fa-circle-info"></i> Danh sách giường bệnh (Tọa độ ROS):</h4>
              <div class="beds-list-visual">
                ${doc.beds && doc.beds.length ? doc.beds.map(b => `<div class="bed-item-visual"><i class="fa-solid fa-person-bed"></i> <strong>Giường ${b.name}</strong> (Tọa độ: ${b.position?.x?.toFixed(2) || 0}, ${b.position?.y?.toFixed(2) || 0})</div>`).join("") : "Chưa cấu hình giường bệnh."}
              </div>
            </div>
          </div>
        `;
      case "deliveryCommand": {
        const isManualOpen = doc.status === "open_lid" && doc.bins && doc.bins.every(b => b.patientName === "OPEN");
        let binsContent = "";
        
        if (isManualOpen) {
          const slots = doc.bins ? doc.bins.map(b => b.slot).join(", ") : "-";
          binsContent = `<p style="grid-column: 1 / -1; margin: 0; padding: 12px; color: #475569; background: #f1f5f9; border-radius: 8px; font-weight: 500; font-size: 0.9rem;"><i class="fa-solid fa-circle-info"></i> Lệnh điều khiển mở nắp thủ công trực tiếp cho ngăn số: <strong>${slots}</strong></p>`;
        } else {
          binsContent = doc.bins && doc.bins.length ? doc.bins.map(b => `
            <div class="bin-card-visual">
              <div class="bin-header">Ngăn số ${b.slot} · ${b.status === 'delivered' ? '<span style="color:#10b981;font-weight:700;">Đã giao</span>' : '<span style="color:#0284c7;font-weight:700;">Đang đi</span>'}</div>
              <div class="bin-body">
                <strong>Bệnh nhân:</strong> ${b.patientName || "Trống"}<br/>
                <strong>Phòng / Giường:</strong> Phòng ${b.room || "-"} / Giường ${(b.bed || "-").replace(/^giường\s+/i, "")}<br/>
                <strong>Đơn thuốc:</strong> ${b.medicines && b.medicines.length ? b.medicines.map(m => m.name).join(", ") : "Không có"}
              </div>
            </div>
          `).join("") : "<p>Không có thông tin ngăn chứa.</p>";
        }

        return `
          <div class="db-visual-card delivery">
            <div class="db-card-profile-header">
              <div class="card-avatar delivery-avatar"><i class="fa-solid fa-truck-ramp-box"></i></div>
              <div class="card-main-title">
                <h4>Nhiệm vụ giao thuốc #${doc._id.slice(-6)}</h4>
                <p>Robot phụ trách: Robot ${doc.robotId || "-"}</p>
              </div>
            </div>
            <div class="card-details-grid">
              <div class="detail-item"><strong>Lệnh giao ID:</strong> <span>${doc._id}</span></div>
              <div class="detail-item"><strong>Trạng thái:</strong> <span class="db-status-badge ${doc.status}">${statusLabel(doc.status)}</span></div>
              <div class="detail-item"><strong>Người ra lệnh:</strong> <span>${doc.nurseName || "Quản trị viên"}</span></div>
              <div class="detail-item"><strong>Thời gian tạo:</strong> <span>${doc.createdAt || "-"}</span></div>
            </div>
            <div class="card-medicines-section">
              <h4><i class="fa-solid fa-boxes-stacked"></i> Chi tiết các ngăn chứa:</h4>
              <div class="bins-layout-grid">
                ${binsContent}
              </div>
            </div>
          </div>
        `;
      }
      case "user": {
        const roleText = doc.role === "head_nurse" ? "Y tá trưởng" : doc.role === "admin" ? "Quản trị viên" : "Y tá";
        return `
          <div class="db-visual-card user">
            <div class="db-card-profile-header">
              <div class="card-avatar user-avatar"><i class="fa-solid fa-user-tie"></i></div>
              <div class="card-main-title">
                <h4>${doc.fullName || doc.username}</h4>
                <p>Username: @${doc.username || "-"}</p>
              </div>
            </div>
            <div class="card-details-grid">
              <div class="detail-item"><strong>Email đăng ký:</strong> <span>${doc.email || "-"}</span></div>
              <div class="detail-item"><strong>Quyền quản trị:</strong> <span class="db-role-tag ${doc.role}">${roleText}</span></div>
              <div class="detail-item"><strong>Trạng thái:</strong> <span>${statusLabel(doc.status)}</span></div>
              <div class="detail-item"><strong>Ngày tạo tài khoản:</strong> <span>${doc.createdAt || "-"}</span></div>
            </div>
          </div>
        `;
      }
      case "systemLog": {
        const resultText = doc.result === "success" ? "Thành công" : doc.result === "failed" ? "Thất bại" : doc.result === "denied" ? "Từ chối" : doc.result;
        return `
          <div class="db-visual-card log">
            <div class="db-card-profile-header">
              <div class="card-avatar log-avatar"><i class="fa-solid fa-file-invoice"></i></div>
              <div class="card-main-title">
                <h4>Thao tác: ${doc.action || "-"}</h4>
                <p>Thực hiện bởi: ${doc.actor || "-"}</p>
              </div>
            </div>
            <div class="card-details-grid">
              <div class="detail-item"><strong>Module:</strong> <span class="db-module-tag">${doc.module || "-"}</span></div>
              <div class="detail-item"><strong>Kết quả:</strong> <span class="db-result-badge ${doc.result}">${resultText}</span></div>
              <div class="detail-item"><strong>Thời gian xảy ra:</strong> <span>${doc.createdAt || "-"}</span></div>
            </div>
            <div class="card-medicines-section">
              <h4><i class="fa-solid fa-magnifying-glass"></i> Nhật ký chi tiết:</h4>
              <p style="background: #f8fafc; padding: 12px; border-radius:6px; border:1px solid #e2e8f0; margin:0; font-size: 0.88rem; color: #475569; line-height: 1.5;">${doc.description || doc.detail || "Không có chi tiết mô tả."}</p>
            </div>
          </div>
        `;
      }
      default:
        return `<p>Không hỗ trợ kết xuất trực quan cho loại tài liệu "${doc.type}". Vui lòng chọn tab "Mã JSON" để xem dữ liệu thô.</p>`;
    }
  }

  async handleDeleteDoc(docId) {
    const doc = this.docs.find((d) => d._id === docId);
    if (!doc) return;

    const confirmed = confirm(
      `CẢNH BÁO NGUY HIỂM:\nBạn có chắc chắn muốn XÓA VĨNH VIỄN tài liệu này không?\n\n- ID: ${doc._id}\n- Loại: ${doc.type}\n\nThao tác này sẽ xóa sạch dữ liệu khỏi cả PouchDB và CouchDB Server và không thể hoàn tác!`
    );

    if (!confirmed) return;

    try {
      await db.remove(doc._id, doc._rev);
      logService.addSystemLog("system", "Xóa tài liệu CSDL", "success", `Xóa tài liệu: ID=${doc._id}, Loại=${doc.type}`);
      showToast("Đã xóa tài liệu thành công.");
      this.renderView();
    } catch (err) {
      console.error("Xóa tài liệu thất bại:", err);
      showToast(`Không thể xóa tài liệu: ${err.message}`);
    }
  }
}

export default new DbExplorerController();
