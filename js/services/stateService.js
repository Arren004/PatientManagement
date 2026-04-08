// ============================================
// STATE SERVICE - Quản lý state toàn cục
// ============================================

import { STORAGE_KEY, DEFAULT_STATE } from "../data/constants.js";

class StateService {
  constructor() {
    // Reset localStorage khi load trang để tránh dữ liệu cũ sai lệch
    localStorage.removeItem(STORAGE_KEY);
    this.state = this.loadState();
    this.listeners = [];
  }

  // Load state từ localStorage
  loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(DEFAULT_STATE);
    }
    try {
      return JSON.parse(raw);
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  // Lưu state vào localStorage
  saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    this.notifyListeners();
  }

  // Lắng nghe thay đổi state
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  // Thông báo khi state thay đổi
  notifyListeners() {
    this.listeners.forEach((cb) => cb(this.state));
  }


  // Lấy state hiện tại
  getState() {
    this.ensurePatientsValid();
    return this.state;
  }

  // Ghi đè setState để log giá trị mới
  setState(newState) {
    this.state = newState;
    console.log("[StateService] setState:", this.state); // DEBUG LOG
    this.saveState();
  }

  // Reset state về mặc định
  resetState() {
    this.state = structuredClone(DEFAULT_STATE);
    this.saveState();
  }

  // Đảm bảo delivery bins có dữ liệu hợp lệ
  ensureDeliveryBinsValid() {
    if (!Array.isArray(this.state.deliveryBins) || this.state.deliveryBins.length !== 4) {
      this.state.deliveryBins = structuredClone(DEFAULT_STATE.deliveryBins);
      return;
    }

    this.state.deliveryBins = this.state.deliveryBins.map((bin) => ({
      patientId: bin.patientId || "",
      note: typeof bin.note === "string" ? bin.note : "",
    }));
  }

  // Đảm bảo system logs tồn tại
  ensureSystemLogsValid() {
    if (!Array.isArray(this.state.systemLogs)) {
      this.state.systemLogs = [];
    }
  }

  // Đảm bảo patients luôn là mảng
  ensurePatientsValid() {
    if (!Array.isArray(this.state.patients)) {
      this.state.patients = [];
    }
  }
}

export default new StateService();
