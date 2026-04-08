// ============================================
// DELIVERY VIEW - Render UI giao thuốc
// ============================================

import authService from "../services/authService.js";

export function renderDeliveryView(container, deliveryBins, patients, readyBinsCount, isDelivering) {
  const canEditDelivery = authService.can("delivery.edit");
  const canStartDelivery = authService.can("delivery.start");

  // Modal chọn bệnh nhân (ẩn mặc định)
  const admittedPatients = patients.filter(p => p.status === "admitted");
  const patientModal = `
    <div id="patient-select-modal" class="modal-overlay" style="display:none;z-index:1000;">
      <div class="modal-card" style="max-width:520px;min-width:340px;">
        <h3>Chọn bệnh nhân</h3>
        <input id="patient-modal-search" type="text" placeholder="Tìm tên bệnh nhân..." style="width:100%;margin-bottom:10px;padding:8px 12px;font-size:1rem;" />
        <div id="patient-modal-list" style="max-height:320px;overflow-y:auto;"></div>
        <div style="text-align:right;margin-top:10px;">
          <button id="patient-modal-cancel" class="ghost-btn" type="button">Đóng</button>
        </div>
      </div>
    </div>
  `;

  const compartments = deliveryBins
    .map((bin, index) => {
      const patient = patients.find((p) => String(p.id) === String(bin.patientId));
      const hasAssigned = Boolean(bin.patientId && bin.note.trim());
      // Nếu đang có đơn hàng delivering thì tất cả ngăn đều bị khóa
      const isBusy = isDelivering || bin.status === "delivering";
      const statusLabel = isBusy ? "Đang giao hàng..." : (hasAssigned ? "Đã gán" : "Trống");

      return `
      <div class="card delivery-compartment${hasAssigned ? " assigned" : ""}${isBusy ? " slot-busy" : ""}">
        <div class="delivery-head">
          <div>
            <h3>Ngăn ${index + 1}</h3>
            <p>${statusLabel}</p>
          </div>
          ${hasAssigned || bin.note ? `<button class="link-clear clear-bin-btn" data-index="${index}" ${(canEditDelivery && !isBusy) ? "" : "disabled title='Không thể xóa khi đang giao'"}>Xóa</button>` : ""}
        </div>

        <div class="field-wrap">
          <label>Chọn bệnh nhân</label>
          <div class="patient-search-wrapper">
            <input 
              type="text" 
              class="delivery-control-patient-search" 
              data-index="${index}" 
              placeholder="Nhấn để chọn bệnh nhân..." 
              readonly
              style="cursor:pointer;background:#f3f4f6;"
              ${(canEditDelivery && !isBusy) ? "" : "disabled"} />
            <input type="hidden" class="delivery-control-patient-id" data-index="${index}" value="${bin.patientId}">
          </div>
        </div>

        <div class="field-wrap">
          <label>Hướng dẫn giao thuốc</label>
          <textarea class="delivery-control-note" data-index="${index}" rows="3" placeholder="Ví dụ: Sau ăn, cần hỗ trợ, uống kèm nước..." ${(canEditDelivery && !isBusy) ? "" : "disabled"}></textarea>
        </div>
        ${isBusy ? `<div class='delivery-busy-label'><span class="spinner"></span>Đang giao hàng...</div>` : ""}
        ${patient ? `<div class="delivery-preview"><strong>${patient.name}</strong><span>Phòng ${patient.room}, Giường ${patient.bed}</span></div>` : ""}
      </div>
    `;
    })
    .join("");

  container.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Ngăn thuốc robot</h2>
        <p>Chỉ gửi lệnh khi đã chọn bệnh nhân và nhập ghi chú cho ngăn thuốc</p>
      </div>
    </div>

    <div class="delivery-grid">${compartments}</div>

    <div class="card delivery-footer">
      <div>
        <h3>Sẵn sàng giao thuốc?</h3>
        <p id="ready-bins-text">${readyBinsCount} ngăn đã sẵn sàng</p>
      </div>
      <button id="start-delivery-btn" ${(readyBinsCount && canStartDelivery) ? "" : "disabled"} ${canStartDelivery ? "" : "title='Không có quyền gửi lệnh giao thuốc'"}><i class="fa-regular fa-paper-plane" aria-hidden="true"></i><span>Bắt đầu nhiệm vụ</span></button>
    </div>
    ${patientModal}
  `;
}
