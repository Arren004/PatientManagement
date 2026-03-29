// ============================================
// LOG SERVICE - Quản lý nhật ký hệ thống
// ============================================

import stateService from "./stateService.js";
import authService from "./authService.js";
import firebaseService from "./firebaseService.js";

class LogService {
  // Lấy danh sách delivery logs
  getDeliveryLogs() {
    return stateService.getState().deliveryLogs || [];
  }

  // Lấy danh sách system logs từ Firestore
  async getSystemLogs() {
    const logs = await firebaseService.getSystemLogsFromCloud();
    // Đảm bảo có trường at (thời gian) cho sorting/filter
    return logs.map(x => ({
      ...x,
      at: x.at || (x.createdAt && x.createdAt.toDate ? x.createdAt.toDate().toISOString().slice(0, 16).replace('T', ' ') : "")
    }));
  }

  // Lọc delivery logs
  filterDeliveryLogs(filters = {}) {
    let logs = this.getDeliveryLogs();

    // Lọc theo kết quả
    if (filters.result && filters.result !== "all") {
      logs = logs.filter((x) => x.status === filters.result);
    }

    // Lọc theo ngày
    if (filters.date && filters.date.trim()) {
      logs = logs.filter((x) => x.date === filters.date);
    }

    // Tìm kiếm
    if (filters.search && filters.search.trim()) {
      const query = filters.search.toLowerCase();
      logs = logs.filter((x) => {
        const text = [x.date, x.patient, x.nurse, x.robot, x.status].join(" ").toLowerCase();
        return text.includes(query);
      });
    }

    return logs;
  }

  // Lọc system logs (bất đồng bộ)
  async filterSystemLogs(filters = {}) {
    let logs = await this.getSystemLogs();

    // Lọc theo kết quả
    if (filters.result && filters.result !== "all") {
      logs = logs.filter((x) => x.result === filters.result);
    }

    // Lọc theo module
    if (filters.module && filters.module !== "all") {
      logs = logs.filter((x) => x.module === filters.module);
    }

    // Lọc theo ngày
    if (filters.date && filters.date.trim()) {
      logs = logs.filter((x) => x.at && x.at.slice(0, 10) === filters.date);
    }

    // Tìm kiếm
    if (filters.search && filters.search.trim()) {
      const query = filters.search.toLowerCase();
      logs = logs.filter((x) => {
        const text = [x.at, x.actor, x.module, x.action, x.detail, x.result].join(" ").toLowerCase();
        return text.includes(query);
      });
    }

    return logs;
  }

  // Thêm system log lên Firestore
  async addSystemLog(module, action, result, detail = "") {
    const log = {
      at: this.getNowForLog(),
      actor: authService.getCurrentUser() ? authService.getCurrentUser().fullName : "Khách",
      role: authService.getCurrentUser() ? authService.getCurrentUser().role : "system",
      module,
      action,
      result,
      detail,
    };
    await firebaseService.addSystemLogToCloud(log);
  }

  // Lấy giờ hiện tại định dạng log
  getNowForLog() {
    const d = new Date();
    const date = d.toISOString().slice(0, 10);
    const time = d.toTimeString().slice(0, 5);
    return `${date} ${time}`;
  }

  // Lấy thống kê delivery
  getDeliveryStats() {
    const logs = this.getDeliveryLogs();
    const success = logs.filter((x) => x.status === "success").length;
    const failed = logs.filter((x) => x.status === "failed").length;
    const rate = logs.length ? ((success / logs.length) * 100).toFixed(1) : 0;

    return { total: logs.length, success, failed, rate };
  }
}

export default new LogService();
