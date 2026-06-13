// ============================================
// ROBOT SERVICE - Quản lý robot (Offline-First)
// ============================================

import dbService from "./dbService.js";
import stateService from "./stateService.js";

const firebaseService = dbService;

class RobotService {
  // Thêm robot mới lên cơ sở dữ liệu
  async addRobotToFirestore(robot) {
    // Tạo id duy nhất
    const id = robot.id || (robot.name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now());
    const robotData = { ...robot, id };
    const res = await (await import('./dbService.js')).default.setDocument(
      'robots',
      id,
      robotData
    );
    return res;
  }

  // Xóa robot khỏi cơ sở dữ liệu
  async deleteRobot(robotId) {
    try {
      const db = (await import('../db-config.js')).db;
      const doc = await db.get(robotId);
      await db.remove(doc);
      return { success: true, message: "Đã xóa robot khỏi danh sách." };
    } catch (err) {
      console.error("Error deleting robot:", err);
      return { success: false, message: err.message || "Lỗi khi xóa robot." };
    }
  }

  // Lấy danh sách robot từ cơ sở dữ liệu (1 lần)
  async getRobotsFromFirestore() {
    const res = await (await import('./dbService.js')).default.getCollection('robots');
    if (res.success) return res.data;
    return [];
  }

  // Lắng nghe realtime robots
  listenRobotsRealtime(callback) {
    return (import('./dbService.js')).then(mod => {
      return mod.default.listenRobotsRealtime(callback);
    });
  }

  /** v (m/s), w (rad/s) — điều khiển chuyển động; robot cũ chỉ có `speed` (0–100) vẫn đọc được ở view. */
  async updateRobotVelocityInFirestore(robotId, v, w) {
    return await (await import("./dbService.js")).default.updateDocument("robots", robotId, {
      v: Number(v),
      w: Number(w),
    });
  }

  // Lấy danh sách robot từ local state
  getRobots() {
    return stateService.getState().robots || [];
  }

  // Lấy robot theo ID
  getRobotById(id) {
    return this.getRobots().find((r) => r.id === id);
  }

  // Lấy số robot online
  getOnlineRobotsCount() {
    return this.getRobots().filter((r) => r.online).length;
  }

  // Lấy robot online đầu tiên
  getFirstOnlineRobot() {
    return this.getRobots().find((robot) => robot.online);
  }

  // Lấy thống kê robot
  getRobotStats() {
    const robots = this.getRobots();
    return {
      total: robots.length,
      online: this.getOnlineRobotsCount(),
      offline: robots.length - this.getOnlineRobotsCount(),
    };
  }

  // Gửi yêu cầu robot tải lại bản đồ lên MQTT
  async requestMapReload(robotId) {
    try {
      const currentHost = window.location.hostname || "localhost";
      const response = await fetch(`http://${currentHost}:8000/robots/${robotId}/map/request`, {
        method: "POST"
      });
      return await response.json();
    } catch (e) {
      console.error("Error requesting map reload:", e);
      return { success: false, error: e.message };
    }
  }

  // Gửi cập nhật danh sách nhãn đánh dấu của robot lên DB
  async updateRobotLabels(robotId, labels) {
    try {
      return await (await import("./dbService.js")).default.updateDocument("robots", robotId, {
        map_labels: labels
      });
    } catch (e) {
      console.error("Error updating robot labels:", e);
      return { success: false, error: e.message };
    }
  }
}

export default new RobotService();
