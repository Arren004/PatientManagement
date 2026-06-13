// ============================================
// APP CONTROLLER - Điều phối ứng dụng chính
// ============================================

import stateService from "../services/stateService.js";
import authService from "../services/authService.js";
import logService from "../services/logService.js";
import { renderLoginView, setLoginError, resetLoginForm } from "../views/loginView.js";
import { renderMenuView, updateActiveMenuItem } from "../views/menuView.js";
import patientController from "./patientController.js";
import roomController from "./roomController.js";
import nurseController from "./nurseController.js";
window.nurseController = nurseController;
import profileController from "./profileController.js";
import robotController from "./robotController.js";
import deliveryController from "./deliveryController.js";
import logsController from "./logsController.js";
import dbExplorerController from "./dbExplorerController.js";
import { showToast } from "../utils/ui.js";

class AppController {
  constructor() {
    this.loginScreen = document.getElementById("login-screen");
    this.dashboard = document.getElementById("dashboard");
    this.menuEl = document.getElementById("menu");
    this.profileName = document.getElementById("profile-name");
    this.profileRole = document.getElementById("profile-role");
    this.avatar = document.getElementById("avatar");
    this.profileBox = document.getElementById("profile-box");
    this.permissionBadge = document.getElementById("permission-badge");
    this.logoutBtn = document.getElementById("logout-btn");
    this.globalSearch = document.getElementById("global-search");
    this.profilePageBtn = document.getElementById("profile-page-btn");
    this.changePasswordModal = document.getElementById("change-password-modal");
    this.changePasswordForm = document.getElementById("change-password-form");
    this.changePasswordCancelBtn = document.getElementById("change-password-cancel");

    // Modal cấu hình CSDL LAN
    this.dbConfigBtn = document.getElementById("db-config-btn");
    this.dbConfigModal = document.getElementById("db-config-modal");
    this.dbConfigForm = document.getElementById("db-config-form");
    this.dbConfigCancelBtn = document.getElementById("db-config-cancel");
    this.dbIpInput = document.getElementById("db-ip-input");
    this.currentDbUrlText = document.getElementById("current-db-url-text");

    this.configOnlyOpenBtn = document.getElementById("config-only-open-btn");
    this.configOnlyLogoutBtn = document.getElementById("config-only-logout-btn");

    this.viewMap = {
      patients: document.getElementById("view-patients"),
      rooms: document.getElementById("view-rooms"),
      nurses: document.getElementById("view-nurses"),
      profile: document.getElementById("view-profile"),
      robots: document.getElementById("view-robots"),
      delivery: document.getElementById("view-delivery"),
      logs: document.getElementById("view-logs"),
      dbexplorer: document.getElementById("view-dbexplorer"),
      configOnly: document.getElementById("view-config-only"),
    };

    this.activeView = "patients";

    // Đảm bảo delivery bins hợp lệ
    stateService.ensureDeliveryBinsValid();
    stateService.ensureDeliveryMissionMetaValid();
    stateService.ensureSystemLogsValid();
  }

  init() {
    // Setup login form (không render, dùng HTML có sẵn)
    const loginForm = this.loginScreen.querySelector("#login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => this.handleLogin(e));
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.addEventListener("click", () => {
          const errorEl = this.loginScreen.querySelector("#login-error");
          if (errorEl) errorEl.textContent = "";
        });
      }
    }

    // Setup logout
    this.logoutBtn.addEventListener("click", () => this.handleLogout());

    if (this.profilePageBtn) {
      this.profilePageBtn.addEventListener("click", () => this.switchView("profile"));
    }

    if (this.changePasswordCancelBtn) {
      this.changePasswordCancelBtn.addEventListener("click", () => this.closeChangePasswordModal());
    }

    if (this.changePasswordForm) {
      this.changePasswordForm.addEventListener("submit", (e) => this.handleChangePassword(e));
    }

    if (this.changePasswordModal) {
      this.changePasswordModal.addEventListener("click", (event) => {
        if (event.target === this.changePasswordModal) {
          this.closeChangePasswordModal();
        }
      });
    }

