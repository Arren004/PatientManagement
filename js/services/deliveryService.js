// ============================================
// DELIVERY SERVICE - Quản lý ngăn thuốc
// ============================================

import stateService from "./stateService.js";
import authService from "./authService.js";
import logService from "./logService.js";
import { DEFAULT_STATE } from "../data/constants.js";
import firebaseService from "./firebaseService.js";
import patientService from "./patientService.js";

class DeliveryService {
  // Lấy danh sách ngăn thuốc
  getDeliveryBins() {
    const state = stateService.getState();
    stateService.ensureDeliveryBinsValid();
    return state.deliveryBins;
  }

  // Cập nhật ngăn thuốc
  updateBin(index, field, value) {
    if (!authService.can("delivery.edit")) {
      return { success: false, message: "Không có quyền chỉnh sửa ngăn thuốc." };
    }

    const state = stateService.getState();
    if (index < 0 || index >= state.deliveryBins.length) {
      return { success: false, message: "Ngăn không hợp lệ." };
    }
    if (state.deliveryBins[index].status === "đang giao") {
      return { success: false, message: "Ngăn này đang giao hàng, không thể chỉnh sửa." };
    }

    state.deliveryBins[index][field] = value;
    stateService.saveState();
    return { success: true };
  }

  // Xóa dữ liệu ngăn
  clearBin(index) {
    if (!authService.can("delivery.edit")) {
      logService.addSystemLog("delivery", "Xóa dữ liệu ngăn thuốc", "denied", `Ngăn ${index + 1}`);
      return { success: false, message: "Không có quyền chỉnh sửa ngăn thuốc." };
    }

    const state = stateService.getState();
    if (index < 0 || index >= state.deliveryBins.length) {
      return { success: false, message: "Ngăn không hợp lệ." };
    }
    if (state.deliveryBins[index].status === "đang giao") {
      return { success: false, message: "Ngăn này đang giao hàng, không thể xóa." };
    }

    state.deliveryBins[index] = { patientId: "", note: "" };
    stateService.saveState();
    logService.addSystemLog("delivery", "Xóa dữ liệu ngăn thuốc", "success", `Ngăn ${index + 1}`);
    return { success: true, message: "Đã xóa dữ liệu ngăn." };
  }

  // Lấy número ngăn sẵn sàng
  getReadyBinsCount() {
    const state = stateService.getState();
    return state.deliveryBins.filter((bin) => bin.patientId && bin.note.trim()).length;
  }

  // Bắt đầu nhiệm vụ giao thuốc và ghi đơn hàng lên Firestore (1 document cho nhiều ngăn, khóa toàn bộ ngăn)
  async startMission() {
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
    readyBins.forEach((bin) => {
      const binIndex = state.deliveryBins.findIndex(b => b === bin);
      const slot = binIndex >= 0 ? binIndex + 1 : 1;
      let patient = null;
      try {
        patient = patientsList.find && patientsList.find((p) => String(p.id) === String(bin.patientId));
      } catch (err) {}
      binsData.push({
        slot: slot,
        patientName: patient ? patient.name : "Unknown",
        room: patient ? patient.room : "",
        bed: patient ? patient.bed : "",
        status: "delivering",
        note: bin.note
      });
    });

    // Gửi 1 document duy nhất lên Firestore
    let result;
    try {
      result = await firebaseService.addMultiDeliveryCommand(binsData);
    } catch (err) {
      alert("Không thể kết nối tới máy chủ. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau!");
      logService.addSystemLog("delivery", "Gửi lệnh giao thuốc", "error", "Không thể kết nối Firestore");
      return { success: false, message: "Không thể kết nối Firestore." };
    }

    // Đánh dấu trạng thái "delivering" cho TẤT CẢ các ngăn
    state.deliveryBins.forEach(bin => { bin.status = "delivering"; });
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
