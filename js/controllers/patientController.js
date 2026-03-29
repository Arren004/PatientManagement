// ============================================
// PATIENT CONTROLLER - Xử lý events bệnh nhân
// ============================================

import patientService from "../services/patientService.js";
import stateService from "../services/stateService.js";
import { renderPatientView } from "../views/patientView.js";
import { showToast, setupModalClose, focusFirstInputInModal } from "../utils/ui.js";


class PatientController {
  constructor() {
    this.viewContainer = document.getElementById("view-patients");
    this.isModalVisible = false;
    this.editingPatient = null;
    this.filters = { status: "all", room: "" };

    // Khi khởi tạo, luôn đồng bộ dữ liệu từ Firestore
    this.initSyncFromCloud();

    // Subscribe để tự động render khi state thay đổi
    stateService.subscribe(() => {
      this.renderView();
    });
  }

  async initSyncFromCloud() {
    // Chỉ đồng bộ nếu đang ở view bệnh nhân
    if (this.viewContainer) {
      await patientService.syncPatientsFromCloud();
    }
  }

  init() {
    // Render sẽ được gọi khi switch view
  }

  renderView(searchQuery = "") {
    // Lọc bệnh nhân
    const filteredPatients = patientService.filterPatients({
      status: this.filters.status,
      room: this.filters.room,
      search: searchQuery,
    });

    // Render view
    renderPatientView(this.viewContainer, filteredPatients, this.isModalVisible, this.editingPatient);

    // Setup event listeners
    this.setupEventListeners();

    // Gán event cho nút phân trang sau khi render
    const pag = this.viewContainer.querySelector('#patient-pagination');
    if (pag) {
      pag.querySelector('#first-page').onclick = () => { window.patientPage = 1; this.renderView(); };
      pag.querySelector('#prev-page').onclick = () => { window.patientPage = Math.max(1, window.patientPage-1); this.renderView(); };
      pag.querySelector('#next-page').onclick = () => {
        const totalPages = Math.ceil(patientService.filterPatients(this.filters).length / 10) || 1;
        window.patientPage = Math.min(totalPages, window.patientPage+1); this.renderView();
      };
      pag.querySelector('#last-page').onclick = () => {
        const totalPages = Math.ceil(patientService.filterPatients(this.filters).length / 10) || 1;
        window.patientPage = totalPages; this.renderView();
      };
    }
  }

