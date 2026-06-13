// ============================================
// DELIVERY SERVICE - Quản lý ngăn thuốc
// ============================================

import stateService from "./stateService.js";
import authService from "./authService.js";
import logService from "./logService.js";
import { createEmptyDeliveryBin, DEFAULT_ROBOT_COMPARTMENTS, getRobotCompartmentCount } from "../data/constants.js";
import dbService from "./dbService.js";
const firebaseService = dbService;
import patientService from "./patientService.js";

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

class DeliveryService {
  _binHasBusyStatus(bin) {
    const s = bin && bin.status;
    return s === "đang giao" || s === "delivering";
  }

  /**
   * Ngăn bị khóa chỉnh sửa khi đang giao cho đúng robot đang xem (deliveryMissionRobotId === selectedRobotId).
   * Khi chọn robot khác, có thể chỉnh nháp dù cờ bin vẫn là delivering từ robot trước.
   */
  isBinLockedForSelectedRobot(index, selectedRobotId) {
    const state = stateService.getState();
    stateService.ensureDeliveryMissionMetaValid();
    const bin = state.deliveryBins[index];
    if (!this._binHasBusyStatus(bin)) return false;
    const mid = state.deliveryMissionRobotId;
    if (mid && selectedRobotId && String(mid) !== String(selectedRobotId)) {
      return false;
    }
    return true;
  }

  // Lấy danh sách ngăn thuốc
  getDeliveryBins() {
    const state = stateService.getState();
    stateService.ensureDeliveryBinsValid();
    return state.deliveryBins;
  }

  // Cập nhật ngăn thuốc (selectedRobotId: bắt buộc khi gọi từ màn giao thuốc để xử lý đa robot)
  updateBin(index, field, value, selectedRobotId) {
    if (!authService.can("delivery.edit")) {
      return { success: false, message: "Không có quyền chỉnh sửa ngăn thuốc." };
    }

    const state = stateService.getState();
    if (index < 0 || index >= state.deliveryBins.length) {
      return { success: false, message: "Ngăn không hợp lệ." };
    }
    if (this.isBinLockedForSelectedRobot(index, selectedRobotId)) {
      return { success: false, message: "Ngăn này đang giao hàng, không thể chỉnh sửa." };
    }

    state.deliveryBins[index][field] = value;
    stateService.saveState();
    return { success: true };
  }

  // Xóa dữ liệu ngăn
  clearBin(index, selectedRobotId) {
    if (!authService.can("delivery.edit")) {
      logService.addSystemLog("delivery", "Xóa dữ liệu ngăn thuốc", "denied", `Ngăn ${index + 1}`);
      return { success: false, message: "Không có quyền chỉnh sửa ngăn thuốc." };
    }

    const state = stateService.getState();
    if (index < 0 || index >= state.deliveryBins.length) {
      return { success: false, message: "Ngăn không hợp lệ." };
    }
    if (this.isBinLockedForSelectedRobot(index, selectedRobotId)) {
      return { success: false, message: "Ngăn này đang giao hàng, không thể xóa." };
    }

    state.deliveryBins[index] = { patientId: "", note: "", medicines: [] };
    stateService.saveState();
    logService.addSystemLog("delivery", "Xóa dữ liệu ngăn thuốc", "success", `Ngăn ${index + 1}`);
    return { success: true, message: "Đã xóa dữ liệu ngăn." };
  }

  resetBinsAfterMission() {
    const state = stateService.getState();
    const len = Array.isArray(state.deliveryBins) && state.deliveryBins.length > 0 ? state.deliveryBins.length : 0;
    const n = len > 0 ? len : DEFAULT_ROBOT_COMPARTMENTS;
    state.deliveryBins = Array.from({ length: n }, () => createEmptyDeliveryBin());
    state.deliveryMissionRobotId = null;
    stateService.saveState();
  }