    // Setup db config modal events
    if (this.dbConfigBtn) {
      this.dbConfigBtn.addEventListener("click", () => this.openDbConfigModal());
    }
    if (this.dbConfigCancelBtn) {
      this.dbConfigCancelBtn.addEventListener("click", () => this.closeDbConfigModal());
    }
    if (this.dbConfigForm) {
      this.dbConfigForm.addEventListener("submit", (e) => this.handleDbConfigSubmit(e));
    }
    if (this.dbConfigModal) {
      this.dbConfigModal.addEventListener("click", (event) => {
        if (event.target === this.dbConfigModal) {
          this.closeDbConfigModal();
        }
      });
    }

    if (this.configOnlyOpenBtn) {
      this.configOnlyOpenBtn.addEventListener("click", () => this.openDbConfigModal());
    }
    if (this.configOnlyLogoutBtn) {
      this.configOnlyLogoutBtn.addEventListener("click", () => this.handleLogout());
    }

    document.addEventListener("profile:open-change-password", () => {
      this.openChangePasswordModal();
    });

    // Setup global search
    this.globalSearch.addEventListener("input", () => this.renderActiveView());

    // Setup menu item click
    document.addEventListener("menuItemClick", (e) => {
      this.switchView(e.detail.key);
    });

    // ĐỒNG BỘ TRẠNG THÁI ĐĂNG NHẬP KHI KHỞI ĐỘNG
    import("../services/authService.js").then(({ default: authService }) => {
      authService.onAuthStateChanged((user) => {
        if (user) {
          // Đã đăng nhập, show dashboard
          this.loginScreen.classList.add("hidden");
          this.dashboard.classList.remove("hidden");
          this.hydrateUserUi();
          this.renderMenu();
          this.applyLayoutMode(user.role);
          if (user.role === 'config') {
            this.openDbConfigModal();
          } else {
            this.switchView("patients");
          }
        } else {
          // Chưa đăng nhập, show login
          this.dashboard.classList.add("hidden");
          this.loginScreen.classList.remove("hidden");
          this.applyLayoutMode(null);
        }
      });
    });

    // Khởi tạo các controller con
    patientController.init();
    roomController.init();
    nurseController.init();
    profileController.init();
    robotController.init();
    deliveryController.init();
    logsController.init();
    dbExplorerController.init();

    // --- BẮT ĐẦU SỬA ĐỔI: LẮNG NGHE LỖI GIAO THUỐC TOÀN CỤC ĐỂ PHÁT CẢNH BÁO ---
    let lastCheckedBinsStatus = {};
    let isInitialLoad = true;
    stateService.subscribe(() => {
      const state = stateService.getState();
      const commands = state.deliveryCommands || [];
      
      // Lần đầu tải trang: Đánh dấu toàn bộ các đơn hàng lỗi cũ là "đã biết" để không hiện cảnh báo
      if (isInitialLoad && commands.length > 0) {
        commands.forEach(cmd => {
          if (!cmd || !Array.isArray(cmd.bins)) return;
          const failedBins = cmd.bins.filter(b => b.status === "failed");
          failedBins.forEach(b => {
            const key = `${cmd._id || cmd.id}_${b.slot}`;
            lastCheckedBinsStatus[key] = true;
          });
        });
        isInitialLoad = false;
        console.log("[AppController] Đã nạp danh sách lỗi lịch sử để tránh cảnh báo lặp khi tải lại trang.");
        return;
      }
      
      // Từ các lần thay đổi sau: Chỉ hiện cảnh báo cho lỗi mới xuất hiện
      commands.forEach(cmd => {
        if (!cmd || !Array.isArray(cmd.bins)) return;
        
        const failedBins = cmd.bins.filter(b => b.status === "failed");
        failedBins.forEach(b => {
          const key = `${cmd._id || cmd.id}_${b.slot}`;
          if (!lastCheckedBinsStatus[key]) {
            lastCheckedBinsStatus[key] = true; // Đánh dấu đã cảnh báo
            this.triggerGlobalFailureNotification(cmd, b);
          }
        });
      });
    });
    // --- KẾT THÚC SỬA ĐỔI ---