  setupEventListeners() {
    // Mở modal thêm bệnh nhân
    const openModalBtn = this.viewContainer.querySelector("#open-patient-modal");
    if (openModalBtn) {
      openModalBtn.addEventListener("click", () => this.openModal());
    }

    // Mở modal in danh sách bệnh nhân
    const printBtn = this.viewContainer.querySelector("#print-patient-list-btn");
    const printModal = this.viewContainer.querySelector("#print-patient-modal");
    if (printBtn && printModal) {
      printBtn.addEventListener("click", () => {
        printModal.classList.add("show");
      });
      // Đóng modal khi bấm Huỷ hoặc click ra ngoài
      const cancelBtn = printModal.querySelector("#print-patient-cancel");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          printModal.classList.remove("show");
        });
      }
      printModal.addEventListener("mousedown", (e) => {
        if (e.target === printModal) printModal.classList.remove("show");
      });
      // Xác nhận in
      const confirmBtn = printModal.querySelector("#print-patient-confirm");
      if (confirmBtn) {
        confirmBtn.addEventListener("click", () => {
          const fromDateStr = printModal.querySelector("#print-from-date").value;
          const toDateStr = printModal.querySelector("#print-to-date").value;
          const fromDate = fromDateStr ? new Date(fromDateStr) : null;
          const toDate = toDateStr ? new Date(toDateStr) : null;
          // Lấy toàn bộ danh sách bệnh nhân (không phân trang, không filter UI)
          const allPatients = window.stateService ? window.stateService.getState().patients : [];
          import('../utils/excelUtils.js').then(({ exportPatientsToExcel }) => {
            exportPatientsToExcel(allPatients, fromDate, toDate);
          });
          printModal.classList.remove("show");
        });
      }
    }

    // Nút xuất viện trong bảng
    const dischargeBtns = this.viewContainer.querySelectorAll(".discharge-patient-btn");
    dischargeBtns.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const patientId = btn.dataset.id; // Lấy id dạng chuỗi
        const today = new Date().toISOString().slice(0, 10);
        const confirmDischarge = confirm("Bạn có chắc muốn xuất viện bệnh nhân này?");
        if (confirmDischarge) {
          const result = await patientService.dischargePatient(patientId, today);
          showToast(result.message);
          await patientService.syncPatientsFromCloud();
          this.renderView();
        }
      });
    });

    // Nút xuất viện trong modal chỉnh sửa
    const editModalDischargeBtn = this.viewContainer.querySelector("#patient-edit-modal .discharge-patient-btn");
    if (editModalDischargeBtn) {
      editModalDischargeBtn.addEventListener("click", async () => {
        const patientId = editModalDischargeBtn.dataset.id; // Lấy id dạng chuỗi
        const today = new Date().toISOString().slice(0, 10);
        const confirmDischarge = confirm("Bạn có chắc muốn xuất viện bệnh nhân này?");
        if (confirmDischarge) {
          const result = await patientService.dischargePatient(patientId, today);
          showToast(result.message);
          await patientService.syncPatientsFromCloud();
          this.closeEditModal();
        }
      });
    }

    // Đóng modal thêm bệnh nhân
    const cancelBtn = this.viewContainer.querySelector("#patient-modal-cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => this.closeModal());
    }

    // Modal form submit (thêm bệnh nhân)
    const form = this.viewContainer.querySelector("#patient-modal-form");
    if (form) {
      form.addEventListener("submit", (e) => this.handleFormSubmit(e));
    }

    // Modal click outside (thêm bệnh nhân)
    const modal = this.viewContainer.querySelector("#patient-modal");
    if (modal) {
      setupModalClose(modal, () => this.closeModal());
      if (this.isModalVisible && !this.editingPatient) {
        focusFirstInputInModal(modal);
      }
    }

    // Edit buttons
    const editBtns = this.viewContainer.querySelectorAll(".edit-patient-btn");
    editBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const patientId = Number(btn.dataset.id);
        const patient = patientService.getPatientById(patientId);
        if (patient) {
          this.openEditModal(patient);
        }
      });
    });

    // Đóng modal chỉnh sửa bệnh nhân
    const editCancelBtn = this.viewContainer.querySelector("#patient-edit-modal-cancel");
    if (editCancelBtn) {
      editCancelBtn.addEventListener("click", () => this.closeEditModal());
    }

    // Modal form submit (chỉnh sửa bệnh nhân)
    const editForm = this.viewContainer.querySelector("#patient-edit-modal-form");
    if (editForm) {
      editForm.addEventListener("submit", (e) => this.handleEditFormSubmit(e));
    }

    // Modal click outside (chỉnh sửa bệnh nhân)
    const editModal = this.viewContainer.querySelector("#patient-edit-modal");
    if (editModal) {
      setupModalClose(editModal, () => this.closeEditModal());
      if (this.editingPatient) {
        focusFirstInputInModal(editModal);
      }
    }

    // Lọc
    const statusFilter = this.viewContainer.querySelector("#patient-status-filter");
    const roomFilter = this.viewContainer.querySelector("#patient-room-filter");
    const applyBtn = this.viewContainer.querySelector("#apply-patient-filter");
    const resetBtn = this.viewContainer.querySelector("#reset-patient-filter");

    if (statusFilter) {
      statusFilter.value = this.filters.status;
    }
    if (roomFilter) {
      roomFilter.value = this.filters.room;
    }

    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        this.filters.status = statusFilter.value;
        this.filters.room = roomFilter.value.trim();
        this.renderView();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.filters = { status: "all", room: "" };
        this.renderView();
      });
    }
  }

  openModal() {
    this.isModalVisible = true;
    this.editingPatient = null;
    this.renderView();
  }

  closeModal() {
    this.isModalVisible = false;
    this.renderView();
  }

  openEditModal(patient) {
    this.editingPatient = patient;
    this.renderView();
  }

  closeEditModal() {
    this.editingPatient = null;
    this.renderView();
  }

  async handleFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;

    const result = await patientService.addPatient({
      name: form.name.value.trim(),
      room: form.room.value.trim(),
      bed: form.bed.value.trim(),
      status: form.status.value,
      gender: form.gender ? form.gender.value : '',
      dob: form.dob ? form.dob.value : '',
      admissionDate: form.admissionDate ? form.admissionDate.value : '',
      dischargeDate: form.dischargeDate ? form.dischargeDate.value : '',
    });

    if (!result.success) {
      showToast(result.message);
      return;
    }

    await patientService.syncPatientsFromCloud();
    // UI will auto-update via stateService subscription
    showToast(result.message);
    this.closeModal();
  }

  async handleEditFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const patientId = Number(form.querySelector("#edit-patient-id").value);

    const result = await patientService.updatePatient(patientId, {
      name: form.name.value.trim(),
      room: form.room.value.trim(),
      bed: form.bed.value.trim(),
      status: form.status.value,
      gender: form.gender ? form.gender.value : '',
      dob: form.dob ? form.dob.value : '',
      admissionDate: form.admissionDate ? form.admissionDate.value : '',
      dischargeDate: form.dischargeDate ? form.dischargeDate.value : '',
    });

    if (!result.success) {
      showToast(result.message);
      return;
    }

    await patientService.syncPatientsFromCloud();
    // UI will auto-update via stateService subscription
    showToast(result.message);
    this.closeEditModal();
  }
}

export default new PatientController();