  syncMissionLifecycle(commands) {
    const state = stateService.getState();
    stateService.ensureDeliveryMissionMetaValid();
    const list = Array.isArray(commands) ? commands : [];
    
    // Tìm tất cả lệnh đang giao trong hệ thống, sắp xếp theo thời gian tạo giảm dần (mới nhất lên đầu)
    const deliveringCommands = list
      .filter(c => c.status === "delivering")
      .sort((a, b) => getDeliveryCommandTimestamp(b) - getDeliveryCommandTimestamp(a));
    const mid = state.deliveryMissionRobotId;

    if (mid) {
      // Nếu bộ nhớ cục bộ đang ghi nhận robot đang giao, kiểm tra xem lệnh đó còn hiệu lực trong database không
      const stillDelivering = deliveringCommands.some((c) => String(c.robotId) === String(mid));
      
      // Log debug info
      const logData = {
        timestamp: new Date().toISOString(),
        mid: mid,
        stillDelivering: stillDelivering,
        commandsCount: list.length,
        matchingCommands: list.filter(c => String(c.robotId) === String(mid)).map(c => ({ id: c._id || c.id, status: c.status, robotId: c.robotId })),
        allCommands: list.map(c => ({ id: c._id || c.id, status: c.status, robotId: c.robotId }))
      };
      dbService.addDocument("debugLogs", logData);

      if (!stillDelivering) {
        /* SỬA ĐỔI: Đồng bộ trạng thái khi ca giao kết thúc (giữ lại các ngăn bị giao thất bại) */
        // Tìm lệnh mới nhất của robot này để trích xuất các ngăn bị lỗi
        const latestCmd = list
          .filter(c => String(c.robotId) === String(mid))
          .sort((a, b) => getDeliveryCommandTimestamp(b) - getDeliveryCommandTimestamp(a))[0];
        
        if (latestCmd && Array.isArray(latestCmd.bins)) {
          const robots = state.robots || [];
          const robotObj = robots.find(r => String(r.id) === String(mid));
          const compartmentCount = getRobotCompartmentCount(robotObj);
          
          const newBins = Array.from({ length: compartmentCount }, () => createEmptyDeliveryBin());
          let hasFailedBin = false;
          
          latestCmd.bins.forEach(b => {
            const idx = b.slot - 1;
            if (idx >= 0 && idx < compartmentCount) {
              if (b.status === "failed") {
                newBins[idx] = {
                  patientId: b.patientId || "",
                  patientName: b.patientName || "",
                  room: b.room || "",
                  bed: b.bed || "",
                  note: b.note || "",
                  medicines: Array.isArray(b.medicines) ? b.medicines : [],
                  status: "failed",
                  failureReason: b.failureReason || "" // Lưu lý do lỗi
                };
                hasFailedBin = true;
              } else {
                newBins[idx] = createEmptyDeliveryBin();
              }
            }
          });
          
          state.deliveryBins = newBins;
          state.deliveryMissionRobotId = null; // Giải phóng Robot
          stateService.saveState();

          // Phát âm thanh cảnh báo và hiển thị toast thông báo (Đã chuyển lên appController xử lý toàn cục)
          // if (hasFailedBin && window.deliveryControllerInstance) {
          //   window.deliveryControllerInstance.triggerFailureNotification(latestCmd);
          // }
        } else {
          this.resetBinsAfterMission();
        }
        /* KẾT THÚC SỬA ĐỔI */
      }
    } else {
      // Nếu bộ nhớ cục bộ chưa ghi nhận robot đang giao (ví dụ do bị F5 reload trang)
      // nhưng database lại đang có lệnh đang giao thực tế, tự động khôi phục lại trạng thái giao hàng
      if (deliveringCommands.length > 0) {
        const activeCmd = deliveringCommands[0];
        const robotId = activeCmd.robotId;
        
        state.deliveryMissionRobotId = robotId;
        
        // Tìm thông tin robot để lấy số ngăn
        const robots = state.robots || [];
        const robotObj = robots.find(r => String(r.id) === String(robotId));
        const compartmentCount = getRobotCompartmentCount(robotObj);
        
        const newBins = Array.from({ length: compartmentCount }, () => createEmptyDeliveryBin());
        if (Array.isArray(activeCmd.bins)) {
          activeCmd.bins.forEach(b => {
            const idx = b.slot - 1;
            if (idx >= 0 && idx < compartmentCount) {
              newBins[idx] = {
                patientId: b.patientId || "",
                note: b.note || "",
                medicines: Array.isArray(b.medicines) ? b.medicines : [],
                status: "delivering"
              };
            }
          });
        }
        state.deliveryBins = newBins;
        stateService.saveState();
      }
    }
  }

  // Lấy número ngăn sẵn sàng
  getReadyBinsCount() {
    const state = stateService.getState();
    return state.deliveryBins.filter((bin) => bin.patientId && bin.note.trim()).length;
  }

