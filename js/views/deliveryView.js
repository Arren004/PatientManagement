// ============================================
// DELIVERY VIEW - Render UI giao thuốc
// ============================================

import authService from "../services/authService.js";
import { getRobotCompartmentCount } from "../data/constants.js";

function binNote(bin) {
  return (bin && bin.note && String(bin.note).trim()) || "";
}

function hasMedicines(bin) {
  return Array.isArray(bin.medicines) && bin.medicines.length > 0;
}

function escapeHtmlSummary(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function medicinesSummaryLine(bin) {
  const meds = Array.isArray(bin.medicines) ? bin.medicines : [];
  if (!meds.length) return "Chưa chọn thuốc";
  const names = meds
    .map((m) => (typeof m === "string" ? m : m && typeof m === "object" && m.name ? String(m.name) : ""))
    .map((x) => String(x).trim())
    .filter(Boolean);
  if (!names.length) return "Chưa chọn thuốc";
  const slice = names.slice(0, 2).join(", ");
  return names.length > 2 ? `${slice}…` : slice;
}

export function renderDeliveryView(
  container,
  deliveryBins,
  patients,
  readyBinsCount,
  isDeliveringForSelectedRobot,
  robots = [],
  selectedRobotId = "",
  deliveryMissionRobotId = null,
  deliveringRobotIds = null,
  configuringBinIndex = null,
  // New planning arguments
  isPlanningMode = false,
  planningPlanName = "",
  planningCompartmentsCount = 4,
  presets = [],
  selectedPresetId = "",
  showPresetModal = false
) {
  const canEditDelivery = authService.can("delivery.edit");
  const canStartDelivery = authService.can("delivery.start");
  const selectedRobot = robots.find((r) => String(r.id) === String(selectedRobotId));
  const robotOffline = Boolean(selectedRobot && selectedRobot.online === false);
  const startBlocked =
    !readyBinsCount ||
    !canStartDelivery ||
    isDeliveringForSelectedRobot ||
    !selectedRobotId ||
    robotOffline;

  const patientIdCounts = {};
  deliveryBins.forEach((b) => {
    if (b && b.patientId) {
      const k = String(b.patientId);
      patientIdCounts[k] = (patientIdCounts[k] || 0) + 1;
    }
  });

  let statReady = 0;
  let statPartial = 0;
  let statBusy = 0;
  deliveryBins.forEach((bin) => {
    const noteOk = Boolean(binNote(bin));
    const isReady = Boolean(bin.patientId && noteOk);
    const binMissionLocked =
      !isPlanningMode &&
      deliveryMissionRobotId &&
      selectedRobotId &&
      String(deliveryMissionRobotId) === String(selectedRobotId) &&
      (bin.status === "delivering" || bin.status === "đang giao");
    const isBusy = !isPlanningMode && (isDeliveringForSelectedRobot || binMissionLocked);
    const hasPartial =
      !isBusy &&
      !isReady &&
      Boolean(bin.patientId || noteOk || hasMedicines(bin));
    if (isBusy) statBusy += 1;
    else if (isReady) statReady += 1;
    else if (hasPartial) statPartial += 1;
  });

  const slotTotal = Math.max(1, deliveryBins.length);
  const readyMeterPct = Math.min(100, Math.max(0, (readyBinsCount / slotTotal) * 100));
  const robotStatLabel = selectedRobot ? selectedRobot.name || selectedRobot.id : "—";
  const robotStatOnline = Boolean(selectedRobot && selectedRobot.online !== false);

  const busyRobotSet =
    deliveringRobotIds instanceof Set
      ? deliveringRobotIds
      : deliveringRobotIds && Array.isArray(deliveringRobotIds)
        ? new Set(deliveringRobotIds.map(String))
        : new Set();

  const robotOptionRow = (r) => {
    const nSlots = getRobotCompartmentCount(r);
    const name = r.name || r.id;
    const off = r.online === false ? " — Off" : "";
    const label = `${name} · ${nSlots} ngăn${off}`;
    const sel = String(r.id) === String(selectedRobotId) ? " selected" : "";
    const val = String(r.id).replace(/"/g, "&quot;");
    return `<option value="${val}"${sel}>${label}</option>`;
  };

  let robotOptions = "";
  if (robots.length === 0) {
    robotOptions = `<option value="">— Chưa có robot —</option>`;
  } else {
    const readyList = robots.filter((r) => !busyRobotSet.has(String(r.id)));
    const busyList = robots.filter((r) => busyRobotSet.has(String(r.id)));
    robotOptions =
      `<option value="">-- Chọn robot --</option>` +
      (readyList.length
        ? `<optgroup label="Sẵn sàng">${readyList.map(robotOptionRow).join("")}</optgroup>`
        : "") +
      (busyList.length
        ? `<optgroup label="Đang giao thuốc">${busyList.map(robotOptionRow).join("")}</optgroup>`
        : "");
  }

  // Preset plans toolbar HTML
  let presetsToolbarHtml = "";
  if (!isPlanningMode) {
    presetsToolbarHtml = `
      <div class="presets-trigger-wrapper" style="margin-bottom: 16px;">
        <div id="presets-trigger-btn" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-radius: 12px; border: 1.5px solid #cbd5e1; background: #fff; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.02); box-sizing: border-box;" onmouseover="this.style.borderColor='#2563eb';this.style.boxShadow='0 4px 12px rgba(37,99,235,0.08)';" onmouseout="this.style.borderColor='#cbd5e1';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.02)';">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
              <img src="image/mission.png" alt="" style="width: 24px; height: 24px; object-fit: contain;" />
            </div>
            <span style="font-size: 0.95rem; font-weight: 700; color: #1e293b;">Kế hoạch giao thuốc</span>
            <span style="font-size: 0.8rem; color: #64748b; font-weight: 500;">(Áp dụng nhanh danh sách bệnh nhân & đơn thuốc)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.85rem; font-weight: 700; color: #2563eb;">Mở danh sách</span>
            <i class="fa-solid fa-chevron-right" style="color: #64748b; font-size: 0.8rem;"></i>
          </div>
        </div>
      </div>
    `;
  }

  const presetCardsHtml = presets.length === 0
    ? `
      <div style="text-align:center; padding:32px 16px; color:#94a3b8; background:#f8fafc; border-radius:12px; border:1.5px dashed #cbd5e1;">
        <i class="fa-solid fa-box-open" style="font-size:2.2rem; margin-bottom:10px; color:#cbd5e1;"></i>
        <p style="margin:0; font-size:0.92rem; font-weight:600; color:#64748b;">Chưa có kế hoạch giao thuốc nào</p>
        <p style="margin:4px 0 0 0; font-size:0.8rem; color:#94a3b8;">Nhấn nút bên dưới để lập kế hoạch đầu tiên</p>
      </div>
    `
    : presets.map(p => {
        const compartmentsSummary = p.compartments
          .map((c, i) => {
            if (!c.patientId) return null;
            const patient = patients.find(pat => String(pat.id) === String(c.patientId));
            return patient ? `P.${patient.room}` : `Ngăn ${i+1}`;
          })
          .filter(Boolean);
        
        const summaryText = compartmentsSummary.length > 0
          ? `Phòng: ${Array.from(new Set(compartmentsSummary)).join(", ")}`
          : "Kế hoạch trống";

        return `
          <div class="preset-item-card" data-id="${p.id}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-radius:10px; border:1.5px solid #e2e8f0; background:#fff; transition:all 0.15s ease-in-out; box-sizing:border-box;" onmouseover="this.style.borderColor='#2563eb';this.style.background='#f8fbff';" onmouseout="this.style.borderColor='#e2e8f0';this.style.background='#fff';">
            <div style="flex:1; min-width:0; margin-right:12px; text-align:left;">
              <h4 style="margin:0; font-size:1rem; font-weight:700; color:#1e293b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtmlSummary(p.name)}</h4>
              <p style="margin:4px 0 0 0; font-size:0.8rem; color:#64748b; font-weight:500; display:flex; align-items:center; gap:6px;">
                <span><i class="fa-solid fa-cubes"></i> ${p.compartments.length} ngăn</span>
                <span>•</span>
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${summaryText}</span>
              </p>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
              <button type="button" class="modal-apply-preset-btn main-btn" data-id="${p.id}" style="padding:6px 12px; font-size:0.8rem; background:#2563eb; color:#fff; font-weight:700; border-radius:6px; border:none; cursor:pointer; height:32px;">Áp dụng</button>
              <button type="button" class="modal-edit-preset-btn ghost-btn" data-id="${p.id}" style="padding:6px 10px; border-radius:6px; color:#059669; border-color:#a7f3d0; background:#fff; cursor:pointer; font-weight:700; font-size:0.8rem; display:inline-flex; align-items:center; gap:4px; height:32px; box-sizing:border-box;" title="Chỉnh sửa"><i class="fa-solid fa-pen-to-square"></i> Sửa</button>
              <button type="button" class="modal-delete-preset-btn ghost-btn" data-id="${p.id}" style="padding:6px 10px; border-radius:6px; color:#ef4444; border-color:#fecaca; background:#fff; cursor:pointer; font-weight:700; font-size:0.8rem; display:inline-flex; align-items:center; gap:4px; height:32px; box-sizing:border-box;" title="Xóa"><i class="fa-solid fa-trash"></i> Xóa</button>
            </div>
          </div>
        `;
      }).join("");

  const presetSelectModalHtml = `
    <div id="preset-select-modal" class="modal-overlay${showPresetModal ? " show" : ""}" style="z-index:950; align-items:center; justify-content:center; display:${showPresetModal ? "flex" : "none"};">
      <div class="modal-card" style="width: min(540px, 95vw); max-width:540px; padding:24px 20px; position:relative; overflow:visible; display:flex; flex-direction:column; gap:16px;">
        <button id="close-preset-modal" style="position:absolute; top:12px; right:12px; background:none; border:none; font-size:1.5rem; line-height:1; color:#888; cursor:pointer;">&times;</button>
        
        <h3 style="font-size:1.4rem; font-weight:800; margin:0; color:#1e293b; display:flex; align-items:center; gap:8px;">
          <img src="image/mission.png" alt="" style="width: 24px; height: 24px; object-fit: contain;" /> Kế hoạch giao thuốc
        </h3>
        <p style="margin:0; font-size:0.88rem; color:#64748b;">Áp dụng nhanh danh sách bệnh nhân và đơn thuốc đã chuẩn bị sẵn</p>
        
        <div style="position:relative; width:100%; box-sizing:border-box; margin-top:-4px;">
          <input type="text" id="preset-search-input" placeholder="Tìm kế hoạch theo tên..." style="width:100%; height:38px; padding:0 12px 0 36px; border-radius:8px; border:1.5px solid #cbd5e1; font-size:0.9rem; font-weight:600; color:#1e293b; box-sizing:border-box; outline:none; transition:border-color 0.15s ease-in-out;" />
          <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:0.9rem; pointer-events:none;"></i>
        </div>
        
        <div id="presets-list-container" style="max-height:280px; overflow-y:auto; display:flex; flex-direction:column; gap:10px; margin-top:4px;">
          ${presetCardsHtml}
        </div>
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; border-top:1px solid #f1f5f9; padding-top:14px; box-sizing:border-box;">
          <button type="button" id="modal-create-preset-btn" class="primary-btn" style="padding:8px 16px; background:#2563eb; color:#fff; font-weight:700; border-radius:8px; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:0.9rem;">
            <i class="fa-solid fa-plus"></i> Lập kế hoạch mới
          </button>
          <button type="button" id="modal-close-preset-btn" class="ghost-btn" style="padding:8px 16px; border-radius:8px; cursor:pointer; font-size:0.9rem;">Đóng</button>
        </div>
      </div>
    </div>
  `;

  // Planning Toolbar HTML
  let planningToolbarHtml = "";
  if (isPlanningMode) {
    planningToolbarHtml = `
      <div class="card delivery-planning-toolbar" style="margin-bottom: 20px; padding: 20px 24px; border-radius: 20px; border: 2px solid #f59e0b; background: #fffbeb; box-shadow: 0 4px 15px rgba(245,158,11,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #fef3c7; display: flex; align-items: center; justify-content: center; color: #d97706; border: 1.5px solid #fde68a;">
              <i class="fa-solid fa-pencil" style="font-size: 1.3rem;"></i>
            </div>
            <div>
              <h3 style="margin: 0; font-size: 1.2rem; font-weight: 800; color: #b45309;">Chế độ lập kế hoạch</h3>
              <p style="margin: 2px 0 0 0; font-size: 0.88rem; color: #b45309; font-weight: 600; opacity: 0.85;">Thiết lập trước thông tin cho từng ngăn thuốc</p>
            </div>
          </div>
          <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; flex-grow: 1; justify-content: flex-end;">
            <div style="display:flex; flex-direction:column; gap:4px; min-width: 220px;">
              <label for="planning-name-input" style="font-size: 0.8rem; font-weight: 700; color: #b45309;">Tên kế hoạch</label>
              <input type="text" id="planning-name-input" placeholder="Ví dụ: Kế hoạch sáng Lầu 1..." value="${planningPlanName}" style="height: 40px; padding: 0 12px; border-radius: 8px; border: 1.5px solid #f59e0b; font-weight: 600; color: #78350f; background: #fff; width: 100%; box-sizing: border-box;" />
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <label for="planning-slots-select" style="font-size: 0.8rem; font-weight: 700; color: #b45309;">Số ngăn</label>
              <select id="planning-slots-select" style="height: 40px; padding: 0 12px; border-radius: 8px; border: 1.5px solid #f59e0b; font-weight: 600; color: #78350f; background: #fff; cursor: pointer;">
                <option value="4"${planningCompartmentsCount === 4 ? " selected" : ""}>4 ngăn</option>
                <option value="6"${planningCompartmentsCount === 6 ? " selected" : ""}>6 ngăn</option>
                <option value="8"${planningCompartmentsCount === 8 ? " selected" : ""}>8 ngăn</option>
                <option value="12"${planningCompartmentsCount === 12 ? " selected" : ""}>12 ngăn</option>
              </select>
            </div>
            <div style="display:flex; gap:8px; align-items:flex-end;">
              <button type="button" id="planning-cancel-btn" class="ghost-btn" style="height: 40px; padding: 0 18px; border-color: #fcd34d; color: #b45309; background: #fff; cursor: pointer; border-radius: 8px; font-weight: 700; transition: all 0.15s; margin-top: auto;">
                Hủy
              </button>
              <button type="button" id="planning-save-btn" class="primary-btn" style="height: 40px; padding: 0 20px; background: #d97706; color: #fff; border-radius: 8px; font-weight: 700; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(217,119,6,0.25); margin-top: auto;">
                <i class="fa-solid fa-floppy-disk"></i> Lưu kế hoạch
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const robotAvatar = selectedRobot && selectedRobot.avatar ? String(selectedRobot.avatar).trim() : "";
  const toolbarAvatarInner = robotAvatar
    ? `<img src="${robotAvatar}" alt="" class="delivery-toolbar-avatar-img" />`
    : `<i class="fa-solid fa-robot delivery-toolbar-icon-fallback" aria-hidden="true"></i>`;

  // Modal chọn bệnh nhân dạng stepper: Lầu -> Phòng -> Bệnh nhân
  const patientModal = `
    <div id="patient-select-modal" class="modal-overlay" style="display:none;z-index:1000;align-items:center;justify-content:center;">
      <div class="modal-card" style="max-width:980px;min-width:520px;width:96vw;height:88vh;padding:24px 28px 18px 28px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;">
        <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:80px;height:7px;background:#ff6600;border-radius:6px 6px 12px 12px;margin-bottom:8px;"></div>
        <h3 style="font-size:2.1rem;font-weight:800;margin-bottom:10px;margin-top:10px;z-index:1;position:relative;text-align:center;">Chọn bệnh nhân</h3>
        <div class="stepper" style="display:flex;align-items:center;gap:40px;margin:18px 0 18px 0;justify-content:center;z-index:1;position:relative;">
          <div class="stepper-step" data-step="1" style="display:flex;align-items:center;gap:14px;">
            <span class="step-circle" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#2563eb;color:#fff;font-weight:700;font-size:22px;box-shadow:0 2px 8px #2563eb22;">1</span>
            <span class="step-label" style="font-weight:700;color:#222;font-size:19px;">Chọn lầu</span>
          </div>
          <div class="stepper-line" style="flex:0 0 60px;height:2.5px;background:#e5eaf2;"></div>
          <div class="stepper-step" data-step="2" style="display:flex;align-items:center;gap:14px;">
            <span class="step-circle" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#f3f4f6;color:#bbb;font-weight:700;font-size:22px;">2</span>
            <span class="step-label" style="font-weight:600;color:#bbb;font-size:19px;">Chọn phòng</span>
          </div>
          <div class="stepper-line" style="flex:0 0 60px;height:2.5px;background:#e5eaf2;"></div>
          <div class="stepper-step" data-step="3" style="display:flex;align-items:center;gap:14px;">
            <span class="step-circle" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#f3f4f6;color:#bbb;font-weight:700;font-size:22px;">3</span>
            <span class="step-label" style="font-weight:600;color:#bbb;font-size:19px;">Chọn bệnh nhân</span>
          </div>
        </div>
        <div id="patient-step-content"></div>
        <div style="text-align:right;margin-top:18px;">
          <button id="patient-modal-cancel" class="ghost-btn" type="button" style="font-size:1.1rem;padding:8px 22px;">Đóng</button>
        </div>
      </div>
    </div>
  `;

  // Modal chọn thuốc (ẩn mặc định, chỉ render 1 lần ngoài cùng)
  if (!document.getElementById('medicine-select-modal')) {
    const modal = document.createElement('div');
    modal.id = 'medicine-select-modal';
    modal.className = 'modal-overlay';
    modal.style = 'display:none;z-index:99999;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="medicine-modal-header">
          <i class="fa-solid fa-pills"></i>
          <h3>Chọn thuốc</h3>
        </div>
        <div class="medicine-modal-content">
          <div class="medicine-list-panel">
            <div class="medicine-list-search">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" class="medicine-list-search-input" placeholder="Tìm thuốc từ danh mục..." />
            </div>
            <div class="medicine-list-items"></div>
            <button type="button" class="add-new-medicine-btn">
              <i class="fa-solid fa-plus-circle"></i> Thêm thuốc mới vào danh mục
            </button>
          </div>
          <div class="medicine-selected-panel">
            <div class="medicine-selected-header">
              <span>Thuốc đã chọn</span>
              <span class="selected-count-badge" id="selected-meds-count">0</span>
            </div>
            <div class="medicine-selected-list"></div>
          </div>
        </div>
        
        <div class="medicine-add-form" style="display:none;">
          <div class="medicine-add-inputs">
            <input type="text" class="medicine-add-name medicine-add-input" placeholder="Tên thuốc (Ví dụ: Paracetamol, Amoxicillin...)" />
            <input type="text" class="medicine-add-dosage medicine-add-input" placeholder="Hàm lượng / Liều dùng (Ví dụ: 500mg, 10ml...)" />
            <button type="button" class="medicine-add-save-btn">Lưu thuốc</button>
            <button type="button" class="medicine-add-cancel-btn">Hủy bỏ</button>
          </div>
        </div>

        <div class="medicine-modal-footer">
          <button type="button" class="medicine-modal-cancel-btn">Huỷ</button>
          <button type="button" class="medicine-modal-ok-btn">Xác nhận</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const compartments = deliveryBins
    .map((bin, index) => {
      const patient = patients.find((p) => String(p.id) === String(bin.patientId));
      const noteOk = Boolean(binNote(bin));
      const isReady = Boolean(bin.patientId && noteOk);
      const hasAssigned = isReady;
      const binMissionLocked =
        deliveryMissionRobotId &&
        selectedRobotId &&
        String(deliveryMissionRobotId) === String(selectedRobotId) &&
        (bin.status === "delivering" || bin.status === "đang giao");
      const isBusy = isDeliveringForSelectedRobot || binMissionLocked;
      const hasPartial =
        !isBusy &&
        !isReady &&
        Boolean(bin.patientId || noteOk || hasMedicines(bin));
      const dupPatient =
        Boolean(bin.patientId) && patientIdCounts[String(bin.patientId)] > 1;

      let statusLabel = "Trống";
      let statusClass = "delivery-status--empty";
      if (isBusy) {
        if (bin.status === "delivered" || bin.status === "đã giao") {
          statusLabel = "Đã giao";
          statusClass = "delivery-status--delivered";
        } else {
          statusLabel = "Đang giao";
          statusClass = "delivery-status--busy";
        }
      } else if (bin.status === "failed" || bin.status === "giao thất bại") {
        /* SỬA ĐỔI: Nhãn hiển thị cho ca giao thất bại */
        statusLabel = "Giao thất bại";
        statusClass = "delivery-status--failed";
        /* KẾT THÚC SỬA ĐỔI */
      } else if (isReady) {
        statusLabel = "Sẵn sàng gửi";
        statusClass = "delivery-status--ready";
      } else if (hasPartial) {
        statusLabel = "Chưa đủ thiết lập";
        statusClass = "delivery-status--partial";
      }

      const hasPatientInfo = patient || bin.patientName;
      const displayPatientName = patient ? patient.name : (bin.patientName || "");
      const displayRoom = patient ? patient.room : (bin.room || "");

      const summaryPatientLine = isBusy
        ? (hasPatientInfo ? `Đang giao: ${escapeHtmlSummary(displayPatientName)} · Phòng ${escapeHtmlSummary(displayRoom)}` : "Đang thực hiện giao thuốc…")
        : patient
          ? `${escapeHtmlSummary(patient.name)} · Phòng ${escapeHtmlSummary(patient.room || "—")}`
          : "Chưa chọn bệnh nhân";
      const summaryMedsLine = medicinesSummaryLine(bin);

      return `
      <div class="card delivery-compartment${hasAssigned ? " assigned" : ""}${isBusy ? " slot-busy" : ""}${hasPartial ? " partial" : ""}" data-index="${index}" style="cursor: ${isBusy ? "default" : "pointer"}; min-height: 250px; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.25s ease-in-out; border: 1.5px solid #cbd5e1; box-shadow: 0 4px 15px rgba(0,0,0,0.02); border-radius: 20px; overflow: hidden; background: #fff;">
        
        <!-- Header -->
        <div style="padding: 14px 16px 10px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; background: #fafcff;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 28px; height: 28px; background: linear-gradient(135deg, #e0f2fe, #bae6fd); color: #0369a1; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; border: 1.5px solid #7dd3fc; box-shadow: 0 2px 4px rgba(3,105,161,0.06);">${index + 1}</span>
            <h3 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #0f172a;">Ngăn ${index + 1}</h3>
          </div>
          <span class="delivery-status-chip ${statusClass}" style="font-size: 0.78rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; letter-spacing: 0.02em; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">${statusLabel}</span>
        </div>

        <!-- Body / Content -->
        <div style="padding: 14px 16px; flex-grow: 1; display: flex; flex-direction: column; gap: 10px; justify-content: flex-start;">
          ${(bin.status === "failed" || bin.status === "giao thất bại") ? `
            <!-- SỬA ĐỔI: Hiển thị cảnh báo lỗi giao hàng kèm nguyên nhân chi tiết -->
            <div style="background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 12px; padding: 8px 10px; display: flex; align-items: center; gap: 10px; color: #991b1b;">
              <div style="width: 32px; height: 32px; border-radius: 8px; background: #fee2e2; display: flex; align-items: center; justify-content: center; color: #ef4444; flex-shrink:0;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 0.95rem;"></i>
              </div>
              <div style="min-width: 0; flex: 1; font-size: 0.88rem; font-weight: 700;">
                <div>Giao thuốc thất bại!</div>
                <div style="font-size: 0.78rem; font-weight: 600; color: #b91c1c; margin-top: 2px;">
                  ${bin.failureReason === "timeout" ? "Lý do: Quá giờ chờ tại giường" : bin.failureReason === "navigation_error" ? "Lý do: Lỗi di chuyển (Kẹt đường)" : "Lý do: Robot gặp sự cố"}
                </div>
              </div>
            </div>
            <!-- KẾT THÚC SỬA ĐỔI -->
          ` : ""}

          ${(patient || bin.patientName) ? `
            <!-- Patient Info Block -->
            <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 8px 10px; display: flex; align-items: center; gap: 10px;">
              <div style="width: 32px; height: 32px; border-radius: 8px; background: #e0f2fe; display: flex; align-items: center; justify-content: center; color: #0284c7; flex-shrink:0;">
                <i class="fa-solid fa-user-injured" style="font-size: 0.95rem;"></i>
              </div>
              <div style="min-width: 0; flex: 1;">
                <div style="font-size: 0.92rem; font-weight: 800; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${escapeHtmlSummary(patient ? patient.name : bin.patientName)}
                </div>
                <div style="font-size: 0.8rem; color: #64748b; margin-top: 1px; font-weight: 600; display: flex; align-items: center; gap: 5px;">
                  <span>Phòng ${escapeHtmlSummary(patient ? patient.room : bin.room)}</span>
                  <span style="color: #cbd5e1;">•</span>
                  <span>Giường ${patient ? (patient.bed ? escapeHtmlSummary(patient.bed).match(/\d+/)?.[0] || escapeHtmlSummary(patient.bed) : "—") : (bin.bed ? escapeHtmlSummary(bin.bed).match(/\d+/)?.[0] || escapeHtmlSummary(bin.bed) : "—")}</span>
                </div>
              </div>
            </div>
          ` : `
            <!-- Empty Patient Placeholder -->
            <div style="border: 1.5px dashed #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; color: #94a3b8; font-size: 0.88rem; display: flex; flex-direction: column; align-items: center; gap: 6px; justify-content: center; height: 100%; min-height: 100px;">
              <i class="fa-solid fa-user-plus" style="font-size: 1.25rem; color: #cbd5e1;"></i>
              <span style="font-weight: 600;">Chưa chọn bệnh nhân</span>
            </div>
          `}

          ${(bin.patientId || bin.patientName) ? `
            <!-- Medicines List -->
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <span style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: #94a3b8; letter-spacing: 0.03em;">Thuốc giao</span>
              <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 1px;">
                ${Array.isArray(bin.medicines) && bin.medicines.length > 0 ? bin.medicines.map(m => `
                  <span style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.76rem; font-weight: 700; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 2px 6px; border-radius: 6px; white-space: nowrap;">
                    <i class="fa-solid fa-prescription-bottle" style="font-size: 0.7rem; color: #10b981;"></i>
                    ${escapeHtmlSummary(m.name)}${m.dosage ? ` (${escapeHtmlSummary(m.dosage)})` : ""}
                  </span>
                `).join("") : `
                  <span style="font-size: 0.8rem; color: #f59e0b; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-triangle-exclamation"></i> Chưa chọn thuốc
                  </span>
                `}
              </div>
            </div>

            <!-- Instructions / Note -->
            ${bin.note ? `
              <div style="display: flex; flex-direction: column; gap: 3px; margin-top: 1px; min-width:0;">
                <span style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: #94a3b8; letter-spacing: 0.03em;">Hướng dẫn</span>
                <div style="background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px 8px 8px 4px; padding: 6px 10px; font-size: 0.84rem; color: #b45309; line-height: 1.35; display: flex; gap: 5px; align-items: flex-start; box-shadow: inset 0 1px 2px rgba(245,158,11,0.01); max-width: 100%;">
                  <i class="fa-solid fa-comment-medical" style="margin-top: 2px; flex-shrink: 0; color: #d97706; font-size: 0.8rem;"></i>
                  <span style="font-weight: 600; word-break: break-word; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-overflow: ellipsis; max-height: 2.7em;">${escapeHtmlSummary(bin.note)}</span>
                </div>
              </div>
            ` : ""}
          ` : ""}
        </div>

        <!-- Footer Actions -->
        <div style="padding: 10px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; border-radius: 0 0 20px 20px; min-height: 52px; box-sizing: border-box;">
          <div>
            ${dupPatient && !isBusy ? `
              <span class="delivery-duplicate-badge" style="font-size: 0.7rem; font-weight: 800; padding: 3px 6px; border-radius: 6px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; display: inline-flex; align-items: center; gap: 3px;">
                <i class="fa-solid fa-clone"></i> Trùng BN
              </span>
            ` : ""}
          </div>
          <div style="display: flex; gap: 6px;">
            ${!isBusy ? `
              ${(bin.status === "failed" || bin.status === "giao thất bại") ? `
                <!-- SỬA ĐỔI: Giao diện thao tác khi ngăn bị lỗi -->
                ${!isPlanningMode ? `<button type="button" class="ghost-btn open-lid-btn" data-index="${index}" style="padding: 5px 10px; font-size: 0.8rem; color: #2563eb; border-color: #bfdbfe; background: #fff; cursor: pointer; border-radius: 8px; font-weight: 700; transition: all 0.15s;">Mở nắp</button>` : ""}
                <button type="button" class="ghost-btn clear-bin-btn" data-index="${index}" style="padding: 5px 10px; font-size: 0.8rem; color: #ef4444; border-color: #fecaca; background: #fff; cursor: pointer; border-radius: 8px; font-weight: 700; transition: all 0.15s;">Thu hồi</button>
                <!-- KẾT THÚC SỬA ĐỔI -->
              ` : `
                ${!isPlanningMode ? `<button type="button" class="ghost-btn open-lid-btn" data-index="${index}" style="padding: 5px 10px; font-size: 0.8rem; color: #2563eb; border-color: #bfdbfe; background: #fff; cursor: pointer; border-radius: 8px; font-weight: 700; transition: all 0.15s;">Mở nắp</button>` : ""}
                ${bin.patientId ? `<button type="button" class="ghost-btn clear-bin-btn" data-index="${index}" style="padding: 5px 10px; font-size: 0.8rem; color: #ef4444; border-color: #fecaca; background: #fff; cursor: pointer; border-radius: 8px; font-weight: 700; transition: all 0.15s;">Xóa</button>` : ""}
                <button type="button" class="configure-bin-btn main-btn" data-index="${index}" style="padding: 5px 14px; font-size: 0.82rem; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(37,99,235,0.2); transition: all 0.15s;">
                  ${bin.patientId ? "Chỉnh sửa" : "Thiết lập"}
                </button>
              `}
            ` : `
              ${(bin.status === "delivered" || bin.status === "đã giao") ? `
                <div style="display: flex; align-items: center; gap: 6px; color: #15803d; font-size: 0.8rem; font-weight: 700; background: #f0fdf4; padding: 4px 8px; border-radius: 8px; border: 1px solid #bbf7d0;">
                  <i class="fa-solid fa-circle-check" style="color: #16a34a;"></i> Đã giao
                </div>
              ` : `
                <div style="display: flex; align-items: center; gap: 6px; color: #2563eb; font-size: 0.8rem; font-weight: 700; background: #eff6ff; padding: 4px 8px; border-radius: 8px; border: 1px solid #bfdbfe;">
                  <span class="spinner" style="width: 12px; height: 12px; border-width: 1.5px;"></span> Đang giao...
                </div>
              `}
            `}
          </div>
        </div>

      </div>
      `;
    })
    .join("");

  let binConfigModal = "";
  if (configuringBinIndex !== null) {
    const idx = configuringBinIndex;
    const bin = deliveryBins[idx];
    const patient = patients.find((p) => String(p.id) === String(bin.patientId));
    
    binConfigModal = `
      <div id="bin-config-modal" class="modal-overlay show" style="z-index:900; align-items:center; justify-content:center;">
        <div class="modal-card" style="width: min(640px, 95vw); max-width:640px; min-width:320px; padding:28px 24px; position:relative; overflow:visible; display:flex; flex-direction:column; gap:16px;">
          <button id="close-bin-config-modal" style="position:absolute; top:14px; right:14px; background:none; border:none; font-size:1.5rem; line-height:1; color:#888; cursor:pointer;">&times;</button>
          
          <h3 style="font-size:1.6rem; font-weight:800; margin:0 0 6px 0; color:#1e293b;">
            Cấu hình Ngăn ${idx + 1}
          </h3>
          
          <div class="field-wrap">
            <label style="font-weight:600; color:#334155; margin-bottom:6px; display:block;">Chọn bệnh nhân</label>
            <div class="patient-search-wrapper delivery-tap-row" style="display:flex; gap:8px;">
              <input 
                type="text" 
                class="delivery-control-patient-search delivery-tap-input" 
                data-index="${idx}" 
                placeholder="Chạm để chọn bệnh nhân…" 
                readonly
                style="flex:1; padding:10px 12px; border-radius:8px; border:1.5px solid #cbd5e1; background:#f8fafc; cursor:pointer;" />
              <input type="hidden" class="delivery-control-patient-id" data-index="${idx}" value="${bin.patientId || ''}">
              ${bin.patientId ? `<button type="button" class="ghost-btn cancel-patient-btn delivery-cancel-pill" data-index="${idx}" style="padding:10px 14px; border-color:#fecaca; color:#ef4444;" title="Huỷ chọn bệnh nhân">Huỷ</button>` : ""}
            </div>
            
            ${patient && patient.prescription ? `
              <div class="prescription-suggestion-bar" style="margin-top:10px; padding:10px 14px; background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:10px; font-size:0.92rem; color:#166534; display:flex; align-items:center; justify-content:space-between; gap:12px; box-shadow:inset 0 1px 2px rgba(22,101,52,0.02);">
                <div style="flex:1; word-break:break-word; line-height:1.4;">
                  <i class="fa-solid fa-file-prescription" style="margin-right:6px; color:#15803d;"></i>Đơn thuốc: <strong style="color:#14532d;">${escapeHtmlSummary(patient.prescription)}</strong>
                </div>
                <button type="button" class="apply-prescription-btn ghost-btn" data-index="${idx}" style="padding:5px 12px; font-size:0.85rem; background:#fff; border:1.5px solid #bbf7d0; color:#15803d; font-weight:700; white-space:nowrap; cursor:pointer; border-radius:8px; box-shadow:0 2px 4px rgba(21,128,61,0.06); transition:all 0.15s ease-in-out;">Áp dụng nhanh</button>
              </div>
            ` : ""}
          </div>
          
          <div class="field-wrap">
            <label style="font-weight:600; color:#334155; margin-bottom:6px; display:block;">Tên thuốc</label>
            <div class="medicine-select-input-wrapper">
              <input 
                type="text" 
                class="delivery-control-medicine-select delivery-tap-input" 
                data-index="${idx}" 
                placeholder="Chạm để chọn thuốc…" 
                readonly
                style="width:100%; padding:10px 12px; border-radius:8px; border:1.5px solid #cbd5e1; background:#f8fafc; cursor:pointer; box-sizing:border-box;" />
              <input type="hidden" class="delivery-control-medicine-data" data-index="${idx}" value='${JSON.stringify(bin.medicines || [])}'>
            </div>
          </div>
          
          <div class="field-wrap">
            <label style="font-weight:600; color:#334155; margin-bottom:6px; display:block;">Hướng dẫn giao thuốc</label>
            <textarea 
              class="delivery-control-note delivery-note-area" 
              data-index="${idx}" 
              rows="3" 
              placeholder="Ví dụ: Sau ăn, cần hỗ trợ, uống kèm nước…"
              style="width:100%; padding:10px 12px; border-radius:8px; border:1.5px solid #cbd5e1; box-sizing:border-box; resize:vertical; font-family:inherit; font-size:0.95rem;"></textarea>
            <div class="common-instructions" data-index="${idx}" style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px;">
              <span class="common-instruction-btn" tabindex="0" role="button" data-value="Sau ăn" style="background:#f3f4f6; padding:6px 12px; border-radius:999px; cursor:pointer; font-size:0.88rem; border:1.5px solid transparent; transition:all 0.15s;">Sau ăn</span>
              <span class="common-instruction-btn" tabindex="0" role="button" data-value="Trước ăn" style="background:#f3f4f6; padding:6px 12px; border-radius:999px; cursor:pointer; font-size:0.88rem; border:1.5px solid transparent; transition:all 0.15s;">Trước ăn</span>
              <span class="common-instruction-btn" tabindex="0" role="button" data-value="Uống kèm nước" style="background:#f3f4f6; padding:6px 12px; border-radius:999px; cursor:pointer; font-size:0.88rem; border:1.5px solid transparent; transition:all 0.15s;">Uống kèm nước</span>
              <span class="common-instruction-btn" tabindex="0" role="button" data-value="Cần hỗ trợ" style="background:#f3f4f6; padding:6px 12px; border-radius:999px; cursor:pointer; font-size:0.88rem; border:1.5px solid transparent; transition:all 0.15s;">Cần hỗ trợ</span>
              <span class="common-instruction-btn" tabindex="0" role="button" data-value="Không dùng chung với sữa" style="background:#f3f4f6; padding:6px 12px; border-radius:999px; cursor:pointer; font-size:0.88rem; border:1.5px solid transparent; transition:all 0.15s;">Không dùng chung với sữa</span>
            </div>
          </div>
          
          ${patient ? (() => {
            let bedNum = patient.bed;
            if (typeof bedNum === 'string') {
              const match = bedNum.match(/\d+/);
              bedNum = match ? match[0] : bedNum;
            }
            return `<div class="delivery-preview" style="border:1px solid #9ddff3; background:#e6f8fe; border-radius:12px; padding:10px 12px; color:#0e5d7b; font-size:0.92rem;">
              <strong>${patient.name}</strong> · Phòng ${patient.room}, Giường ${bedNum}
            </div>`;
          })() : ""}
          
          <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:8px;">
            ${bin.patientId ? `<button type="button" class="ghost-btn clear-bin-btn modal-clear-btn" data-index="${idx}" style="padding:10px 20px; border-color:#fecaca; color:#ef4444; font-weight:600; border-radius:8px; cursor:pointer;">Xoá thiết lập</button>` : ""}
            <button type="button" id="bin-config-save-btn" class="primary-btn" style="padding:10px 24px; background:#2563eb; color:#fff; font-weight:700; border-radius:8px; border:none; cursor:pointer;">Xác nhận</button>
          </div>
        </div>
      </div>
    `;
  }

  const topControls = isPlanningMode
    ? planningToolbarHtml
    : `
      ${presetsToolbarHtml}

      <div class="card delivery-robot-toolbar">
        <div class="delivery-toolbar-head">
          <div class="delivery-toolbar-visual${robotAvatar ? " delivery-toolbar-visual--photo" : ""}${robotOffline ? " is-offline" : ""}" aria-hidden="true">
            ${toolbarAvatarInner}
          </div>
          <div>
            <p class="delivery-toolbar-kicker">Thiết bị</p>
            <p class="delivery-toolbar-title">Robot thực hiện nhiệm vụ</p>
          </div>
        </div>
        <div class="delivery-robot-toolbar-row" style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
          <div style="flex:1; min-width: 240px;">
            <label class="visually-hidden" for="delivery-robot-select">Chọn robot</label>
            <select id="delivery-robot-select" class="delivery-robot-select" style="width:100%;" aria-describedby="delivery-robot-banner-desc">${robotOptions}</select>
          </div>
          ${selectedRobotId && !robotOffline ? `
            <button type="button" id="open-all-lids-btn" class="ghost-btn" style="padding: 10px 18px; height: 48px; display: inline-flex; align-items: center; gap: 8px; font-size: 0.95rem; color: #2563eb; border-color: #bfdbfe; background: #fff; cursor: pointer; border-radius: 12px; font-weight: 700; transition: all 0.2s; white-space: nowrap; box-sizing: border-box; box-shadow: 0 2px 8px rgba(37,99,235,0.05);">
              <i class="fa-solid fa-door-open"></i> Mở cả ${slotTotal} ngăn
            </button>
          ` : ""}
        </div>
        ${
          isDeliveringForSelectedRobot
            ? `<p id="delivery-robot-banner-desc" class="delivery-robot-banner busy"><i class="fa-solid fa-robot" aria-hidden="true"></i> Đang giao — chờ xong hoặc đổi robot.</p>`
            : robotOffline
              ? `<p id="delivery-robot-banner-desc" class="delivery-robot-banner warn"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i> Offline — chọn robot khác.</p>`
              : `<p id="delivery-robot-banner-desc" class="delivery-robot-banner hint">${slotTotal} ngăn. Trong menu: nhóm Sẵn sàng và Đang giao thuốc.</p>`
        }
      </div>
    `;

  const footerHtml = isPlanningMode
    ? ""
    : `<div class="card delivery-footer delivery-footer--cta">
        <div class="delivery-footer-main">
          <h3>Gửi lệnh robot</h3>
          <p id="ready-bins-text" class="delivery-footer-lead"><strong>${readyBinsCount}/${slotTotal}</strong> ngăn đủ điều kiện gửi lệnh</p>
          <div class="delivery-ready-meter" aria-hidden="true">
            <div class="delivery-ready-meter-track">
              <div id="delivery-ready-meter-fill" class="delivery-ready-meter-fill" style="width:${readyMeterPct}%"></div>
            </div>
          </div>
        </div>
        <button type="button" id="start-delivery-btn" class="delivery-start-btn" ${startBlocked ? "disabled" : ""} ${canStartDelivery ? "" : "title='Không có quyền gửi lệnh giao thuốc'"}><i class="fa-regular fa-paper-plane" aria-hidden="true"></i><span class="start-delivery-label">Bắt đầu nhiệm vụ</span></button>
      </div>`;

  const gridWrapClass = isPlanningMode
    ? "delivery-grid-wrap"
    : `delivery-grid-wrap${!selectedRobotId ? " delivery-grid--needs-robot" : ""}`;

  container.innerHTML = `
    <div class="delivery-page${isPlanningMode ? " is-planning-active" : ""}">
      ${topControls}

      <div class="${gridWrapClass}">
        <div class="delivery-grid">${compartments}</div>
      </div>

      ${footerHtml}
    </div>

    <div id="delivery-confirm-modal" class="modal-overlay delivery-confirm-overlay" style="display:none;" aria-hidden="true">
      <div class="modal-card delivery-confirm-card" role="dialog" aria-labelledby="delivery-confirm-title">
        <h3 id="delivery-confirm-title">Xác nhận gửi lệnh robot</h3>
        <p id="delivery-confirm-lead" class="delivery-confirm-lead"></p>
        <ul id="delivery-confirm-summary" class="delivery-confirm-summary"></ul>
        <p class="delivery-confirm-note">Vui lòng đối chiếu bệnh nhân, thuốc và hướng dẫn trước khi xác nhận.</p>
        <div class="delivery-confirm-actions">
          <button type="button" id="delivery-confirm-cancel" class="ghost-btn modal-cancel">Huỷ</button>
          <button type="button" id="delivery-confirm-ok" class="primary-btn">Xác nhận gửi robot</button>
        </div>
      </div>
    </div>
    ${patientModal}
    ${binConfigModal}
    ${presetSelectModalHtml}
  `;
}
