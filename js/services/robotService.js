// ============================================
// ROBOT SERVICE - Quản lý robot
// ============================================

import stateService from "./stateService.js";

class RobotService {
  // Thêm robot mới lên Firestore
  async addRobotToFirestore(robot) {
    // Tạo id duy nhất
    const id = robot.id || (robot.name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now());
    const robotData = { ...robot, id };
    const res = await (await import('./firebaseService.js')).default.setDocument(
      'robots',
      id,
      robotData
    );
    return res;
  }


  // Lấy danh sách robot từ Firestore (1 lần)
  async getRobotsFromFirestore() {
    const res = await (await import('./firebaseService.js')).default.getCollection('robots');
    if (res.success) return res.data;
    return [];
  }
  //new

  // Lắng nghe realtime robots
  listenRobotsRealtime(callback) {
    return (import('./firebaseService.js')).then(mod => {
      return mod.default.listenRobotsRealtime(callback);
    });
  }

  // Cập nhật tốc độ robot lên Firestore
  async updateRobotSpeedInFirestore(robotId, speed) {
    return await (await import('./firebaseService.js')).default.updateDocument('robots', robotId, { speed });
  }

  // Lấy danh sách robot
  // Lấy robots từ local state (cũ, fallback)
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
}

export default new RobotService();
