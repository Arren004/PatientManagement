// ============================================
// LOG SERVICE - Quản lý nhật ký hệ thống
// ============================================

import stateService from "./stateService.js";
import authService from "./authService.js";
import dbService from "./dbService.js";
const firebaseService = dbService;

class LogService {
  // Lấy danh sách delivery logs
  getDeliveryLogs() {
    const commands = stateService.getState().deliveryCommands || [];
    const logs = [];
    commands.forEach((cmd) => {
      // Bỏ qua các lệnh mở nắp (open_lid)
      if (cmd.status === "open_lid") return;

      const bins = Array.isArray(cmd.bins) ? cmd.bins : [];
      let dateStr = "";
      if (cmd.createdAt) {
        const date = new Date(cmd.createdAt);
        if (!isNaN(date.getTime())) {
          const pad = (n) => String(n).padStart(2, '0');
          dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }
      }
      
      bins.forEach((bin) => {
        // Bỏ qua các hành động mở nắp trong bins nếu có
        if (bin.status === "open_lid" || bin.patientName === "OPEN" || bin.note === "OPEN") return;

        let status = "delivering";
        const binStatus = String(bin.status || "").toLowerCase();
        if (binStatus === "delivered" || binStatus === "thành công" || binStatus === "success") {
          status = "success";
        } else if (binStatus === "failed" || binStatus === "thất bại") {
          status = "failed";
        }
        
        const medList = Array.isArray(bin.medicines) ? bin.medicines.map(m => `${m.name}${m.dosage ? ' (' + m.dosage + ')' : ''}`).join(', ') : "";
        
        logs.push({
          id: `${cmd.id}_${bin.slot}`,
          date: dateStr,
          patient: bin.patientName || "Không rõ",
          medicines: medList || "—",
          nurse: cmd.nurseName || cmd.actor || "Y tá",
          robot: cmd.robotId || "Robot",
          status: status
        });
      });
    });
    return logs.sort((a, b) => b.date.localeCompare(a.date));
  }

  // Lấy danh sách system logs từ Firestore
  async getSystemLogs() {
    const logs = await firebaseService.getSystemLogsFromCloud();
    // Đảm bảo có trường at (thời gian) cho sorting/filter
    return logs.map(x => {
      let atStr = x.at;
      if (!atStr && x.createdAt) {
        const date = new Date(x.createdAt);
        if (!isNaN(date.getTime())) {
          const pad = (n) => String(n).padStart(2, '0');
          atStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }
      }
      return {
        ...x,
        at: atStr || ""
      };
    });
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
        const text = [x.date, x.patient, x.medicines, x.nurse, x.robot, x.status].join(" ").toLowerCase();
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
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
