// ============================================
// STATE SERVICE - Quản lý state toàn cục
// ============================================

import {
  STORAGE_KEY,
  DEFAULT_STATE,
  DEFAULT_ROBOT_COMPARTMENTS,
  MAX_ROBOT_COMPARTMENTS,
  createEmptyDeliveryBin,
} from "../data/constants.js";

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

  _normalizeDeliveryBinEntries() {
    this.state.deliveryBins = this.state.deliveryBins.map((bin) => ({
      patientId: bin.patientId || "",
      note: typeof bin.note === "string" ? bin.note : "",
      medicines: Array.isArray(bin.medicines) ? bin.medicines : [],
      ...(bin.status ? { status: bin.status } : {}),
    }));
  }

  /**
   * Đảm bảo mảng ngăn tồn tại và từng phần tử có shape hợp lệ (không ép đúng 4 ngăn).
   */
  ensureDeliveryBinsValid() {
    if (!Array.isArray(this.state.deliveryBins)) {
      this.state.deliveryBins = Array.from({ length: DEFAULT_ROBOT_COMPARTMENTS }, () => createEmptyDeliveryBin());
    } else if (this.state.deliveryBins.length === 0) {
      this.state.deliveryBins = Array.from({ length: DEFAULT_ROBOT_COMPARTMENTS }, () => createEmptyDeliveryBin());
    }
    this._normalizeDeliveryBinEntries();
  }

  /**
   * Co giãn số ngăn theo robot đang chọn. Khi đang có nhiệm vụ giao (khóa), không đổi độ dài để tránh lệch slot.
   */
  syncDeliveryBinsToLength(targetLength) {
    this.ensureDeliveryMissionMetaValid();
    let n = Math.floor(Number(targetLength));
    if (!Number.isFinite(n) || n < 1) {
      n = DEFAULT_ROBOT_COMPARTMENTS;
    }
    n = Math.min(MAX_ROBOT_COMPARTMENTS, Math.max(1, n));

    if (!Array.isArray(this.state.deliveryBins)) {
      this.state.deliveryBins = Array.from({ length: n }, () => createEmptyDeliveryBin());
      this._normalizeDeliveryBinEntries();
      this.saveState();
      return;
    }

    if (this.state.deliveryMissionRobotId) {
      this._normalizeDeliveryBinEntries();
      return;
    }

    const cur = this.state.deliveryBins.length;
    if (cur === n) {
      this._normalizeDeliveryBinEntries();
      return;
    }

    if (cur < n) {
      for (let i = cur; i < n; i++) {
        this.state.deliveryBins.push(createEmptyDeliveryBin());
      }
    } else {
      this.state.deliveryBins = this.state.deliveryBins.slice(0, n);
    }
    this._normalizeDeliveryBinEntries();
    this.saveState();
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

  ensureDeliveryMissionMetaValid() {
    if (!("deliveryMissionRobotId" in this.state)) {
      this.state.deliveryMissionRobotId = null;
    }
    const v = this.state.deliveryMissionRobotId;
    if (v !== null && v !== undefined && typeof v !== "string") {
      this.state.deliveryMissionRobotId = String(v);
    }
  }
}

export default new StateService();
