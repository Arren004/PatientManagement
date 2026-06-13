// ============================================
// SMART HOSPITAL - ENTRY POINT
// ============================================
// Kiến trúc:
// - Data Layer: constants + models
// - Services: singleton classes xử lý logic
// - Views: pure functions render HTML
// - Controllers: handle events + orchestrate
// - Utils: formatters, UI helpers
// ============================================

// Import Firebase config trước tiên
import "./db-config.js";


import stateService from "./services/stateService.js";
window.stateService = stateService;
import appController from "./controllers/appController.js";
import authService from "./services/authService.js";
window.authService = authService;

import dbService from "./services/dbService.js";
import patientService from "./services/patientService.js";
import roomService from "./services/roomService.js";

// Đăng ký đồng bộ real-time từ PouchDB vào stateService toàn cục
dbService.listenPatientsRealtime((patients) => {
  console.log("[LiveSync] Patients updated:", patients);
  const normalized = patients.map(p => patientService.normalizePatientRecord(p));
  const state = stateService.getState();
  stateService.setState({
    ...state,
    patients: normalized
  });
});

dbService.listenRoomsRealtime((rooms) => {
  console.log("[LiveSync] Rooms updated:", rooms);
  roomService._cachedRooms = rooms;
  const state = stateService.getState();
  stateService.setState({
    ...state,
    rooms: rooms
  });
});

dbService.listenRobotsRealtime((robots) => {
  console.log("[LiveSync] Robots updated:", robots);
  const state = stateService.getState();
  stateService.setState({
    ...state,
    robots: robots
  });
});

dbService.listenDeliveryCommandsRealtime((commands) => {
  console.log("[LiveSync] Delivery commands updated:", commands);
  const state = stateService.getState();
  stateService.setState({
    ...state,
    deliveryCommands: commands
  });
});

// Khởi tạo ứng dụng
appController.init();