  // Bắt đầu nhiệm vụ giao thuốc và ghi đơn hàng lên Firestore (1 document cho nhiều ngăn, khóa toàn bộ ngăn)
  async startMission(robotId) {
    if (!authService.can("delivery.start")) {
      logService.addSystemLog("delivery", "Gửi lệnh giao thuốc", "denied", "Không đủ quyền");
      alert("Bạn không có quyền gửi lệnh giao thuốc.");
      return { success: false, message: "Không có quyền gửi lệnh giao thuốc." };
    }

    const state = stateService.getState();
    const readyBins = state.deliveryBins.filter((bin) => bin.patientId && bin.note.trim());

    if (!readyBins.length) {
      alert("Vui lòng chọn bệnh nhân và nhập ghi chú trước khi gửi lệnh.");
      return { success: false, message: "Cần chọn bệnh nhân và nhập ghi chú trước khi gửi lệnh." };
    }

    // Lấy danh sách bệnh nhân
    let patientsList = [];
    try {
      patientsList = patientService.getPatients();
      if (!Array.isArray(patientsList)) patientsList = [];
    } catch (err) {
      patientsList = [];
    }

    // Chuẩn bị dữ liệu cho từng ngăn được sử dụng
    const binsData = [];
    // Lấy rooms từ roomService (fallback import nếu window.roomService không tồn tại)
    let roomsList = [];
    try {
      if (window.roomService && typeof window.roomService.getRooms === 'function') {
        roomsList = await window.roomService.getRooms();
      } else {
        const { default: roomService } = await import('./roomService.js');
        roomsList = await roomService.getRooms();
      }
      if (!Array.isArray(roomsList)) roomsList = [];
    } catch (err) {
      roomsList = [];
    }
    readyBins.forEach((bin) => {
      const binIndex = state.deliveryBins.findIndex(b => b === bin);
      const slot = binIndex >= 0 ? binIndex + 1 : 1;
      let patient = null;
      try {
        patient = patientsList.find && patientsList.find((p) => String(p.id) === String(bin.patientId));
      } catch (err) {}
      // Lấy position từ roomService (theo room, bed)
      let position = null;
      if (patient && patient.room && patient.bed) {
        const room = roomsList.find(r => String(r.name) === String(patient.room));
        if (room && Array.isArray(room.beds)) {
          // Tìm bed index (theo số giường, chỉ lấy số)
          let bedIdx = -1;
          for (let i = 0; i < room.beds.length; i++) {
            const bedName = typeof room.beds[i] === 'object' ? room.beds[i].name : room.beds[i];
            if ((bedName && bedName.match(/\d+/)?.[0]) === (patient.bed && patient.bed.match(/\d+/)?.[0])) {
              bedIdx = i;
              break;
            }
          }
          if (bedIdx >= 0 && room.beds[bedIdx] && room.beds[bedIdx].position) {
            position = room.beds[bedIdx].position;
          }
        }
      }
      binsData.push({
        slot: slot,
        patientId: bin.patientId, // Lưu lại patientId để phục vụ truy xuất ngược
        patientName: patient ? patient.name : "Unknown",
        room: patient ? patient.room : "",
        bed: patient ? patient.bed : "",
        position: position || null,
        status: "delivering",
        note: bin.note,
        medicines: Array.isArray(bin.medicines) ? [...bin.medicines] : []
      });
    });

    // Gửi 1 document duy nhất lên Firestore, truyền kèm robotId
    let result;
    try {
      const currentUser = authService.getCurrentUser();
      const nurseName = currentUser ? currentUser.fullName : "Y tá";
      result = await firebaseService.addMultiDeliveryCommand(binsData, robotId, nurseName);
    } catch (err) {
      alert("Không thể kết nối tới máy chủ. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau!");
      logService.addSystemLog("delivery", "Gửi lệnh giao thuốc", "error", "Không thể kết nối Firestore");
      return { success: false, message: "Không thể kết nối Firestore." };
    }

    // Gắn robot cho phiên giao này + đánh dấu "delivering" cho tất cả ngăn đang dùng
    state.deliveryMissionRobotId = robotId;
    state.deliveryBins.forEach((bin) => {
      bin.status = "delivering";
    });
    stateService.saveState();
    if (result && result.success) {
      // alert(`Đã gửi lệnh giao thuốc thành công cho ${binsData.length} ngăn!`);
      logService.addSystemLog("delivery", "Gửi lệnh giao thuốc", "success", `${binsData.length} ngăn`);
      return { success: true, message: "Đã gửi lệnh giao thuốc thành công.", binsCount: binsData.length };
    } else {
      alert("Gửi lệnh giao thuốc thất bại. Vui lòng thử lại!");
      logService.addSystemLog("delivery", "Gửi lệnh giao thuốc", "error", "Không gửi được lệnh nào");
      return { success: false, message: "Không gửi được lệnh nào." };
    }
  }

  // Lưu lại toàn bộ mảng ngăn thuốc (dùng cho đồng bộ realtime)
  saveBins(bins) {
    const state = stateService.getState();
    state.deliveryBins = bins;
    stateService.saveState();
  }
}

export default new DeliveryService();
