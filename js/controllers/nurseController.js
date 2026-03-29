// ============================================
// NURSE CONTROLLER - Xử lý events y tá
// ============================================

import nurseService from "../services/nurseService.js";
import authService from "../services/authService.js";
import { renderNurseView } from "../views/nurseView.js";
import { showToast, setupModalClose, focusFirstInputInModal } from "../utils/ui.js";

class NurseController {
  constructor() {
    this.viewContainer = document.getElementById("view-nurses");
    this.isModalVisible = false;
    this.filters = { role: "all", status: "all" };
  }

  init() {
    // Render sẽ được gọi khi switch view
  }

  async renderView(searchQuery = "") {
    const syncResult = await nurseService.syncNursesFromCloud();
    if (!syncResult.success) {
      showToast(syncResult.message || "Khong the dong bo danh sach y ta tu Firebase.");
    }

    // Lọc y tá
    const filteredNurses = nurseService.filterNurses({
      role: this.filters.role,
      status: this.filters.status,
      search: searchQuery,
    });

    // Render view
    renderNurseView(this.viewContainer, filteredNurses, this.isModalVisible);

    // Setup event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Mở modal
    const openModalBtn = this.viewContainer.querySelector("#open-nurse-modal");
    if (openModalBtn) {
      openModalBtn.addEventListener("click", () => this.openModal());
    }

    // Đóng modal
    const cancelBtn = this.viewContainer.querySelector("#nurse-modal-cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => this.closeModal());
    }

    // Modal form submit
    const form = this.viewContainer.querySelector("#nurse-modal-form");
    if (form) {
      form.addEventListener("submit", (e) => this.handleFormSubmit(e));
    }

    // Modal click outside
    const modal = this.viewContainer.querySelector("#nurse-modal");
    if (modal) {
      setupModalClose(modal, () => this.closeModal());
      if (this.isModalVisible) {
        focusFirstInputInModal(modal);
      }
    }

    // Lọc
    const roleFilter = this.viewContainer.querySelector("#nurse-role-filter");
    const statusFilter = this.viewContainer.querySelector("#nurse-status-filter");
    const applyBtn = this.viewContainer.querySelector("#apply-nurse-filter");
    const resetBtn = this.viewContainer.querySelector("#reset-nurse-filter");

    if (roleFilter) {
      roleFilter.value = this.filters.role;
    }
    if (statusFilter) {
      statusFilter.value = this.filters.status;
    }

    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        this.filters.role = roleFilter.value;
        this.filters.status = statusFilter.value;
        this.renderView().catch((error) => {
          console.error("[NurseController] renderView error:", error);
        });
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.filters = { role: "all", status: "all" };
        this.renderView().catch((error) => {
          console.error("[NurseController] renderView error:", error);
        });
      });
    }

    // Kiểm tra nút ấn delete nếu có ấn thì gọi handleDeleteNurse
    this.viewContainer.querySelectorAll(".delete-nurse-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        this.handleDeleteNurse(id);
      });
    });
  }

  openModal() {
    this.isModalVisible = true;
    this.renderView().catch((error) => {
      console.error("[NurseController] renderView error:", error);
    });
  }

  closeModal() {
    this.isModalVisible = false;
    this.renderView().catch((error) => {
      console.error("[NurseController] renderView error:", error);
    });
  }

  async handleFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    const result = await nurseService.addNurse({
      fullName: form.fullName.value.trim(),
      username: form.username.value.trim(),
      password: form.password.value.trim(),
      role: form.role.value || "nurse",
    });

    if (!result.success) {
      showToast(result.message);
      return;
    }

    showToast(result.message);
    this.closeModal();
  }

  // Xóa y tá
  async handleDeleteNurse(id) {
    // lấy uid của y tá cần xóa
    const nurse = nurseService.getNurseById(id);
    if (!nurse) return;

    if (!confirm(`Xóa tài khoản ${nurse.username}?`)) return;
    // gọi hàm xóa y tá trong service vs id (uid)
    const result = await nurseService.deleteNurse(id);
    if (!result.success) {
      showToast(result.message);
      return;
    }

    showToast(result.message);

    if (result.deletedCurrentUser) {
      setTimeout(() => {
        // Đăng xuất
        document.getElementById("logout-btn").click();
      }, 500);
    } else {
      this.renderView().catch((error) => {
        console.error("[NurseController] renderView error:", error);
      });
    }
  }
}

export default new NurseController();
