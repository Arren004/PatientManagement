// ============================================
// NURSE CONTROLLER - Xử lý events y tá
// ============================================

import nurseService from "../services/nurseService.js";
import authService from "../services/authService.js";
import { 
  renderNurseView,
  getNurseFormStep,
  setNurseFormStep,
  getNurseFormData,
  setNurseFormData,
  resetNurseForm
} from "../views/nurseView.js";
import { showToast, setupModalClose, focusFirstInputInModal } from "../utils/ui.js";
import { EMPLOYEE_ID_PREFIX } from "../data/constants.js";

class NurseController {
  constructor() {
    this.viewContainer = document.getElementById("view-nurses");
    this.isModalVisible = false;
    this.filters = { role: "all", status: "all", workingStatus: "all", search: "" };
    window.nurseController = this;
  }

  init() {
    // Lắng nghe sự kiện rerender để phân trang hoạt động
    if (this.viewContainer) {
      this.viewContainer.addEventListener("rerender", () => {
        this.renderView(this.filters.search || "");
      });
    }
    // Render sẽ được gọi khi switch view
  }

  createEmployeeId() {
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const stamp = `${year}${month}${day}`;
    const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${EMPLOYEE_ID_PREFIX}${stamp}${randomPart}`;
  }

  async renderView(searchQuery = "") {
    const syncResult = await nurseService.syncNursesFromCloud();
    if (!syncResult.success) {
      showToast(syncResult.message || "Không thể đồng bộ danh sách y tá từ Cơ sở dữ liệu.");
    }

    // Lọc y tá
    const filteredNurses = nurseService.filterNurses({
      role: this.filters.role,
      status: this.filters.status,
      workingStatus: this.filters.workingStatus || "all",
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
      cancelBtn.addEventListener("click", () => {
        const currentStep = getNurseFormStep();
        if (currentStep === 2) {
          // Go back to step 1
          setNurseFormStep(1);
          this.renderView().catch((error) => {
            console.error("[NurseController] renderView error:", error);
          });
        } else {
          // Close modal
          this.closeModal();
        }
      });
    }

    // Modal form submit
    const form = this.viewContainer.querySelector("#nurse-modal-form");
    if (form) {
      form.addEventListener("submit", (e) => this.handleNurseFormSubmit(e));
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
    const searchInput = this.viewContainer.querySelector("#nurse-search-input");
    const applyBtn = this.viewContainer.querySelector("#apply-nurse-filter");
    const resetBtn = this.viewContainer.querySelector("#reset-nurse-filter");

    if (roleFilter) {
      roleFilter.value = this.filters.role;
    }
    if (statusFilter) {
      statusFilter.value = this.filters.status;
    }
    if (searchInput) {
      searchInput.value = this.filters.search || "";
      searchInput.addEventListener("input", (e) => {
        this.filters.search = e.target.value;
        this.renderView(this.filters.search).catch((error) => {
          console.error("[NurseController] renderView error (search):", error);
        });
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        this.filters.role = roleFilter.value;
        this.filters.status = statusFilter.value;
        // Giữ lại giá trị search khi lọc
        this.renderView(this.filters.search || "").catch((error) => {
          console.error("[NurseController] renderView error:", error);
        });
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.filters = { role: "all", status: "all", workingStatus: "all", search: "" };
        this.renderView().catch((error) => {
          console.error("[NurseController] renderView error:", error);
        });
      });
    }

    // Gắn sự kiện xóa cho nút xóa trong danh sách (nếu còn)
    this.viewContainer.querySelectorAll(".delete-nurse-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.handleDeleteNurse(id);
      });
    });

    // Gắn sự kiện xóa cho nút xóa trong modal chi tiết (nếu có)
    const detailModal = document.querySelector('.nurse-detail-modal');
    if (detailModal) {
      const deleteBtn = detailModal.querySelector('.delete-nurse-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = deleteBtn.dataset.id;
          this.handleDeleteNurse(id);
          setTimeout(() => {
            if (detailModal.parentNode) detailModal.parentNode.removeChild(detailModal);
          }, 300);
        });
      }
    }
  }

  openModal() {
    this.isModalVisible = true;
    const currentData = getNurseFormData();
    if (!currentData.employeeId) {
      setNurseFormData({
        ...currentData,
        employeeId: this.createEmployeeId(),
        skills: Array.isArray(currentData.skills) ? currentData.skills : [],
      });
    }
    this.renderView().catch((error) => {
      console.error("[NurseController] renderView error:", error);
    });
  }

  closeModal() {
    this.isModalVisible = false;
    resetNurseForm();
    this.renderView().catch((error) => {
      console.error("[NurseController] renderView error:", error);
    });
  }

  async handleNurseFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const currentStep = getNurseFormStep();

    if (currentStep === 1) {
      // Step 1: Validate and save form data, then move to step 2
      const fullName = form.fullName.value.trim();
      const phone = form.phone ? form.phone.value.trim() : "";
      const username = form.username.value.trim();
      const password = form.password.value.trim();
      const role = form.role.value;
      const employeeId = form.employeeId ? form.employeeId.value.trim() : this.createEmployeeId();
      const avatar = getNurseFormData().avatar || "";

      if (!fullName || !username || !password) {
        showToast("Vui lòng điền đầy đủ thông tin");
        return;
      }

      // Save form data and move to step 2
      setNurseFormData({
        ...getNurseFormData(),
        employeeId,
        fullName,
        phone,
        username,
        password,
        role,
        avatar,
      });
      setNurseFormStep(2);

      // Re-render to show step 2
      this.renderView().catch((error) => {
        console.error("[NurseController] renderView error:", error);
      });
      return;
    }

    if (currentStep === 2) {
      const fullName = form.fullName ? form.fullName.value.trim() : getNurseFormData().fullName || "";
      const phone = form.phone ? form.phone.value.trim() : getNurseFormData().phone || "";
      const username = form.username ? form.username.value.trim() : getNurseFormData().username || "";
      const password = form.password ? form.password.value.trim() : getNurseFormData().password || "";
      const role = form.role ? form.role.value : getNurseFormData().role || "nurse";
      const department = form.department ? form.department.value.trim() : "";
      const workArea = form.workArea ? form.workArea.value.trim() : "";
      const shift = form.shift ? form.shift.value.trim() : "";
      const startDate = form.startDate ? form.startDate.value : "";
      const workingStatus = form.workingStatus ? form.workingStatus.value : "active";

      if (!department || !shift) {
        showToast("Vui lòng chọn khoa/phòng và ca làm.");
        return;
      }

      setNurseFormData({
        ...getNurseFormData(),
        fullName,
        phone,
        username,
        password,
        role,
        department,
        workArea,
        shift,
        startDate,
        workingStatus,
      });
      setNurseFormStep(3);
      this.renderView().catch((error) => {
        console.error("[NurseController] renderView error:", error);
      });
      return;
    }

    if (currentStep === 3) {
      const formData = getNurseFormData();
      const skillCheckboxes = form.querySelectorAll('input[name="nurse-skill"]:checked');
      const presetSkills = Array.from(skillCheckboxes).map((checkbox) => checkbox.value.trim()).filter(Boolean);
      const customSkillsRaw = form.customSkills ? form.customSkills.value.trim() : "";
      const customSkills = customSkillsRaw
        ? customSkillsRaw
            .split(",")
            .map((skill) => skill.trim())
            .filter(Boolean)
        : [];
      const skills = Array.from(new Set([...presetSkills, ...customSkills]));
      const experienceYears = form.experienceYears ? String(form.experienceYears.value || "").trim() : "";
      const notes = form.notes ? form.notes.value.trim() : "";

      if (!formData.fullName || !formData.username || !formData.password) {
        showToast("Thông tin không hợp lệ");
        return;
      }

      const result = await nurseService.addNurse({
        fullName: formData.fullName,
        phone: formData.phone || "",
        employeeId: formData.employeeId || this.createEmployeeId(),
        avatar: formData.avatar || "",
        username: formData.username,
        password: formData.password,
        role: formData.role || "nurse",
        department: formData.department || "",
        workArea: formData.workArea || "",
        shift: formData.shift || "",
        startDate: formData.startDate || "",
        workingStatus: formData.workingStatus || "active",
        skills,
        experienceYears,
        notes,
      });

      if (!result.success) {
        showToast(result.message);
        return;
      }

      showToast(result.message);
      resetNurseForm();
      this.closeModal();
    }
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

  // Đặt lại mật khẩu cho y tá
  async handleResetPassword(id) {
    const nurse = nurseService.getNurseById(id);
    if (!nurse) return;

    const newPassword = prompt(`Nhập mật khẩu mới cho tài khoản "${nurse.fullName}" (tối thiểu 6 ký tự):`);
    if (newPassword === null) return; // Người dùng bấm Hủy

    const cleanPassword = newPassword.trim();
    if (cleanPassword.length < 6) {
      showToast("Mật khẩu mới phải có ít nhất 6 ký tự.", "danger");
      return;
    }

    const result = await nurseService.resetNursePassword(id, cleanPassword);
    if (!result.success) {
      showToast(result.message, "danger");
      return;
    }

    showToast(`Đã đặt lại mật khẩu cho y tá "${nurse.fullName}" thành công.`);
  }
}

export default new NurseController();
