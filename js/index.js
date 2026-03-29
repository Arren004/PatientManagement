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
import "./firebase-config.js";


import stateService from "./services/stateService.js";
window.stateService = stateService;
import appController from "./controllers/appController.js";

// Khởi tạo ứng dụng
appController.init();