    document.addEventListener("userProfileUpdated", () => {
      this.hydrateUserUi();
      if (this.activeView === "profile") {
        profileController.renderView().catch((error) => {
          console.error("[AppController] profile refresh error:", error);
        });
      }
    });
  }

  async handleLogin(event) {
    event.preventDefault();
    // Lấy element username và password, cũng như element hiển thị lỗi và nút submit
    const usernameInput = this.loginScreen.querySelector("#username");
    const passwordInput = this.loginScreen.querySelector("#password");
    const errorEl = this.loginScreen.querySelector("#login-error");
    const submitBtn = this.loginScreen.querySelector('#login-form button[type="submit"]');
    // Từ element user name và password lấy giá trị bằng .value và trim() để loại bỏ khoảng trắng đầu cuối
    const username = usernameInput ? usernameInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value.trim() : "";

    if (errorEl) errorEl.textContent = "";
    // Kiểm tra nút ấn vào, nếu có thì disable nó và đổi text thành "Đang xử lý..."
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Đang xử lý...";
    }

    try {
      //Gọi hàm login của authService với username và password đã lấy được
      const result = await authService.login(username, password);
      if (!result.success) {
        logService.addSystemLog("auth", "Đăng nhập", "failed", `Sai thông tin: ${username || "(trống)"}`);
        if (errorEl) {
          errorEl.textContent = result.message || "Đăng nhập thất bại.";
        }
        return;
      }

      // Đăng nhập thành công
      this.loginScreen.classList.add("hidden");
      this.dashboard.classList.remove("hidden");
      resetLoginForm(this.loginScreen);
      // KHÔNG ghi log đăng nhập thành công nữa
      this.hydrateUserUi();
      this.renderMenu();
      this.applyLayoutMode(result.user ? result.user.role : null);
      if (result.user && result.user.role === 'config') {
        this.openDbConfigModal();
      } else {
        this.switchView("patients");
        // Đảm bảo view phòng cập nhật đúng quyền ngay sau đăng nhập
        if (typeof roomController !== 'undefined' && roomController.renderView) {
          roomController.renderView();
        }
      }
    } catch (error) {
      console.error("[AppController] handleLogin error:", error);
      if (errorEl) {
        errorEl.textContent = "Có lỗi khi đăng nhập. Mở F12 > Console để xem chi tiết.";
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Đăng nhập";
      }
    }
  }

  hideAllViews() {
    Object.values(this.viewMap).forEach((element) => {
      if (element) {
        element.classList.add("hidden");
      }
    });
  }

  async handleLogout() {
    const user = authService.getCurrentUser();
    if (user) {
      logService.addSystemLog("auth", "Đăng xuất", "success", `Đăng xuất: ${user.fullName}`);
    }
    await authService.logout();
    this.applyLayoutMode(null);
    this.dashboard.classList.add("hidden");
    this.loginScreen.classList.remove("hidden");
    resetLoginForm(this.loginScreen);
  }

  hydrateUserUi() {
    const user = authService.getCurrentUser();
    this.profileName.textContent = user && user.fullName ? user.fullName : "?";
    if (user && user.role) {
      if (user.role === "config") {
        this.profileRole.textContent = "Kỹ thuật viên LAN";
        this.permissionBadge.textContent = "Quyền: Cấu hình CSDL";
      } else {
        this.profileRole.textContent = user.role === "head_nurse" ? "Y tá trưởng" : user.role === "admin" ? "Quản trị viên" : "Y tá";
        this.permissionBadge.textContent =
          user.role === "head_nurse"
            ? "Quyền: Y tá trưởng"
            : user.role === "admin"
              ? "Quyền: Quản trị viên"
              : "Quyền: Y tá";
      }
    } else {
      this.profileRole.textContent = "";
      this.permissionBadge.textContent = "";
    }
    if (user && user.avatar) {
      this.avatar.innerHTML = `<img src="${user.avatar}" alt="Avatar ${user.fullName || ""}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      this.avatar.textContent = (user && user.fullName && typeof user.fullName === 'string' && user.fullName.length > 0)
        ? user.fullName.slice(0, 1).toUpperCase()
        : "?";
    }
  }

  openChangePasswordModal() {
    if (!this.changePasswordModal) return;
    this.changePasswordModal.classList.add("show");
    this.changePasswordModal.setAttribute("aria-hidden", "false");
    const firstInput = this.changePasswordModal.querySelector("#current-password");
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 0);
    }
  }

  closeChangePasswordModal() {
    if (!this.changePasswordModal || !this.changePasswordForm) return;
    this.changePasswordModal.classList.remove("show");
    this.changePasswordModal.setAttribute("aria-hidden", "true");
    this.changePasswordForm.reset();
  }

  async handleChangePassword(event) {
    event.preventDefault();
    const currentPasswordInput = this.changePasswordForm.querySelector("#current-password");
    const newPasswordInput = this.changePasswordForm.querySelector("#new-password");
    const confirmPasswordInput = this.changePasswordForm.querySelector("#confirm-new-password");

    const currentPassword = currentPasswordInput ? currentPasswordInput.value.trim() : "";
    const newPassword = newPasswordInput ? newPasswordInput.value.trim() : "";
    const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value.trim() : "";

    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast("Vui lòng nhập đầy đủ thông tin.");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("Mật khẩu mới nhập lại không khớp.");
      return;
    }

    const result = await authService.changePassword(currentPassword, newPassword);
    if (!result.success) {
      showToast(result.message || "Không thể đổi mật khẩu.");
      return;
    }

    showToast(result.message);
    this.closeChangePasswordModal();
  }

  renderMenu() {
    renderMenuView(this.menuEl, this.activeView);
  }

  switchView(viewKey) {
    const user = authService.getCurrentUser();
    if (user && user.role === 'config') {
      showToast("Tài khoản cấu hình không thể chuyển sang giao diện khác.");
      return;
    }
    if (viewKey === "dbexplorer" && !authService.isHeadNurse()) {
      showToast("Bạn không có quyền truy cập vào khu vực Cơ sở dữ liệu.");
      return;
    }
    this.activeView = viewKey;

    // Ẩn/hiện view
    Object.entries(this.viewMap).forEach(([key, element]) => {
      element.classList.toggle("hidden", key !== viewKey);
    });

    // Cập nhật menu
    updateActiveMenuItem(this.menuEl, viewKey);

    this.renderActiveView();
  }

  applyLayoutMode(role) {
    if (role === 'config') {
      this.dashboard.classList.add("no-sidebar");
      this.globalSearch.classList.add("hidden");
      if (this.profilePageBtn) this.profilePageBtn.classList.add("hidden");
      this.hideAllViews();
      if (this.viewMap.configOnly) this.viewMap.configOnly.classList.remove("hidden");
    } else {
      this.dashboard.classList.remove("no-sidebar");
      this.globalSearch.classList.remove("hidden");
      if (this.profilePageBtn) this.profilePageBtn.classList.remove("hidden");
    }
  }

  renderActiveView() {
    const searchQuery = this.globalSearch.value.trim().toLowerCase();

    if (this.activeView === "patients") {
      patientController.renderView(searchQuery);
    } else if (this.activeView === "nurses") {
      nurseController.renderView(searchQuery);
    } else if (this.activeView === "profile") {
      profileController.renderView();
    } else if (this.activeView === "robots") {
      robotController.renderView();
    } else if (this.activeView === "delivery") {
      deliveryController.renderView();
    } else if (this.activeView === "logs") {
      logsController.renderView(searchQuery);
    } else if (this.activeView === "dbexplorer") {
      dbExplorerController.renderView(searchQuery);
    }
  }

  // Hiển thị toast từ các controller khác
  showMessage(message) {
    showToast(message);
  }

  // --- QUẢN LÝ MODAL CẤU HÌNH CSDL LAN ---
  openDbConfigModal() {
    const currentUrl = localStorage.getItem("couchdb_server_url") || "";
    this.currentDbUrlText.textContent = currentUrl || "Chưa thiết lập";
    
    // Trích xuất IP hiển thị vào ô nhập cho y tá dễ dùng
    let ip = "";
    if (currentUrl) {
      const match = currentUrl.match(/@([^:/]+)/) || currentUrl.match(/\/\/([^:/]+)/);
      ip = match ? match[1] : "localhost";
    }
    this.dbIpInput.value = ip;
    
    this.dbConfigModal.classList.add("show");
    this.dbConfigModal.setAttribute("aria-hidden", "false");
  }

  closeDbConfigModal() {
    this.dbConfigModal.classList.remove("show");
    this.dbConfigModal.setAttribute("aria-hidden", "true");
  }

  handleDbConfigSubmit(e) {
    e.preventDefault();
    const ip = this.dbIpInput.value.trim();
    if (!ip) {
      showToast("Vui lòng nhập địa chỉ IP hoặc tên miền hợp lệ!", "error");
      return;
    }
    
    // Quy đổi IP sang link CouchDB chuẩn hóa
    let newUrl = ip;
    if (!ip.startsWith("http://") && !ip.startsWith("https://")) {
      newUrl = `http://admin:admin@${ip}:5984/smarthospital`;
    }
    
    if (typeof window.updateCouchDbUrl === "function") {
      window.updateCouchDbUrl(newUrl);
    } else {
      localStorage.setItem("couchdb_server_url", newUrl);
    }
    
    showToast("Đã cập nhật cấu hình kết nối CSDL LAN thành công!", "success");
    logService.addSystemLog("system", "Cập nhật IP CSDL LAN", "success", `Kết nối tới IP: ${ip}`);
    this.closeDbConfigModal();
  }

  // --- BẮT ĐẦU SỬA ĐỔI: CẢNH BÁO GIAO THẤT BẠI TOÀN CỤC (TOAST + AUDIO) ---
  triggerGlobalFailureNotification(command, bin) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // Beep cao
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.35); // Phát trong 0.35s
    } catch (err) {
      console.warn("Không thể phát âm thanh cảnh báo:", err);
    }

    const state = stateService.getState();
    const robots = state.robots || [];
    const robot = robots.find(r => String(r.id) === String(command.robotId));
    const robotName = robot ? robot.name : "Robot";
    const displayRobotName = /robot/i.test(robotName) ? robotName : `Robot ${robotName}`;

    const reasonText = bin.failureReason === "timeout" 
      ? "Quá thời gian chờ tại giường" 
      : bin.failureReason === "navigation_error" 
        ? "Lỗi di chuyển (Kẹt đường)" 
        : "Robot gặp sự cố";

    const message = `Ngăn ${bin.slot} trên ${displayRobotName} giao đến Phòng ${bin.room || '—'} (Giường ${(bin.bed || '—').replace(/^giường\s+/i, '')}) thất bại. Lý do: ${reasonText}`;

    // Tạo hoặc tìm toast-container
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.style = "position: fixed; right: 18px; bottom: 18px; display: flex; flex-direction: column; gap: 10px; z-index: 100000; max-width: 420px; width: 90vw;";
      document.body.appendChild(container);
    }

    // Tạo toast đỏ nguy hiểm không tự ẩn
    const toast = document.createElement("div");
    toast.className = "toast show";
    toast.style = "position: static; opacity: 1; pointer-events: auto; display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: #fee2e2; border: 2px solid #ef4444; border-radius: 12px; color: #991b1b; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15); animation: rise 0.25s ease-out; box-sizing: border-box;";
    toast.innerHTML = `
      <div style="flex: 1; font-size: 0.9rem; font-weight: 700; line-height: 1.4; text-align: left;">
        <div style="display: flex; align-items: center; gap: 6px; font-size: 0.95rem; margin-bottom: 4px; color: #b91c1c;">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>GIAO THẤT BẠI</span>
        </div>
        <div style="font-weight: 600; color: #7f1d1d;">${message}</div>
      </div>
      <button type="button" style="background: none; border: none; color: #b91c1c; font-size: 1.4rem; font-weight: 800; cursor: pointer; padding: 0; line-height: 1; margin-top: -2px;" onclick="this.parentElement.remove()">
        &times;
      </button>
    `;
    container.appendChild(toast);
  }
  // --- KẾT THÚC SỬA ĐỔI ---
}

export default new AppController();
