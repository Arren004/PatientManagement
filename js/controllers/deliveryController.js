// ============================================
// DELIVERY CONTROLLER - Xử lý events giao thuốc
// ============================================

import deliveryService from "../services/deliveryService.js";
import patientService from "../services/patientService.js";
import { renderDeliveryView } from "../views/deliveryView.js";
import { showToast, showConfirmModal } from "../utils/ui.js";
import dbService from "../services/dbService.js";
const firebaseService = dbService;
import robotService from "../services/robotService.js";
import authService from "../services/authService.js";
import stateService from "../services/stateService.js";
import { getRobotCompartmentCount, createEmptyDeliveryBin } from "../data/constants.js";

const DELIVERY_SELECTED_ROBOT_KEY = "delivery-selected-robot-id";

function getDeliveryCommandTimestamp(cmd) {
  if (!cmd) return 0;
  if (cmd.createdAt) {
    const t = Date.parse(cmd.createdAt);
    if (!isNaN(t)) return t;
  }
  const id = cmd._id || cmd.id;
  if (id && typeof id === "string") {
    const parts = id.split("_");
    if (parts.length > 1) {
      const ts = parseInt(parts[1], 10);
      if (!isNaN(ts)) return ts;
    }
  }
  return 0;
}

function syncInstructionChips(container, noteText) {
  if (!container) return;
  const lower = (noteText || "").toLowerCase();
  container.querySelectorAll(".common-instruction-btn").forEach((btn) => {
    const v = (btn.dataset.value || "").toLowerCase();
    btn.classList.toggle("chip-active", Boolean(v && lower.includes(v)));
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

class DeliveryController {
  constructor() {
    this.viewContainer = document.getElementById("view-delivery");
    this.unsubscribeDeliveryCommands = null;
    this.robots = [];
    this.selectedRobotId = "";
    this.deliveryCommands = [];
    this.isSelectedRobotDelivering = false;
    this.configuringBinIndex = null;
    
    // Planning state
    this.isPlanningMode = false;
    this.showPresetModal = false;
    this.planningPlanId = null;
    this.planningPlanName = "";
    this.planningBins = [];
    this.planningCompartmentsCount = 4;
    this.selectedPresetId = "";
    this.presets = [];
    this.presetSearchQuery = "";
    this.loadPresets();

    // Tự động render lại khi stateService thay đổi (chỉ khi đang ở tab giao thuốc)
    import("../services/stateService.js").then(({ default: stateService }) => {
      stateService.subscribe(() => {
        if (this.viewContainer && this.viewContainer.offsetParent !== null) {
          this.renderView();
        }
      });
    });
  }

  init() {
    if (this.unsubscribeDeliveryCommands) this.unsubscribeDeliveryCommands();
    this.unsubscribeDeliveryCommands = firebaseService.listenDeliveryCommandsRealtime((commands) => {
      this.deliveryCommands = Array.isArray(commands) ? commands : [];
      deliveryService.syncMissionLifecycle(this.deliveryCommands);
      this.renderView();
    });
  }

  loadPresets() {
    try {
      const raw = localStorage.getItem("smart-hospital-delivery-presets");
      this.presets = raw ? JSON.parse(raw) : [];
    } catch (_) {
      this.presets = [];
    }
  }

  savePresetsToStorage() {
    try {
      localStorage.setItem("smart-hospital-delivery-presets", JSON.stringify(this.presets));
    } catch (_) {}
  }

  getBins() {
    if (this.isPlanningMode) {
      return this.planningBins;
    }
    const sel = this.selectedRobotId;
    const activeCommand = this.deliveryCommands && [...this.deliveryCommands]
      .filter((cmd) => cmd.status === "delivering" && String(cmd.robotId || "") === String(sel))
      .sort((a, b) => getDeliveryCommandTimestamp(b) - getDeliveryCommandTimestamp(a))[0];
    if (activeCommand && Array.isArray(activeCommand.bins)) {
      const selectedRobotObj = this.robots.find((r) => String(r.id) === String(sel));
      const compartmentCount = getRobotCompartmentCount(selectedRobotObj);
      const bins = Array.from({ length: compartmentCount }, () => createEmptyDeliveryBin());
      activeCommand.bins.forEach((b) => {
        const idx = b.slot - 1;
        if (idx >= 0 && idx < compartmentCount) {
          bins[idx] = {
            patientId: b.patientId || "",
            patientName: b.patientName || "",
            room: b.room || "",
            bed: b.bed || "",
            note: b.note || "",
            medicines: Array.isArray(b.medicines) ? b.medicines : [],
            status: b.status || "delivering"
          };
        }
      });
      return bins;
    }
    return deliveryService.getDeliveryBins();
  }

  isBinLocked(index) {
    if (this.isPlanningMode) return false;
    if (this.isSelectedRobotDelivering) return true;
    return deliveryService.isBinLockedForSelectedRobot(index, this.selectedRobotId);
  }

  updateBin(index, field, value) {
    if (this.isPlanningMode) {
      if (index >= 0 && index < this.planningBins.length) {
        this.planningBins[index][field] = value;
        return { success: true };
      }
      return { success: false, message: "Ngăn không hợp lệ." };
    } else {
      return deliveryService.updateBin(index, field, value, this.selectedRobotId);
    }
  }

  clearBin(index) {
    if (this.isPlanningMode) {
      if (index >= 0 && index < this.planningBins.length) {
        this.planningBins[index] = { patientId: "", note: "", medicines: [] };
        return { success: true, message: "Đã xóa dữ liệu ngăn." };
      }
      return { success: false, message: "Ngăn không hợp lệ." };
    } else {
      return deliveryService.clearBin(index, this.selectedRobotId);
    }
  }

  savePreset(name, compartments) {
    const trimmed = String(name || "").trim();
    if (!trimmed) {
      showToast("Vui lòng nhập tên kế hoạch.");
      return false;
    }
    
    const hasData = compartments.some(c => c.patientId && (c.note || "").trim());
    if (!hasData) {
      showToast("Kế hoạch phải có ít nhất 1 ngăn đã chọn bệnh nhân và nhập ghi chú.");
      return false;
    }

    if (this.planningPlanId) {
      const idx = this.presets.findIndex(p => String(p.id) === String(this.planningPlanId));
      if (idx >= 0) {
        this.presets[idx].name = trimmed;
        this.presets[idx].compartments = compartments.map(c => ({
          patientId: c.patientId,
          note: c.note,
          medicines: Array.isArray(c.medicines) ? [...c.medicines] : []
        }));
        showToast("Đã cập nhật kế hoạch giao thuốc.");
      }
    } else {
      const newPreset = {
        id: "preset_" + Date.now(),
        name: trimmed,
        compartments: compartments.map(c => ({
          patientId: c.patientId,
          note: c.note,
          medicines: Array.isArray(c.medicines) ? [...c.medicines] : []
        }))
      };
      this.presets.push(newPreset);
      showToast("Đã lưu kế hoạch giao thuốc mới.");
    }
    
    this.savePresetsToStorage();
    return true;
  }

  deletePreset(id) {
    this.presets = this.presets.filter(p => String(p.id) !== String(id));
    this.savePresetsToStorage();
    showToast("Đã xóa kế hoạch.");
    this.renderView(true);
  }

  async applyPreset(id) {
    const preset = this.presets.find(p => String(p.id) === String(id));
    if (!preset) {
      showToast("Không tìm thấy kế hoạch.");
      return;
    }
    
    const activeBins = deliveryService.getDeliveryBins();
    const activeLen = activeBins.length;
    const presetLen = preset.compartments.length;
    
    if (presetLen > activeLen) {
      showToast(`Cảnh báo: Kế hoạch có ${presetLen} ngăn nhưng robot đang chọn chỉ có ${activeLen} ngăn. Chỉ áp dụng ${activeLen} ngăn đầu tiên.`);
    }
    
    const patients = patientService.getPatients();
    
    for (let i = 0; i < activeLen; i++) {
      if (i < presetLen) {
        const pc = preset.compartments[i];
        const patientExists = pc.patientId ? patients.some(p => String(p.id) === String(pc.patientId) && p.status === "admitted") : false;
        
        activeBins[i] = {
          patientId: patientExists ? pc.patientId : "",
          note: patientExists ? pc.note : "",
          medicines: patientExists && Array.isArray(pc.medicines) ? [...pc.medicines] : [],
          status: ""
        };
      } else {
        activeBins[i] = createEmptyDeliveryBin();
      }
    }
    
    deliveryService.saveBins(activeBins);
    showToast("Đã áp dụng kế hoạch thành công.");
    this.renderView(true);
  }

  applyPatientPrescription(index, patient) {
    if (!patient || !patient.prescription || !patient.prescription.trim()) return;
    const prescriptionText = patient.prescription.trim();
    
    // Tách đơn thuốc thành các dòng để phân tích
    const lines = prescriptionText.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    const parsedMeds = [];
    const instructions = [];
    
    lines.forEach(line => {
      // Phân tách các phần bằng dấu gạch ngang (chấp nhận cả các ký tự gạch ngang khác nhau)
      const lineParts = line.split(/\s*[-–—]\s*/);
      
      // 1. Phân tích tên thuốc và liều lượng ở phần đầu tiên
      const firstPart = lineParts[0] || "";
      let name = firstPart;
      let dosage = "";
      const match = firstPart.match(/^([^(]+)(?:\(([^)]+)\))?/);
      if (match) {
        name = match[1].trim();
        dosage = match[2] ? match[2].trim() : "";
      }
      
      let quantity = "";
      let instruction = "";
      
      if (lineParts.length >= 3) {
        // Định dạng chuẩn: Tên thuốc - Số lượng - Hướng dẫn
        quantity = lineParts[1].trim();
        instruction = lineParts.slice(2).join(" - ").trim();
      } else if (lineParts.length === 2) {
        // Định dạng rút gọn: Tên thuốc - Hướng dẫn hoặc Tên thuốc - Số lượng
        const secondPart = lineParts[1].trim();
        const isQty = secondPart.toLowerCase().includes("viên") || 
                      secondPart.toLowerCase().includes("vien") || 
                      /^\d+$/.test(secondPart);
        if (isQty) {
          quantity = secondPart;
        } else {
          instruction = secondPart;
        }
      }
      
      if (name) {
        parsedMeds.push({ 
          name, 
          dosage,
          quantity: quantity || undefined
        });
      }
      
      if (instruction) {
        instructions.push(instruction);
      }
    });
    
    // Lọc các hướng dẫn uống thuốc trùng lặp hoặc con của nhau
    const uniqueInstructions = [];
    instructions.forEach(ins => {
      const subParts = ins.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
      subParts.forEach(sub => {
        if (!uniqueInstructions.includes(sub)) {
          uniqueInstructions.push(sub);
        }
      });
    });
    
    // Đổ hướng dẫn uống thuốc gọn gàng vào note (hướng dẫn giao thuốc)
    const finalNote = uniqueInstructions.length > 0 
      ? uniqueInstructions.join(", ") 
      : "";
    
    this.updateBin(index, "note", finalNote);
    
    if (parsedMeds.length > 0) {
      this.updateBin(index, "medicines", parsedMeds);
    }
    
    showToast(`Đã áp dụng đơn thuốc cho ${patient.name}`);
    this.renderView(true);
  }

  /* SỬA ĐỔI: Thêm cảnh báo khi giao thuốc thất bại (Toast + Audio) */
  playAlertSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // Beep cao
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.35); // Phát trong 0.35s
    } catch (err) {
      console.warn("Không thể phát âm thanh cảnh báo:", err);
    }
  }

  triggerFailureNotification(command) {
    if (!command || !Array.isArray(command.bins)) return;
    
    // Tìm các ngăn bị lỗi
    const failedBins = command.bins.filter(b => b.status === "failed");
    if (failedBins.length === 0) return;
    
    // Phát âm thanh
    this.playAlertSound();
    
    // Tìm robot
    const robot = this.robots.find(r => String(r.id) === String(command.robotId));
    const robotName = robot ? robot.name : "Robot";
    const displayRobotName = /robot/i.test(robotName) ? robotName : `Robot ${robotName}`;

    // Hiển thị Toast thông báo đỏ cho từng ngăn lỗi
    failedBins.forEach(b => {
      const reasonText = b.failureReason === "timeout" 
        ? "Quá thời gian chờ tại giường" 
        : b.failureReason === "navigation_error" 
          ? "Lỗi di chuyển (Kẹt đường)" 
          : "Robot gặp sự cố";
          
      this.showPersistentDangerToast(
        `Ngăn ${b.slot} trên ${displayRobotName} giao đến Phòng ${b.room || '—'} (Giường ${(b.bed || '—').replace(/^giường\s+/i, '')}) thất bại. Lý do: ${reasonText}`
      );
    });
  }

  showPersistentDangerToast(message) {
    // Tìm hoặc tạo container cho toast
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.style = "position: fixed; right: 18px; bottom: 18px; display: flex; flex-direction: column; gap: 10px; z-index: 100000; max-width: 420px; width: 90vw;";
      document.body.appendChild(container);
    }
    
    // Tạo toast
    const toast = document.createElement("div");
    toast.className = "toast show";
    toast.style = "position: static; opacity: 1; pointer-events: auto; display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: #fee2e2; border: 2px solid #ef4444; border-radius: 12px; color: #991b1b; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15); animation: rise 0.25s ease-out; box-sizing: border-box;";
    toast.innerHTML = `
      <div style="flex: 1; font-size: 0.9rem; font-weight: 700; line-height: 1.4; text-align: left;">
        <div style="display: flex; align-items: center; gap: 6px; font-size: 0.95rem; margin-bottom: 4px; color: #b91c1c;">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>GIAO THẤT BẠI</span>
        </div>
        <div style="font-weight: 600; color: #7f1d1d;">${message}</div>
      </div>
      <button type="button" style="background: none; border: none; color: #b91c1c; font-size: 1.4rem; font-weight: 800; cursor: pointer; padding: 0; line-height: 1; margin-top: -2px;" onclick="this.parentElement.remove()">
        &times;
      </button>
    `;
    
    container.appendChild(toast);
  }
  /* KẾT THÚC SỬA ĐỔI */

  async renderView(force = false) {
    if (!force) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        return;
      }
    }
    const active = document.activeElement;
    let noteFocusIndex = null;
    let selectionStart = null;
    let selectionEnd = null;
    if (active && active.classList && active.classList.contains("delivery-control-note")) {
      noteFocusIndex = active.dataset.index;
      selectionStart = active.selectionStart;
      selectionEnd = active.selectionEnd;
    }

    const bins = this.getBins();
    const patients = patientService.getPatients();
    const readyBinsCount = this.isPlanningMode
      ? bins.filter((bin) => bin.patientId && (bin.note || "").trim()).length
      : deliveryService.getReadyBinsCount();

    this.robots = robotService.getRobots();

    let persisted = "";
    try {
      persisted = sessionStorage.getItem(DELIVERY_SELECTED_ROBOT_KEY) || "";
    } catch (_) {
      persisted = "";
    }
    if (persisted && this.robots.some((r) => String(r.id) === String(persisted))) {
      this.selectedRobotId = persisted;
    } else if (this.selectedRobotId && !this.robots.some((r) => String(r.id) === String(this.selectedRobotId))) {
      this.selectedRobotId = "";
      try {
        sessionStorage.removeItem(DELIVERY_SELECTED_ROBOT_KEY);
      } catch (_) {}
    }
    if (!this.selectedRobotId && this.robots.length) {
      const firstOnline = this.robots.find((r) => r.online);
      if (firstOnline) this.selectedRobotId = firstOnline.id;
      else this.selectedRobotId = this.robots[0].id;
    }

    if (!this.isPlanningMode) {
      const selectedRobotObj = this.robots.find((r) => String(r.id) === String(this.selectedRobotId));
      stateService.syncDeliveryBinsToLength(getRobotCompartmentCount(selectedRobotObj));
    }

    const sel = this.selectedRobotId;
    this.isSelectedRobotDelivering =
      Boolean(sel) &&
      this.deliveryCommands.some(
        (cmd) => cmd.status === "delivering" && String(cmd.robotId || "") === String(sel)
      );

    const deliveringRobotIds = new Set(
      this.deliveryCommands
        .filter((cmd) => cmd.status === "delivering" && cmd.robotId != null && String(cmd.robotId).trim() !== "")
        .map((cmd) => String(cmd.robotId))
    );

    stateService.ensureDeliveryMissionMetaValid();
    const deliveryMissionRobotId = stateService.getState().deliveryMissionRobotId || null;

    renderDeliveryView(
      this.viewContainer,
      bins,
      patients,
      readyBinsCount,
      this.isSelectedRobotDelivering,
      this.robots,
      this.selectedRobotId,
      deliveryMissionRobotId,
      deliveringRobotIds,
      this.configuringBinIndex,
      this.isPlanningMode,
      this.planningPlanName,
      this.planningCompartmentsCount,
      this.presets,
      this.selectedPresetId,
      this.showPresetModal
    );

    this.setupEventListeners();
    this.updateReadyState();

    if (noteFocusIndex !== null) {
      const newTextarea = this.viewContainer.querySelector(`.delivery-control-note[data-index='${noteFocusIndex}']`);
      if (newTextarea) {
        newTextarea.focus();
        if (selectionStart !== null && selectionEnd !== null) {
          newTextarea.setSelectionRange(selectionStart, selectionEnd);
        }
      }
    }
  }

  setupEventListeners() {
    const patients = patientService.getPatients().filter(p => p.status === 'admitted');
    const bins = this.getBins();

    // Patient stepper selection modal
    this.viewContainer.querySelectorAll(".delivery-control-patient-search").forEach((input) => {
      const index = Number(input.dataset.index);
      const hiddenInput = this.viewContainer.querySelector(`.delivery-control-patient-id[data-index="${index}"]`);
      const currentPatientId = bins[index].patientId;
      const isBusy = this.isBinLocked(index);
      
      if (currentPatientId) {
        const patient = patients.find(p => String(p.id) === String(currentPatientId));
        if (patient) {
          input.value = patient.name;
          hiddenInput.value = currentPatientId;
        }
      }
      
      if (isBusy) return;
      
      input.onclick = () => {
        const modal = document.getElementById("patient-select-modal");
        if (!modal) return;
        
        import('../services/roomService.js').then(roomServiceModule => {
          roomServiceModule.default.getRooms().then(allRooms => {
            const allRoomNames = allRooms.map(r => r.name).filter(Boolean);
            
            const getFloorNumber = (roomName) => {
              if (!roomName) return 0;
              const match = String(roomName).match(/^(\d)/);
              return match ? parseInt(match[1]) : 0;
            };
            
            const floorNumbers = Array.from(new Set(allRoomNames.map(getFloorNumber))).filter(n => n > 0).sort((a, b) => a - b);
            const floors = floorNumbers.map(n => `Lầu ${n}`);
            const getFloorFromLabel = (label) => parseInt(label.replace(/\D/g, ""));
            
            let step = 1;
            let selectedFloor = null;
            let selectedRoom = null;
            
            const renderStepper = () => {
              modal.querySelectorAll('.stepper-step').forEach((el, idx) => {
                const circle = el.querySelector('.step-circle');
                const label = el.querySelector('.step-label');
                if (idx+1 === step) {
                  circle.style.background = '#2563eb';
                  circle.style.color = '#fff';
                  label.style.color = '#222';
                  label.style.fontWeight = '600';
                  circle.style.boxShadow = '0 2px 8px #2563eb22';
                } else {
                  circle.style.background = '#f3f4f6';
                  circle.style.color = '#bbb';
                  label.style.color = '#bbb';
                  label.style.fontWeight = '500';
                  circle.style.boxShadow = 'none';
                }
              });
            };
            
            const renderStepContent = () => {
              renderStepper();
              const content = modal.querySelector('#patient-step-content');
              if (step === 1) {
                content.innerHTML = `
                  <div style='font-size:18px;font-weight:600;margin-bottom:18px;'>Chọn lầu</div>
                  <div style='display:flex;flex-wrap:wrap;gap:24px;'>
                    ${floors.map(f => {
                      const floorNum = getFloorFromLabel(f);
                      const count = allRoomNames.filter(r => getFloorNumber(r) === floorNum).length;
                      return `<div class='floor-card' data-floor='${f}' style='flex:1 1 180px;min-width:160px;max-width:220px;cursor:pointer;background:#f8fbff;border-radius:14px;padding:24px 18px;box-shadow:0 2px 12px #2563eb11;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px solid #e5eaf2;transition:.2s;'>
                        <div style='font-size:22px;font-weight:700;color:#2563eb;margin-bottom:8px;'>${f}</div>
                        <div style='font-size:15px;color:#888;'>${count} phòng</div>
                      </div>`;
                    }).join('')}
                  </div>
                `;
                content.querySelectorAll('.floor-card').forEach(card => {
                  card.onclick = () => {
                    selectedFloor = card.getAttribute('data-floor');
                    step = 2;
                    renderStepContent();
                  };
                });
              } else if (step === 2) {
                const selectedFloorNum = getFloorFromLabel(selectedFloor);
                let filteredRooms = allRoomNames.filter(r => getFloorNumber(r) === selectedFloorNum);
                filteredRooms = filteredRooms.sort((a, b) => {
                  const numA = parseInt(a.replace(/\D/g, "")) || 0;
                  const numB = parseInt(b.replace(/\D/g, "")) || 0;
                  return numA - numB;
                });
                content.innerHTML = `
                  <button id='step-back' style='margin-bottom:12px;background:none;border:none;color:#2563eb;font-size:16px;cursor:pointer;'>&lt; Quay lại</button>
                  <div style='font-size:18px;font-weight:600;margin-bottom:18px;'>Chọn phòng (${selectedFloor})</div>
                  <div style='display:flex;flex-wrap:wrap;gap:18px;'>
                    ${filteredRooms.map(r => `<div class='room-card' data-room='${r}' style='flex:1 1 120px;min-width:100px;max-width:160px;cursor:pointer;background:#fff;border-radius:12px;padding:18px 10px;box-shadow:0 2px 8px #2563eb11;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px solid #e5eaf2;transition:.2s;'>
                      <div style='font-size:18px;font-weight:700;color:#2563eb;margin-bottom:4px;'>${r}</div>
                      <div style='font-size:14px;color:#888;'>${patients.filter(p=>p.room===r).length} bệnh nhân</div>
                    </div>`).join('')}
                  </div>
                `;
                content.querySelector('#step-back').onclick = () => {
                  step = 1;
                  renderStepContent();
                };
                content.querySelectorAll('.room-card').forEach(card => {
                  card.onclick = () => {
                    selectedRoom = card.getAttribute('data-room');
                    step = 3;
                    renderStepContent();
                  };
                });
              } else if (step === 3) {
                const filteredPatients = patients.filter(p => p.room === selectedRoom);
                content.innerHTML = `
                  <button id='step-back' style='margin-bottom:12px;background:none;border:none;color:#2563eb;font-size:16px;cursor:pointer;'>&lt; Quay lại</button>
                  <div style='font-size:18px;font-weight:600;margin-bottom:18px;'>Chọn bệnh nhân (Phòng ${selectedRoom})</div>
                  <input id='patient-search' type='text' placeholder='Tìm tên, mã, giường...' style='width:100%;margin-bottom:12px;padding:8px 12px;font-size:1rem;border-radius:8px;border:1px solid #e5eaf2;'>
                  <div id='patient-list' style='max-height:320px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:12px;padding:4px;'>
                    ${filteredPatients.map(p => `<div class='patient-card' data-id='${p.id}' style='display:flex;align-items:center;gap:16px;padding:12px 16px;cursor:pointer;transition:background .15s;min-width:0;max-width:none;width:100%;box-sizing:border-box;'>
                      <div style='width:38px;height:38px;border-radius:50%;background:#e5eaf2;display:flex;align-items:center;justify-content:center;font-weight:700;color:#2563eb;font-size:18px;'>${(p.name||'')[0]}</div>
                      <div style='flex:1;'>
                        <div style='font-size:16px;font-weight:700;'>${p.name}</div>
                        <div style='font-size:13px;color:#888;'>Giường ${(p.bed||'').replace(/^giường\s+/i, '')}</div>
                      </div>
                    </div>`).join('') || '<div style="color:#888;padding:18px 0;width:100%;">Không có bệnh nhân trong phòng này</div>'}
                  </div>
                `;
                content.querySelector('#step-back').onclick = () => {
                  step = 2;
                  renderStepContent();
                };
                const searchInputEl = content.querySelector('#patient-search');
                const listEl = content.querySelector('#patient-list');
                
                const attachPatientClick = (listContainer) => {
                  listContainer.querySelectorAll('.patient-card').forEach(card => {
                    card.onclick = () => {
                      const id = card.getAttribute('data-id');
                      const patient = patients.find(p => String(p.id) === String(id));
                      if (patient) {
                        const result = this.updateBin(index, "patientId", patient.id);
                        if (!result.success) {
                          showToast(result.message);
                          this.renderView();
                          return;
                        }
                        input.value = patient.name;
                        hiddenInput.value = patient.id;
                        modal.style.display = "none";
                        this.renderView(true);
                      }
                    };
                  });
                };
                
                attachPatientClick(listEl);
                
                searchInputEl.oninput = (e) => {
                  const q = e.target.value.toLowerCase();
                  const filtered = filteredPatients.filter(p =>
                    (p.name||'').toLowerCase().includes(q) ||
                    (p.id||'').toLowerCase().includes(q) ||
                    (p.bed||'').toLowerCase().includes(q)
                  );
                  listEl.innerHTML = filtered.map(p => `<div class='patient-card' data-id='${p.id}' style='display:flex;align-items:center;gap:16px;padding:12px 16px;cursor:pointer;transition:background .15s;min-width:0;max-width:none;width:100%;box-sizing:border-box;'>
                      <div style='width:38px;height:38px;border-radius:50%;background:#e5eaf2;display:flex;align-items:center;justify-content:center;font-weight:700;color:#2563eb;font-size:18px;'>${(p.name||'')[0]}</div>
                      <div style='flex:1;'>
                        <div style='font-size:16px;font-weight:700;'>${p.name}</div>
                        <div style='font-size:13px;color:#888;'>Giường ${(p.bed||'').replace(/^giường\s+/i, '')}</div>
                      </div>
                    </div>`).join('') || '<div style="color:#888;padding:18px 0;width:100%;">Không có bệnh nhân trong phòng này</div>';
                  attachPatientClick(listEl);
                };
              }
            };
            
            renderStepContent();
            modal.querySelector('#patient-modal-cancel').onclick = () => {
              modal.style.display = "none";
            };
          });
        });
        modal.style.display = "flex";
      };
    });

    // Medicine Selection autocomplete modal trigger
    this.viewContainer.querySelectorAll('.delivery-control-medicine-select').forEach(input => {
      const index = Number(input.dataset.index);
      const selected = Array.isArray(bins[index].medicines) ? bins[index].medicines : [];
      input.value = selected.map(m => m.name + (m.dosage ? ' ('+m.dosage+')' : '')).join(', ');
      this.setupMedicineSelectionForCompartment(input, index);
    });

    // Quick Apply Prescription
    this.viewContainer.querySelectorAll(".apply-prescription-btn").forEach((btn) => {
      btn.onclick = () => {
        const index = Number(btn.dataset.index);
        const currentBins = this.getBins();
        const patient = patients.find(p => String(p.id) === String(currentBins[index].patientId));
        if (patient) {
          this.applyPatientPrescription(index, patient);
        }
      };
    });

    // Common Instruction Buttons
    this.viewContainer.querySelectorAll(".common-instruction-btn").forEach((btn) => {
      btn.onclick = () => {
        const index = Number(btn.parentElement.dataset.index);
        const textarea = this.viewContainer.querySelector(`.delivery-control-note[data-index="${index}"]`);
        if (textarea) {
          let val = textarea.value.trim();
          const chipVal = btn.dataset.value;
          if (val.includes(chipVal)) {
            val = val.replace(chipVal, "").replace(/,\s*,/g, ",").replace(/^,\s*/, "").replace(/,\s*$/, "").trim();
          } else {
            val = val ? `${val}, ${chipVal}` : chipVal;
          }
          textarea.value = val;
          this.updateBin(index, "note", val);
          syncInstructionChips(btn.parentElement, val);
          this.updateReadyState();
        }
      };
    });

    // Textarea instructions
    this.viewContainer.querySelectorAll(".delivery-control-note").forEach((textarea) => {
      const index = Number(textarea.dataset.index);
      textarea.value = bins[index].note || "";
      const isBusy = this.isBinLocked(index);
      if (isBusy) return;
      textarea.oninput = (e) => {
        this.updateBin(index, "note", e.target.value);
        this.updateReadyState();
      };
    });

    // Clear Compartment buttons
    this.viewContainer.querySelectorAll(".clear-bin-btn").forEach((btn) => {
      btn.onclick = () => {
        const index = Number(btn.dataset.index);
        const result = this.clearBin(index);
        if (result.success) {
          showToast(result.message);
          this.renderView(true);
        } else {
          showToast(result.message);
        }
      };
    });

    // Cancel patient selection button
    this.viewContainer.querySelectorAll(".cancel-patient-btn").forEach((btn) => {
      btn.onclick = () => {
        const index = Number(btn.dataset.index);
        const result = this.updateBin(index, "patientId", "");
        if (result.success) {
          this.updateBin(index, "note", "");
          this.updateBin(index, "medicines", []);
          showToast("Đã huỷ chọn bệnh nhân.");
          this.renderView(true);
        } else {
          showToast(result.message);
        }
      };
    });

    // Robot selector dropdown
    const robotSelect = this.viewContainer.querySelector("#delivery-robot-select");
    if (robotSelect) {
      robotSelect.onchange = async () => {
        const nextRobotId = robotSelect.value;
        const draftBins = deliveryService.getDeliveryBins();
        const hasDraftData = !this.isSelectedRobotDelivering && draftBins.some(b => b.patientId && (b.note || "").trim());
        
        if (hasDraftData) {
          const ok = await showConfirmModal("Thay đổi robot sẽ thiết lập lại các ngăn đang nhập liệu dang dở. Bạn có chắc chắn?");
          if (!ok) {
            robotSelect.value = this.selectedRobotId;
            return;
          }
        }
        
        this.selectedRobotId = nextRobotId;
        try {
          sessionStorage.setItem(DELIVERY_SELECTED_ROBOT_KEY, nextRobotId);
        } catch (_) {}
        
        // Reset current bins on robot change
        const selectedRobotObj = this.robots.find((r) => String(r.id) === String(nextRobotId));
        stateService.syncDeliveryBinsToLength(getRobotCompartmentCount(selectedRobotObj));
        deliveryService.resetBinsAfterMission();
        
        this.renderView(true);
      };
    }

    // Open/Close compartment configuration modal
    this.viewContainer.querySelectorAll(".delivery-compartment").forEach((card) => {
      card.onclick = (e) => {
        if (e.target.classList.contains("clear-bin-btn") || e.target.closest(".open-lid-btn")) {
          return;
        }
        const index = Number(card.dataset.index);
        if (this.isBinLocked(index)) return;
        
        this.configuringBinIndex = index;
        this.renderView(true);
        
        // Highlight instruction chips
        const activeNoteText = bins[index] ? bins[index].note : "";
        syncInstructionChips(this.viewContainer.querySelector(".common-instructions"), activeNoteText);
      };
    });

    const configModal = this.viewContainer.querySelector("#bin-config-modal");
    if (configModal) {
      const closeBtn = configModal.querySelector("#close-bin-config-modal");
      const saveBtn = configModal.querySelector("#bin-config-save-btn");
      
      const closeModal = () => {
        this.configuringBinIndex = null;
        this.renderView(true);
      };
      
      if (closeBtn) closeBtn.onclick = closeModal;
      if (saveBtn) saveBtn.onclick = closeModal;
      configModal.onclick = (e) => {
        if (e.target === configModal) closeModal();
      };
    }

    // Start mission
    const startBtn = this.viewContainer.querySelector("#start-delivery-btn");
    const confirmModal = this.viewContainer.querySelector("#delivery-confirm-modal");
    
    if (startBtn && confirmModal) {
      const summaryList = confirmModal.querySelector("#delivery-confirm-summary");
      const leadText = confirmModal.querySelector("#delivery-confirm-lead");
      const cancelBtn = confirmModal.querySelector("#delivery-confirm-cancel");
      const okBtn = confirmModal.querySelector("#delivery-confirm-ok");

      const closeConfirmModal = () => {
        confirmModal.style.display = "none";
        confirmModal.classList.remove("show");
        if (summaryList) summaryList.innerHTML = "";
      };

      cancelBtn.onclick = closeConfirmModal;
      confirmModal.onclick = (e) => {
        if (e.target === confirmModal) closeConfirmModal();
      };

      startBtn.onclick = async () => {
        const readyBins = this.getBins().map((bin, idx) => ({ ...bin, slot: idx + 1 }))
                                        .filter(bin => bin.patientId && (bin.note || "").trim());
        
        if (!readyBins.length) {
          showToast("Vui lòng chọn bệnh nhân và nhập ghi chú trước khi gửi lệnh.");
          return;
        }

        // Populate summary
        if (summaryList) {
          summaryList.innerHTML = "";
          const patients = patientService.getPatients();
          readyBins.forEach(bin => {
            const patient = patients.find(p => String(p.id) === String(bin.patientId));
            const patientName = patient ? patient.name : "Không rõ";
            const room = patient ? patient.room : "---";
            const bed = patient ? patient.bed : "---";
            
            let medHtml = "";
            if (Array.isArray(bin.medicines) && bin.medicines.length) {
              const medListStr = bin.medicines.map(m => `<strong>${m.name}</strong> (${m.dosage || ''})`).join(', ');
              medHtml = `<div class="delivery-confirm-med">Đơn thuốc: ${medListStr}</div>`;
            } else {
              medHtml = `<div class="delivery-confirm-med delivery-confirm-warn">Chưa chọn thuốc</div>`;
            }
            
            const li = document.createElement("li");
            li.innerHTML = `
              <div class="delivery-confirm-row-title">
                <strong>Ngăn ${bin.slot}:</strong> Phòng ${room}, Giường ${String(bed).replace(/^giường\s+/i, '')} · <strong>${patientName}</strong>
              </div>
              ${medHtml}
              <div class="delivery-confirm-note-line">Ghi chú: ${bin.note || "---"}</div>
            `;
            summaryList.appendChild(li);
          });
        }

        if (leadText) {
          const robot = this.robots.find((r) => String(r.id) === String(this.selectedRobotId));
          const robotName = robot ? robot.name : "Robot";
          leadText.innerHTML = `Bạn chuẩn bị gửi lệnh giao thuốc cho robot <strong>${robotName}</strong> với <strong>${readyBins.length}</strong> ngăn:`;
        }

        confirmModal.style.display = "flex";
        confirmModal.classList.add("show");
      };

      okBtn.onclick = async () => {
        closeConfirmModal();
        startBtn.disabled = true;
        startBtn.classList.add("is-loading");
        
        const result = await deliveryService.startMission(this.selectedRobotId);
        startBtn.disabled = false;
        startBtn.classList.remove("is-loading");
        
        if (result.success) {
          showToast(result.message);
          import('../utils/ui.js').then(m => m.showSuccessCheckmark());
          this.renderView(true);
        } else {
          showToast(result.message);
        }
      };
    }

    // Individual lid open
    this.viewContainer.querySelectorAll(".open-lid-btn").forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const slot = Number(btn.dataset.index) + 1;
        if (!this.selectedRobotId) {
          showToast("Vui lòng chọn robot giao thuốc ở ô phía trên.");
          return;
        }
        
        const db = (await import('../services/dbService.js')).default;
        const result = await db.addDocument("deliveryCommands", {
          status: "open_lid",
          robotId: this.selectedRobotId,
          bins: [
            {
              slot: slot,
              patientName: "OPEN",
              room: "0",
              bed: "0",
              note: "OPEN",
              status: "open_lid"
            }
          ]
        });
        
        if (result.success) {
          showToast(`Đã gửi yêu cầu mở nắp ngăn ${slot}...`);
        } else {
          showToast("Gửi yêu cầu mở nắp thất bại.");
        }
      };
    });

    // Open All Lids
    const openAllBtn = this.viewContainer.querySelector("#open-all-lids-btn");
    if (openAllBtn) {
      openAllBtn.onclick = async () => {
        if (!this.selectedRobotId) {
          showToast("Vui lòng chọn robot giao thuốc ở ô phía trên.");
          return;
        }
        
        const db = (await import('../services/dbService.js')).default;
        const currentBins = this.getBins();
        const slotCount = currentBins.length;
        const binsData = [];

        for (let slot = 1; slot <= slotCount; slot++) {
          binsData.push({
            slot: slot,
            patientName: "OPEN",
            room: "0",
            bed: "0",
            note: "OPEN",
            status: "open_lid"
          });
        }

        const result = await db.addDocument("deliveryCommands", {
          status: "open_lid",
          robotId: this.selectedRobotId,
          bins: binsData
        });

        if (result.success) {
          showToast(`Đã gửi yêu cầu mở cả ${slotCount} ngăn cùng lúc...`);
        } else {
          showToast("Gửi yêu cầu mở tất cả ngăn thất bại.");
        }
      };
    }

    // ============================================
    // PRESET PLANS & PLANNING EVENT LISTENERS
    // ============================================
    const presetsTriggerBtn = this.viewContainer.querySelector("#presets-trigger-btn");
    if (presetsTriggerBtn) {
      presetsTriggerBtn.onclick = () => {
        this.showPresetModal = true;
        this.presetSearchQuery = "";
        this.renderView(true);
      };
    }

    const closePresetBtn = this.viewContainer.querySelector("#close-preset-modal");
    if (closePresetBtn) {
      closePresetBtn.onclick = () => {
        this.showPresetModal = false;
        this.presetSearchQuery = "";
        this.renderView(true);
      };
    }

    const modalClosePresetBtn = this.viewContainer.querySelector("#modal-close-preset-btn");
    if (modalClosePresetBtn) {
      modalClosePresetBtn.onclick = () => {
        this.showPresetModal = false;
        this.presetSearchQuery = "";
        this.renderView(true);
      };
    }

    const presetModal = this.viewContainer.querySelector("#preset-select-modal");
    if (presetModal) {
      presetModal.onclick = (e) => {
        if (e.target === presetModal) {
          this.showPresetModal = false;
          this.presetSearchQuery = "";
          this.renderView(true);
        }
      };
    }

    const presetSearchInput = this.viewContainer.querySelector("#preset-search-input");
    if (presetSearchInput) {
      const filterPresets = (query) => {
        const q = String(query || "").trim().toLowerCase();
        const container = this.viewContainer.querySelector("#presets-list-container");
        if (!container) return;
        const cards = container.querySelectorAll(".preset-item-card");
        let visibleCount = 0;
        
        cards.forEach((card) => {
          const nameEl = card.querySelector("h4");
          const name = nameEl ? nameEl.textContent.toLowerCase() : "";
          if (name.includes(q)) {
            card.style.display = "flex";
            visibleCount++;
          } else {
            card.style.display = "none";
          }
        });

        let noResultsEl = container.querySelector(".no-preset-results");
        if (visibleCount === 0 && cards.length > 0) {
          if (!noResultsEl) {
            noResultsEl = document.createElement("div");
            noResultsEl.className = "no-preset-results";
            noResultsEl.innerHTML = `
              <div style="text-align:center; padding:24px 12px; color:#94a3b8; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1; box-sizing:border-box; width: 100%;">
                <p style="margin:0; font-size:0.88rem; font-weight:600; color:#64748b;">Không tìm thấy kế hoạch phù hợp</p>
              </div>
            `;
            container.appendChild(noResultsEl);
          } else {
            noResultsEl.style.display = "block";
          }
        } else {
          if (noResultsEl) {
            noResultsEl.style.display = "none";
          }
        }
      };

      presetSearchInput.value = this.presetSearchQuery;
      filterPresets(this.presetSearchQuery);

      presetSearchInput.addEventListener("input", (e) => {
        this.presetSearchQuery = e.target.value;
        filterPresets(this.presetSearchQuery);
      });
      
      if (this.showPresetModal) {
        setTimeout(() => {
          if (document.activeElement !== presetSearchInput) {
            presetSearchInput.focus();
          }
        }, 100);
      }
    }

    const modalCreatePresetBtn = this.viewContainer.querySelector("#modal-create-preset-btn");
    if (modalCreatePresetBtn) {
      modalCreatePresetBtn.onclick = () => {
        this.showPresetModal = false;
        this.isPlanningMode = true;
        this.planningPlanId = null;
        this.planningPlanName = "";
        this.planningCompartmentsCount = 4;
        this.planningBins = Array.from({ length: this.planningCompartmentsCount }, () => ({
          patientId: "",
          note: "",
          medicines: []
        }));
        this.renderView(true);
      };
    }

    this.viewContainer.querySelectorAll(".modal-apply-preset-btn").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const ok = await showConfirmModal("Bạn có chắc chắn muốn áp dụng kế hoạch này? Thao tác này sẽ ghi đè lên các ngăn thuốc hiện tại.");
        if (ok) {
          this.showPresetModal = false;
          this.applyPreset(id);
        }
      };
    });

    this.viewContainer.querySelectorAll(".modal-edit-preset-btn").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const preset = this.presets.find(p => String(p.id) === String(id));
        if (preset) {
          this.showPresetModal = false;
          this.isPlanningMode = true;
          this.planningPlanId = preset.id;
          this.planningPlanName = preset.name;
          this.planningCompartmentsCount = preset.compartments.length;
          this.planningBins = preset.compartments.map(c => ({
            patientId: c.patientId || "",
            note: c.note || "",
            medicines: Array.isArray(c.medicines) ? [...c.medicines] : []
          }));
          this.renderView(true);
        }
      };
    });

    this.viewContainer.querySelectorAll(".modal-delete-preset-btn").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const ok = await showConfirmModal("Bạn có chắc chắn muốn xóa kế hoạch này?");
        if (ok) {
          this.deletePreset(id);
        }
      };
    });

    // Planning toolbar fields
    const planNameInput = this.viewContainer.querySelector("#planning-name-input");
    if (planNameInput) {
      planNameInput.oninput = (e) => {
        this.planningPlanName = e.target.value;
      };
    }

    const planSlotsSelect = this.viewContainer.querySelector("#planning-slots-select");
    if (planSlotsSelect) {
      planSlotsSelect.onchange = () => {
        const newCount = Number(planSlotsSelect.value);
        if (newCount !== this.planningCompartmentsCount) {
          const oldBins = this.planningBins;
          this.planningBins = Array.from({ length: newCount }, (_, i) => {
            if (i < oldBins.length) return oldBins[i];
            return { patientId: "", note: "", medicines: [] };
          });
          this.planningCompartmentsCount = newCount;
          this.renderView(true);
        }
      };
    }

    const planningCancelBtn = this.viewContainer.querySelector("#planning-cancel-btn");
    if (planningCancelBtn) {
      planningCancelBtn.onclick = () => {
        this.isPlanningMode = false;
        this.planningPlanId = null;
        this.planningPlanName = "";
        this.planningBins = [];
        this.renderView(true);
      };
    }

    const planningSaveBtn = this.viewContainer.querySelector("#planning-save-btn");
    if (planningSaveBtn) {
      planningSaveBtn.onclick = () => {
        const success = this.savePreset(this.planningPlanName, this.planningBins);
        if (success) {
          this.isPlanningMode = false;
          this.planningPlanId = null;
          this.planningPlanName = "";
          this.planningBins = [];
          this.renderView(true);
        }
      };
    }
  }

  setupMedicineSelectionForCompartment(input, index) {
    input.onclick = async () => {
      const { getAllMedicines, addMedicine } = await import('../services/medicineService.js');
      const allMedicines = await getAllMedicines();
      
      const bins = this.getBins();
      let selected = Array.isArray(bins[index].medicines) ? [...bins[index].medicines] : [];
      
      let modal = document.getElementById('medicine-select-modal');
      if (!modal) return;
      
      modal.style.display = "flex";
      modal.style.zIndex = "99999";
      
      const listPanel = modal.querySelector('.medicine-list-items');
      const selectedPanel = modal.querySelector('.medicine-selected-list');
      const searchInput = modal.querySelector('.medicine-list-search-input');
      
      const renderLists = () => {
        const filter = searchInput.value || '';
        const filtered = allMedicines.filter(m => m.name.toLowerCase().includes(filter.toLowerCase()));
        
        listPanel.innerHTML = filtered.map(med => {
          const isAlreadySelected = selected.some(s => s.name === med.name && s.dosage === med.dosage);
          const btnClass = isAlreadySelected ? "add-medicine-btn selected" : "add-medicine-btn";
          const btnText = isAlreadySelected ? "Đã chọn" : "+ Thêm";
          const btnDisabled = isAlreadySelected ? "disabled style='background:#d1fae5;color:#065f46;border-color:#bbf7d0;cursor:not-allowed;'" : "";
          
          return `<div class="medicine-list-item">
            <div class="medicine-item-info">
              <span class="medicine-item-name">${med.name}</span>
              ${med.dosage ? `<span class="medicine-item-dosage">${med.dosage}</span>` : ''}
            </div>
            <button type="button" class="${btnClass}" ${btnDisabled}>${btnText}</button>
          </div>`;
        }).join("");
        
        listPanel.querySelectorAll('.add-medicine-btn').forEach((addBtn, idx) => {
          if (addBtn.disabled) return;
          addBtn.onclick = () => {
            const med = filtered[idx];
            if (!selected.some(s => s.name === med.name && s.dosage === med.dosage)) {
              selected.push({
                name: med.name,
                dosage: med.dosage || "",
                qty: "14 Viên",
                usage: "Uống theo chỉ dẫn của bác sĩ"
              });
              renderLists();
            }
          };
        });
        
        const countBadge = modal.querySelector('#selected-meds-count');
        if (countBadge) countBadge.textContent = selected.length;
 
        if (selected.length === 0) {
          selectedPanel.innerHTML = `
            <div class="medicine-selected-empty">
              <i class="fa-solid fa-box-open"></i>
              <p>Chưa chọn thuốc nào.<br/>Hãy chọn từ danh sách bên trái.</p>
            </div>
          `;
          return;
        }
 
        selectedPanel.innerHTML = '';
        selected.forEach((med, idx) => {
          const row = document.createElement('div');
          row.className = 'medicine-selected-row';
          row.style = 'display:flex;flex-direction:column;gap:8px;align-items:stretch;';
          row.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
              <div class="medicine-item-info">
                <span class="medicine-item-name">${med.name}</span>
                ${med.dosage ? `<span class="medicine-item-dosage">${med.dosage}</span>` : ''}
              </div>
              <button type="button" class="remove-medicine-btn">&times;</button>
            </div>
            <div style="display:flex;gap:8px;margin-top:2px;width:100%;">
              <input type="text" class="med-qty-input" placeholder="SL (Ví dụ: 14 viên)" value="${med.qty || '14 Viên'}" style="flex:1;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;font-size:0.82rem;min-width:0;" />
              <input type="text" class="med-usage-input" placeholder="Cách dùng (Ví dụ: Uống sau ăn)" value="${med.usage || 'Uống theo chỉ dẫn của bác sĩ'}" style="flex:2;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;font-size:0.82rem;min-width:0;" />
            </div>
          `;
          row.querySelector('.med-qty-input').oninput = (e) => {
            med.qty = e.target.value;
          };
          row.querySelector('.med-usage-input').oninput = (e) => {
            med.usage = e.target.value;
          };
          row.querySelector('.remove-medicine-btn').onclick = () => {
            selected.splice(idx, 1);
            renderLists();
          };
          selectedPanel.appendChild(row);
        });
      };
      
      searchInput.value = '';
      searchInput.oninput = renderLists;
      renderLists();
      
      modal.querySelector('.medicine-modal-ok-btn').onclick = () => {
        this.updateBin(index, "medicines", selected);
        input.value = selected.map(m => m.name + (m.dosage ? ' ('+m.dosage+')' : '')).join(', ');
        modal.style.display = "none";
        this.renderView(true);
      };
      
      modal.querySelector('.medicine-modal-cancel-btn').onclick = () => {
        modal.style.display = "none";
      };
      
      modal.querySelector('.add-new-medicine-btn').onclick = () => {
        modal.querySelector('.medicine-add-form').style.display = 'block';
      };
      
      modal.querySelector('.medicine-add-cancel-btn').onclick = () => {
        modal.querySelector('.medicine-add-form').style.display = 'none';
      };
      
      const addForm = modal.querySelector('.medicine-add-form');
      const addName = modal.querySelector('.medicine-add-name');
      const addDosage = modal.querySelector('.medicine-add-dosage');
      const addSaveBtn = modal.querySelector('.medicine-add-save-btn');
      
      addSaveBtn.onclick = async () => {
        const name = addName.value.trim();
        const dosage = addDosage.value.trim();
        if (!name) {
          alert('Vui lòng nhập tên thuốc!');
          addName.focus();
          return;
        }
        const res = await addMedicine({ name, dosage });
        if (res.success) {
          allMedicines.push({ name, dosage });
          selected.push({
            name,
            dosage,
            qty: "14 Viên",
            usage: "Uống theo chỉ dẫn của bác sĩ"
          });
          addName.value = '';
          addDosage.value = '';
          addForm.style.display = 'none';
          renderLists();
        } else {
          alert(res.message || 'Lỗi khi thêm thuốc!');
        }
      };
    };
  }

  updateReadyState() {
    const readyCount = this.getBins().filter((bin) => bin.patientId && (bin.note || "").trim()).length;
    const readyText = this.viewContainer.querySelector("#ready-bins-text");
    const startBtn = this.viewContainer.querySelector("#start-delivery-btn");
    
    const totalSlots = Math.max(1, this.getBins().length);
    if (readyText) {
      readyText.innerHTML = `<strong>${readyCount}/${totalSlots}</strong> ngăn đủ điều kiện gửi lệnh`;
    }

    const meterFill = this.viewContainer.querySelector("#delivery-ready-meter-fill");
    if (meterFill) {
      const pct = Math.min(100, Math.max(0, (readyCount / totalSlots) * 100));
      meterFill.style.width = `${pct}%`;
    }

    if (startBtn) {
      const canStart = authService.can("delivery.start");
      const robot = this.robots.find((r) => String(r.id) === String(this.selectedRobotId));
      const offline = robot && robot.online === false;
      const loading = startBtn.classList.contains("is-loading");
      startBtn.disabled =
        loading ||
        !readyCount ||
        !canStart ||
        this.isSelectedRobotDelivering ||
        !this.selectedRobotId ||
        offline;
    }
  }
}

const deliveryControllerInstance = new DeliveryController();
if (typeof window !== "undefined") {
  window.deliveryControllerInstance = deliveryControllerInstance;
}
export default deliveryControllerInstance;
