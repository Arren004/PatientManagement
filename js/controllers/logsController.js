
// LOGS CONTROLLER - Xử lý events nhật ký

import logService from "../services/logService.js";
import authService from "../services/authService.js";
import { renderLogsView } from "../views/logsView.js";
import { showToast } from "../utils/ui.js";

class LogsController {
  constructor() {
    this.viewContainer = document.getElementById("view-logs");
    this.activeTab = "delivery";
    this.filters = { result: "all", module: "all", date: "" };
  }

  init() {
    // Render sẽ được gọi khi switch view
  }

  async renderView(searchQuery = "") {
    // Đảm bảo system log view chỉ dành cho head_nurse
    if (this.activeTab === "system" && !authService.can("logs.system.view")) {
      this.activeTab = "delivery";
    }

    let deliveryLogs = [];
    let systemLogs = [];

    if (this.activeTab === "delivery") {
      deliveryLogs = logService.filterDeliveryLogs({
        result: this.filters.result,
        date: this.filters.date,
        search: searchQuery,
      });
    } else {
      // Lấy log hệ thống từ Firestore (KHÔNG còn lấy/gộp loginHistory)
      systemLogs = await logService.filterSystemLogs({
        result: this.filters.result,
        module: this.filters.module,
        date: this.filters.date,
        search: searchQuery,
      });
      // Sắp xếp theo thời gian giảm dần (mới nhất lên đầu)
      systemLogs = systemLogs.sort((a, b) => {
        // Ưu tiên trường at, fallback sang createdAt nếu có
        const getTime = (x) => {
          if (x.at) return new Date(x.at).getTime();
          if (x.createdAt && x.createdAt.toDate) return x.createdAt.toDate().getTime();
          return 0;
        };
        return getTime(b) - getTime(a);
      });
    }

    const stats = logService.getDeliveryStats();

    renderLogsView(
      this.viewContainer,
      this.activeTab === "delivery" ? deliveryLogs : [],
      this.activeTab === "system" ? systemLogs : [],
      this.activeTab,
      stats
    );

    // Setup event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Tab buttons
    this.viewContainer.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeTab = btn.dataset.tab;
        this.renderView();
      });
    });

    // Filter controls
    const resultFilter = this.viewContainer.querySelector("#log-result-filter");
    const moduleFilter = this.viewContainer.querySelector("#log-module-filter");
    const dateFilter = this.viewContainer.querySelector("#log-date-filter");
    const applyBtn = this.viewContainer.querySelector("#apply-log-filter");
    const resetBtn = this.viewContainer.querySelector("#reset-log-filter");

    if (resultFilter) {
      resultFilter.value = this.filters.result;
    }
    if (moduleFilter) {
      moduleFilter.value = this.filters.module;
    }
    if (dateFilter) {
      dateFilter.value = this.filters.date;
    }

    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        this.filters.result = resultFilter.value;
        this.filters.module = moduleFilter ? moduleFilter.value : "all";
        this.filters.date = dateFilter.value;
        this.renderView();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.filters = { result: "all", module: "all", date: "" };
        this.renderView();
      });
    }

    // Export button
    const exportBtn = this.viewContainer.querySelector("#export-log-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        this.handleExport();
      });
    }
  }

  handleExport() {
    if (!authService.can("logs.export")) {
      logService.addSystemLog("logs", "Xuất CSV", "denied", "Không đủ quyền");
      showToast("Bạn không có quyền xuất dữ liệu.");
      return;
    }

    logService.addSystemLog("logs", "Xuất CSV", "success", `Tab: ${this.activeTab}`);
    showToast("Đã xuất CSV (mô phỏng).");
  }
}

export default new LogsController();
