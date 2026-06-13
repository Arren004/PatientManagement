// Modal chi tiết bệnh nhân

export function renderPatientDetailModal(patient) {
  const isDischarged = String(patient.status || "").toLowerCase() === "discharged";
  const dischargeDate =
    patient.dischargeDate ||
    patient.ngayXuatVien ||
    patient.discharge_date ||
    patient.dateOfDischarge ||
    patient.releasedAt ||
    "";
  const dischargeCondition =
    patient.dischargeCondition ||
    patient.dischargeNote ||
    patient.dischargeStatusNote ||
    patient.tinhTrangXuatVien ||
    patient.conditionOnDischarge ||
    "";

  // Xoá modal cũ nếu có
  let oldModal = document.getElementById('patient-detail-modal');
  if (oldModal) oldModal.remove();
  
  // Tính BMI tự động nếu có chiều cao và cân nặng
  let bmiVal = "Chưa tính";
  if (patient.bmi) {
    bmiVal = patient.bmi;
  } else if (patient.height && patient.weight) {
    const h = parseFloat(patient.height) / 100;
    const w = parseFloat(patient.weight);
    if (h > 0 && w > 0) {
      bmiVal = (w / (h * h)).toFixed(2);
    }
  }

  const canCreatePatient = authService.can("patients.create");

  // Tạo modal
  const modal = document.createElement('div');
  modal.id = 'patient-detail-modal';
  modal.className = 'modal-overlay show';
  modal.innerHTML = `
    <div class="modal-card" style="width: min(880px, 95vw); max-width:880px; min-width:340px; position:relative; padding:38px 38px 28px 38px; transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1);">
      <button id="close-patient-detail-modal" style="position:absolute;top:18px;right:18px;background:none;border:none;font-size:1.7rem;line-height:1;color:#888;cursor:pointer;z-index:10;">&times;</button>
      
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-right:24px;">
        <div>
          <h2 style="font-size:1.45rem;font-weight:800;margin-bottom:2px;">${patient.name || ''}</h2>
          <div style="color:#666;font-size:1.07rem;">Thông tin chi tiết bệnh nhân</div>
        </div>
        ${canCreatePatient ? `
          <button id="edit-patient-btn" data-id="${patient.id}" style="background:#e0f2fe;border:none;border-radius:8px;padding:6px 14px;font-weight:600;color:#2563eb;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 8px #2563eb11;">
            <i class="fa-solid fa-pen-to-square"></i> Chỉnh sửa
          </button>
        ` : ''}
      </div>

      <!-- Khung chứa dạng Flexbox để mở rộng sang bên -->
      <div style="display:flex; gap:24px; transition: all 0.35s ease; align-items: stretch; justify-content: stretch; overflow: hidden;">
        
        <!-- Cột trái: Chi tiết thông tin bệnh nhân -->
        <div id="patient-detail-left" style="flex: 1 1 700px; max-height:65vh; overflow-y:auto; padding-right:8px; display:flex; flex-direction:column; gap:16px; text-align:left; transition: all 0.35s ease;">
          <!-- Hàng đầu: Ảnh & Hành chính -->
          <div style="display:flex;gap:20px;align-items:stretch;flex-wrap:wrap;">
            <!-- Khung ảnh mặc định FB -->
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;margin:0 auto;">
              <div style="width:140px;height:140px;border-radius:12px;border:1px solid #cbd5e1;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#e2e8f0;box-shadow:inset 0 2px 4px rgba(0,0,0,0.06);">
                <svg viewBox="0 0 100 100" style="width:100%;height:100%;fill:#94a3b8;background:#e2e8f0;">
                  <circle cx="50" cy="35" r="18" />
                  <path d="M50 60 c-18 0 -28 10 -28 22 h56 c0 -12 -10 -22 -28 -22 z" />
                </svg>
              </div>
              <span style="font-size:0.8rem;color:#64748b;margin-top:8px;font-weight:500;">Ảnh bệnh nhân</span>
            </div>

            <!-- 1. Hành chính -->
            <div style="flex:1;min-width:280px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;">
              <h4 style="margin:0 0 4px 0;color:#2563eb;font-size:1.02rem;font-weight:700;display:flex;align-items:center;gap:6px;border-bottom:1.5px solid #2563eb1f;padding-bottom:4px;"><img src="image/patient.png" style="width:16px;height:16px;"/> 1. Hành chính</h4>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;font-size:0.95rem;">
                <div>Giới tính: <b>${patient.gender || ''}</b></div>
                <div>Ngày sinh: <b>${patient.dob || ''}</b></div>
                <div>SĐT: <b>${patient.phone || 'Chưa nhập'}</b></div>
                <div>CCCD: <b>${patient.citizenId || patient.cccd || 'Chưa nhập'}</b></div>
                <div style="grid-column: span 2;">Mã số thẻ BHYT: <b>${patient.bhyt || 'Chưa nhập'}</b></div>
              </div>
            </div>
          </div>

          <!-- 2. Lưu trú -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
            <h4 style="margin:0 0 10px 0;color:#2563eb;font-size:1.02rem;font-weight:700;display:flex;align-items:center;gap:6px;border-bottom:1.5px solid #2563eb1f;padding-bottom:4px;"><img src="image/bed.png" style="width:16px;height:16px;"/> 2. Lưu trú</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:0.95rem;margin-top:8px;">
              <div>Lầu: <b>${patient.room ? String(patient.room).trim()[0] : 'Chưa rõ'}</b></div>
              <div>Phòng: <b>${patient.room || ''}</b></div>
              <div>Giường: <b>${patient.bed ? String(patient.bed).replace(/^giường\s+/i, '') : ''}</b></div>
            </div>
          </div>

          <!-- 3. Trạng thái điều trị -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
            <h4 style="margin:0 0 10px 0;color:#2563eb;font-size:1.02rem;font-weight:700;display:flex;align-items:center;gap:6px;border-bottom:1.5px solid #2563eb1f;padding-bottom:4px;"><img src="image/day.png" style="width:16px;height:16px;"/> 3. Trạng thái điều trị</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:0.95rem;margin-top:8px;">
              <div>Ngày nhập viện: <b>${patient.admissionDate || ''}</b></div>
              <div>Trạng thái: <b>${patient.status === 'discharged' ? 'Đã xuất viện' : 'Đang điều trị'}</b></div>
              <div>Ngày xuất viện: <b>${dischargeDate || 'Chưa xuất viện'}</b></div>
              ${isDischarged ? `<div style="grid-column: span 3; word-break:break-word; margin-top: 4px;">Tình trạng xuất viện: <span style="color:#555;font-weight:600;">${dischargeCondition || 'Chưa ghi'}</span></div>` : ''}
            </div>
          </div>

          <!-- 4. Y tế & Sinh hiệu -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
            <h4 style="margin:0 0 10px 0;color:#2563eb;font-size:1.02rem;font-weight:700;display:flex;align-items:center;gap:6px;border-bottom:1.5px solid #2563eb1f;padding-bottom:4px;"><img src="image/nurse.png" style="width:16px;height:16px;"/> 4. Y tế & Sinh hiệu</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;font-size:0.95rem;margin-top:8px;">
              <div>Bác sĩ điều trị: <b>${patient.doctor || 'Chưa phân công'}</b></div>
              <div>Chẩn đoán: <b>${patient.diagnosis || 'Chưa ghi'}</b></div>
              <div style="grid-column: span 2; display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; background: #fff; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 4px;">
                <div>Chiều cao: <b>${patient.height ? patient.height + ' cm' : 'Chưa nhập'}</b></div>
                <div>Cân nặng: <b>${patient.weight ? patient.weight + ' kg' : 'Chưa nhập'}</b></div>
                <div>Chỉ số BMI: <b style="color:${Number(bmiVal) >= 25 ? '#ef4444' : (Number(bmiVal) < 18.5 && bmiVal !== 'Chưa tính' ? '#f59e0b' : '#10b981')}">${bmiVal}</b></div>
              </div>
            </div>
          </div>

          <!-- 5. Tiền sử y khoa & An toàn -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
            <h4 style="margin:0 0 10px 0;color:#2563eb;font-size:1.02rem;font-weight:700;display:flex;align-items:center;gap:6px;border-bottom:1.5px solid #2563eb1f;padding-bottom:4px;"><img src="image/log.png" style="width:16px;height:16px;"/> 5. Tiền sử y khoa & An toàn</h4>
            <div style="display:grid;grid-template-columns:1fr 2fr 2fr;gap:12px;font-size:0.95rem;margin-top:8px;">
              <div>Nhóm máu: <b style="color:#ef4444;">${patient.bloodType || 'Chưa rõ'}</b></div>
              <div style="word-break:break-word;">Tiền sử dị ứng: <br/><span style="color:#ef4444;font-weight:600;">${patient.allergies || 'Không có'}</span></div>
              <div style="word-break:break-word;">Tiền sử bệnh lý nền: <br/><span style="color:#555;">${patient.medicalHistory || 'Không có'}</span></div>
            </div>
          </div>

          <!-- 6. Nghiệp vụ Khám bệnh & Cấp phát thuốc -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;position:relative;">
            <h4 style="margin:0 0 10px 0;color:#2563eb;font-size:1.02rem;font-weight:700;display:flex;align-items:center;gap:6px;border-bottom:1.5px solid #2563eb1f;padding-bottom:4px;"><img src="image/medicine.png" style="width:16px;height:16px;"/> 6. Khám bệnh & Cấp phát thuốc</h4>
            ${patient.prescription ? `
              <button class="print-prescription-modal-btn" data-id="${patient.id}" style="position:absolute;top:10px;right:14px;background:#ecfdf5;border:1px solid #10b981;border-radius:8px;padding:4px 12px;font-size:0.88rem;font-weight:600;color:#047857;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:0 2px 6px #10b98111;transition:all 0.2s;">
                <i class="fa-solid fa-print"></i> In đơn thuốc
              </button>
            ` : ''}
            <div style="display:grid;grid-template-columns:1fr 3fr;gap:12px;font-size:0.95rem;margin-top:8px;">
              <div>Mã bệnh ICD-10: <b>${patient.icdCode || 'Chưa gán'}</b></div>
              <div style="word-break:break-word;">Đơn thuốc / Ghi chú cấp phát: <br/><b style="color:#1e3a8a;">${patient.prescription || 'Không có'}</b></div>
            </div>
          </div>
        </div>

        <!-- Cột phải: Nhật ký hoạt động & Bệnh án timeline -->
        <div id="patient-history-right" style="flex: 0 0 0px; width: 0; opacity: 0; pointer-events: none; overflow: hidden; display: flex; flex-direction: column; max-height: 65vh; border-left: 0px solid transparent; padding-left: 0; transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1); text-align: left;">
          <div style='padding-bottom:12px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; margin-bottom:12px;'>
            <b style="font-size:1.05rem; color:#0f172a; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-clock-rotate-left" style="color:#3b82f6;"></i>Nhật ký hoạt động & Bệnh án</b>
            <button id="close-history-section-btn" style="background:none; border:none; color:#94a3b8; font-size:1.4rem; cursor:pointer; padding:0; line-height:1; transition:color 0.2s;">&times;</button>
          </div>
          <div id='history-content-panel' style='overflow-y:auto; flex:1; padding-right:4px;'></div>
        </div>
      </div>

      <div style="margin-top:18px; border-top:1px solid #f1f5f9; padding-top:14px; text-align:left;">
        <button id="toggle-delivery-history" style="background:#f3f4f6;border:none;border-radius:8px;padding:8px 18px;font-weight:600;color:#2563eb;cursor:pointer;box-shadow:0 2px 8px #2563eb11; transition:all 0.2s;">Lịch sử & Nhật ký hoạt động</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Đóng modal khi click nút đóng hoặc click ra ngoài
  modal.querySelector('#close-patient-detail-modal').onclick = () => {
    modal.remove();
  };
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  };

  // Xử lý nút Chỉnh sửa
  const editBtn = modal.querySelector('#edit-patient-btn');
  if (editBtn) {
    editBtn.onclick = () => {
      modal.remove();
      const event = new CustomEvent('edit-patient-trigger', { detail: { patientId: patient.id } });
      document.dispatchEvent(event);
    };
  }

  // Xử lý nút In đơn thuốc trong modal
  const printPrescriptionModalBtn = modal.querySelector('.print-prescription-modal-btn');
  if (printPrescriptionModalBtn) {
    printPrescriptionModalBtn.onclick = async () => {
      try {
        const { downloadPrescriptionWord } = await import("../utils/prescriptionPrint.js");
        downloadPrescriptionWord(patient);
        const { showToast } = await import("../utils/ui.js");
        showToast(`Đã tải file Đơn thuốc (.doc) cho bệnh nhân ${patient.name}.`);
      } catch (error) {
        console.error("Lỗi khi tải đơn thuốc:", error);
        const { showToast } = await import("../utils/ui.js");
        showToast("Không thể tải đơn thuốc.");
      }
    };
  }

  // Xử lý mở/đóng lịch sử y khoa dạng mở rộng ngay trong modal
  const btn = modal.querySelector('#toggle-delivery-history');
  const historyRight = modal.querySelector('#patient-history-right');
  const historyContent = modal.querySelector('#history-content-panel');
  const closeHistoryBtn = modal.querySelector('#close-history-section-btn');
  const card = modal.querySelector('.modal-card');
  let isHistoryOpen = false;

  const closeHistory = () => {
    isHistoryOpen = false;
    btn.textContent = 'Lịch sử & Nhật ký hoạt động';
    btn.style.background = '#f3f4f6';
    btn.style.color = '#2563eb';
    
    // Thu hẹp modal card về kích thước ban đầu
    card.style.width = "min(880px, 95vw)";
    card.style.maxWidth = "880px";
    
    // Thu hẹp và ẩn panel lịch sử
    historyRight.style.flex = "0 0 0px";
    historyRight.style.width = "0";
    historyRight.style.opacity = "0";
    historyRight.style.pointerEvents = "none";
    historyRight.style.borderLeft = "0px solid transparent";
    historyRight.style.paddingLeft = "0";
  };

  const openHistory = async () => {
    isHistoryOpen = true;
    btn.textContent = 'Đóng nhật ký hoạt động';
    btn.style.background = '#2563eb';
    btn.style.color = '#fff';
    
    // Mở rộng modal card để chứa thêm panel lịch sử
    card.style.width = "min(1320px, 95vw)";
    card.style.maxWidth = "1320px";
    
    // Mở rộng và hiển thị panel lịch sử
    historyRight.style.flex = "1 1 440px";
    historyRight.style.width = "440px";
    historyRight.style.opacity = "1";
    historyRight.style.pointerEvents = "auto";
    historyRight.style.borderLeft = "1.5px solid #cbd5e1";
    historyRight.style.paddingLeft = "24px";
    
    historyContent.innerHTML = '<div style="color:#888;padding:18px 0;display:flex;align-items:center;gap:8px;"><span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>Đang tải dữ liệu...</div>';
    
    try {
      const { getPatientDeliveryHistory } = await import('../utils/deliveryHistory.js');
      const deliveryHistory = await getPatientDeliveryHistory(patient);
      
      const mappedDeliveries = deliveryHistory.map(item => {
        let dateStr = "";
        try {
          const date = item.createdAt ? new Date(item.createdAt) : new Date();
          if (date && !isNaN(date.getTime())) {
            const pad = (n) => String(n).padStart(2, '0');
            dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
          }
        } catch (err) {
          console.error("Lỗi parse thời gian giao thuốc:", err);
        }
        
        let medicineStr = '';
        if (Array.isArray(item.medicines)) {
          medicineStr = item.medicines.map(m => typeof m === 'string' ? m : (m.name + (m.dosage ? ' ('+m.dosage+')' : ''))).join(', ');
        } else if (typeof item.medicines === 'string') {
          medicineStr = item.medicines;
        }
        
        return {
          time: dateStr || item.time || "",
          type: "delivery",
          detail: `Giao thuốc qua ngăn ${item.slot || '—'}. Thuốc: ${medicineStr || 'Trống'}. Ghi chú: ${item.note || 'Không có'}.`,
          status: item.commandStatus || item.status || "delivering",
          actor: item.nurseName || item.actor || "Y tá"
        };
      });
      
      const internalHistory = Array.isArray(patient.history) ? patient.history : [];
      const mergedHistory = [...mappedDeliveries, ...internalHistory].sort((a, b) => {
        return String(b.time || "").localeCompare(String(a.time || ""));
      });

      if (!mergedHistory.length) {
        historyContent.innerHTML = '<div style="color:#888;padding:18px 0;text-align:center;">Chưa có lịch sử hoạt động bệnh lý nào.</div>';
      } else {
        historyContent.innerHTML = `
          <div class="timeline-container" style="padding: 10px 5px; font-family: inherit; font-size: 0.92rem; text-align: left;">
            <div style="position: relative; border-left: 2px solid #cbd5e1; margin-left: 12px; padding-left: 18px; display: flex; flex-direction: column; gap: 18px;">
              ${mergedHistory.map(item => {
                let icon = "fa-bell";
                let color = "#3b82f6";
                let bg = "#eff6ff";
                let title = "Hoạt động";
                
                switch (item.type) {
                  case "admit":
                    icon = "fa-hospital-user";
                    color = "#10b981";
                    bg = "#ecfdf5";
                    title = "Nhập viện";
                    break;
                  case "discharge":
                    icon = "fa-door-open";
                    color = "#ef4444";
                    bg = "#fef2f2";
                    title = "Xuất viện";
                    break;
                  case "transfer":
                    icon = "fa-bed-pulse";
                    color = "#8b5cf6";
                    bg = "#f5f3ff";
                    title = "Lịch sử chuyển phòng/giường";
                    break;
                  case "prescription":
                    icon = "fa-file-prescription";
                    color = "#f59e0b";
                    bg = "#fffbeb";
                    title = "Lịch sử thêm thuốc";
                    break;
                  case "condition":
                    icon = "fa-stethoscope";
                    color = "#06b6d4";
                    bg = "#ecfeff";
                    title = "Tình trạng bệnh nhân";
                    break;
                  case "delivery":
                    icon = "fa-robot";
                    color = "#0284c7";
                    bg = "#f0f9ff";
                    title = "Robot giao thuốc";
                    break;
                }
                
                let statusBadge = "";
                if (item.type === "delivery" && item.status) {
                  let badgeColor = "#64748b";
                  let badgeBg = "#f1f5f9";
                  let badgeText = "Đang giao";
                  if (item.status === "success" || item.status === "thành công" || item.status === "delivered") {
                    badgeColor = "#047857";
                    badgeBg = "#d1fae5";
                    badgeText = "Thành công";
                  } else if (item.status === "failed" || item.status === "thất bại") {
                    badgeColor = "#b91c1c";
                    badgeBg = "#fef2f2";
                    badgeText = "Thất bại";
                  }
                  statusBadge = `<span style="font-size:0.72rem; font-weight:700; color:${badgeColor}; background:${badgeBg}; padding:2px 6px; border-radius:999px; margin-left:8px; border:1px solid currentColor;">${badgeText}</span>`;
                }
                
                return `
                  <div style="position: relative;">
                    <div style="position: absolute; left: -29px; top: 10px; width: 20px; height: 20px; border-radius: 50%; background: ${bg}; border: 2px solid ${color}; display: flex; align-items: center; justify-content: center; color: ${color}; box-shadow: 0 0 0 4px #fff; z-index: 1;">
                      <i class="fa-solid ${icon}" style="font-size: 0.68rem;"></i>
                    </div>
                    
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.015); text-align:left;">
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 0.8rem; color: #94a3b8; font-weight: 500;">
                        <span>${item.time}</span>
                        <span style="font-weight: 600; color: #475569;"><i class="fa-solid fa-user-md" style="margin-right:4px;"></i>${item.actor || "Hệ thống"}</span>
                      </div>
                      
                      <div style="font-weight: 800; font-size: 0.92rem; color: #1e293b; display: flex; align-items: center; flex-wrap:wrap;">
                        ${title} ${statusBadge}
                      </div>
                      
                      <div style="font-size: 0.88rem; color: #334155; margin-top: 6px; line-height: 1.45; word-break: break-word;">
                        ${item.detail}
                      </div>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }
    } catch (e) {
      console.error("Lỗi khi tải lịch sử hoạt động:", e);
      historyContent.innerHTML = '<div style="color:#e53e3e;padding:18px 0;">Lỗi tải dữ liệu lịch sử hoạt động.</div>';
    }
  };

  btn.onclick = () => {
    if (isHistoryOpen) {
      closeHistory();
    } else {
      openHistory();
    }
  };

  if (closeHistoryBtn) {
    closeHistoryBtn.onclick = closeHistory;
  }
}
// ============================================
// PATIENT VIEW - Render UI bệnh nhân
// ============================================

import {
  formatPatientStatus,
} from "../utils/formatter.js";
import authService from "../services/authService.js";


export function renderPatientView(container, patients, isModalVisible = false, editingPatient = null, currentTab = 'admitted') {
  // Tab bar
  const tabBar = `
    <div style="display:flex;gap:12px;margin-bottom:18px;">
      <button class="patient-tab${currentTab==='admitted' ? ' active' : ''}" data-tab="admitted" style="padding:8px 22px;border-radius:8px;border:none;background:${currentTab==='admitted' ? '#2563eb':'#e0e7ef'};color:${currentTab==='admitted' ? '#fff':'#2563eb'};font-weight:700;font-size:1.05rem;">Đang điều trị</button>
      <button class="patient-tab${currentTab==='discharged' ? ' active' : ''}" data-tab="discharged" style="padding:8px 22px;border-radius:8px;border:none;background:${currentTab==='discharged' ? '#2563eb':'#e0e7ef'};color:${currentTab==='discharged' ? '#fff':'#2563eb'};font-weight:700;font-size:1.05rem;">Đã xuất viện</button>
    </div>
  `;

  const canCreatePatient = authService.can("patients.create");

  // Lọc bệnh nhân theo tab
  let filteredPatients = patients;
  if (currentTab === 'admitted') {
    filteredPatients = patients.filter(p => p.status !== 'discharged');
  } else if (currentTab === 'discharged') {
    filteredPatients = patients.filter(p => p.status === 'discharged');
  }

  // Sắp xếp: nhập viện lên trên, xuất viện xuống dưới
  const sortedPatients = [...filteredPatients].sort((a, b) => {
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

  // Table rows mapping
  const tableRows = pagedPatients.map((p, idx) => {
    const stt = (currentPage - 1) * pageSize + idx + 1;
    let bedNum = p.bed;
    if (typeof bedNum === 'string') {
      const match = bedNum.match(/\d+/);
      bedNum = match ? match[0] : bedNum;
    }

    return `
      <tr class="patient-row-clickable ${p.status === "discharged" ? "discharged-row" : ""}" data-id="${p.id || ""}" style="cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.15s;">
        <td style="padding: 14px 16px; text-align: center; color: #64748b; font-weight: 500;">${stt}</td>
        <td style="padding: 14px 16px;">
          <div style="font-weight: 600; color: #1e293b; font-size: 0.98rem;">${p.name}</div>
        </td>
        <td style="padding: 14px 16px; color: #334155; font-size: 0.95rem;">${p.dob || 'Chưa nhập'}</td>
        <td style="padding: 14px 16px; color: #334155; font-size: 0.95rem; text-transform: capitalize;">${p.gender || ''}</td>
        <td style="padding: 14px 16px; color: #334155; font-size: 0.95rem;">${p.phone || 'Chưa nhập'}</td>
        <td style="padding: 14px 16px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.92rem; color: #475569; background: #f1f5f9; padding: 3px 8px; border-radius: 6px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.8; margin-right: 2px;">
                <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"></path>
                <path d="M2 20h20"></path>
                <path d="M14 12v.01" stroke-width="3.5"></path>
              </svg> Phòng ${p.room}
            </span>
            <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.92rem; color: #475569; background: #f1f5f9; padding: 3px 8px; border-radius: 6px;">
              <img src="image/bed.png" alt="Giường" style="width: 14px; height: 14px; opacity: 0.7;"/> Giường ${bedNum}
            </span>
          </div>
        </td>
        <td style="padding: 14px 16px; color: #334155; font-size: 0.95rem; font-weight: 500;">${p.doctor || 'Chưa phân công'}</td>
        <td style="padding: 14px 16px; text-align: center;">${statusBadge(p.status)}</td>
        <td style="padding: 14px 16px; text-align: center;" class="action-cell">
          <button class="open-actions-popup-btn" data-id="${p.id}" type="button">
            Thao tác <i class="fa-solid fa-chevron-right" style="font-size: 0.75rem;"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");

  const tableHtml = `
    <div class="table-wrap" style="background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; margin-bottom: 24px; overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; border-spacing: 0;">
        <thead>
          <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
            <th style="padding: 14px 16px; font-weight: 700; color: #475569; font-size: 0.95rem; text-align: center; width: 60px;">STT</th>
            <th style="padding: 14px 16px; font-weight: 700; color: #475569; font-size: 0.95rem;">Họ tên</th>
            <th style="padding: 14px 16px; font-weight: 700; color: #475569; font-size: 0.95rem; width: 115px;">Ngày sinh</th>
            <th style="padding: 14px 16px; font-weight: 700; color: #475569; font-size: 0.95rem; width: 90px;">Giới tính</th>
            <th style="padding: 14px 16px; font-weight: 700; color: #475569; font-size: 0.95rem; width: 135px;">Số điện thoại</th>
            <th style="padding: 14px 16px; font-weight: 700; color: #475569; font-size: 0.95rem; width: 220px;">Phòng / Giường</th>
            <th style="padding: 14px 16px; font-weight: 700; color: #475569; font-size: 0.95rem;">Bác sĩ điều trị</th>
            <th style="padding: 14px 16px; font-weight: 700; color: #475569; font-size: 0.95rem; width: 140px; text-align: center;">Trạng thái</th>
            <th style="padding: 14px 16px; font-weight: 700; color: #475569; font-size: 0.95rem; width: 120px; text-align: center;">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || `<tr><td colspan="9" style="padding:24px;text-align:center;color:#888;">Không có dữ liệu.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  // Tổng số bệnh nhân nhập viện/xuất viện
  const admittedCount = patients.filter(p => p.status === "admitted").length;
  const dischargedCount = patients.filter(p => p.status === "discharged").length;

  container.innerHTML = `
    <div class="card patient-stats-summary" aria-label="Thống kê bệnh nhân">
      <div class="patient-stat-cell">
        <div class="patient-stat-row">
          <img src="image/people.png" alt="" class="patient-stat-icon" width="26" height="26"/>
          <span class="patient-stat-value patient-stat-value--total">${patients.length}</span>
        </div>
        <span class="patient-stat-label">Tổng</span>
      </div>
      <div class="patient-stat-cell">
        <div class="patient-stat-row">
          <img src="image/patient.png" alt="" class="patient-stat-icon" width="26" height="26"/>
          <span class="patient-stat-value patient-stat-value--admitted">${admittedCount}</span>
        </div>
        <span class="patient-stat-label">Đang điều trị</span>
      </div>
      <div class="patient-stat-cell">
        <div class="patient-stat-row">
          <img src="image/checked.png" alt="" class="patient-stat-icon" width="26" height="26"/>
          <span class="patient-stat-value patient-stat-value--discharged">${dischargedCount}</span>
        </div>
        <span class="patient-stat-label">Đã xuất viện</span>
      </div>
    </div>

    <div class="card patient-toolbar-card" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div class="filter-group">
        <select id="patient-status-filter">
          <option value="all">Tất cả trạng thái</option>
          <option value="admitted">Nhập viện</option>
          <option value="discharged">Xuất viện</option>
        </select>
        <input id="patient-name-filter" type="text" placeholder="Lọc theo tên bệnh nhân" />
        <input id="patient-room-filter" type="text" placeholder="Lọc theo phòng (vd: 101)" />
        <button id="apply-patient-filter" class="ghost-btn" type="button"><img src="image/filter.png" alt="Lọc" class="icon-img" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;"/><span>Lọc</span></button>
        <button id="reset-patient-filter" class="ghost-btn" type="button"><img src="image/undo.png" alt="Đặt lại" class="icon-img" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;"/><span>Đặt lại</span></button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button id="print-patient-list-btn" class="ghost-btn" type="button"><img src="image/excel.png" alt="In danh sách" class="icon-img" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;"/><span>In danh sách</span></button>
        <button id="open-patient-modal" ${canCreatePatient ? "" : "disabled title='Bạn không có quyền thêm bệnh nhân'"}><img src="image/addpatient.png" alt="Thêm bệnh nhân" class="icon-img" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;"/><span>Thêm bệnh nhân</span></button>
      </div>
    </div>
    <div style="display:flex;justify-content:center;width:100%;margin:12px 0 18px 0;">
      <div style="display:flex;width:100%;max-width:100%;">
        <button class="patient-tab${currentTab==='admitted' ? ' active' : ''}" data-tab="admitted" style="flex:1 1 0;padding:7px 0;border-radius:18px 0 0 18px;border:none;background:${currentTab==='admitted' ? '#e0e7ef':'#f3f4f6'};color:${currentTab==='admitted' ? '#334155':'#64748b'};font-weight:600;font-size:1.01rem;transition:background 0.18s;box-shadow:none;">Đang điều trị</button>
        <button class="patient-tab${currentTab==='discharged' ? ' active' : ''}" data-tab="discharged" style="flex:1 1 0;padding:7px 0;border-radius:0 18px 18px 0;border:none;background:${currentTab==='discharged' ? '#e0e7ef':'#f3f4f6'};color:${currentTab==='discharged' ? '#334155':'#64748b'};font-weight:600;font-size:1.01rem;transition:background 0.18s;box-shadow:none;">Đã xuất viện</button>
      </div>
    </div>

    <!-- Modal overlay chọn thời gian in danh sách bệnh nhân -->

    <div id="print-patient-modal" class="modal-overlay">
      <div class="modal-card print-modal-card">
        <div class="print-modal-header">
          <span class="print-modal-icon"><i class="fa-solid fa-file-excel"></i></span>
          <h3>In danh sách bệnh nhân</h3>
        </div>
        <div class="print-modal-body">
          <div class="form-stack">
            <label for="print-from-date">Từ ngày:</label>
            <div class="input-icon-group">
              <input type="date" id="print-from-date" />
              <span class="input-icon"><i class="fa-regular fa-calendar"></i></span>
            </div>
            <label for="print-to-date">Đến ngày:</label>
            <div class="input-icon-group">
              <input type="date" id="print-to-date" />
              <span class="input-icon"><i class="fa-regular fa-calendar"></i></span>
            </div>
          </div>
        </div>
        <div class="print-modal-actions">
          <button id="print-patient-cancel" class="ghost-btn modal-cancel-btn" type="button"><img src="image/close.png" alt="Huỷ" class="icon-img" style="width:18px;height:18px;margin-right:7px;vertical-align:middle;"/>Huỷ</button>
          <button id="print-patient-confirm" class="main-btn modal-print-btn" type="button"><img src="image/printer.png" alt="In" class="icon-img" style="width:18px;height:18px;margin-right:7px;vertical-align:middle;"/>In</button>
        </div>
      </div>
    </div>

    <div id="room-select-modal" class="modal-overlay" style="display:none;align-items:center;justify-content:center;z-index:2000;">
      <div class="modal-card" style="width: min(1000px, 95vw); max-width:1100px; min-width:820px; padding:44px 44px 36px 44px;">
        <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:18px;">Chọn lầu và phòng</h3>
        <div style="display:flex;gap:0;align-items:stretch;justify-content:center;">
          <div style="display:flex;flex-direction:column;align-items:center;min-width:140px;max-width:160px;min-height:320px;">
            <div id="floor-list" style="display:flex;flex-direction:column;gap:12px;width:100%;"></div>
          </div>
          <div style="width:2px;background:#2563eb22;height:100%;margin:0 32px 0 32px;border-radius:2px;"></div>
          <div style="display:flex;flex-direction:column;align-items:center;min-width:420px;max-width:520px;min-height:180px;">
            <div id="room-list" style="display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;width:100%;justify-items:center;"></div>
          </div>
        </div>
        <div style="margin-top:22px;text-align:right;">
          <button type="button" id="room-modal-cancel" class="ghost-btn" style="margin-right:8px;">Huỷ</button>
        </div>
      </div>
    </div>

    <div id="bed-select-modal" class="modal-overlay" style="display:none;align-items:center;justify-content:center;z-index:2000;">
      <div class="modal-card" style="width: min(600px, 95vw); max-width:600px; min-width:400px; padding:36px; border-radius:18px; box-shadow:0 8px 40px #2563eb22;">
        <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:18px;">Chọn giường trống</h3>
        <div id="bed-list" style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;min-height:100px;margin-bottom:20px;"></div>
        <div style="text-align:right;">
          <button type="button" id="bed-modal-cancel" class="ghost-btn" style="margin-right:8px;">Huỷ</button>
        </div>
      </div>
    </div>

    ${tableHtml}
    <div class="pagination" id="patient-pagination" style="margin:12px 0;text-align:center;display:flex;align-items:center;justify-content:center;gap:4px;">
      <button id="first-page" ${currentPage===1?'disabled':''} title="Trang đầu"><img src="image/arrow2.png" alt="first" style="width:22px;height:22px;transform:rotate(180deg);opacity:${currentPage===1?0.4:1};"/></button>
      <button id="prev-page" ${currentPage===1?'disabled':''} title="Trang trước"><img src="image/arrow1.png" alt="prev" style="width:22px;height:22px;transform:rotate(180deg);opacity:${currentPage===1?0.4:1};"/></button>
      <span style="margin:0 8px;">Trang <b>${currentPage}</b> / ${totalPages}</span>
      <button id="next-page" ${currentPage===totalPages?'disabled':''} title="Trang sau"><img src="image/arrow1.png" alt="next" style="width:22px;height:22px;opacity:${currentPage===totalPages?0.4:1};"/></button>
      <button id="last-page" ${currentPage===totalPages?'disabled':''} title="Trang cuối"><img src="image/arrow2.png" alt="last" style="width:22px;height:22px;opacity:${currentPage===totalPages?0.4:1};"/></button>
    </div>

    <style>
      .badge-green { background: #d1fae5; color: #065f46; }
      .badge-gray { background: #e5e7eb; color: #374151; }
      .pagination button { margin: 0 2px; padding: 2px 10px; border-radius: 4px; border: 1px solid #ddd; background: #fff; cursor: pointer; font-size: 18px; }
      .pagination button[disabled] { opacity: 0.5; cursor: not-allowed; }
      .patient-tab.active { box-shadow: 0 2px 8px #2563eb33; }
      .patient-row-clickable:hover { background-color: #f1f5f9 !important; }
    </style>

    <div id="patient-modal" class="modal-overlay ${isModalVisible && !editingPatient ? "show" : ""}">
      <div class="modal-card" style="max-width:800px; width:95vw;">
        <h3>Thêm bệnh nhân mới</h3>
        <form id="patient-modal-form" class="patient-modal-form">
          <div style="max-height: 70vh; overflow-y: auto; padding-right: 8px; display: flex; flex-direction: column; gap: 16px; text-align: left;">
            
            <!-- Hàng đầu: Ảnh & Hành chính -->
            <div style="display: flex; gap: 20px; align-items: stretch; flex-wrap: wrap;">
              <!-- Khung Ảnh (Mặc định Facebook) -->
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; margin: 0 auto;">
                <div style="width: 140px; height: 140px; border-radius: 12px; border: 1.5px solid #cbd5e1; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #e2e8f0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.06);">
                  <svg viewBox="0 0 100 100" style="width: 100%; height: 100%; fill: #94a3b8; background: #e2e8f0;">
                    <circle cx="50" cy="35" r="18" />
                    <path d="M50 60 c-18 0 -28 10 -28 22 h56 c0 -12 -10 -22 -28 -22 z" />
                  </svg>
                </div>
                <span style="font-size: 0.8rem; color: #64748b; margin-top: 8px; font-weight: 500;">Ảnh bệnh nhân</span>
              </div>

              <!-- 1. Hành chính -->
              <div style="flex: 1; min-width: 280px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc; display: flex; flex-direction: column; gap: 8px;">
                <div style="font-weight: 700; color: #2563eb; margin-bottom: 4px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/patient.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>1. Hành chính</div>
                
                <div class="field-wrap">
                  <label for="modal-patient-name">Tên bệnh nhân</label>
                  <input id="modal-patient-name" name="name" type="text" placeholder="Nhập tên bệnh nhân" required />
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
                    <label for="modal-patient-phone">Số điện thoại</label>
                    <input id="modal-patient-phone" name="phone" type="text" placeholder="Nhập số điện thoại" pattern="[0-9+ ]{8,20}" />
                  </div>
                  <div class="field-wrap">
                    <label for="modal-patient-citizen-id">Căn cước công dân</label>
                    <input id="modal-patient-citizen-id" name="citizenId" type="text" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Nhập số CCCD (9 hoặc 12 số)" pattern="[0-9]{9,12}" title="Chỉ gồm 9 hoặc 12 chữ số" />
                  </div>
                </div>

                <div class="field-wrap">
                  <label for="modal-patient-bhyt">Bảo hiểm y tế (số thẻ BHYT)</label>
                  <input id="modal-patient-bhyt" name="bhyt" type="text" autocomplete="off" maxlength="25" placeholder="Nhập mã số thẻ BHYT (nếu có)" inputmode="numeric" />
                </div>
              </div>
            </div>

            <!-- 2. Lưu trú -->
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc;">
              <div style="font-weight: 700; color: #2563eb; margin-bottom: 12px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/bed.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>2. Lưu trú</div>
              <div class="row-2">
                <div class="field-wrap">
                  <label for="modal-patient-room">Chọn phòng</label>
                  <input id="modal-patient-room" name="room" type="text" placeholder="Chọn phòng" required readonly style="background:#f8fafd;cursor:pointer;" />
                </div>
                <div class="field-wrap">
                  <label for="modal-patient-bed">Chọn giường</label>
                  <input id="modal-patient-bed" name="bed" type="text" placeholder="Chọn giường" required readonly style="background:#f8fafd;cursor:pointer;" />
                </div>
              </div>
            </div>

            <!-- 3. Trạng thái điều trị -->
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc;">
              <div style="font-weight: 700; color: #2563eb; margin-bottom: 12px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/day.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>3. Trạng thái điều trị</div>
              <div class="row-2">
                <div class="field-wrap">
                  <label for="modal-patient-admission">Ngày nhập viện</label>
                  <input id="modal-patient-admission" name="admissionDate" type="date" required />
                </div>
                <div class="field-wrap">
                  <label for="modal-patient-status">Trạng thái</label>
                  <div style="padding: 10px 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #fff; color: #222; font-size: 16px;">Nhập viện</div>
                  <input type="hidden" id="modal-patient-status" name="status" value="admitted" />
                </div>
              </div>
            </div>

            <!-- 4. Y tế & Sinh hiệu -->
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc;">
              <div style="font-weight: 700; color: #2563eb; margin-bottom: 12px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/nurse.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>4. Y tế & Sinh hiệu</div>
              <div class="field-wrap">
                <label for="modal-patient-doctor">Bác sĩ điều trị chính</label>
                <input id="modal-patient-doctor" name="doctor" type="text" placeholder="Nhập tên bác sĩ điều trị chính" value="${authService.getCurrentUser() ? authService.getCurrentUser().fullName : ''}" />
              </div>
              <div class="field-wrap" style="margin-top: 8px;">
                <label for="modal-patient-diagnosis">Chẩn đoán chung</label>
                <input id="modal-patient-diagnosis" name="diagnosis" type="text" placeholder="Nhập chẩn đoán sơ bộ" />
              </div>
              <div class="row-3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px;">
                <div class="field-wrap">
                  <label for="modal-patient-height">Chiều cao (cm)</label>
                  <input id="modal-patient-height" name="height" type="number" step="0.1" placeholder="Ví dụ: 170" min="10" max="300" />
                </div>
                <div class="field-wrap">
                  <label for="modal-patient-weight">Cân nặng (kg)</label>
                  <input id="modal-patient-weight" name="weight" type="number" step="0.1" placeholder="Ví dụ: 60" min="1" max="500" />
                </div>
                <div class="field-wrap">
                  <label for="modal-patient-bmi">Chỉ số BMI</label>
                  <input id="modal-patient-bmi" name="bmi" type="text" placeholder="Tự động tính" readonly style="background:#e2e8f0;font-weight:700;" />
                </div>
              </div>
            </div>

            <!-- 5. Tiền sử y khoa & An toàn -->
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc;">
              <div style="font-weight: 700; color: #2563eb; margin-bottom: 12px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/log.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>5. Tiền sử y khoa & An toàn</div>
              <div class="field-wrap">
                <label for="modal-patient-bloodtype">Nhóm máu</label>
                <select id="modal-patient-bloodtype" name="bloodType">
                  <option value="">-- Chọn nhóm máu --</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="AB">AB</option>
                  <option value="O">O</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
              <div class="field-wrap" style="margin-top: 8px;">
                <label for="modal-patient-allergies">Tiền sử dị ứng (Thuốc, thức ăn,...)</label>
                <textarea id="modal-patient-allergies" name="allergies" rows="2" placeholder="Nhập các chất/thuốc gây dị ứng nếu có" style="width:100%;border:1px solid #d0d7de;border-radius:6px;padding:8px;font-size:15px;resize:vertical;box-sizing:border-box;"></textarea>
              </div>
              <div class="field-wrap" style="margin-top: 8px;">
                <label for="modal-patient-history">Tiền sử bệnh lý nền</label>
                <textarea id="modal-patient-history" name="medicalHistory" rows="2" placeholder="Ví dụ: Tiểu đường tuýp 2, Cao huyết áp..." style="width:100%;border:1px solid #d0d7de;border-radius:6px;padding:8px;font-size:15px;resize:vertical;box-sizing:border-box;"></textarea>
              </div>
            </div>

            <!-- 6. Nghiệp vụ Khám bệnh & Cấp phát thuốc -->
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc;">
              <div style="font-weight: 700; color: #2563eb; margin-bottom: 12px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/medicine.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>6. Khám bệnh & Cấp phát thuốc</div>
              <div class="field-wrap">
                <label for="modal-patient-icd">Mã bệnh ICD-10</label>
                <input id="modal-patient-icd" name="icdCode" type="text" placeholder="Ví dụ: E11 (Tiểu đường), I10 (Cao huyết áp)" />
              </div>
              <div class="field-wrap" style="margin-top: 8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <label for="modal-patient-prescription" style="margin-bottom:0;">Đơn thuốc / Ghi chú cấp phát</label>
                  <button type="button" id="modal-select-medicine-btn" style="background:none;border:none;color:#2563eb;font-weight:700;font-size:0.92rem;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:4px;"><img src="image/medicine.png" style="width:14px;height:14px;vertical-align:middle;"/>Chọn từ danh mục</button>
                </div>
                <textarea id="modal-patient-prescription" name="prescription" rows="3" placeholder="Nhập danh sách thuốc và liều lượng, giờ cấp phát..." style="width:100%;border:1px solid #d0d7de;border-radius:6px;padding:8px;font-size:15px;resize:vertical;box-sizing:border-box;"></textarea>
              </div>
            </div>
          </div>

          <div class="modal-actions" style="margin-top:16px;">
            <button type="button" class="ghost-btn modal-cancel" id="patient-modal-cancel"><img src="image/close.png" alt="Hủy" class="icon-img" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;"/><span>Hủy</span></button>
            <button type="submit"><img src="image/addpatient.png" alt="Thêm bệnh nhân" class="icon-img" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;"/><span>Thêm bệnh nhân</span></button>
          </div>
        </form>
      </div>
    </div>

    <div id="patient-edit-modal" class="modal-overlay ${editingPatient ? "show" : ""}">
      <div class="modal-card" style="max-width:800px; width:95vw;">
        <h3 style="margin-bottom:12px;">Chỉnh sửa bệnh nhân</h3>
        <form id="patient-edit-modal-form" class="patient-modal-form">
          <input type="hidden" id="edit-patient-id" value="${editingPatient ? editingPatient.id : ""}" />
          
          <div style="max-height: 70vh; overflow-y: auto; padding-right: 8px; display: flex; flex-direction: column; gap: 16px; text-align: left;">
            
            <!-- Hàng đầu: Ảnh & Hành chính -->
            <div style="display: flex; gap: 20px; align-items: stretch; flex-wrap: wrap;">
              <!-- Khung Ảnh (Mặc định Facebook) -->
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; margin: 0 auto;">
                <div style="width: 140px; height: 140px; border-radius: 12px; border: 1.5px solid #cbd5e1; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #e2e8f0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.06);">
                  <svg viewBox="0 0 100 100" style="width: 100%; height: 100%; fill: #94a3b8; background: #e2e8f0;">
                    <circle cx="50" cy="35" r="18" />
                    <path d="M50 60 c-18 0 -28 10 -28 22 h56 c0 -12 -10 -22 -28 -22 z" />
                  </svg>
                </div>
                <span style="font-size: 0.8rem; color: #64748b; margin-top: 8px; font-weight: 500;">Ảnh bệnh nhân</span>
              </div>

              <!-- 1. Hành chính -->
              <div style="flex: 1; min-width: 280px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc; display: flex; flex-direction: column; gap: 8px;">
                <div style="font-weight: 700; color: #2563eb; margin-bottom: 4px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/patient.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>1. Hành chính</div>
                
                <div class="field-wrap">
                  <label for="edit-patient-name">Tên bệnh nhân</label>
                  <input id="edit-patient-name" name="name" type="text" placeholder="Nhập tên bệnh nhân" value="${editingPatient ? editingPatient.name : ""}" required />
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
                    <label for="edit-patient-phone">Số điện thoại</label>
                    <input id="edit-patient-phone" name="phone" type="text" placeholder="Nhập số điện thoại" value="${editingPatient ? editingPatient.phone : ""}" pattern="[0-9+ ]{8,20}" />
                  </div>
                  <div class="field-wrap">
                    <label for="edit-patient-citizen-id">Căn cước công dân</label>
                    <input id="edit-patient-citizen-id" name="citizenId" type="text" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Nhập số CCCD (9 hoặc 12 số)" value="${editingPatient ? (editingPatient.citizenId || editingPatient.cccd || "") : ""}" pattern="[0-9]{9,12}" title="Chỉ gồm 9 hoặc 12 chữ số" />
                  </div>
                </div>

                <div class="field-wrap">
                  <label for="edit-patient-bhyt">Bảo hiểm y tế (số thẻ BHYT)</label>
                  <input id="edit-patient-bhyt" name="bhyt" type="text" autocomplete="off" maxlength="25" placeholder="Nhập mã số thẻ BHYT (nếu có)" value="${editingPatient ? (editingPatient.bhyt || "") : ""}" inputmode="numeric" />
                </div>
              </div>
            </div>

            <!-- 2. Lưu trú -->
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc;">
              <div style="font-weight: 700; color: #2563eb; margin-bottom: 12px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/bed.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>2. Lưu trú</div>
              <div class="row-2">
                <div class="field-wrap">
                  <label for="edit-patient-room">Chọn phòng</label>
                  <input id="edit-patient-room" name="room" type="text" placeholder="Chọn phòng" value="${editingPatient ? editingPatient.room : ""}" required readonly style="background:#f8fafd;cursor:pointer;" />
                </div>
                <div class="field-wrap">
                  <label for="edit-patient-bed">Chọn giường</label>
                  <input id="edit-patient-bed" name="bed" type="text" placeholder="Chọn giường" value="${editingPatient ? editingPatient.bed : ""}" required readonly style="background:#f8fafd;cursor:pointer;" />
                </div>
              </div>
            </div>

            <!-- 3. Trạng thái điều trị -->
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc;">
              <div style="font-weight: 700; color: #2563eb; margin-bottom: 12px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/day.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>3. Trạng thái điều trị</div>
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
              <div class="field-wrap" style="margin-top: 8px;">
                <label for="edit-patient-status">Trạng thái</label>
                <select id="edit-patient-status" name="status" required>
                  <option value="admitted" ${editingPatient && editingPatient.status === "admitted" ? "selected" : ""}>Nhập viện (Đang điều trị)</option>
                  <option value="discharged" ${editingPatient && editingPatient.status === "discharged" ? "selected" : ""}>Xuất viện (Đã xuất viện)</option>
                </select>
              </div>
            </div>

            <!-- 4. Y tế & Sinh hiệu -->
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc;">
              <div style="font-weight: 700; color: #2563eb; margin-bottom: 12px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/nurse.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>4. Y tế & Sinh hiệu</div>
              <div class="field-wrap">
                <label for="edit-patient-doctor">Bác sĩ điều trị chính</label>
                <input id="edit-patient-doctor" name="doctor" type="text" placeholder="Nhập tên bác sĩ điều trị chính" value="${editingPatient ? (editingPatient.doctor || (authService.getCurrentUser() ? authService.getCurrentUser().fullName : '')) : ''}" />
              </div>
              <div class="field-wrap" style="margin-top: 8px;">
                <label for="edit-patient-diagnosis">Chẩn đoán chung</label>
                <input id="edit-patient-diagnosis" name="diagnosis" type="text" placeholder="Nhập chẩn đoán sơ bộ hoặc chi tiết" value="${editingPatient ? (editingPatient.diagnosis || "") : ""}" />
              </div>
              <div class="row-3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px;">
                <div class="field-wrap">
                  <label for="edit-patient-height">Chiều cao (cm)</label>
                  <input id="edit-patient-height" name="height" type="number" step="0.1" placeholder="Ví dụ: 170" value="${editingPatient ? (editingPatient.height || "") : ""}" min="10" max="300" />
                </div>
                <div class="field-wrap">
                  <label for="edit-patient-weight">Cân nặng (kg)</label>
                  <input id="edit-patient-weight" name="weight" type="number" step="0.1" placeholder="Ví dụ: 60" value="${editingPatient ? (editingPatient.weight || "") : ""}" min="1" max="500" />
                </div>
                <div class="field-wrap">
                  <label for="edit-patient-bmi">Chỉ số BMI</label>
                  <input id="edit-patient-bmi" name="bmi" type="text" placeholder="Tự động tính" value="${editingPatient ? (editingPatient.bmi || "") : ""}" readonly style="background:#e2e8f0;font-weight:700;" />
                </div>
              </div>
            </div>

            <!-- 5. Tiền sử y khoa & An toàn -->
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc;">
              <div style="font-weight: 700; color: #2563eb; margin-bottom: 12px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/log.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>5. Tiền sử y khoa & An toàn</div>
              <div class="field-wrap">
                <label for="edit-patient-bloodtype">Nhóm máu</label>
                <select id="edit-patient-bloodtype" name="bloodType">
                  <option value="" ${editingPatient && !editingPatient.bloodType ? "selected" : ""}>-- Chọn nhóm máu --</option>
                  <option value="A" ${editingPatient && editingPatient.bloodType === "A" ? "selected" : ""}>A</option>
                  <option value="B" ${editingPatient && editingPatient.bloodType === "B" ? "selected" : ""}>B</option>
                  <option value="AB" ${editingPatient && editingPatient.bloodType === "AB" ? "selected" : ""}>AB</option>
                  <option value="O" ${editingPatient && editingPatient.bloodType === "O" ? "selected" : ""}>O</option>
                  <option value="A+" ${editingPatient && editingPatient.bloodType === "A+" ? "selected" : ""}>A+</option>
                  <option value="A-" ${editingPatient && editingPatient.bloodType === "A-" ? "selected" : ""}>A-</option>
                  <option value="B+" ${editingPatient && editingPatient.bloodType === "B+" ? "selected" : ""}>B+</option>
                  <option value="B-" ${editingPatient && editingPatient.bloodType === "B-" ? "selected" : ""}>B-</option>
                  <option value="AB+" ${editingPatient && editingPatient.bloodType === "AB+" ? "selected" : ""}>AB+</option>
                  <option value="AB-" ${editingPatient && editingPatient.bloodType === "AB-" ? "selected" : ""}>AB-</option>
                  <option value="O+" ${editingPatient && editingPatient.bloodType === "O+" ? "selected" : ""}>O+</option>
                  <option value="O-" ${editingPatient && editingPatient.bloodType === "O-" ? "selected" : ""}>O-</option>
                </select>
              </div>
              <div class="field-wrap" style="margin-top: 8px;">
                <label for="edit-patient-allergies">Tiền sử dị ứng (Thuốc, thức ăn,...)</label>
                <textarea id="edit-patient-allergies" name="allergies" rows="2" placeholder="Nhập các chất/thuốc gây dị ứng nếu có" style="width:100%;border:1px solid #d0d7de;border-radius:6px;padding:8px;font-size:15px;resize:vertical;box-sizing:border-box;">${editingPatient ? (editingPatient.allergies || "") : ""}</textarea>
              </div>
              <div class="field-wrap" style="margin-top: 8px;">
                <label for="edit-patient-history">Tiền sử bệnh lý nền</label>
                <textarea id="edit-patient-history" name="medicalHistory" rows="2" placeholder="Ví dụ: Tiểu đường tuýp 2, Cao huyết áp..." style="width:100%;border:1px solid #d0d7de;border-radius:6px;padding:8px;font-size:15px;resize:vertical;box-sizing:border-box;">${editingPatient ? (editingPatient.medicalHistory || "") : ""}</textarea>
              </div>
            </div>

            <!-- 6. Nghiệp vụ Khám bệnh & Cấp phát thuốc -->
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #f8fafc;">
              <div style="font-weight: 700; color: #2563eb; margin-bottom: 12px; font-size: 1rem; border-bottom: 1.5px solid #2563eb1f; padding-bottom: 4px;"><img src="image/medicine.png" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"/>6. Khám bệnh & Cấp phát thuốc</div>
              <div class="field-wrap">
                <label for="edit-patient-icd">Mã bệnh ICD-10</label>
                <input id="edit-patient-icd" name="icdCode" type="text" placeholder="Ví dụ: E11 (Tiểu đường), I10 (Cao huyết áp)" value="${editingPatient ? (editingPatient.icdCode || "") : ""}" />
              </div>
              <div class="field-wrap" style="margin-top: 8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <label for="edit-patient-prescription" style="margin-bottom:0;">Đơn thuốc / Ghi chú cấp phát</label>
                  <button type="button" id="edit-select-medicine-btn" style="background:none;border:none;color:#2563eb;font-weight:700;font-size:0.92rem;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:4px;"><img src="image/medicine.png" style="width:14px;height:14px;vertical-align:middle;"/>Chọn từ danh mục</button>
                </div>
                <textarea id="edit-patient-prescription" name="prescription" rows="3" placeholder="Nhập danh sách thuốc và liều lượng, giờ cấp phát..." style="width:100%;border:1px solid #d0d7de;border-radius:6px;padding:8px;font-size:15px;resize:vertical;box-sizing:border-box;">${editingPatient ? (editingPatient.prescription || "") : ""}</textarea>
              </div>
            </div>
          </div>

          <div class="modal-actions" style="margin-top:16px;">
            <button type="button" class="ghost-btn modal-cancel" id="patient-edit-modal-cancel"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Hủy</span></button>
            <button type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i><span>Lưu</span></button>
          </div>
        </form>
      </div>
    </div>
  `;
}
